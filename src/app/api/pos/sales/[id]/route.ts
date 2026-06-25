import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import { safePosSaleSelect } from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("pos.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const sale = await prisma.posSale.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safePosSaleSelect,
    });

    if (!sale) {
      throw new AppError("FORBIDDEN", "You do not have permission to access this POS sale.", 403);
    }

    return NextResponse.json({ data: sale });
  } catch (error) {
    return errorResponse(error);
  }
}
