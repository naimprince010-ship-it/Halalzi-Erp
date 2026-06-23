# HAL-135 Client Onboarding Checklist v2

## Purpose and Scope

This checklist is the standard operating procedure for onboarding pilot clients after initial product demos. It consolidates learnings from HAL-127 (Demo Readiness), HAL-134 (Pilot Demo Script), OPERATIONS.md, and DEPLOYMENT.md into a single, structured flow.

Use this checklist to:
- Prepare for pilot-customer onboarding conversations.
- Execute onboarding steps in repeatable, safe order.
- Capture real feedback from pilots for product roadmap alignment.
- Measure pilot readiness before go-live.
- Clearly separate confirmed functionality from feedback-driven requirements.

**Scope:** Halalzi ERP Core MVP is signed off for demo and controlled onboarding. This v2 checklist is **not** a playbook for mass-market rollout; it is for small, carefully managed pilot customer cohorts (1-3 customers in Q1).

**Current Release Status:**
- Core ERP MVP security cleanup and hardening: Done (HAL-108/HAL-131)
- Authenticated production smoke: Done (HAL-109/HAL-132)
- Production migration baseline: Decision done (HAL-110/HAL-133)
- Demo tenant and pilot demo script: Done (HAL-111/HAL-134)

## When to Use This Checklist

Use this checklist for each new pilot customer in this sequence:

1. **Pre-Demo (T-3 days before scheduled call):** Complete pre-demo readiness section.
2. **Demo Day (T+0):** Execute demo-day checklist and live demo script.
3. **Post-Demo Follow-Up (T+1 to T+7 days):** Capture feedback and assess fit.
4. **Pilot Onboarding (T+7 to T+21 days if pilot approved):** Execute structured onboarding and role setup.

## Pre-Demo Readiness Checklist (3 days before)

### Production Deployment Readiness

- [ ] Latest Vercel deployment is `Ready` (check Vercel dashboard).
- [ ] No high-severity errors in Vercel runtime logs (last 7 days).
- [ ] Database connection is stable (Neon status page green).
- [ ] Custom email sender domain is verified in Resend (currently: **NOT YET** - using sandbox; document plan for client).

### Demo Admin Credentials (IMPORTANT: No Secrets in Shared Notes)

- [ ] Production admin email is verified and working.
- [ ] Production admin password was recently rotated (recommendation: rotate before each external demo round).
- [ ] Demo admin credentials are ready to use locally only (never pasted in chat, Linear, docs, or screenshots).
- [ ] Backup emergency admin account is available in case of lockout.

### Production Smoke Pre-Demo

- [ ] Run unauthenticated smoke (takes ~2 minutes):
  ```powershell
  $env:SMOKE_BASE_URL = "https://halalzi-erp.vercel.app"
  npm run smoke:prod
  ```
  Expected: all checks pass, `failed=0`.

- [ ] (Optional) Run authenticated smoke only if credentials are locally available:
  ```powershell
  $env:SMOKE_BASE_URL = "https://halalzi-erp.vercel.app"
  $env:SMOKE_ADMIN_EMAIL = "<type locally only>"
  $env:SMOKE_ADMIN_PASSWORD = "<type locally only>"
  npm run smoke:prod
  ```
  Expected: 8/8 checks pass, no password/session hashes exposed.

### Demo Tenant and Data Readiness

- [ ] Demo company is created (naming convention: `DEMO <ClientLabel> YYYYMM`).
- [ ] Demo admin user is created and verified.
- [ ] Demo data is labeled with `DEMO-` prefix and is synthetic/generic.
- [ ] Demo products, vendors, orders, finance, and CRM data are in place per HAL-134 guidance.
- [ ] No real customer PII or production client data is mixed in demo tenant.

### Customer Readiness

- [ ] Stakeholder names, roles, and email addresses are confirmed.
- [ ] Demo date/time and duration (plan ~50 minutes) are confirmed.
- [ ] Attendee timezone and connection method (Zoom/Teams/etc.) are confirmed.
- [ ] Customer has been informed: This is a controlled demo of an ERP in early pilot phase.
- [ ] Customer has been informed: Real data import and setup happen only after pilot decision.

### Support and Escalation Readiness

- [ ] Internal support contact (founder/ops) is assigned for this customer.
- [ ] Fallback contact is documented in case primary is unavailable.
- [ ] Response-time expectations are set (e.g., "24-48 hours for follow-up questions").

