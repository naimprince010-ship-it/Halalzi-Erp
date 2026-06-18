import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

// Safe admin credential rotation helper.
//
// This script NEVER updates the database. It only helps an operator prepare a
// new credential locally, then the operator performs the actual rotation
// through the app's password reset flow or a single manual, parameterized SQL
// update (see CREDENTIAL_ROTATION.md).
//
// Secret-handling rules enforced here:
// - The plaintext password is printed ONLY in --generate mode, which exists
//   specifically so the operator can copy it into a private password manager.
// - In --hash mode the plaintext is read from the NEW_ADMIN_PASSWORD env var
//   (never argv, so it does not land in shell history) and is NEVER printed.
// - DATABASE_URL and other secrets are never read or printed.

const SALT_ROUNDS = 12; // Matches src/lib/auth/password.ts
const args = new Set(process.argv.slice(2));

function generateStrongPassword(byteLength = 24) {
  // base64url avoids shell-hostile characters while keeping high entropy.
  return randomBytes(byteLength).toString("base64url");
}

function printUsage() {
  console.log(
    [
      "Admin credential rotation helper (never touches the database).",
      "",
      "Usage:",
      "  npm run rotate:admin -- --generate   Generate a strong password + bcrypt hash.",
      "  npm run rotate:admin -- --hash       Hash NEW_ADMIN_PASSWORD env var (prints hash only).",
      "",
      "Then rotate using CREDENTIAL_ROTATION.md (reset flow preferred).",
      "Store the new password only in a private password manager. Never commit it.",
    ].join("\n"),
  );
}

async function runGenerate() {
  const password = generateStrongPassword();
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  console.log("Generated a new strong admin password (shown once).");
  console.log("Copy it into your private password manager now, then clear your terminal.\n");
  console.log(`NEW_PASSWORD: ${password}`);
  console.log(`BCRYPT_HASH:  ${hash}\n`);
  console.log("Reminders:");
  console.log("  - Do NOT commit, paste into chat, or store this password in the repo.");
  console.log("  - Prefer rotating via the app password reset flow (no hash handling).");
  console.log("  - If updating the DB directly, use the parameterized UPDATE in CREDENTIAL_ROTATION.md.");
}

async function runHash() {
  const password = process.env.NEW_ADMIN_PASSWORD?.trim();

  if (!password) {
    console.error(
      [
        "NEW_ADMIN_PASSWORD is not set.",
        "",
        "Set it in your shell WITHOUT leaving it in history, e.g. read it interactively,",
        "then run: npm run rotate:admin -- --hash",
        "",
        "The plaintext is never printed; only the bcrypt hash is output.",
      ].join("\n"),
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("Refusing to hash: choose a password of at least 12 characters.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  console.log("Computed bcrypt hash (plaintext was not printed):");
  console.log(`BCRYPT_HASH: ${hash}`);
}

async function main() {
  if (args.has("--generate")) {
    await runGenerate();
    return;
  }

  if (args.has("--hash")) {
    await runHash();
    return;
  }

  printUsage();
}

main().catch(() => {
  // Avoid printing error objects that could echo sensitive input.
  console.error("Credential helper failed unexpectedly.");
  process.exit(1);
});
