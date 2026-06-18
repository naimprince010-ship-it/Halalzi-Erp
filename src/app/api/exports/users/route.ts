import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { csvResponse, toCsv, type CsvColumn } from "@/lib/export/csv";

// Sensitive fields (passwordHash, tokens, secrets) are never selected.
const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  createdAt: true,
  userRoles: {
    select: {
      role: { select: { name: true } },
    },
  },
} as const;

type UserExportRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: Date;
  userRoles: { role: { name: string } }[];
};

const columns: CsvColumn<UserExportRow>[] = [
  { header: "ID", value: (row) => row.id },
  { header: "Name", value: (row) => row.name },
  { header: "Email", value: (row) => row.email },
  { header: "Status", value: (row) => row.status },
  {
    header: "Roles",
    value: (row) => row.userRoles.map((userRole) => userRole.role.name).join("; "),
  },
  { header: "Created At", value: (row) => row.createdAt },
];

export async function GET() {
  try {
    const currentUser = await requirePermission("users.read");
    const scope = companyScope(currentUser);

    const users = await prisma.user.findMany({
      where: { companyId: scope.companyId },
      select: safeUserSelect,
      orderBy: { createdAt: "desc" },
    });

    return csvResponse(toCsv(columns, users), "users");
  } catch (error) {
    return errorResponse(error);
  }
}
