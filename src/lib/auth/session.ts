import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const SESSION_COOKIE_NAME = "erp_session";
const DEFAULT_SESSION_DAYS = 7;
const REMEMBER_ME_SESSION_DAYS = 30;

function sessionMaxAge(rememberMe = false) {
  return (rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS) * 24 * 60 * 60;
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, rememberMe = false) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + sessionMaxAge(rememberMe) * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt, maxAge: sessionMaxAge(rememberMe) };
}

export async function getSessionTokenFromRequest() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function revokeSession(token: string | null | undefined) {
  if (!token) {
    return;
  }

  await prisma.session.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export function setSessionCookie(response: NextResponse, token: string, maxAge: number) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
