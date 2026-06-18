import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { csvResponse, toCsv, type CsvColumn } from "@/lib/export/csv";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

// Audit exports intentionally exclude metadata to avoid accidental sensitive
// payload leakage. The dashboard API can show metadata later if reviewed.
const safeAuditLogSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  summary: true,
  createdAt: true,
  user: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

type AuditLogExportRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
  user: {
    name: string;
    email: string;
  } | null;
};

const columns: CsvColumn<AuditLogExportRow>[] = [
  { header: "ID", value: (row) => row.id },
  { header: "Action", value: (row) => row.action },
  { header: "Entity Type", value: (row) => row.entityType },
  { header: "Entity ID", value: (row) => row.entityId },
  { header: "Summary", value: (row) => row.summary },
  { header: "User Name", value: (row) => row.user?.name ?? "System" },
  { header: "User Email", value: (row) => row.user?.email ?? "" },
  { header: "Created At", value: (row) => row.createdAt },
];

export async function GET() {
  try {
    const currentUser = await requirePermission("audit.read");
    const scope = companyScope(currentUser);

    const auditLogs = await prisma.auditLog.findMany({
      where: { companyId: scope.companyId },
      select: safeAuditLogSelect,
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    return csvResponse(toCsv(columns, auditLogs), "audit-logs");
  } catch (error) {
    return errorResponse(error);
  }
}