## Demo-Day Checklist (T+0 Day Of)

### 1 Hour Before

- [ ] Verify internet connection and Vercel status page (green).
- [ ] Test login on production URL in your browser (incognito window, no cached credentials).
- [ ] Confirm demo admin credentials work (type locally only, do not print).
- [ ] Test screen-share and audio in your meeting tool.
- [ ] Keep a private notes document open (never shared) for live observations.

### During Demo (35-50 min, use HAL-134 Script)

Follow the structured pilot demo flow from HAL-134:

1. **Auth/Login (3-5 min)** - Explain tenant isolation and role-based access.
2. **Dashboard Overview (4-6 min)** - Show operational summaries.
3. **Products and Stock (4-6 min)** - Highlight DEMO-SKU naming and stock traceability.
4. **Sales Flow (5-7 min)** - Demonstrate confirm/cancel workflow.
5. **Procurement Flow (5-7 min)** - Demonstrate receive/cancel workflow.
6. **Finance Flow (5-7 min)** - Show receivables, payables, reports.
7. **CRM Overview (3-5 min)** - Show leads/deals/tasks pipeline.
8. **Audit and Export (3-5 min)** - Explain accountability trail, confirm no sensitive data leakage.

### Live Demo Notes (Do Not Print Secrets)

Capture:
- [ ] Which modules do they ask about first?
- [ ] Any workflow friction observed in questions?
- [ ] Any feature requests mentioned spontaneously?
- [ ] Overall confidence level (excited / neutral / skeptical)?

### After Demo Call

- [ ] Thank them and confirm next-step timeline (24-48 hour follow-up).
- [ ] Offer to share a non-sensitive summary document.
- [ ] Document any urgent blockers or questions for immediate follow-up.

## Post-Demo Follow-Up Checklist (T+1 to T+7)

### Immediate (Within 24 Hours)

- [ ] Review demo call notes and audit logs for any issues.
- [ ] Respond to any urgent questions from customer.
- [ ] Check if any demo users need to be disabled (do not leave temporary demo credentials active).

### Feedback Capture (Use Template Below)

Use the **Demo Feedback Capture Template** section to record customer observations, using these categories:

- **Strongest Fit:** Which module(s) solve their biggest pain?
- **Weakest Fit:** Any module that felt incomplete or confusing?
- **Workflow Blockers:** Any step that they said was missing or awkward?
- **Feature Requests:** Any "it would be great if..." items mentioned?
- **Confidence Level:** On 1-5 scale, how likely to pilot (1=not interested, 5=ready to sign)?

### Pilot Decision Assessment

**Complete the Pilot Readiness Scoring Rubric** (below) with the customer feedback.

Based on score:

- **Score 16+:** Proceed to pilot onboarding immediately.
- **Score 12-15:** Schedule 1 follow-up conversation to clarify top blockers; then decide.
- **Score < 12:** Document why, offer to revisit after roadmap updates, maintain relationship for future pilots.

### Roadmap Communication (If Proceeding)

If proceeding to pilot:

- [ ] Share HAL-130 One-Year Roadmap with customer (public, non-secret).
- [ ] Highlight Q1/Q2 priorities aligned with their feedback.
- [ ] Explain what happens in months 1-3 of their pilot.
- [ ] Set expectations: "We will iterate based on your real usage and feedback."

## Pilot Onboarding Checklist (T+7 to T+21 if Approved)

Use this checklist to execute controlled pilot setup.

### 1. Company and Admin Setup (Day 1)

- [ ] Client registers their company using the production registration flow.
  - Company name: Client's actual business name.
  - Contact email: Primary contact at client.
- [ ] Confirm client receives registration confirmation email and can access reset link.
- [ ] Log in as client admin and confirm dashboard access.
- [ ] Confirm initial role assignments are visible.

### 2. Email Verification (Day 1)

- [ ] Confirm admin email is verified (currently required at login).
- [ ] If blocked by unverified email, walk through email verification flow.
- [ ] Document: "Email verification is enforced; resend link available in Resend dashboard if needed."

### 3. RBAC and Staff User Setup (Day 2-3)

- [ ] Review HAL-127 role templates:
  - Company Admin (for client owner/manager)
  - Sales Staff (if they have sales operations)
  - Procurement Staff (if they have purchasing)
  - Finance Staff (if they manage accounting)
  - Read-Only Auditor (optional, if they want oversight role)

