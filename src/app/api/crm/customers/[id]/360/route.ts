import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safeCustomerSelect, safeDealSelect, safeSalesTaskSelect } from "../../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("crm.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const customer = await prisma.customerContact.findFirst({
      where: { id, companyId: scope.companyId },
      select: safeCustomerSelect,
    });

    if (!customer) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this customer.", 403);
    }

    const [deals, tasks] = await Promise.all([
      prisma.deal.findMany({
        where: { companyId: scope.companyId, customerContactId: id, status: { not: "archived" } },
        select: safeDealSelect,
        orderBy: { createdAt: "desc" },
      }),
      prisma.salesTask.findMany({
        where: { companyId: scope.companyId, customerContactId: id },
        select: safeSalesTaskSelect,
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      }),
    ]);

    return NextResponse.json({ customer360: { customer, deals, tasks } });
  } catch (error) {
    return errorResponse(error);
  }
}
