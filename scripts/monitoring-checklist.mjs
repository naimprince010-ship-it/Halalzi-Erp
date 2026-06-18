// Prints the production monitoring / log-review checklist for a solo developer.
//
// This script is intentionally read-only and secret-free:
// - It never reads DATABASE_URL, RESEND_API_KEY, SESSION_SECRET, or any secret.
// - It never makes network calls or touches the database.
// - It only prints a checklist and the exact (non-secret) commands to run.
//
// Usage:
//   npm run monitor:checklist

const APP_URL = "https://halalzi-erp.vercel.app";

const sections = [
  {
    title: "1. Vercel deployment logs",
    items: [
      "Open Vercel > Project halalzi-erp > Deployments.",
      "Confirm the latest production deployment is 'Ready' (not 'Error').",
      "Open the latest deployment > Building logs; confirm prisma generate and next build succeeded.",
      "If a build failed, read the first error line, not the last.",
    ],
  },
  {
    title: "2. Vercel runtime / function logs",
    items: [
      "Open Vercel > Project halalzi-erp > Logs (Runtime Logs).",
      "Filter by Error level for the last 24h.",
      "Look for repeated 500s on /api/* routes.",
      "Check for 'Audit log write failed', email delivery failures, and Prisma errors.",
    ],
  },
  {
    title: "3. Production smoke test (no secrets in this file)",
    items: [
      "Set env vars in your shell, then run npm run smoke:prod.",
      'PowerShell: $env:SMOKE_BASE_URL="' + APP_URL + '"',
      'PowerShell: $env:SMOKE_ADMIN_EMAIL="<admin email>"',
      "PowerShell: $env:SMOKE_ADMIN_PASSWORD=<type directly, do not paste into shared logs>",
      "Run: npm run smoke:prod  (expect \"failed\": 0)",
    ],
  },
  {
    title: "4. Database (Neon) health",
    items: [
      "Open Neon console > project neon-byzantine-ribbon.",
      "Confirm the compute is active and not suspended unexpectedly.",
      "Confirm history retention window is still enabled (for restores).",
      "If connection errors appear in logs, confirm DATABASE_URL is set in Vercel env (do not print it).",
    ],
  },
  {
    title: "5. Email (Resend) health",
    items: [
      "Open Resend > Emails; confirm recent password-reset / verification sends succeeded.",
      "If sends fail, confirm RESEND_API_KEY and EMAIL_FROM exist in Vercel env (do not print them).",
      "Confirm sender domain status in Resend before real client onboarding.",
    ],
  },
];

const weekly = [
  "Latest production deploy is Ready.",
  "No unresolved Error-level runtime logs in the last 7 days.",
  "npm run smoke:prod passes with failed: 0.",
  "Neon compute healthy and retention window intact.",
  "Recent Resend emails delivered.",
  "Record result and date in OPERATIONS.md / MONITORING.md log.",
];

function printList(items, bullet = "  -") {
  for (const item of items) {
    console.log(`${bullet} ${item}`);
  }
}

console.log("Halalzi ERP Production Monitoring Checklist");
console.log(`App: ${APP_URL}`);
console.log("This checklist prints commands only. It never reads or prints secrets.\n");

for (const section of sections) {
  console.log(section.title);
  printList(section.items);
  console.log("");
}

console.log("Weekly sign-off checklist");
printList(weekly);
console.log("\nFull details: see MONITORING.md");
