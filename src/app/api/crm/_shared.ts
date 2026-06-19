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

export const pipelineStageSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Stage key is required.")
    .max(80)
    .regex(/^[a-z0-9_ -]+$/i, "Stage key can only contain letters, numbers, spaces, hyphens, and underscores.")
    .transform((value) => value.toLowerCase().replace(/\s+/g, "_")),
  name: z.string().trim().min(1, "Stage name is required.").max(120),
  sortOrder: z.coerce.number().int().min(0).max(1000),
  description: optionalNullableTextSchema(500),
  isActive: z.boolean().optional(),
});

export const updatePipelineStageSchema = pipelineStageSchema.partial().omit({ key: true });

export const dealListQuerySchema = z.object({
  status: z.enum(["active", "won", "lost", "archived", "cancelled"]).optional(),
  stageId: z.string().trim().min(1).optional(),
  q: z.string().trim().max(120).optional(),
});

export const createDealSchema = z.object({
  name: z.string().trim().min(1, "Deal name is required.").max(160),
  description: optionalNullableTextSchema(1000),
  value: decimalInputSchema.refine((value) => value >= 0, "value must be non-negative.").nullable().optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseDate: optionalNullableDateSchema,
  currentStageId: z.string().trim().min(1).optional(),
  leadId: z.string().trim().min(1).nullable().optional(),
  customerContactId: z.string().trim().min(1).nullable().optional(),
});

export const updateDealSchema = createDealSchema.partial();

export const closeLostSchema = z.object({
  lostReason: z.string().trim().min(1, "Lost reason is required.").max(500),
  note: optionalNullableTextSchema(1000),
});

export const closeWonSchema = z.object({
  note: optionalNullableTextSchema(1000),
});

export const taskListQuerySchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  dealId: z.string().trim().min(1).optional(),
  leadId: z.string().trim().min(1).optional(),
  customerContactId: z.string().trim().min(1).optional(),
  assignedToUserId: z.string().trim().min(1).optional(),
  q: z.string().trim().max(120).optional(),
});

export const createSalesTaskSchema = z.object({
  title: z.string().trim().min(1, "Task title is required.").max(160),
  description: optionalNullableTextSchema(1000),
  dueAt: optionalNullableDateSchema,
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dealId: z.string().trim().min(1).nullable().optional(),
  leadId: z.string().trim().min(1).nullable().optional(),
  customerContactId: z.string().trim().min(1).nullable().optional(),
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
});

export const updateSalesTaskSchema = createSalesTaskSchema.partial();

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

export const safePipelineStageSelect = {
  id: true,
  key: true,
  name: true,
  sortOrder: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const safeDealSelect = {
  id: true,
  name: true,
  description: true,
  value: true,
  probability: true,
  expectedCloseDate: true,
  currentStageId: true,
  leadId: true,
  customerContactId: true,
  status: true,
  wonAt: true,
  lostAt: true,
  lostReason: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  currentStage: { select: safePipelineStageSelect },
  lead: {
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      phone: true,
      stage: true,
      status: true,
    },
  },
  customerContact: {
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

export const safeDealStageHistorySelect = {
  id: true,
  dealId: true,
  fromStageId: true,
  toStageId: true,
  changedByUserId: true,
  probability: true,
  value: true,
  note: true,
  createdAt: true,
  fromStage: { select: safePipelineStageSelect },
  toStage: { select: safePipelineStageSelect },
  changedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export const safeSalesTaskSelect = {
  id: true,
  dealId: true,
  leadId: true,
  customerContactId: true,
  assignedToUserId: true,
  createdByUserId: true,
  title: true,
  description: true,
  dueAt: true,
  completedAt: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  deal: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  lead: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  customerContact: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  assignedToUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

const defaultPipelineStages = [
  { key: "qualification", name: "Qualification", sortOrder: 10 },
  { key: "proposal", name: "Proposal", sortOrder: 20 },
  { key: "negotiation", name: "Negotiation", sortOrder: 30 },
  { key: "closed_won", name: "Closed Won", sortOrder: 90 },
  { key: "closed_lost", name: "Closed Lost", sortOrder: 100 },
] as const;

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

export async function ensureDefaultPipelineStages(client: DbClient, companyId: string) {
  for (const stage of defaultPipelineStages) {
    await client.pipelineStage.upsert({
      where: { companyId_key: { companyId, key: stage.key } },
      create: { companyId, ...stage },
      update: {},
    });
  }
}

export async function getDefaultPipelineStage(client: DbClient, companyId: string) {
  await ensureDefaultPipelineStages(client, companyId);

  const stage = await client.pipelineStage.findFirst({
    where: { companyId, key: "qualification", isActive: true },
    select: { id: true, key: true, name: true },
  });

  if (!stage) {
    throw new AppError("VALIDATION_ERROR", "No active default pipeline stage is available.", 400);
  }

  return stage;
}

export async function assertPipelineStageInCompany(
  client: DbClient,
  id: string,
  companyId: string,
  options: { activeOnly?: boolean } = {},
) {
  const stage = await client.pipelineStage.findFirst({
    where: { id, companyId, ...(options.activeOnly ? { isActive: true } : {}) },
    select: { id: true, key: true, name: true, isActive: true },
  });

  if (!stage) {
    throw crmForbidden("You do not have permission to access this pipeline stage.");
  }

  return stage;
}

export async function assertDealInCompany(client: DbClient, id: string, companyId: string) {
  const deal = await client.deal.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      status: true,
      currentStageId: true,
      probability: true,
      value: true,
      leadId: true,
      customerContactId: true,
    },
  });

  if (!deal) {
    throw crmForbidden("You do not have permission to access this deal.");
  }

  return deal;
}

export async function assertSalesTaskInCompany(client: DbClient, id: string, companyId: string) {
  const task = await client.salesTask.findFirst({
    where: { id, companyId },
    select: { id: true, title: true, status: true, dealId: true, leadId: true, customerContactId: true },
  });

  if (!task) {
    throw crmForbidden("You do not have permission to access this task.");
  }

  return task;
}

export async function assertUserInCompany(client: DbClient, id: string, companyId: string) {
  const user = await client.user.findFirst({
    where: { id, companyId },
    select: { id: true },
  });

  if (!user) {
    throw crmForbidden("You do not have permission to assign this user.");
  }

  return user;
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

export function toDealData(input: z.infer<typeof createDealSchema> | z.infer<typeof updateDealSchema>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.value !== undefined ? { value: input.value } : {}),
    ...(input.probability !== undefined ? { probability: input.probability } : {}),
    ...(input.expectedCloseDate !== undefined ? { expectedCloseDate: input.expectedCloseDate } : {}),
    ...(input.currentStageId !== undefined ? { currentStageId: input.currentStageId } : {}),
    ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
    ...(input.customerContactId !== undefined ? { customerContactId: input.customerContactId } : {}),
  };
}

export function toSalesTaskData(input: z.infer<typeof createSalesTaskSchema> | z.infer<typeof updateSalesTaskSchema>) {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    ...(input.status !== undefined
      ? { status: input.status, completedAt: input.status === "completed" ? new Date() : null }
      : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
    ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
    ...(input.customerContactId !== undefined ? { customerContactId: input.customerContactId } : {}),
    ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
  };
}
