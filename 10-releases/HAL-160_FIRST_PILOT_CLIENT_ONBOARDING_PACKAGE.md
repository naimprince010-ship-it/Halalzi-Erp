# HAL-160 First Pilot Client Onboarding Package

**Date:** 2026-06-24  
**Status:** Ready for first controlled pilot client  
**Audience:** Founder/operator, pilot client champion, implementation support

## Goal

Provide a repeatable package for onboarding the first paid/pilot customer without
turning the process into custom consulting. This package converts the release
readiness work into practical customer-facing steps.

## Launch Boundary

This package is for a controlled pilot, not broad self-serve SaaS launch.

- Maximum concurrent pilot customers: 5.
- Pilot price: 5,000 BDT/month.
- Remote onboarding only.
- No custom feature development for individual clients.
- Client must nominate one internal champion.
- Client owns data cleanup and data entry unless a separate paid data-service
  agreement is created later.

## Pre-Onboarding Gate

Complete these before accepting payment or creating the client company:

- [ ] Production admin password has been rotated after any accidental exposure.
- [ ] Latest production deployment is healthy.
- [ ] Authenticated production smoke or browser session check is green.
- [ ] Admin can access dashboard, users, roles, products, sales, procurement,
  finance, and reports.
- [ ] Client has accepted pilot scope, pricing, and support boundaries.
- [ ] Client has one named champion who can attend setup/training calls.
- [ ] Client understands email/domain limitations if final sender domain is not
  verified yet.

## Client Qualification Form

Use this before scheduling onboarding.

### Company Profile

- Company name:
- Industry:
- City/country:
- Approximate employees:
- Monthly order volume:
- Current tools: spreadsheet / paper / Tally / QuickBooks / other
- Primary pain: sales / procurement / inventory / finance / CRM

### Decision and Champion

- Decision maker:
- Internal champion:
- Champion email:
- Champion phone/WhatsApp:
- Who will use the system daily?
- Who can approve business process decisions?

### Module Fit

- Need Sales Orders: Yes/No
- Need Purchase Orders: Yes/No
- Need Inventory Tracking: Yes/No
- Need Basic Finance AR/AP: Yes/No
- Need CRM Leads/Deals/Tasks: Yes/No
- Need role-based staff access: Yes/No
- Need data exports: Yes/No

### Pilot Constraints

- Will they accept remote-only onboarding?
- Will they accept no custom code during pilot?
- Will they provide feedback weekly?
- Can they prepare product/vendor/customer data within 7 days?
- Any compliance or separate-database requirement?

Decision:
- Proceed / Hold / Not Fit
- Reason:

## Data Collection Templates

Ask the client to prepare the following data in spreadsheet form. Do not accept
messy screenshots, chat messages, or handwritten lists as the source of truth.

### Products

Required columns:

- SKU
- Product name
- Category
- Unit
- Current stock quantity
- Selling price
- Purchase cost
- Reorder level
- Status

Rules:

- Every SKU must be unique.
- Stock quantity must be numeric.
- Do not import discontinued items unless the client needs history.

### Vendors

Required columns:

- Vendor name
- Code
- Contact person
- Phone
- Email
- Address
- Status

Rules:

- Start with the top 5-15 vendors only.
- Avoid importing old inactive vendors in week 1.

### Customers

Required columns:

- Customer name
- Code
- Contact person
- Phone
- Email
- Address
- Status

Rules:

- Start with active repeat customers.
- Do not import sensitive personal details that are not needed for operations.

### Users and Roles

Required columns:

- Name
- Email
- Job role
- Needed access: Admin / Sales / Procurement / Finance / Read-only

Rules:

- Keep first phase to 1 admin plus up to 4 staff.
- Use least privilege.
- Never share one account between multiple staff.

### Opening Balances

Use only if the client is ready and confident in the numbers.

- Opening stock by SKU
- Open customer receivables
- Open supplier payables
- Cash/bank opening balances

If numbers are uncertain, start with operations only and defer finance opening
balances until after validation.

## Day 1 Kickoff Call Script

Duration: 60 minutes.

### Agenda

1. Confirm pilot scope and success criteria.
2. Confirm champion, users, and role access.
3. Confirm first-week data responsibilities.
4. Walk through the production app at a high level.
5. Agree on support channel and response expectations.

