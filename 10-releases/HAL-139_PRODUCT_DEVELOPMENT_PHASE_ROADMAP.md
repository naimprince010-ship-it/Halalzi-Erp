# HAL-139 Product Development Phase Roadmap

**Date:** 2026-06-25  
**Status:** Ready for execution  
**Decision:** Pause customer onboarding and focus on product depth

## Goal

Define the next product-development-only phase for Halalzi ERP now that customer
onboarding and sales outreach are intentionally paused.

The goal is to make the product stronger before bringing in customers: better
data workflows, more printable documents, stronger regression safety, and more
visible UI polish.

## Current Product Status

### Strong Foundations Already Complete

- Authentication, sessions, company/tenant scope.
- Users, roles, permissions, and role templates.
- Products and basic inventory.
- Stock ledger.
- Sales orders.
- Sales quotations and invoices.
- Vendor and purchase order workflows.
- Purchase approval workflow.
- Sales/procurement to finance linkage.
- Finance accounts, receivables, payables, payments, expenses, reports.
- CRM Phase 1/2.
- Audit logs and CSV exports.
- Production deployment and smoke/UI checks.
- Browser print/save-PDF foundation for sales orders and purchase orders.
- Pilot pricing, onboarding, and outreach packages.

### Product Areas Still Too Light

- Product data setup is still manual and not customer-ready enough.
- Low-stock visibility needs clearer operational treatment.
- Print support does not yet cover quotations, invoices, receipts, or payments.
- Regression checks are spread across one-off scripts and manual notes.
- Several dashboards work but still feel more engineering-complete than polished.
- Warehouse/location, POS, and BI are planned but should not start until the core
  experience is cleaner.

## Development Principles

- Customer onboarding is paused.
- Sales/outreach is paused.
- Do not build random new modules before core workflows are stronger.
- Prefer product depth over breadth for the next 4-6 weeks.
- Keep every issue small enough to verify with lint, build, and an artifact.
- Avoid custom-client assumptions until real pilot feedback exists.
- Keep all work tenant-scoped, RBAC-guarded, and production-build safe.

## Now / Next / Later

### Now: Next 4-6 Weeks

1. **HAL-140 Customer-ready product data workflow**
   - Product CSV template and validation rules.
   - Product import/export polish.
   - Low-stock visibility.
   - Safer error handling for product data setup.
   - Align with existing Linear HAL-116.

2. **HAL-141 Document printing expansion**
   - Extend print foundation to quotations and invoices.
   - Consider receipts/payment print if current data supports it cleanly.
   - Keep HTML print/save-PDF approach unless a real PDF API is justified.

3. **HAL-142 Development regression hardening**
   - Consolidate critical development checks.
   - Cover auth, tenant scope, RBAC, products, stock ledger, sales, procurement,
     finance, CRM, and print routes.
   - Keep scripts non-destructive and secret-safe.
   - Align with existing Linear HAL-122 but focus on pre-customer development.

4. **HAL-143 Production UX polish pass**
   - Improve visible polish on high-frequency dashboards.
   - Focus on empty states, action clarity, status labels, low-stock signals,
     finance navigation, loading/error states.
   - Avoid broad redesign.

5. **Existing planning issue decision pass**
   - Reassess warehouse/location, POS, and BI after the first four issues.
   - Pick only one deeper module to start next.

### Next: After Core Polish

- Warehouse/location requirements if inventory complexity remains the strongest
  product gap.
- POS requirements if retail/cashier workflow becomes the strongest product gap.
- BI dashboard requirements if reporting and management visibility become the
  strongest product gap.
- Resend sender domain verification when domain purchase is ready.
- Production migration baseline execution when trusted production DB access is
  available.

### Later: Future Modules

- AI CRM automation.
- E-commerce B2B/B2C.
- WMS/logistics depth.
- HRM/payroll.
- Project/task management.
- Broad public website/demo-video push.

These are valuable, but they should wait until the operational core feels solid.

## Recommended Execution Order

| Order | Linear Issue | Work | Why Now |
|---:|---|---|---|
| 1 | HAL-140 | Customer-ready product data workflow | Product setup is the first operational bottleneck in any ERP |
| 2 | HAL-141 | Document printing expansion | Invoices/quotations are highly visible and client-facing |
| 3 | HAL-142 | Development regression hardening | Protects the codebase before deeper module expansion |
| 4 | HAL-143 | Production UX polish pass | Makes existing screens feel more finished |
| 5 | Decision pass | Warehouse vs POS vs BI | Pick based on product gap, not excitement |

## 4-6 Week Plan

### Week 1: Product Data Workflow

Primary issue: HAL-140.

Deliverables:

- Product data workflow document.
- CSV template definition.
- Import/export or guided workflow improvement.
- Low-stock visibility decision and implementation if MVP-small.
- Artifact and verification.

### Week 2: Document Printing Expansion

Primary issue: HAL-141.

Deliverables:

- Quotation print view.
- Sales invoice print view.
- Dashboard print actions.
- Tenant/RBAC verification.
- Artifact and verification.

### Week 3: Regression Hardening

Primary issue: HAL-142.

Deliverables:

- Development regression scope.
- Repeatable script/command if feasible.
- Route checks for document print endpoints.
- Cross-module safety checks.
- Artifact and verification.

### Week 4: UX Polish

Primary issue: HAL-143.

Deliverables:

- UX audit.
- High-impact polish fixes.
- Browser/runtime verification.
- Artifact and verification.

### Weeks 5-6: Deep Module Decision

Pick one:

- Warehouse/location if inventory structure is the biggest weakness.
- POS if retail transaction speed is the biggest weakness.
- BI if management reporting is the biggest weakness.

Do not start all three together.

## Build / Defer Decisions

### Build Now

- Product data workflow.
- Print expansion.
- Development regression.
- UX polish.

### Plan, Then Decide

- Warehouse/location.
- POS.
- BI dashboards.

### Defer

- AI CRM automation.
- E-commerce.
- HRM/payroll.
- WMS/logistics depth.
- Project/task management.
- Broad public sales assets.

## Quality Gates For Every Issue

Each completed issue must include:

- Focused implementation or document.
- Evidence artifact in `outputs/`.
- `npm run lint`.
- `npm run build:ci`.
- Scoped commit.
- GitHub push.
- Linear evidence comment.
- Linear status update.

If runtime/browser behavior changes, add a browser or script verification note.

## Risk Controls

- Keep production DB operations non-destructive.
- Do not print or commit secrets.
- Do not change customer-onboarding/sales scope while this product phase is
  active.
- Do not add a large dependency unless it clearly removes meaningful risk.
- Do not build warehouse, POS, and BI simultaneously.

## Success Criteria

This roadmap succeeds when:

- The next 4-6 weeks have a clear order.
- Product development has priority over sales/onboarding.
- Existing open issues are aligned rather than duplicated.
- The core ERP feels more complete to use before the next customer push.
- The team can choose the next deep module from evidence, not momentum.

## Final Recommendation

Start with **HAL-140 Customer-ready product data workflow**.

Product setup is the first friction point in every ERP. Improving it before
warehouse, POS, BI, or AI work will make every later module easier to test,
demo, and eventually onboard.
