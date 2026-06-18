import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { csvResponse, toCsv, type CsvColumn } from "@/lib/export/csv";

// Vendor snapshot fields are business data already visible to purchases.read
// holders; no secrets, tokens, or hashes are selected.
const safePurchaseOrderSelect = {
  purchaseOrderNumber: true,
  vendorNameSnapshot: true,
  vendorPhoneSnapshot: true,
  vendorEmailSnapshot: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  totalAmount: true,
  createdAt: true,
  orderedAt: true,
  receivedAt: true,
  cancelledAt: true,
  _count: { select: { items: true } },
} as const;

type PurchaseOrderExportRow = {
  purchaseOrderNumber: string;
  vendorNameSnapshot: string;
  vendorPhoneSnapshot: string | null;
  vendorEmailSnapshot: string | null;
  status: string;
  subtotal: unknown;
  discountAmount: unknown;
  totalAmount: unknown;
  createdAt: Date;
  orderedAt: Date | null;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  _count: { items: number };
};

const columns: CsvColumn<PurchaseOrderExportRow>[] = [
  { header: "Purchase Order Number", value: (row) => row.purchaseOrderNumber },
  { header: "Vendor Name", value: (row) => row.vendorNameSnapshot },
  { header: "Vendor Phone", value: (row) => row.vendorPhoneSnapshot },
  { header: "Vendor Email", value: (row) => row.vendorEmailSnapshot },
  { header: "Status", value: (row) => row.status },
  { header: "Subtotal", value: (row) => row.subtotal },
  { header: "Discount", value: (row) => row.discountAmount },
  { header: "Total", value: (row) => row.totalAmount },
  { header: "Item Count", value: (row) => row._count.items },
  { header: "Created At", value: (row) => row.createdAt },
  { header: "Ordered At", value: (row) => row.orderedAt },
  { header: "Received At", value: (row) => row.receivedAt },
  { header: "Cancelled At", value: (row) => row.cancelledAt },
];

export async function GET() {
  try {
    const currentUser = await requirePermission("purchases.read");
    const scope = companyScope(currentUser);

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { companyId: scope.companyId },
      select: safePurchaseOrderSelect,
      orderBy: { createdAt: "desc" },
    });

    return csvResponse(toCsv(columns, purchaseOrders), "purchase-orders");
  } catch (error) {
    return errorResponse(error);
  }
}