- [ ] Create client staff users per their org structure.
- [ ] Assign roles based on job function using least-privilege principle.
- [ ] Validate each role:
  - Allowed endpoints return 200.
  - Disallowed endpoints return 403.
  - Cross-company access is blocked.

- [ ] Document role matrix and send to client for approval.

### 4. Master Data Setup (Day 3-5)

Prepare or import client's baseline data:

- [ ] **Products:** Import or manually enter 20-50 active products with categories, SKUs, stock levels.
  - Include a few low-stock examples for demo of alerts.
  - Validate stock accuracy against their records.

- [ ] **Vendors:** Create or import 5-15 key vendor accounts with contact and payment terms.
  - Verify vendor names and addresses match client records.

- [ ] **Finance Chart of Accounts:** Set up core accounts (Cash, Receivable, Payable, Revenue, Expense).
  - Use client's preferred account numbering.
  - Validate alignment with their current GL structure.

- [ ] **Receivables/Payables:** Optionally import open customer and supplier invoices if data is available.
  - Use only with client's explicit consent.
  - Verify data accuracy before import.

### 5. Data Collection and Client Discovery (Day 3-7)

**Complete the Client Data Collection Checklist** below. This drives product roadmap feedback.

### 6. Pilot Go-Live Checklist (Day 7, Before First Production Use)

- [ ] Production smoke is green (unauthenticated and authenticated with client admin).
- [ ] Client has confirmed all staff users are created and can log in.
- [ ] Client has confirmed master data (products, vendors) is accurate.
- [ ] Client has confirmed finance chart is correct.
- [ ] Client has named a primary escalation contact on their end.
- [ ] You have documented internal support contact for this client.
- [ ] Client is informed: "We will monitor audit logs and performance weekly. Tell us immediately if anything is broken."
- [ ] Client has been given a summary of known limitations (see **Known Limitations** section).

### 7. Post-Go-Live (Week 1 and Ongoing)

- [ ] Check client's audit logs daily for first 7 days (look for unexpected errors, failed logins, permission issues).
- [ ] Send brief weekly sync check-in (e.g., "How did this week go? Any blockers?").
- [ ] Capture issues and feature requests in Linear with `PILOT-<CLIENT_SHORT_NAME>-` prefix.
- [ ] Escalate any critical issues immediately (data loss, security, compliance).
- [ ] Keep a running log of client-reported issues for roadmap prioritization.

## Demo Feedback Capture Template

Copy this template and fill it out after each demo call. Do **not** invent feedback; only record what the customer actually said.

### Demo Session Meta

- **Date:** [YYYY-MM-DD]
- **Customer:** [Company Name]
- **Customer Role/Attendees:** [Job Titles]
- **Presenter:** [Your Name]
- **Demo URL:** https://halalzi-erp.vercel.app
- **Duration:** [Minutes]

### Observed Fit and Engagement

**Strongest Module Fit (Which problem does this solve best for them?):**
- [ ] Sales workflows
- [ ] Procurement and inventory
- [ ] Finance and reporting
- [ ] CRM and customer tracking
- [ ] Cross-module (explain): _________________

**Customer Verbatim:** [Quote what they said about their strongest fit]

**Weakest Module Fit (Which felt incomplete or confusing?):**
- [ ] Sales workflows - Reason: _________________
- [ ] Procurement and inventory - Reason: _________________
- [ ] Finance and reporting - Reason: _________________
- [ ] CRM and customer tracking - Reason: _________________
- [ ] General UX/navigation - Reason: _________________
- [ ] Not applicable / all areas looked good

**Customer Verbatim:** [Quote what they said about weaknesses]

### Workflow Blockers and Feature Requests

**Critical Blockers (Stops them from using this product right now):**
1. _________________ (Blocker)
2. _________________ (Blocker)

**Important Missing Features (Would be very valuable):**
1. _________________ (Feature)
2. _________________ (Feature)

**Nice-to-Have Requests (Useful but not blocking):**
1. _________________ (Feature)
2. _________________ (Feature)

### Pilot Readiness Signal

**Confidence Level (1-5 scale, 1=not interested, 5=ready to sign pilot agreement):** [ ]

**If <3, Top Reason for Hesitation:**
_________________________________________________

**If >= 3, When Would They Want to Start Pilot?**
_________________________________________________

**Next Action Agreed:**
- [ ] Schedule follow-up conversation (date: ________)
- [ ] Proceed immediately to onboarding (target go-live: ________)
- [ ] Defer for now; maintain contact for future (reason: ______)

