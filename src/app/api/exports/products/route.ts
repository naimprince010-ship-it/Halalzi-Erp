import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { csvResponse, toCsv, type CsvColumn } from "@/lib/export/csv";

// Only non-sensitive product fields are exported.
const safeProductSelect = {
  id: true,
  name: true,
  sku: true,
  category: true,
  salePrice: true,
  costPrice: true,
  stockQuantity: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ProductExportRow = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  salePrice: unknown;
  costPrice: unknown;
  stockQuantity: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

const columns: CsvColumn<ProductExportRow>[] = [
  { header: "ID", value: (row) => row.id },
  { header: "Name", value: (row) => row.name },
  { header: "SKU", value: (row) => row.sku },
  { header: "Category", value: (row) => row.category },
  { header: "Sale Price", value: (row) => row.salePrice },
  { header: "Cost Price", value: (row) => row.costPrice },
  { header: "Stock Quantity", value: (row) => row.stockQuantity },
  { header: "Status", value: (row) => row.status },
  { header: "Created At", value: (row) => row.createdAt },
  { header: "Updated At", value: (row) => row.updatedAt },
];

export async function GET() {
  try {
    const currentUser = await requirePermission("products.read");
    const scope = companyScope(currentUser);

    const products = await prisma.product.findMany({
      where: { companyId: scope.companyId },
      select: safeProductSelect,
      orderBy: { createdAt: "desc" },
    });

    return csvResponse(toCsv(columns, products), "products");
  } catch (error) {
    return errorResponse(error);
  }
}
