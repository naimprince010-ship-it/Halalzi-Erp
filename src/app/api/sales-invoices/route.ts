import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requireAnyPermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { parseInvoiceStatusFilter, parsePositiveInt, safeSalesInvoiceSelect } from "./_shared";

type SalesInvoiceListWhere = Prisma.SalesInvoiceWhereInput;

export async function GET(request: Request) {
  try {
    const currentUser = await requireAnyPermission(["sales.invoices.read", "finance.read"]);
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);

    const status = parseInvoiceStatusFilter(searchParams.get("status"));
    const search = searchParams.get("search")?.trim();
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);

    const where: SalesInvoiceListWhere = {
      ...scope,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: "insensitive" } },
              { customerNameSnapshot: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, invoices] = await Promise.all([
      prisma.salesInvoice.count({ where }),
      prisma.salesInvoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: safeSalesInvoiceSelect,
      }),
    ]);

    return NextResponse.json({
      data: invoices,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