## Client Data Collection Checklist

Use this during onboarding to understand the customer's actual operational needs.

### Business Basics

- [ ] Industry/sector: _________________________
- [ ] Company size (employees): _________________________
- [ ] Current ERP/accounting software: _________________________
- [ ] How long have they been in business: _________________________
- [ ] Geographic footprint (local/regional/national): _________________________

### Operational Pain Points (Priority Ranking)

Rank these 1-5 (1=not a pain, 5=critical pain):

- [ ] **Sales:** Tracking orders, quotes, delivery, payments - Score: [ ]
  - Details: _________________________________________

- [ ] **Procurement:** Finding vendors, managing POs, receiving goods, payment - Score: [ ]
  - Details: _________________________________________

- [ ] **Inventory:** Stock accuracy, low-stock alerts, location tracking - Score: [ ]
  - Details: _________________________________________

- [ ] **Finance:** Invoice tracking, aging, cash flow, monthly close - Score: [ ]
  - Details: _________________________________________

- [ ] **CRM:** Lead tracking, follow-ups, pipeline visibility - Score: [ ]
  - Details: _________________________________________

### Data and Integration Needs

- [ ] Do they have existing customer/vendor data to import? YES / NO
  - If yes, format: CSV / Excel / API / Other: _________
  - Estimated volume: __________ records

- [ ] Do they track customer/supplier history? YES / NO
  - If yes, do they want historical data migrated? YES / NO

- [ ] Do they have accounting history to migrate? YES / NO
  - If yes, depth: Last 3 months / 6 months / 1 year / Full history?

- [ ] Do they need integration with any external systems?
  - [ ] Bank feeds (for cash/bank reconciliation)
  - [ ] Accounting software (QuickBooks, SAP, etc.)
  - [ ] Shipping carrier (tracking/automation)
  - [ ] Email/calendar (Outlook, Gmail)
  - [ ] Other: _______________

### Team and Adoption

- [ ] How many daily active users will they have? _______
- [ ] Which team members will use this? (Roles) _________________
- [ ] How long have they been using their current system? _______
- [ ] What's their comfort level with new software? (1-5): [ ]
- [ ] Will they need hands-on training/onboarding? YES / NO
  - If yes, preferred format: In-person / Zoom group / Self-guided videos / Docs

### Reporting and Compliance

- [ ] What reports do they generate regularly?
  - [ ] Sales pipeline / forecasting
  - [ ] Aged receivables / payables
  - [ ] Profit & loss
  - [ ] Inventory aging
  - [ ] Cash flow
  - [ ] Other: _______________

- [ ] Are they subject to any compliance or audit requirements?
  - [ ] Tax audit (VAT/GST/etc.)
  - [ ] Bank audit
  - [ ] Investor reporting
  - [ ] Other: _______________

### Success Metrics

- [ ] What would "success" look like after 90 days of using Halalzi ERP?
  - Details: ______________________________________

- [ ] What metric would you use to measure success? (e.g., "invoice time <1 hour", "20% faster order processing")
  - Details: ______________________________________

## Role and Permission Setup Checklist

Use this to assign and validate least-privilege roles for the pilot customer.

### Role Templates (Based on HAL-127)

Create these roles in the customer's company (customize as needed):

| Role | Access Level | Allowed Modules | Not Allowed |
|------|---|---|---|
| Company Admin | Full | All | None (can do everything) |
| Sales Staff | Limited | Sales orders, CRM, products (read) | Users, roles, finance admin |
| Procurement Staff | Limited | Purchase orders, vendors, products (read) | Users, roles, finance admin |
| Finance Staff | Limited | Finance (accounts, receivables, payables, reports), products (read) | Users, roles, sales/purchase admin |
| Read-Only Auditor | View-only | Dashboard, audit logs, exports | Create/edit anything |

### Permission Validation

For each role, confirm:

- [ ] **Sales Staff can:**
  - [ ] View/create/edit sales orders (200)
  - [ ] View products (200)
  - [ ] View CRM leads/deals (200)
  - [ ] Cannot access users/roles (403)
  - [ ] Cannot access finance accounts (403)

- [ ] **Procurement Staff can:**
  - [ ] View/create/edit purchase orders (200)
  - [ ] View/edit vendors (200)
  - [ ] View products (200)
  - [ ] Cannot access users/roles (403)
  - [ ] Cannot access finance accounts (403)

