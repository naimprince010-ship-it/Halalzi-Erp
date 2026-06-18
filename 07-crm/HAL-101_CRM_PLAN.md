# HAL-101 CRM Requirements And Schema Plan

## 1. Goal

Add a simple CRM foundation inside Halalzi ERP so each company can track leads,
customer/contact records, follow-ups, and a basic sales pipeline before a lead
becomes an ERP sales order.

This is an ERP-connected CRM module, not a separate CRM product yet.

## 2. MVP Scope

Build only the practical CRM core:

- Leads
- Customer/contact records
- Pipeline stage tracking
- Follow-up date and notes
- Lead status changes
- Optional conversion from lead to customer/contact
- Company-scoped CRM data

Keep out of MVP:

- Email campaigns
- Marketing automation
- Call center tools
- Advanced forecasting
- Multi-owner sales teams
- Complex CRM workflow automation
- Separate CRM mobile app

## 3. User Stories

1. As a company admin, I want to create a lead so I can track possible buyers.
2. As a sales staff user, I want to view assigned company leads so I can follow up.
3. As a sales staff user, I want to update lead stage/status so the team knows progress.
4. As a company admin, I want to archive lost/unqualified leads without deleting history.
5. As a company admin, I want to convert a qualified lead into a customer/contact record.
6. As a company admin, I want CRM data isolated by company so one tenant cannot see another tenant's leads.

## 4. Required MVP Fields

### Lead

- id
- companyId
- name
- companyName optional
- email optional
- phone optional
- source optional
- stage
- status
- estimatedValue optional
- expectedCloseDate optional
- nextFollowUpAt optional
- notes optional
- convertedCustomerId optional
- createdAt
- updatedAt

### CustomerContact

- id
- companyId
- name
- companyName optional
- email optional
- phone optional
- address optional
- notes optional
- status
- createdAt
- updatedAt

### LeadActivity

- id
- companyId
- leadId
- userId optional
- type
- note
- createdAt

## 5. Business Rules

1. Every CRM record must belong to one company.
2. API routes must derive `companyId` from the authenticated session only.
3. Request body/query `companyId` must be ignored.
4. A lead can move through simple stages:
   - new
   - contacted
   - qualified
   - proposal
   - won
   - lost
5. A lead status can be:
   - active
   - converted
   - archived
6. Only active leads can be edited.
7. A converted lead should keep history and link to the created customer/contact.
8. Do not hard delete leads or customers in MVP; archive instead.
9. Email/phone are optional because many early leads may come from phone calls or walk-ins.
10. Duplicate customer email should be allowed only when email is missing; if present, enforce company-level uniqueness later if customer quality requires it.

## 6. Permissions

Add CRM permission keys:

- `crm.read` - view leads/customers
- `crm.create` - create leads/customers
- `crm.update` - update lead/customer details
- `crm.convert` - convert lead to customer
- `crm.archive` - archive lead/customer

Default role mapping:

- Company Admin: all CRM permissions
- Staff: `crm.read`, `crm.create`, `crm.update`

Staff should not convert/archive by default until the admin grants those permissions.

## 7. Prisma Schema Plan

Add enums:

```prisma
enum LeadStage {
  new
  contacted
  qualified
  proposal
  won
  lost
}

enum LeadStatus {
  active
  converted
  archived
}

enum CustomerStatus {
  active
  archived
}

enum LeadActivityType {
  note
  call
  email
  meeting
  status_change
}
```

Add models:

