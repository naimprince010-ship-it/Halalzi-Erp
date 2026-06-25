import { errorResponse } from "@/lib/auth/auth-errors";
import { csvResponse, toCsv, type CsvColumn } from "@/lib/export/csv";
import { requirePermission } from "@/lib/rbac/guards";

type ProductTemplateRow = {
  sku: string;
  name: string;
  category: string;
  salePrice: string;
  costPrice: string;
  openingStockQuantity: string;
  status: "active" | "inactive";
  notes: string;
};

const columns: CsvColumn<ProductTemplateRow>[] = [
  { header: "sku", value: (row) => row.sku },
  { header: "name", value: (row) => row.name },
  { header: "category", value: (row) => row.category },
  { header: "salePrice", value: (row) => row.salePrice },
  { header: "costPrice", value: (row) => row.costPrice },
  { header: "openingStockQuantity", value: (row) => row.openingStockQuantity },
  { header: "status", value: (row) => row.status },
  { header: "notes", value: (row) => row.notes },
];

const exampleRows: ProductTemplateRow[] = [
  {
    sku: "SKU-001",
    name: "Example Product",
    category: "General",
    salePrice: "100.00",
    costPrice: "70.00",
    openingStockQuantity: "25",
    status: "active",
    notes: "SKU must be unique inside the company.",
  },
  {
    sku: "SKU-002",
    name: "Inactive Example",
    category: "General",
    salePrice: "0.00",
    costPrice: "",
    openingStockQuantity: "0",
    status: "inactive",
    notes: "Use active or inactive only.",
  },
];

export async function GET() {
  try {
    await requirePermission("products.read");

    return csvResponse(toCsv(columns, exampleRows), "products-template");
  } catch (error) {
    return errorResponse(error);
  }
}