- [ ] **Finance Staff can:**
  - [ ] View/create finance accounts and entries (200)
  - [ ] View receivables/payables (200)
  - [ ] View reports (200)
  - [ ] Cannot access users/roles (403)
  - [ ] Cannot edit sales/purchase orders (403)

- [ ] **Read-Only Auditor can:**
  - [ ] View dashboard (200)
  - [ ] View audit logs (200)
  - [ ] Export audit logs (200)
  - [ ] Cannot edit anything (403 on POST/PATCH/DELETE)

- [ ] **Cross-company isolation confirmed:**
  - [ ] Customer A users cannot access Customer B data (403).
  - [ ] Customer A users cannot see other companies' audit logs.

## Pilot Readiness Scoring Rubric

Use this rubric to score the customer's fit and readiness for pilot after the demo + feedback collection.

| Criterion | Score 5 | Score 3 | Score 1 | Points |
|-----------|---------|---------|---------|--------|
| **Module Fit** | All 3+ modules solve real pain; high enthusiasm | 1-2 modules fit; neutral on others | Modules don't fit or solve their problems | ___ |
| **Workflow Match** | Demo flow matched their process exactly; no friction | Some steps were different but manageable | Major workflow friction or missing steps | ___ |
| **Data Readiness** | Can provide/import data within 1 week | Data exists but needs cleanup/transformation | Data not ready or scattered across systems | ___ |
| **Team Buy-In** | All stakeholders excited and ready to learn | Mixed opinions; some skepticism | Skeptical or low engagement from stakeholders | ___ |
| **Timeline Realism** | Can start pilot in 1-2 weeks | Can start pilot in 3-4 weeks | Distant future or undefined timeline | ___ |
| **Confidence in MVP** | Confident current features solve their needs | Hopeful but has concerns about gaps | Not confident; wants more features first | ___ |
| **Support Expectation** | Clear on our support model; reasonable expectations | Unclear but willing to learn | Expects 24/7 white-glove support (unrealistic) | ___ |
| **Willingness to Iterate** | Excited to give feedback and iterate | Willing to work with us | Wants perfect product before committing | ___ |

**Total Score (out of 40):**

**Rubric Decision:**
- **32+:** Strong pilot fit. Proceed with onboarding immediately.
- **24-31:** Good fit. One follow-up conversation recommended to clarify top 2 concerns; then proceed.
- **16-23:** Moderate fit. Revisit after addressing top 3 blockers; maintain relationship.
- **<16:** Not a fit now. Document reason, offer to reconnect after roadmap progress.

## Top Onboarding Blockers Tracker

Use this table to track the most common blockers that prevent pilots from moving forward. This informs product roadmap prioritization.

| Blocker | Frequency | Customer(s) | Severity | Proposed Fix | Linked HAL Issues |
|---------|-----------|------------|----------|--------------|-------------------|
| Email domain verification not complete | ___ | _________ | Medium | Verify custom domain in Resend | HAL-90 |
| Data import tooling missing | ___ | _________ | High | Build import UI for products/vendors | HAL-24 |
| Quotation/invoice workflow not available | ___ | _________ | High | Build sales quote -> invoice | HAL-23 |
| Mobile app not available | ___ | _________ | Medium | Add responsive mobile UI or app | Roadmap |
| API documentation incomplete | ___ | _________ | Low | Expand API docs with examples | HAL-41 |
| (Add your own blockers below) | ___ | _________ | ___ | __________ | __________ |

## Security and Credential Rules

### Before Any Demo or Onboarding

- [ ] Confirm production admin password has been rotated since last demo or major change.
- [ ] Do **not** share demo credentials with customers outside of live, controlled sessions.
- [ ] Do **not** paste admin password into chat, Linear, docs, or shared notes.
- [ ] Do **not** commit local `.env` files with real secrets.
- [ ] Do **not** screenshot a screen showing a password or token.

### During Onboarding

- [ ] Use client's own login credentials; never leave shared demo credentials active.
- [ ] After onboarding, remove any temporary demo users.
- [ ] Confirm client's admin email is verified before marking onboarding complete.
- [ ] If client needs a password reset, direct them to the self-service reset flow (do not reset in admin panel and share).

### After Onboarding and Ongoing

- [ ] Review audit logs weekly for any suspicious activity.
- [ ] If a user reports a compromised password, guide them to password reset immediately.
- [ ] Rotate the production admin password every 90 days or after any security incident.
- [ ] Keep an emergency admin account in case of lockout (verify email periodically).

