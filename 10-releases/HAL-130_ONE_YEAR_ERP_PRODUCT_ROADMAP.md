# HAL-130 One-Year ERP Product Roadmap

## Goal

Define the next 12 months of Halalzi ERP after Core ERP MVP signoff, with a
realistic solo/founder-led path from controlled demo to pilot customers and then
to a deeper Odoo-style ERP competitor.

## Current Product Status

Core ERP MVP is signed off for demo and controlled onboarding.

Built and verified:

- Authentication, session, register/login/logout/current user.
- Company/tenant scope.
- Users, roles, permissions, and protected dashboards.
- Product and basic inventory.
- Sales orders.
- Vendor and purchase order workflows.
- Finance accounts, journals, receivables, payables, periods, payments, and
  basic reports.
- Sales-to-finance and procurement-to-finance linkage.
- Inventory stock ledger.
- CRM Phase 1/2 foundation.
- Audit/export foundations.
- Vercel production deployment and production smoke.
- Release candidate QA and production signoff.

Accepted limitations:

- Provider-side API key rotation is still required after screenshot exposure.
- Authenticated production smoke should be rerun with secure admin credentials.
- Production migration baseline is pending before switching fully to
  `prisma migrate deploy`.
- Domain/Resend sender verification is deferred until domain purchase.
- Broad paid-client onboarding should wait until the above are accepted or
  completed.

## 12-Month Vision

By the end of 12 months, Halalzi ERP should be a practical, sellable ERP SaaS
for small and medium businesses, focused on:

- Fast onboarding.
- Clean operational dashboards.
- Strong inventory, sales, procurement, finance, and CRM basics.
- Auditability and tenant security.
- Simple automation and AI-assisted workflows.
- A smaller, clearer alternative to heavyweight ERP systems.

The first goal is not to clone Odoo. The goal is to beat Odoo for a narrow
market segment by being simpler, faster to understand, easier to onboard, and
more locally practical.

## Roadmap Principles

- Stabilize before expanding.
- Sell controlled pilots before building every module.
- Keep each HAL issue small enough to finish and verify.
- Prefer workflows customers can actually use this month.
- Use AI only where it saves user time or reduces operational mistakes.
- Do not build enterprise-grade complexity before pilot evidence exists.

## Quarter-by-Quarter Roadmap

### Q1: Pilot-Ready Core ERP

Goal: Turn demo-ready MVP into pilot-ready product.

Primary outcomes:

- Security cleanup and provider API key rotation.
- Authenticated production smoke with secure admin credentials.
- Migration baseline hardening or explicit accepted operating procedure.
- Domain purchase and sender verification when ready.
- Demo tenant and onboarding workflow.
- First 1-3 controlled pilot conversations.
- UI polish for common module pages.
- Bug-fix loop from real usage.

Recommended HAL themes:

- Security cleanup.
- Production hardening.
- Demo and onboarding operations.
- First pilot feedback capture.
- Print/export polish.
- Sales/procurement/finance usability improvements.

### Q2: Pilot Customer Workflows

Goal: Make the product useful enough for 1-3 pilot businesses to operate daily.

Primary outcomes:

- Sales quotation/invoice lifecycle.
- Purchase approval and receiving polish.
- Better finance payment and aging workflows.
- Product import/export improvements.
- Role templates for common business teams.
- Client-facing onboarding checklist and training notes.
- Support process and issue intake.
- First pricing/package draft.

Recommended modules:

- Quotation and invoice basics.
- Payment/expense/cash-bank ledger improvements.
- Import/export and data cleanup tools.
- Dashboard widgets by role.
- PDF/print documents for sales and purchase.

### Q3: Competitive Operational Depth

Goal: Build depth that makes Halalzi ERP credible beside Odoo-like tools for a
focused SME segment.

Primary outcomes:

