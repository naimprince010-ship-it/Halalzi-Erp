import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { csvResponse, toCsv, type CsvColumn } from "@/lib/export/csv";

// Customer contact fields are business data already visible to sales.read
// holders; no secrets, tokens, or hashes are selected.
const safeSalesOrderSelect = {
  orderNumber: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  customerAddress: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  totalAmount: true,
  createdAt: true,
  confirmedAt: true,
  cancelledAt: true,
  completedAt: true,
  _count: { select: { items: true } },
} as const;

type SalesOrderExportRow = {
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  status: string;
  subtotal: unknown;
  discountAmount: unknown;
  totalAmount: unknown;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  _count: { items: number };
};

const columns: CsvColumn<SalesOrderExportRow>[] = [
  { header: "Order Number", value: (row) => row.orderNumber },
  { header: "Customer Name", value: (row) => row.customerName },
  { header: "Customer Phone", value: (row) => row.customerPhone },
  { header: "Customer Email", value: (row) => row.customerEmail },
  { header: "Customer Address", value: (row) => row.customerAddress },
  { header: "Status", value: (row) => row.status },
  { header: "Subtotal", value: (row) => row.subtotal },
  { header: "Discount", value: (row) => row.discountAmount },
  { header: "Total", value: (row) => row.totalAmount },
  { header: "Item Count", value: (row) => row._count.items },
  { header: "Created At", value: (row) => row.createdAt },
  { header: "Confirmed At", value: (row) => row.confirmedAt },
  { header: "Cancelled At", value: (row) => row.cancelledAt },
  { header: "Completed At", value: (row) => row.completedAt },
];

export async function GET() {
  try {
    const currentUser = await requirePermission("sales.read");
    const scope = companyScope(currentUser);

    const salesOrders = await prisma.salesOrder.findMany({
      where: { companyId: scope.companyId },
      select: safeSalesOrderSelect,
      orderBy: { createdAt: "desc" },
    });

    return csvResponse(toCsv(columns, salesOrders), "sales-orders");
  } catch (error) {
    return errorResponse(error);
  }
}