## Do Not Proceed to Pilot If...

Pause onboarding and escalate if any of these are true:

- [ ] Customer's data includes unencrypted PII or regulated data that we are not legally approved to store.
- [ ] Customer expects 24/7 support, SLA guarantees, or compliance certifications we don't have.
- [ ] Customer expects production data migration on day 1; data migration and testing takes 2-4 weeks.
- [ ] Customer demands feature X that doesn't exist and isn't on Q2 roadmap.
- [ ] Customer's primary use case is not covered by HAL-130 Roadmap (e.g., HRM, advanced analytics).
- [ ] Customer requires integration (e.g., bank feeds, QuickBooks) that we don't support.
- [ ] Customer is unwilling to accept bug-fix iterations; wants stable, complete product.
- [ ] Customer relationship/communication has been poor; unlikely to provide constructive feedback.

**If any of the above apply:** Document reason, escalate to founder, and schedule follow-up conversation after roadmap progress.

## Known Limitations

Share these with customer during onboarding. These are **not** bugs; they are intentional scope limits for the MVP.

- Email sender domain verification is in progress; currently using Resend sandbox sender.
- Quotation and invoice workflows are planned for Q2; not available in MVP.
- Mobile app is not available; desktop/browser-only for now.
- Bank feeds and automated reconciliation are not supported.
- Advanced forecasting and AI recommendations are planned for Q4.
- Multi-location/warehouse tracking is not in MVP; single-location inventory only.
- POS system is not available in MVP.
- HRM and payroll are not in scope.
- Custom reports and BI dashboards are planned for Q3.
- API is available but not fully documented; support by request only.

## Next Linear Issues After Demo Feedback

As real pilot feedback comes in, create/reprioritize these Linear issues:

### Immediate (Based on Pilot 1 Feedback)

- [ ] **HAL-XXX** Client onboarding UI polish (if UX issues observed)
- [ ] **HAL-XXX** Role/permission UI improvements (if RBAC setup is confusing)
- [ ] **HAL-XXX** Data import tooling for products/vendors (if manual entry is slow)
- [ ] **HAL-XXX** Dashboard customization by role (if some roles see irrelevant widgets)

### Q2 (Based on Pilot 1-3 Feedback)

- [ ] **HAL-XXX** Sales quotation and invoice plan
- [ ] **HAL-XXX** Sales quotation and invoice implementation
- [ ] **HAL-XXX** Purchase approval workflow
- [ ] **HAL-XXX** Finance cash/bank/expense improvements
- [ ] **HAL-XXX** PDF/print document templates for sales and purchase

### Q3+ (Based on Pilot Customer Evolution)

- [ ] **HAL-XXX** BI dashboards and advanced reporting
- [ ] **HAL-XXX** Approval workflow automation
- [ ] **HAL-XXX** Warehouse/location inventory (if multi-location demand exists)
- [ ] **HAL-XXX** POS foundation (if retail demand exists)
- [ ] **HAL-XXX** HRM basics (if people-management demand exists)

## Verification for HAL-135

Run from app folder:

```powershell
npm run lint
npm run build:ci
```

Expected: Zero failures.

## Completion and Handoff

**HAL-135 deliverables:**
- Complete: Comprehensive v2 onboarding checklist with pre-demo, demo-day, post-demo, and pilot-go-live phases.
- Complete: Integrated feedback capture templates (demo feedback, pilot readiness rubric, blocker tracker).
- Complete: Clear guardrails on security, credentials, and "do not proceed if" rules.
- Complete: Mapping to next Linear issues based on real pilot feedback.
- Complete: Lint and build verification passed.

**How to use:**
1. Print this checklist (or keep it open in a separate tab).
2. Use it for your first 1-3 pilot customer onboardings.
3. After each pilot, update the "Top Onboarding Blockers Tracker" table.
4. Collect all pilot feedback and map to "Next Linear Issues" section.
5. Share real blocker data with the team for Q2 roadmap planning.

**Assumption:** This checklist assumes Core ERP MVP is the baseline. If you discover that critical functionality is missing or broken during pilot, escalate immediately to founder for triage.

**Not in scope:** This checklist does not cover:
- Enterprise multi-database tenancy.
- Custom integrations.
- Data migration from legacy systems (covered in separate HAL-XX).
- Advanced compliance (HIPAA, SOC2, etc.).
- Paid customer contract negotiation (covered in separate HAL-XX).
