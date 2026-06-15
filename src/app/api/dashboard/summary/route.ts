import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { hasPermission } from "@/lib/rbac/permissions";
import { companyScope } from "@/lib/rbac/tenant-scope";

function decimalToNumber(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function GET() {
  try {
    const currentUser = await requirePermission("dashboard.read");
    const scope = companyScope(currentUser);

    const [
      usersCount,
      activeProducts,
      lowStockProducts,
      draftSalesOrders,
      confirmedSalesOrders,
      draftPurchaseOrders,
      orderedPurchaseOrders,
      openReceivables,
      openPayables,
      financeAccounts,
    ] = await Promise.all([
      hasPermission(currentUser, "users.read")
        ? prisma.user.count({ where: { companyId: scope.companyId } })
        : Promise.resolve(null),
      hasPermission(currentUser, "products.read")
        ? prisma.product.count({ where: { companyId: scope.companyId, status: "active" } })
        : Promise.resolve(null),
      hasPermission(currentUser, "products.read")
        ? prisma.product.count({
            where: { companyId: scope.companyId, status: "active", stockQuantity: { lte: 5 } },
          })
        : Promise.resolve(null),
      hasPermission(currentUser, "sales.read")
        ? prisma.salesOrder.count({ where: { companyId: scope.companyId, status: "draft" } })
        : Promise.resolve(null),
      hasPermission(currentUser, "sales.read")
        ? prisma.salesOrder.count({ where: { companyId: scope.companyId, status: "confirmed" } })
        : Promise.resolve(null),
      hasPermission(currentUser, "purchases.read")
        ? prisma.purchaseOrder.count({ where: { companyId: scope.companyId, status: "draft" } })
        : Promise.resolve(null),
      hasPermission(currentUser, "purchases.read")
        ? prisma.purchaseOrder.count({ where: { companyId: scope.companyId, status: "ordered" } })
        : Promise.resolve(null),
      hasPermission(currentUser, "finance.read")
        ? prisma.receivable.aggregate({
            where: { companyId: scope.companyId, status: { in: ["open", "partial"] } },
            _sum: { amount: true, paidAmount: true },
          })
        : Promise.resolve(null),
      hasPermission(currentUser, "finance.read")
        ? prisma.payable.aggregate({
            where: { companyId: scope.companyId, status: { in: ["open", "partial"] } },
            _sum: { amount: true, paidAmount: true },
          })
        : Promise.resolve(null),
      hasPermission(currentUser, "finance.read")
        ? prisma.financeAccount.count({ where: { companyId: scope.companyId, status: "active" } })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      summary: {
        users: usersCount,
        products: activeProducts === null ? null : { active: activeProducts, lowStock: lowStockProducts ?? 0 },
        sales:
          draftSalesOrders === null
            ? null
            : { draft: draftSalesOrders, confirmed: confirmedSalesOrders ?? 0 },
        procurement:
          draftPurchaseOrders === null
            ? null
            : { draft: draftPurchaseOrders, ordered: orderedPurchaseOrders ?? 0 },
        finance:
          openReceivables === null || openPayables === null
            ? null
            : {
                activeAccounts: financeAccounts ?? 0,
                openReceivables:
                  decimalToNumber(openReceivables._sum.amount) -
                  decimalToNumber(openReceivables._sum.paidAmount),
                openPayables:
                  decimalToNumber(openPayables._sum.amount) -
                  decimalToNumber(openPayables._sum.paidAmount),
              },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
