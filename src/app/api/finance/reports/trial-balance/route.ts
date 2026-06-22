import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isNormalDebitAccount(type: string) {
  return type === "asset" || type === "expense";
}

export async function GET() {
  try {
    const currentUser = await requirePermission("finance.reports.read");
    const scope = companyScope(currentUser);

    const accounts = await prisma.financeAccount.findMany({
      where: {
        companyId: scope.companyId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        status: true,
        openingBalance: true,
        currentBalance: true,
      },
      orderBy: [{ code: "asc" }],
    });

    const rows = accounts.map((account) => {
      const balance = Number(account.currentBalance);
      const normalDebit = isNormalDebitAccount(account.type);
      const debit = normalDebit ? Math.max(balance, 0) : Math.max(-balance, 0);
      const credit = normalDebit ? Math.max(-balance, 0) : Math.max(balance, 0);

      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        status: account.status,
        openingBalance: round2(Number(account.openingBalance)),
        currentBalance: round2(balance),
        debit: round2(debit),
        credit: round2(credit),
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += row.debit;
        acc.credit += row.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    return NextResponse.json({
      report: {
        generatedAt: new Date().toISOString(),
        rows,
        totals: {
          debit: round2(totals.debit),
          credit: round2(totals.credit),
          isBalanced: round2(totals.debit) === round2(totals.credit),
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
