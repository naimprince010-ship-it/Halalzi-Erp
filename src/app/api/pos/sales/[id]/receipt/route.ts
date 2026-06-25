import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { renderPrintableDocument } from "@/lib/print/document-html";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

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
      companyName: sale.company.name,
      partyLabel: "Customer",
      partyName: sale.customerNameSnapshot ?? "Walk-in customer",
      partyContact: sale.customerPhoneSnapshot,
      status: sale.status,
      createdAt: sale.completedAt,
      updatedAt: sale.updatedAt,
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discountAmount),
      totalAmount: Number(sale.totalAmount),
      unitAmountLabel: "Unit price",
      lines: sale.items.map((item) => ({
        sku: item.productSkuSnapshot,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        unitAmount: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
      meta: [
        { label: "Payment method", value: sale.paymentMethod },
        { label: "Payment account", value: sale.paymentAccount?.name },
        { label: "Paid", value: String(Number(sale.paidAmount)) },
        { label: "Change", value: String(Number(sale.changeAmount)) },
        { label: "Cashier", value: sale.cashierUser?.name ?? sale.cashierUser?.email },
      ],
      notes: "Thank you for your purchase.",
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
