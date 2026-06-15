import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computePurchaseTotals,
  createPurchaseOrderSchema,
  generatePurchaseOrderNumber,
  isUniqueConstraintError,
  preparePurchaseItems,
  resolvePurchaseVendor,
  safePurchaseOrderSelect,
} from "./_shared";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("purchases.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get("status")?.trim().toLowerCase();
    const validStatuses = ["draft", "ordered", "received", "cancelled"] as const;
    type PurchaseStatus = (typeof validStatuses)[number];

    if (statusParam && !validStatuses.includes(statusParam as PurchaseStatus)) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Invalid status filter.", 400));
    }

    const statusFilter = statusParam as PurchaseStatus | undefined;

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        companyId: scope.companyId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      select: safePurchaseOrderSelect,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ purchaseOrders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("purchases.create");
    const scope = companyScope(currentUser);
    const json = await request.json();
    const parsed = createPurchaseOrderSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please check the submitted fields.",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const vendor = await resolvePurchaseVendor(tx, parsed.data.vendorId, scope.companyId);
      const preparedItems = await preparePurchaseItems(tx, scope.companyId, parsed.data.items);
      const totals = computePurchaseTotals(preparedItems, parsed.data.discountAmount);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const purchaseOrderNumber = generatePurchaseOrderNumber();

        try {
          return await tx.purchaseOrder.create({
            data: {
              companyId: scope.companyId,
              vendorId: vendor.id,
              purchaseOrderNumber,
              vendorNameSnapshot: vendor.name,
              vendorPhoneSnapshot: vendor.phone ?? null,
              vendorEmailSnapshot: vendor.email ?? null,
              status: "draft",
              subtotal: totals.subtotal,
              discountAmount: totals.discountAmount,
              totalAmount: totals.totalAmount,
              notes: parsed.data.notes?.trim() || null,
              items: {
                create: preparedItems.map((item) => ({
                  productId: item.productId,
                  productNameSnapshot: item.productNameSnapshot,
                  productSkuSnapshot: item.productSkuSnapshot,
                  quantity: item.quantity,
                  unitCost: item.unitCost,
                  lineTotal: item.lineTotal,
                })),
              },
            },
            select: safePurchaseOrderSelect,
          });
        } catch (error) {
          if (attempt < 4 && isUniqueConstraintError(error)) {
            continue;
          }

          throw error;
        }
      }

      throw new AppError("INTERNAL_SERVER_ERROR", "Unable to generate purchase order number.", 500);
    });

    return NextResponse.json({ purchaseOrder: created }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", 400));
    }

    return errorResponse(error);
  }
}
