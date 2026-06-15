import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth/auth-errors";
import { requireAuth } from "@/lib/rbac/guards";

export async function GET() {
  try {
    const currentUser = await requireAuth();
    return NextResponse.json(currentUser);
  } catch (error) {
    return errorResponse(error);
  }
}
