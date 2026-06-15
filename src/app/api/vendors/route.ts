import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorResponse } from "@/lib/auth/auth-errors";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/rbac/guards";
import { companyScope } from "@/lib/rbac/tenant-scope";

const optionalTextSchema = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value.length > 0 ? value : null;
  });

const createVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required.").max(120),
  code: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value.length > 0 ? value : null;
    }),
  phone: optionalTextSchema,
  email: z
    .string()
    .trim()
    .email("Please provide a valid email.")
    .max(255)
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value.length > 0 ? value.toLowerCase() : null;
    }),
  address: optionalTextSchema,
  contactPerson: optionalTextSchema,
  notes: optionalTextSchema,
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

export async function GET() {
  try {
    const currentUser = await requirePermission("vendors.read");
    const scope = companyScope(currentUser);

    const vendors = await prisma.vendor.findMany({
      where: {
        companyId: scope.companyId,
      },
      select: safeVendorSelect,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ vendors });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requirePermission("vendors.create");
    const scope = companyScope(currentUser);
    const input = createVendorSchema.parse(await request.json());

    const vendor = await prisma.vendor.create({
      data: {
        companyId: scope.companyId,
        name: input.name,
        code: input.code,
        phone: input.phone,
        email: input.email,
        address: input.address,
        contactPerson: input.contactPerson,
        notes: input.notes,
        status: input.status ?? "active",
      },
      select: safeVendorSelect,
    });

    return NextResponse.json({ vendor }, { status: 201 });
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
