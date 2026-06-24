import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requireAnyPermission, requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const accountTypes = ["asset", "liability", "equity", "income", "expense"] as const;
const accountStatuses = ["active", "inactive"] as const;
const accountKinds = ["general", "cash", "bank", "mobile_money"] as const;

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Amount must be a valid number.")
  .refine((value) => value >= 0, "Amount must be zero or greater.");

const createFinanceAccountSchema = z.object({
  name: z.string().trim().min(1, "Account name is required.").max(120),
  code: z.string().trim().min(1, "Account code is required.").max(64),
  type: z.enum(accountTypes),
  kind: z.enum(accountKinds).optional(),
  status: z.enum(accountStatuses).optional(),
  openingBalance: moneySchema.optional(),
});

const listFinanceAccountQuerySchema = z.object({
  kind: z.enum(accountKinds).optional(),
});

const safeFinanceAccountSelect = {
  id: true,
  name: true,
  code: true,
  type: true,
  kind: true,
  status: true,
  openingBalance: true,
  currentBalance: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("finance.read");
    const scope = companyScope(currentUser);
    const { searchParams } = new URL(request.url);
    const query = listFinanceAccountQuerySchema.parse({
      kind: searchParams.get("kind") ?? undefined,
    });

    const accounts = await prisma.financeAccount.findMany({
      where: {
        ...scope,
        kind: query.kind,
      },
      select: safeFinanceAccountSelect,
      orderBy: [{ type: "asc" }, { code: "asc" }],
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", "Please provide valid account filters.", 400));
    }

    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireAnyPermission(["finance.accounts.create", "finance.cashbank.manage"]);
    const scope = companyScope(currentUser);
    const input = createFinanceAccountSchema.parse(await request.json());
    const openingBalance = input.openingBalance ?? 0;
    const selectedKind = input.kind ?? "general";
    const canManageCashBank = currentUser.permissions.includes("finance.cashbank.manage");

    if (!canManageCashBank && selectedKind !== "general") {
      throw new AppError(
        "FORBIDDEN",
        "You do not have permission to set cash or bank account kinds.",
        403,
      );
    }

    const account = await prisma.financeAccount.create({
      data: {
        companyId: scope.companyId,
        name: input.name,
        code: input.code,
        type: input.type,
        kind: selectedKind,
        status: input.status ?? "active",
        openingBalance,
        currentBalance: openingBalance,
      },
      select: safeFinanceAccountSelect,
    });

    if (selectedKind !== "general") {
      await recordAuditLog({
        companyId: scope.companyId,
        userId: currentUser.user.id,
        action: "finance.cashbank.account_marked",
        entityType: "finance_account",
        entityId: account.id,
        summary: `Finance account marked as ${selectedKind}: ${account.code}`,
        metadata: {
          accountId: account.id,
          accountCode: account.code,
          accountKind: selectedKind,
        },
      });
    }

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "Please provide valid finance account details.", 400),
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
