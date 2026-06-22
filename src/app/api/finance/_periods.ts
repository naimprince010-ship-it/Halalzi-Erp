import { z } from "zod";

import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const financePeriodStatuses = ["open", "closed"] as const;

export const createFinancePeriodSchema = z
  .object({
    periodKey: z.string().trim().min(1, "Period key is required.").max(32),
    startDate: z.string().trim().datetime(),
    endDate: z.string().trim().datetime(),
  })
  .superRefine((value, context) => {
    const start = new Date(value.startDate);
    const end = new Date(value.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      context.addIssue({
        code: "custom",
        message: "endDate must be the same or later than startDate.",
      });
    }
  });

export const updateFinancePeriodSchema = z
  .object({
    periodKey: z.string().trim().min(1).max(32).optional(),
    startDate: z.string().trim().datetime().optional(),
    endDate: z.string().trim().datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one period field is required.");

export const periodListQuerySchema = z.object({
  status: z.enum(financePeriodStatuses).optional(),
});

export const safeFinancePeriodSelect = {
  id: true,
  periodKey: true,
  startDate: true,
  endDate: true,
  status: true,
  closedAt: true,
  closedByUserId: true,
  createdAt: true,
  updatedAt: true,
  closedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function ensureNoPeriodOverlap(
  client: DbClient,
  companyId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
) {
  const overlap = await client.financePeriod.findFirst({
    where: {
      companyId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, periodKey: true },
  });

  if (overlap) {
    throw new AppError("VALIDATION_ERROR", `Finance period overlaps with existing period ${overlap.periodKey}.`, 409);
  }
}

export async function assertPeriodOpenForDate(client: DbClient, companyId: string, date: Date) {
  const closedPeriod = await client.financePeriod.findFirst({
    where: {
      companyId,
      status: "closed",
      startDate: { lte: date },
      endDate: { gte: date },
    },
    select: { id: true, periodKey: true },
  });

  if (closedPeriod) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Finance period ${closedPeriod.periodKey} is closed for the selected date.`,
      400,
    );
  }
}
