import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const closeSessionSchema = z.object({
  closingCash: z.number().min(0).max(99999999),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("pos.sessions.manage");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const parsed = closeSessionSchema.parse(await request.json().catch(() => ({})));

    const session = await prisma.$transaction(async (tx) => {
      const openSession = await tx.posSession.findFirst({
        where: {
          id,
          companyId: scope.companyId,
          cashierUserId: currentUser.user.id,
          status: "open",
        },
        select: {
          id: true,
          openingFloat: true,
        },
      });

      if (!openSession) {
        throw new AppError("FORBIDDEN", "You do not have permission to close this POS session.", 403);
      }

      const saleSummary = await tx.posSale.aggregate({
        where: {
          companyId: scope.companyId,
          posSessionId: openSession.id,
          status: "completed",
        },
        _count: { id: true },
        _sum: { totalAmount: true },
      });

      const expectedCash = Number(openSession.openingFloat) + Number(saleSummary._sum.totalAmount ?? 0);
      const variance = parsed.closingCash - expectedCash;

      const closedSession = await tx.posSession.update({
        where: { id: openSession.id },
        data: {
          status: "closed",
          closedAt: new Date(),
          closingCash: parsed.closingCash,
          expectedCash,
          variance,
          note: parsed.note || undefined,
        },
        select: {
          id: true,
          counterName: true,
          status: true,
          openingFloat: true,
          closingCash: true,
          expectedCash: true,
          variance: true,
          openedAt: true,
          closedAt: true,
          note: true,
        },
      });

      await recordAuditLog({
        client: tx,
        companyId: scope.companyId,
        userId: currentUser.user.id,
        action: "pos.session.close",
        entityType: "pos_session",
        entityId: closedSession.id,
        summary: "POS session closed.",
        metadata: {
          saleCount: saleSummary._count.id,
          salesTotal: Number(saleSummary._sum.totalAmount ?? 0),
          expectedCash,
          closingCash: parsed.closingCash,
          variance,
        },
      });

      return closedSession;
    });

    return NextResponse.json({ data: session });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid POS session close payload.", 400));
    }

    return errorResponse(error);
  }
}
