import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { renderPrintableDocument } from "@/lib/print/document-html";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

function statusLabel(value: string) {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("pos.receipts.print");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const sale = await prisma.posSale.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: {
        saleNumber: true,
        customerNameSnapshot: true,
        customerPhoneSnapshot: true,
        status: true,
        subtotal: true,
        discountAmount: true,
        totalAmount: true,
        paidAmount: true,
        changeAmount: true,
        paymentMethod: true,
        completedAt: true,
        updatedAt: true,
        company: {
          select: {
            name: true,
          },
        },
        cashierUser: {
          select: {
            name: true,
            email: true,
          },
        },
        paymentAccount: {
          select: {
            name: true,
          },
        },
        items: {
          select: {
            productNameSnapshot: true,
            productSkuSnapshot: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!sale) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this POS receipt.", 403);
    }

    const html = renderPrintableDocument({
      title: "POS Receipt",
      documentNumber: sale.saleNumber,
      documentNumberLabel: "Receipt number",
      companyName: sale.company.name,
      partyLabel: "Customer",
      partyName: sale.customerNameSnapshot ?? "Walk-in customer",
      partyContact: sale.customerPhoneSnapshot,
      status: statusLabel(sale.status),
      createdAt: sale.completedAt,
      updatedAt: sale.updatedAt,
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      totalAmount: Number(sale.totalAmount),
      tenderedAmount: Number(sale.paidAmount),
      changeAmount: Number(sale.changeAmount),
      unitAmountLabel: "Unit price",
      lines: sale.items.map((item) => ({
        sku: item.productSkuSnapshot,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        unitAmount: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
      meta: [
        { label: "Payment method", value: statusLabel(sale.paymentMethod) },
        { label: "Payment account", value: sale.paymentAccount?.name },
        { label: "Cashier", value: sale.cashierUser?.name ?? sale.cashierUser?.email },
        { label: "Completed", value: sale.completedAt.toISOString() },
      ],
      notes: "Thank you for your purchase.",
      footerText: "Goods sold are subject to store return policy. Keep this receipt for your records.",
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
