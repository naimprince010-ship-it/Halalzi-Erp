import { z } from "zod";
import { AppError } from "@/lib/auth/auth-errors";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

const optionalNullableTextSchema = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      if (value === null) {
        return null;
      }

      return value.length > 0 ? value : null;
    });

const optionalNullableEmailSchema = z
  .string()
  .trim()
  .email("Please provide a valid email.")
  .max(255)
  .nullable()
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    return value.length > 0 ? value.toLowerCase() : null;
  });

const decimalInputSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "number" ? value : Number(value.trim())))
  .refine((value) => Number.isFinite(value), "Must be a valid number.");

const optionalNullableDateSchema = z
  .union([z.string(), z.date()])
  .nullable()
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    return date;
  })
  .refine((value) => value === undefined || value === null || !Number.isNaN(value.getTime()), "Invalid date.");

export const createLeadSchema = z.object({
  name: z.string().trim().min(1, "Lead name is required.").max(120),
  companyName: optionalNullableTextSchema(120),
  email: optionalNullableEmailSchema,
  phone: optionalNullableTextSchema(40),
  source: optionalNullableTextSchema(80),
  stage: z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]).optional(),
  estimatedValue: decimalInputSchema
    .refine((value) => value >= 0, "estimatedValue must be non-negative.")
    .nullable()
    .optional(),
  expectedCloseDate: optionalNullableDateSchema,
  nextFollowUpAt: optionalNullableDateSchema,
  notes: optionalNullableTextSchema(1000),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  stage: z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]).optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(120),
  companyName: optionalNullableTextSchema(120),
  email: optionalNullableEmailSchema,
  phone: optionalNullableTextSchema(40),
  address: optionalNullableTextSchema(500),
  notes: optionalNullableTextSchema(1000),
  status: z.enum(["active", "inactive"]).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createLeadActivitySchema = z.object({
  type: z.enum(["call", "email", "whatsapp", "meeting", "note", "stage_change", "conversion", "archive"]),
  note: z.string().trim().min(1, "Activity note is required.").max(1000),
});

export const convertLeadSchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  customer: createCustomerSchema.optional(),
});

export const leadListQuerySchema = z.object({
  stage: z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]).optional(),
  status: z.enum(["active", "converted", "archived"]).optional(),
  q: z.string().trim().max(120).optional(),
  followUp: z.enum(["due", "overdue"]).optional(),
});

export const customerListQuerySchema = z.object({
  status: z.enum(["active", "inactive", "archived"]).optional(),
  q: z.string().trim().max(120).optional(),
});

export const safeLeadSelect = {
  id: true,
  name: true,
  companyName: true,
  email: true,
  phone: true,
  source: true,
  stage: true,
  status: true,
  estimatedValue: true,
  expectedCloseDate: true,
  nextFollowUpAt: true,
  notes: true,
  convertedCustomerId: true,
  convertedAt: true,
  createdAt: true,
  updatedAt: true,
  convertedCustomer: {
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      phone: true,
      status: true,
    },
  },
} as const;

export const safeCustomerSelect = {
  id: true,
  name: true,
  companyName: true,
  email: true,
  phone: true,
  address: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const safeLeadActivitySelect = {
  id: true,
  leadId: true,
  userId: true,
  type: true,
  note: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the submitted fields.";
}

export function crmForbidden(message = "You do not have permission to access this CRM record.") {
  return new AppError("FORBIDDEN", message, 403);
}

export async function assertLeadInCompany(client: DbClient, id: string, companyId: string) {
  const lead = await client.lead.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      status: true,
      stage: true,
      name: true,
      companyName: true,
      email: true,
      phone: true,
      notes: true,
    },
  });

  if (!lead) {
    throw crmForbidden("You do not have permission to access this lead.");
  }

  return lead;
}

export async function assertCustomerInCompany(client: DbClient, id: string, companyId: string) {
  const customer = await client.customerContact.findFirst({
    where: { id, companyId },
    select: { id: true, status: true },
  });

  if (!customer) {
    throw crmForbidden("You do not have permission to access this customer.");
  }

  return customer;
}

export function toLeadData(input: z.infer<typeof createLeadSchema> | z.infer<typeof updateLeadSchema>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    ...(input.estimatedValue !== undefined ? { estimatedValue: input.estimatedValue } : {}),
    ...(input.expectedCloseDate !== undefined ? { expectedCloseDate: input.expectedCloseDate } : {}),
    ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

export function toCustomerData(input: z.infer<typeof createCustomerSchema> | z.infer<typeof updateCustomerSchema>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
}
