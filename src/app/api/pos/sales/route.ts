import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordStockLedgerEntry } from "@/app/api/products/_stock-ledger";
import type { Prisma } from "@/generated/prisma/client";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computePosSaleTotals,
  createPosSaleSchema,
  generatePosSaleNumber,
  isUniqueConstraintError,
  normalizeOptionalText,
  preparePosSaleItems,
  round2,
  safePosSaleSelect,
} from "../_shared";

type SafePosSale = Prisma.PosSaleGetPayload<{ select: typeof safePosSaleSelect }>;

function parseTake(value: string | null) {
  const parsed = Number(value ?? 25);

  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function parseSkip(value: string | null) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(Math.trunc(parsed), 0);
}

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("pos.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const take = parseTake(searchParams.get("take"));
    const skip = parseSkip(searchParams.get("skip"));
    const status = searchParams.get("status");

    const [sales, total] = await prisma.$transaction([
      prisma.posSale.findMany({
        where: {
          companyId: scope.companyId,
          ...(status === "completed" || status === "cancelled" ? { status } : {}),
        },
        select: safePosSaleSelect,
        orderBy: { completedAt: "desc" },
        take,
        skip,
      }),
      prisma.posSale.count({
        where: {
          companyId: scope.companyId,
          ...(status === "completed" || status === "cancelled" ? { status } : {}),
        },
      }),
    ]);

    return NextResponse.json({
      data: sales,
      meta: {
        take,
        skip,
        total,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("pos.create");
    const scope = companyScope(currentUser);
    const parsed = createPosSaleSchema.parse(await request.json());

    let stockMovementCount = 0;

    const sale = await prisma.$transaction(async (tx) => {
      const preparedItems = await preparePosSaleItems(tx, scope.companyId, parsed.items);
      const totals = computePosSaleTotals(preparedItems, parsed.discountAmount);
      const paidAmount = round2(parsed.paidAmount);

      if (paidAmount < totals.totalAmount) {
        throw new AppError("VALIDATION_ERROR", "paidAmount must cover the POS sale total.", 400);
      }

      const changeAmount = round2(paidAmount - totals.totalAmount);

      if (parsed.paymentAccountId) {
        const account = await tx.financeAccount.findFirst({
          where: {
            id: parsed.paymentAccountId,
            companyId: scope.companyId,
            status: "active",
            kind: { in: ["cash", "bank", "mobile_money"] },
          },
          select: { id: true },
        });

        if (!account) {
          throw new AppError("FORBIDDEN", "Payment account is not accessible.", 403);
        }
      }

      let createdSale: SafePosSale | null = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          createdSale = await tx.posSale.create({
            data: {
              companyId: scope.companyId,
              saleNumber: generatePosSaleNumber(),
              customerNameSnapshot: normalizeOptionalText(parsed.customerName) ?? null,
              customerPhoneSnapshot: normalizeOptionalText(parsed.customerPhone) ?? null,
              subtotal: totals.subtotal,
              discountAmount: totals.discountAmount,
              totalAmount: totals.totalAmount,
              paidAmount,
              changeAmount,
              paymentMethod: parsed.paymentMethod,
              paymentAccountId: parsed.paymentAccountId ?? null,
              cashierUserId: currentUser.user.id,
              items: {
                create: preparedItems,
              },
            },
            select: safePosSaleSelect,
          });
          break;
        } catch (error) {
          if (!isUniqueConstraintError(error) || attempt === 4) {
            throw error;
          }
        }
      }

      if (!createdSale) {
        throw new AppError("INTERNAL_SERVER_ERROR", "Could not create POS sale.", 500);
      }

      for (const item of preparedItems) {
        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            companyId: scope.companyId,
            stockQuantity: { gte: item.quantity },
          },
          data: {
            stockQuantity: { decrement: item.quantity },
          },
        });

        if (updated.count !== 1) {
          throw new AppError("VALIDATION_ERROR", "Insufficient stock while completing POS sale.", 400);
        }

        await recordStockLedgerEntry(tx, scope.companyId, {
          productId: item.productId,
          type: "pos_sale_complete",
          sourceType: "pos_sale",
          sourceId: createdSale.id,
          quantityDelta: -item.quantity,
          createdByUserId: currentUser.user.id,
          note: `POS sale ${createdSale.saleNumber}`,
        });
        stockMovementCount += 1;
      }

      if (parsed.paymentAccountId) {
        await tx.financeAccount.update({
          where: { id: parsed.paymentAccountId },
          data: {
            currentBalance: { increment: totals.totalAmount },
          },
        });
      }

      return createdSale;
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "pos.sale.complete",
      entityType: "pos_sale",
      entityId: sale.id,
      summary: `POS sale completed: ${sale.saleNumber}`,
      metadata: {
        saleNumber: sale.saleNumber,
        totalAmount: Number(sale.totalAmount),
        paymentMethod: sale.paymentMethod,
        paymentAccountId: sale.paymentAccountId,
        stockMovementCount,
      },
    });

    return NextResponse.json({ data: sale }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid POS sale payload.", 400));
    }

    return errorResponse(error);
  }
}