- POS MVP if retail pilot demand exists.
- Warehouse/location basics if stock complexity is common.
- HRM employee basics if service/business pilots need it.
- BI dashboards for sales, inventory, finance, and CRM.
- Approval workflows for purchase/expense/journal actions.
- Notification and task follow-up basics.

Recommended modules:

- POS foundation.
- Warehouse/location stock.
- Expense/cash-bank ledger.
- HRM employee directory and leave basics.
- BI dashboard.
- Workflow approvals.

### Q4: Scale, Automation, and AI Differentiation

Goal: Add automation and AI that makes the product feel modern without becoming
fragile.

Primary outcomes:

- AI CRM summaries and next-best actions.
- AI inventory reorder suggestions.
- AI finance summary and anomaly hints.
- Automation rules for stale leads, overdue tasks, low stock, and unpaid
  invoices.
- Performance/security audit.
- Public website, demo videos, and sales materials.
- Paid-client launch readiness.

Recommended modules:

- AI-assisted CRM.
- AI-assisted inventory planning.
- AI finance explanation layer.
- Workflow automation rules.
- Customer support/admin tooling.
- Public marketing/demo assets.

## Month-by-Month Execution Plan

| Month | Focus | Expected Outcome |
|---:|---|---|
| 1 | Security and production hardening | Key rotation, authenticated smoke, migration baseline decision, bug fixes |
| 2 | Demo/onboarding and pilot prep | Demo tenant, client checklist, guided demo flow, first pilot conversations |
| 3 | Sales documents | Quote/invoice basics, PDF/print, order lifecycle polish |
| 4 | Finance usability | Payments, aging, cash/bank/expense basics, finance dashboard polish |
| 5 | Procurement and inventory depth | Purchase approval, receiving polish, stock alerts/import/export |
| 6 | Pilot hardening | Fix pilot feedback, role templates, backup/restore rehearsal, support workflow |
| 7 | POS or warehouse decision | Build the one with strongest pilot demand |
| 8 | BI and reporting | Sales/inventory/finance dashboards and exportable summaries |
| 9 | HRM or approval workflows | Build employee basics or stronger internal approvals |
| 10 | AI CRM | Lead/deal summaries, follow-up drafts, next-best actions |
| 11 | AI operations | Inventory reorder suggestions, finance summaries, anomaly hints |
| 12 | Launch package | Performance/security review, demo videos, website, pricing, paid-client readiness |

## Recommended Linear Issue Sequence

Immediate issues:

1. Security/API key rotation confirmation.
2. Authenticated production smoke setup.
3. Production migration baseline hardening decision.
4. Demo tenant setup and pilot demo script.
5. Client onboarding checklist v2 after first demo feedback.

Next product issues:

6. Sales quotation and invoice plan.
7. Sales quotation and invoice implementation.
8. PDF/print document foundation.
9. Product import/export polish.
10. Finance payment and cash/bank ledger plan.
11. Finance payment and cash/bank ledger implementation.
12. Purchase approval workflow plan.
13. Purchase approval workflow implementation.
14. Role templates and onboarding presets.
15. Pilot feedback regression suite.

Later roadmap issues:

16. POS requirements plan.
17. POS schema/API foundation.
18. POS dashboard UI.
19. Warehouse/location requirements plan.
20. Warehouse/location implementation.
21. BI dashboard requirements plan.
22. BI dashboard implementation.
23. AI CRM automation plan.
24. AI CRM automation implementation.
25. Paid-client launch checklist.

## Daily and Weekly HAL Target

Solo/founder-led realistic target:

- Normal day: 1 meaningful HAL issue.
- Documentation or Linear cleanup day: 2 HAL issues.
- Complex feature build: 1 HAL every 2-4 days.
- Weekly target: 4-6 completed HALs.
- Monthly target: 16-22 completed HALs.
- 12-month target: 180-250 solid HALs.

Avoid counting tiny busywork as progress. A good HAL should usually produce one
of these:

- A verified feature.
- A useful planning artifact.
- A production hardening improvement.
- A customer-facing workflow improvement.
- A regression or signoff artifact.

