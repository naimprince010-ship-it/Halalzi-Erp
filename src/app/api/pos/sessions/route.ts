import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const openSessionSchema = z.object({
  counterName: z.string().trim().max(80).optional(),
  openingFloat: z.number().min(0).max(99999999).optional().default(0),
  note: z.string().trim().max(500).optional(),
});

const posSessionSelect = {
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
  cashierUser: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

export async function GET() {
  try {
    const currentUser = await requirePermission("pos.sessions.read");
    const scope = companyScope(currentUser);

    const sessions = await prisma.posSession.findMany({
      where: {
        companyId: scope.companyId,
      },
      select: posSessionSelect,
      orderBy: { openedAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ data: sessions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("pos.sessions.manage");
    const scope = companyScope(currentUser);
    const parsed = openSessionSchema.parse(await request.json().catch(() => ({})));

    const session = await prisma.$transaction(async (tx) => {
      const existingOpenSession = await tx.posSession.findFirst({
        where: {
          companyId: scope.companyId,
          cashierUserId: currentUser.user.id,
          status: "open",
        },
        select: { id: true },
      });

      if (existingOpenSession) {
        throw new AppError("VALIDATION_ERROR", "Close the current POS session before opening a new one.", 400);
      }

      const createdSession = await tx.posSession.create({
        data: {
          companyId: scope.companyId,
          cashierUserId: currentUser.user.id,
          counterName: parsed.counterName || null,
          openingFloat: parsed.openingFloat,
          note: parsed.note || null,
        },
        select: posSessionSelect,
      });

      await recordAuditLog({
        client: tx,
        companyId: scope.companyId,
        userId: currentUser.user.id,
        action: "pos.session.open",
        entityType: "pos_session",
        entityId: createdSession.id,
        summary: `POS session opened${createdSession.counterName ? `: ${createdSession.counterName}` : ""}.`,
        metadata: {
          openingFloat: Number(createdSession.openingFloat),
        },
      });

      return createdSession;
    });

    return NextResponse.json({ data: session }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid POS session payload.", 400));
    }

    return errorResponse(error);
  }
}
