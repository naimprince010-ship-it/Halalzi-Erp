import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const optionalNullableTextSchema = z
  .string()
  .trim()
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

    return value.length > 0 ? value : null;
  });

const updateVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required.").max(120).optional(),
  code: z
    .string()
    .trim()
    .max(64)
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
    }),
  phone: optionalNullableTextSchema,
  email: z
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
    }),
  address: optionalNullableTextSchema,
  contactPerson: optionalNullableTextSchema,
  notes: optionalNullableTextSchema,
  status: z.enum(["active", "inactive", "blocked"]).optional(),
});

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "P2002";
}

const safeVendorSelect = {
  id: true,
  name: true,
  code: true,
  phone: true,
  email: true,
  address: true,
  contactPerson: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

function forbiddenVendorAccessError() {
  return new AppError("FORBIDDEN", "You do not have permission to access this vendor.", 403);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("vendors.read");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "Vendor id is required.", 400);
    }

    const vendor = await prisma.vendor.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: safeVendorSelect,
    });

    if (!vendor) {
      throw forbiddenVendorAccessError();
    }

    return NextResponse.json({ vendor });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requirePermission("vendors.update");
    const scope = companyScope(currentUser);
    const { id } = await context.params;

    if (!id) {
      throw new AppError("VALIDATION_ERROR", "Vendor id is required.", 400);
    }

    const input = updateVendorSchema.parse(await request.json());

    if (Object.keys(input).length === 0) {
      throw new AppError("VALIDATION_ERROR", "At least one field is required to update a vendor.", 400);
    }

    const existingVendor = await prisma.vendor.findFirst({
      where: {
        id,
        companyId: scope.companyId,
      },
      select: {
        id: true,
      },
    });

    if (!existingVendor) {
      throw forbiddenVendorAccessError();
    }

    const vendor = await prisma.vendor.update({
      where: {
        id,
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      select: safeVendorSelect,
    });

    return NextResponse.json({ vendor });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid input.", 400));
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse(
        new AppError("VALIDATION_ERROR", "A vendor with this code already exists in your company.", 409),
      );
    }

    return errorResponse(error);
  }
}
