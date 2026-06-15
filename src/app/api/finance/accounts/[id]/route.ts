import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse, forbidden } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const accountTypes = ["asset", "liability", "equity", "income", "expense"] as const;
const accountStatuses = ["active", "inactive"] as const;

const updateFinanceAccountSchema = z
  .object({
    name: z.string().trim().min(1, "Account name is required.").max(120).optional(),
    code: z.string().trim().min(1, "Account code is required.").max(64).optional(),
    type: z.enum(accountTypes).optional(),
    status: z.enum(accountStatuses).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one finance account field is required.",
  });

const safeFinanceAccountSelect = {
  id: true,
  name: true,
  code: true,
  type: true,
  status: true,
  openingBalance: true,
  currentBalance: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    const account = await prisma.financeAccount.findFirst({
      where: { id, companyId: scope.companyId },
      select: safeFinanceAccountSelect,
    });

    if (!account) {
      throw forbidden("You do not have permission to access this finance account.");
    }

    return NextResponse.json({ account });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requirePermission("finance.accounts.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;
    const input = updateFinanceAccountSchema.parse(await request.json());

    const existingAccount = await prisma.financeAccount.findFirst({
      where: { id, companyId: scope.companyId },
      select: { id: true },
    });

    if (!existingAccount) {
      throw forbidden("You do not have permission to update this finance account.");
    }

    const account = await prisma.financeAccount.update({
      where: { id },
      data: input,
      select: safeFinanceAccountSelect,
    });

    return NextResponse.json({ account });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "Please provide valid finance account update details.", 400),
      );
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError(
          "VALIDATION_ERROR",
          "A finance account with this code already exists in your company.",
          409,
        ),
      );
    }

    return errorResponse(error);
  }
}
