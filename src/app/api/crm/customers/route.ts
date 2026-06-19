import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { recordAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";
import {
  createCustomerSchema,
  customerListQuerySchema,
  safeCustomerSelect,
  toCustomerData,
  validationMessage,
} from "../_shared";

export async function GET(request: Request) {
  try {
    const currentUser = await requirePermission("crm.read");
    const scope = companyScope(currentUser);
    const url = new URL(request.url);
    const query = customerListQuerySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });

    const customers = await prisma.customerContact.findMany({
      where: {
        companyId: scope.companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { companyName: { contains: query.q, mode: "insensitive" } },
                { email: { contains: query.q, mode: "insensitive" } },
                { phone: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: safeCustomerSelect,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ customers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("crm.create");
    const scope = companyScope(currentUser);
    const input = createCustomerSchema.parse(await request.json());

    const customer = await prisma.customerContact.create({
      data: {
        companyId: scope.companyId,
        name: input.name,
        ...toCustomerData(input),
      },
      select: safeCustomerSelect,
    });

    await recordAuditLog({
      companyId: scope.companyId,
      userId: currentUser.user.id,
      action: "crm.customer.create",
      entityType: "customerContact",
      entityId: customer.id,
      summary: `CRM customer created: ${customer.name}`,
      metadata: { status: customer.status },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", validationMessage(error), 400));
    }

    return errorResponse(error);
  }
}
