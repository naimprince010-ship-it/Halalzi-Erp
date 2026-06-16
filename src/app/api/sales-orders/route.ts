import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computeOrderTotals,
  createSalesOrderSchema,
  generateOrderNumber,
  isUniqueConstraintError,
  normalizeOptionalText,
  prepareOrderItems,
  safeSalesOrderSelect,
} from "./_shared";

type SalesOrderListWhere = Prisma.SalesOrderWhereInput;

const STATUS_VALUES = ["draft", "confirmed", "cancelled", "completed"] as const;

function parseStatusFilter(value: string | null) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (!STATUS_VALUES.includes(normalized as (typeof STATUS_VALUES)[number])) {
    throw new AppError("VALIDATION_ERROR", "Invalid status filter.", 400);
  }

  return normalized as (typeof STATUS_VALUES)[number];
}

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError("VALIDATION_ERROR", "Invalid pagination values.", 400);
  }

  return parsed;
}

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("sales.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);

    const status = parseStatusFilter(searchParams.get("status"));
    const search = searchParams.get("search")?.trim();
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);

    const where: SalesOrderListWhere = {
      ...scope,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" } },
              { customerName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, salesOrders] = await Promise.all([
      prisma.salesOrder.count({ where }),
      prisma.salesOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: safeSalesOrderSelect,
      }),
    ]);

    return NextResponse.json({
      data: salesOrders,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("sales.create");
    const scope = companyScope(currentUser);
    const json = await request.json();
    const parsed = createSalesOrderSchema.safeParse(json);

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
      const preparedItems = await prepareOrderItems(tx, scope.companyId, parsed.data.items);
      const totals = computeOrderTotals(preparedItems, parsed.data.discountAmount);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const orderNumber = generateOrderNumber();

        try {
          return await tx.salesOrder.create({
            data: {
              companyId: scope.companyId,
              orderNumber,
              customerName: parsed.data.customerName,
              customerPhone: normalizeOptionalText(parsed.data.customerPhone) ?? null,
              customerEmail: normalizeOptionalText(parsed.data.customerEmail) ?? null,
              customerAddress: normalizeOptionalText(parsed.data.customerAddress) ?? null,
              status: "draft",
              subtotal: totals.subtotal,
              discountAmount: totals.discountAmount,
              totalAmount: totals.totalAmount,
              notes: normalizeOptionalText(parsed.data.notes) ?? null,
              items: {
                create: preparedItems.map((item) => ({
                  productId: item.productId,
                  productNameSnapshot: item.productNameSnapshot,
                  productSkuSnapshot: item.productSkuSnapshot,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  lineTotal: item.lineTotal,
                })),
              },
            },
            select: safeSalesOrderSelect,
          });
        } catch (error) {
          if (attempt < 4 && isUniqueConstraintError(error)) {
            continue;
          }

          throw error;
        }
      }

      throw new AppError("INTERNAL_SERVER_ERROR", "Unable to generate sales order number.", 500);
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_order.create",
      entityType: "sales_order",
      entityId: created.id,
      summary: `Sales order created: ${created.orderNumber}`,
      metadata: {
        orderNumber: created.orderNumber,
        status: created.status,
        totalAmount: Number(created.totalAmount),
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
