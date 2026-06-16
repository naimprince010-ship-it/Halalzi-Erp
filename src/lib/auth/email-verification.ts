import { createHash, randomBytes } from "crypto";

const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function createEmailVerificationToken() {
  return randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("base64url");
}

export function hashEmailVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function emailVerificationExpiry() {
  return new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
}
