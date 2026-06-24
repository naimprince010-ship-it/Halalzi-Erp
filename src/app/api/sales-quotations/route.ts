import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  computeOrderTotals,
  createPreparedQuotationItems,
  createSalesQuotationSchema,
  generateQuoteNumber,
  isUniqueConstraintError,
  normalizeOptionalText,
  parsePositiveInt,
  parseQuotationStatusFilter,
  safeSalesQuotationSelect,
} from "./_shared";

type SalesQuotationListWhere = Prisma.SalesQuotationWhereInput;

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("sales.quotations.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);

    const status = parseQuotationStatusFilter(searchParams.get("status"));
    const search = searchParams.get("search")?.trim();
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);

    const where: SalesQuotationListWhere = {
      ...scope,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { quoteNumber: { contains: search, mode: "insensitive" } },
              { customerName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, quotations] = await Promise.all([
      prisma.salesQuotation.count({ where }),
      prisma.salesQuotation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: safeSalesQuotationSelect,
      }),
    ]);

    return NextResponse.json({
      data: quotations,
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
    const currentUser = await requirePermission("sales.quotations.create");
    const scope = companyScope(currentUser);
    const json = await request.json();
    const parsed = createSalesQuotationSchema.safeParse(json);

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
      const preparedItems = await createPreparedQuotationItems(tx, scope.companyId, parsed.data.items);
      const totals = computeOrderTotals(preparedItems, parsed.data.discountAmount);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const quoteNumber = generateQuoteNumber();

        try {
          return await tx.salesQuotation.create({
            data: {
              companyId: scope.companyId,
              quoteNumber,
              customerName: parsed.data.customerName,
              customerPhone: normalizeOptionalText(parsed.data.customerPhone) ?? null,
              customerEmail: normalizeOptionalText(parsed.data.customerEmail) ?? null,
              customerAddress: normalizeOptionalText(parsed.data.customerAddress) ?? null,
              status: "draft",
              validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
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
            select: safeSalesQuotationSelect,
          });
        } catch (error) {
          if (attempt < 4 && isUniqueConstraintError(error)) {
            continue;
          }

          throw error;
        }
      }

      throw new AppError("INTERNAL_SERVER_ERROR", "Unable to generate quotation number.", 500);
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "sales_quote.create",
      entityType: "sales_quote",
      entityId: created.id,
      summary: `Sales quotation created: ${created.quoteNumber}`,
      metadata: {
        quoteNumber: created.quoteNumber,
        status: created.status,
        totalAmount: Number(created.totalAmount),
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
