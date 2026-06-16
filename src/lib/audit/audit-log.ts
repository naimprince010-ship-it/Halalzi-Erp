import { prisma } from "@/lib/db/prisma";

type AuditMetadata = Record<string, string | number | boolean | null>;

type AuditLogClient = {
  auditLog: {
    create(args: {
      data: {
        companyId: string;
        userId?: string | null;
        action: string;
        entityType: string;
        entityId?: string | null;
        summary: string;
        metadata?: AuditMetadata;
      };
    }): Promise<unknown>;
  };
};

type AuditLogInput = {
  client?: AuditLogClient;
  companyId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: AuditMetadata;
};

export async function recordAuditLog({
  client = prisma,
  companyId,
  userId,
  action,
  entityType,
  entityId,
  summary,
  metadata,
}: AuditLogInput) {
  try {
    await client.auditLog.create({
      data: {
        companyId,
        userId: userId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        summary,
        metadata,
      },
    });
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}