## Product Module Priority

Highest priority after MVP:

1. Sales quotation/invoice.
2. PDF/print documents.
3. Finance cash/bank/expense depth.
4. Product import/export and stock alerts.
5. Purchase approval.
6. Role templates/onboarding presets.
7. BI dashboards.
8. POS or warehouse, based on pilot demand.
9. AI CRM/automation.
10. HRM basics, if target customers ask for it.

## Technical Hardening Roadmap

Month 1-2:

- Rotate exposed provider API key.
- Replace local plaintext model keys with environment variables.
- Run authenticated production smoke.
- Decide and document migration baseline procedure.
- Verify backup/restore workflow against a restore branch.
- Add release checklist discipline for every deploy.

Month 3-6:

- Improve CI checks.
- Add regression scripts for new sales/finance workflows.
- Add structured seed/demo data for non-production only.
- Improve logging and error observability.
- Create internal support/debug runbooks.

Month 7-12:

- Performance pass on slow dashboards and reports.
- Security review of tenant isolation, RBAC, and exports.
- Data retention and audit export policy.
- Optional durable rate limiting and background jobs.
- Modular architecture review before adding many future modules.

## Go-to-Market Roadmap

Month 1-2:

- Prepare controlled demo script.
- Identify 10 target businesses.
- Run 3-5 discovery calls.
- Convert 1-3 into pilot candidates.
- Track objections and missing workflows.

Month 3-6:

- Build around pilot workflows.
- Create simple pricing packages.
- Prepare onboarding/training guide.
- Record demo videos.
- Collect pilot testimonials or case notes if possible.

Month 7-12:

- Public website and product positioning.
- Domain/email trust setup.
- Paid pilot conversion.
- Support process.
- Partner/accountant/consultant channel exploration.

## Odoo/Global ERP Competition Gap Analysis

Where Odoo is stronger today:

- Huge module ecosystem.
- Mature accounting/localization.
- Website/e-commerce/POS breadth.
- Studio/customization.
- Marketplace/community.
- Partner implementation network.

Where Halalzi ERP can compete first:

- Simpler UX for a narrow target customer.
- Faster onboarding.
- Cleaner defaults.
- Local business workflows.
- Founder-led support and customization.
- AI-assisted operational summaries.
- Lower complexity and lower training burden.

Do not compete module-for-module in year one. Compete by solving a smaller set
of painful workflows better for a specific customer profile.

## Solo Developer Risks and Tradeoffs

Risks:

- Building too many modules before pilots.
- Skipping security and migration hardening.
- Overbuilding AI before stable workflows.
- Trying to match Odoo breadth too early.
- Not collecting real customer feedback quickly enough.

Tradeoffs:

- Prefer fewer modules with strong workflows over many shallow modules.
- Prefer pilot evidence over speculative features.
- Prefer simple operational reports over complex analytics early.
- Prefer documented manual operations before premature automation.

## Next 30-Day Action Plan

Week 1:

- Rotate exposed provider API key.
- Run authenticated production smoke with secure credentials.
- Decide migration baseline next step.
- Prepare demo tenant/demo script.

Week 2:

- Run 3-5 demos/discovery calls.
- Capture feedback into Linear.
- Fix top onboarding blockers.
- Improve dashboard/module navigation where needed.

Week 3:

- Plan sales quotation/invoice workflow.
- Implement the smallest useful quote/invoice path.
- Add print/PDF direction if needed.

Week 4:

- Polish finance/payment/report usability.
- Re-run regression and production smoke.
- Decide Month 2 pilot build priorities from feedback.

## Decision

Proceed with a stabilization-first, pilot-led 12-month roadmap.

The next product phase should not be broad module expansion. It should be:

1. Security and production hardening.
2. Demo/pilot onboarding.
3. Sales/finance/inventory depth.
4. Pilot feedback loop.
5. Only then POS, warehouse, BI, HRM, and AI automation.