```prisma
model Lead {
  id                  String     @id @default(cuid())
  companyId           String
  name                String
  companyName         String?
  email               String?
  phone               String?
  source              String?
  stage               LeadStage  @default(new)
  status              LeadStatus @default(active)
  estimatedValue      Decimal?   @db.Decimal(12, 2)
  expectedCloseDate   DateTime?
  nextFollowUpAt      DateTime?
  notes               String?
  convertedCustomerId String?
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt

  company           Company          @relation(fields: [companyId], references: [id])
  convertedCustomer CustomerContact? @relation(fields: [convertedCustomerId], references: [id])
  activities        LeadActivity[]

  @@index([companyId])
  @@index([stage])
  @@index([status])
  @@index([nextFollowUpAt])
  @@index([companyId, name])
}

model CustomerContact {
  id          String         @id @default(cuid())
  companyId   String
  name        String
  companyName String?
  email       String?
  phone       String?
  address     String?
  notes       String?
  status      CustomerStatus @default(active)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  company        Company @relation(fields: [companyId], references: [id])
  convertedLeads Lead[]

  @@index([companyId])
  @@index([status])
  @@index([companyId, name])
}

model LeadActivity {
  id        String           @id @default(cuid())
  companyId String
  leadId    String
  userId    String?
  type      LeadActivityType @default(note)
  note      String
  createdAt DateTime         @default(now())

  company Company @relation(fields: [companyId], references: [id])
  lead    Lead    @relation(fields: [leadId], references: [id])
  user    User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([companyId])
  @@index([leadId])
  @@index([userId])
  @@index([createdAt])
}
```

Add relations:

- `Company.leads Lead[]`
- `Company.customerContacts CustomerContact[]`
- `Company.leadActivities LeadActivity[]`
- `User.leadActivities LeadActivity[]`

## 8. API Plan

### Leads

- `GET /api/crm/leads`
  - Permission: `crm.read`
  - Filters: stage, status, search, nextFollowUp due
  - Company scoped

- `POST /api/crm/leads`
  - Permission: `crm.create`
  - Creates active lead
  - Ignores request `companyId`

- `GET /api/crm/leads/[id]`
  - Permission: `crm.read`
  - Company-scoped lookup

- `PATCH /api/crm/leads/[id]`
  - Permission: `crm.update`
  - Active leads only
  - Updates details/stage/follow-up

- `POST /api/crm/leads/[id]/convert`
  - Permission: `crm.convert`
  - Creates CustomerContact
  - Marks lead converted
  - Runs in transaction

- `POST /api/crm/leads/[id]/archive`
  - Permission: `crm.archive`
  - Marks lead archived

### Customers

- `GET /api/crm/customers`
  - Permission: `crm.read`

- `POST /api/crm/customers`
  - Permission: `crm.create`

- `GET /api/crm/customers/[id]`
  - Permission: `crm.read`

- `PATCH /api/crm/customers/[id]`
  - Permission: `crm.update`

- `POST /api/crm/customers/[id]/archive`
  - Permission: `crm.archive`

### Lead Activities

- `GET /api/crm/leads/[id]/activities`
  - Permission: `crm.read`

- `POST /api/crm/leads/[id]/activities`
  - Permission: `crm.update`
  - Creates note/call/email/meeting activity

## 9. UI Plan

Primary page:

- `/dashboard/crm`

Views:

- Lead pipeline summary cards
- Lead list/table
- Lead create form
- Lead edit panel
- Convert lead action
- Archive lead action
- Customer/contact list section
- Follow-up due filter

Professional office dashboard style:

- No marketing hero
- Dense but readable forms/tables
- Same sidebar/topbar pattern as Products/Sales/Procurement
- Permission-gated controls

Navigation:

- Add `CRM` nav item with `crm.read`
- Add dashboard module card for CRM

## 10. Acceptance Criteria

1. Admin can create, view, update, convert, and archive leads.
2. Staff can view/create/update leads but cannot convert/archive by default.
3. CRM records are scoped by authenticated company.
4. Cross-company lead/customer access returns 403.
5. Request-supplied `companyId` is ignored.
6. Converted lead creates a customer/contact and keeps lead history.
7. Archived leads are not hard deleted.
8. API responses expose safe fields only.
9. Audit log records important CRM mutations.
10. `npm run lint`, `npm run build:ci`, and CRM runtime checks pass.

## 11. Risks

- CRM can become too large if marketing automation is added too early.
- Customer duplication can become messy without later merge/dedupe workflow.
- Converting CRM customer to ERP sales customer needs future refinement because current sales orders use customer snapshots.
- Pipeline forecasting should wait until enough CRM/sales data exists.

## 12. Next Implementation Task

HAL-102: CRM schema and permission foundation.

Scope:

- Add CRM enums/models/relations to Prisma schema.
- Add CRM permissions to `default-permissions.ts`.
- Add CRM role defaults to `default-roles.ts`.
- Run Prisma validate/generate/db sync.
- Run lint and build:ci.

