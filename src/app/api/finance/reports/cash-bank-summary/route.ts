import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function GET() {
  try {
    const currentUser = await requirePermission("finance.cashbank.read");
    const scope = companyScope(currentUser);

    const accounts = await prisma.financeAccount.findMany({
      where: {
        companyId: scope.companyId,
        status: "active",
        kind: { in: ["cash", "bank", "mobile_money"] },
      },
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        currentBalance: true,
      },
      orderBy: [{ kind: "asc" }, { code: "asc" }],
    });

    const rows = accounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      kind: account.kind,
      currentBalance: round2(Number(account.currentBalance)),
      isNegative: Number(account.currentBalance) < 0,
    }));

    const totalLiquidBalance = round2(rows.reduce((sum, row) => sum + row.currentBalance, 0));
    const negativeBalanceCount = rows.filter((row) => row.isNegative).length;

    return NextResponse.json({
      report: {
        generatedAt: new Date().toISOString(),
        accountCount: rows.length,
        totalLiquidBalance,
        negativeBalanceCount,
        warnings: {
          noCashBankAccounts: rows.length === 0,
          hasNegativeBalances: negativeBalanceCount > 0,
        },
        rows,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
