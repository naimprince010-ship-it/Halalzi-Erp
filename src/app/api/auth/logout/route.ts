import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionTokenFromRequest, revokeSession } from "@/lib/auth/session";

export async function POST() {
  const token = await getSessionTokenFromRequest();
  await revokeSession(token);

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);

  return response;
}