### Founder Script

Use this simple opening:

> The goal of this pilot is not to customize software for one company. The goal
> is to test whether the core Halalzi ERP workflows can run your daily sales,
> procurement, inventory, and basic finance work with less spreadsheet chaos.

### Decisions to Capture

- Which module goes live first?
- Which staff get access first?
- Which data must be ready before training?
- What does success look like after 30 days?
- What issue would make the pilot fail?

## Day 7 Training Script

Duration: 60 minutes.

### Required Demo Flow

1. Login and dashboard overview.
2. Create or review products.
3. Create a vendor.
4. Create a draft purchase order.
5. Submit/approve purchase order if client uses approvals.
6. Receive purchase order.
7. Create a sales order.
8. Confirm sales order.
9. Review finance receivable/payable impact.
10. Export one operational report.

### Training Rules

- Train using client-safe demo records or the client's approved initial data.
- Do not improvise custom workflows during the call.
- Record questions as product feedback, not promises.
- Keep the client champion responsible for internal staff adoption.

## Day 14 Check-In Script

Duration: 30 minutes.

### Questions

- Which workflow did your team actually use?
- Where did staff get stuck?
- Which spreadsheet did this replace?
- Which report did you trust?
- Which missing feature blocks daily use?
- Do you want to continue the pilot into month 2?

### Health Score

Score each 1-5:

- Champion engagement
- Data readiness
- Staff adoption
- Workflow fit
- Support load

Decision:

- 20-25: Continue and deepen pilot
- 15-19: Continue with focused fixes/training
- Below 15: pause and reassess fit

## Support Policy Message

Send this to the client champion after kickoff.

```text
Welcome to the Halalzi ERP pilot.

For the pilot period, support is remote and async-first.

Support channel:
- WhatsApp group for the client champion and Halalzi founder/operator
- Email for non-urgent written issues

Response expectation:
- Business days: best effort within 4 business hours for pilot-blocking issues
- General questions: within 24-48 hours
- Friday/Saturday: critical production access issues only

Important scope:
- The pilot includes core ERP workflows only.
- Custom feature development is not included.
- Feature requests will be logged and prioritized only if they fit the shared product roadmap.
- Please send screenshots without passwords, tokens, or private customer data where possible.
```

## No Custom Code Agreement Note

Use this before taking payment.

```text
The pilot subscription covers access to the current Halalzi ERP product,
standard onboarding, and remote support. It does not include custom software
development, custom integrations, on-site implementation, hardware setup, or
manual data entry services.

Any feature requests discovered during the pilot will be recorded as product
feedback. Halalzi may choose to add them to the shared roadmap, but there is no
commitment to build client-specific code during the pilot.
```

## Go-Live Checklist

Do this before the client starts daily production usage.

- [ ] Client company created in production.
- [ ] Client admin email verified.
- [ ] Staff users created.
- [ ] Roles assigned and approved by client champion.
- [ ] Product list entered/imported.
- [ ] Vendor list entered/imported.
- [ ] Customer list entered/imported if sales module is in scope.
- [ ] At least one test purchase order completed.
- [ ] At least one test sales order completed.
- [ ] Finance pages load for client admin.
- [ ] Export path tested.
- [ ] Support policy sent to champion.
- [ ] Day 7 training scheduled.
- [ ] Day 14 check-in scheduled.

## Pilot Success Metrics

Track these weekly:

- Active users this week
- Purchase orders created
- Sales orders created
- Products updated
- Exports downloaded
- Support requests opened
- Support requests resolved
- Feature requests logged
- Client confidence score from champion

## Red Flags

Pause onboarding if any are true:

- Client demands custom code before using the product.
- Client has no internal champion.
- Client cannot provide clean product/vendor/customer data.
- Client expects on-site implementation under pilot pricing.
- Client requires compliance/security guarantees beyond current pilot posture.
- Client asks to share one login across multiple users.

## Final Recommendation

Ready to approach the first qualified pilot client.

The product is now ready for a narrow paid pilot, provided the founder keeps the
scope tight, rotates exposed admin credentials, and uses this package instead of
inventing onboarding steps live on every call.
