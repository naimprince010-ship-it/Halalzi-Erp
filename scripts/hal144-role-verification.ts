import { ROLE_TEMPLATES } from "../src/lib/rbac/default-roles.js";
import fs from "fs";
import path from "path";

async function run() {
  console.log("Starting HAL-144 role templates verification (offline)...");

  try {
    const result = {
      success: true,
      checks: [] as { role?: string; missing?: string; passed?: string }[],
      unsafeLeaks: [] as { role: string; permission?: string; permissions?: string[] }[],
      roles: {} as Record<string, string[]>,
    };

    const roleMap = new Map();

    for (const role of ROLE_TEMPLATES) {
      const perms = [...role.permissions].sort();
      roleMap.set(role.key, perms);
      result.roles[role.key] = perms;
    }

    const checkLeak = (roleKey: string, unexpectedPerm: string) => {
      const perms = roleMap.get(roleKey);
      if (perms?.includes(unexpectedPerm)) {
        result.success = false;
        result.unsafeLeaks.push({ role: roleKey, permission: unexpectedPerm });
      }
    };

    const checkHas = (roleKey: string, expectedPerm: string) => {
      const perms = roleMap.get(roleKey);
      if (!perms?.includes(expectedPerm)) {
        result.success = false;
        result.checks.push({ role: roleKey, missing: expectedPerm });
      }
    };

    // Procurement Clerk cannot approve/reject
    checkLeak("procurement_clerk", "purchases.approve");
    checkLeak("procurement_clerk", "purchases.reject");
    // Procurement Clerk has purchases.submit
    checkHas("procurement_clerk", "purchases.submit");

    // Procurement Approver can approve
    checkHas("procurement_approver", "purchases.approve");
    // Procurement Approver cannot create
    checkLeak("procurement_approver", "purchases.create");

    // Auditor cannot create/update anything except their own profile
    const auditorPerms = roleMap.get("auditor") || [];
    const nonReadAuditorPerms = auditorPerms.filter((p: string) => !p.endsWith(".read") && p !== "profile.update");
    if (nonReadAuditorPerms.length > 0) {
      result.success = false;
      result.unsafeLeaks.push({ role: "auditor", permissions: nonReadAuditorPerms });
    }

    // Default staff is conservative
    const staffPerms = roleMap.get("staff") || [];
    if (staffPerms.includes("purchases.approve") || staffPerms.includes("finance.accounts.create")) {
      result.success = false;
      result.unsafeLeaks.push({ role: "staff", permissions: ["purchases.approve", "finance.accounts.create"] });
    }

    if (result.unsafeLeaks.length === 0) {
      result.checks.push({ passed: "No unsafe permission leaks detected." });
    }

    const outPath = path.resolve("E:/ERP_AI_Project_NEW/outputs/HAL-144_role_templates_onboarding_verification.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

    console.log(`Verification complete. Success: ${result.success}`);
    console.log(`Results saved to: ${outPath}`);
  } catch (error) {
    console.error("Verification failed:", error);
    process.exit(1);
  }
}

run();
