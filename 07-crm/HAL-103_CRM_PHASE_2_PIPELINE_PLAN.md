# HAL-103 CRM Phase 2: Modern Sales CRM Pipeline Plan

## 1. Goal

Extend the production-verified CRM Phase 1 foundation into a modern sales CRM pipeline with deals, tenant-configurable pipeline stages, sales tasks/reminders, Customer 360, and practical analytics cards.

This is still an MVP-friendly Phase 2. It should make CRM useful for day-to-day sales tracking without adding AI scoring, forecasting engines, marketing automation, or complex drag-and-drop behavior yet.

## 2. Current CRM Phase 1 Baseline

CRM Phase 1 is production verified through HAL-107 and signed off through HAL-108.

Current verified capabilities:

- Lead create/list/read/update/archive.
- Lead stage tracking.
- Lead activities and notes.
- Lead conversion to customer/contact.
- Customer/contact create/list/read/update/archive.
- CRM navigation and dashboard page.
- Company-scoped CRM data.
- RBAC permissions: `crm.read`, `crm.create`, `crm.update`, `crm.convert`, `crm.archive`.
- Safe API responses with no password hashes, token hashes, session tokens, or secrets.
- Production runtime QA passed 23/23 checks.

## 3. User Stories

1. As a sales rep, I want to create a deal from a lead or customer so I can track real sales opportunities.
2. As a sales rep, I want to move deals through pipeline stages so I can see sales progress.
3. As a sales manager, I want pipeline totals by stage so I can understand expected revenue.
4. As a sales rep, I want probability and expected close date fields so I can prioritize deals.
5. As a sales manager, I want close-won and close-lost flows so sales outcomes are consistent.
6. As a sales rep, I want tasks/reminders linked to deals or customers so follow-ups are not missed.
7. As a user, I want a Customer 360 panel so I can see customer profile, deals, tasks, and activity in one place.
8. As a company admin, I want pipeline stages configurable per company so each business can use its own sales process.

## 4. MVP Scope

In scope:

- Deal/opportunity model.
- Tenant-configurable pipeline stage model.
- Deal stage history.
- Sales task/reminder model.
- Deal close-won and close-lost lifecycle.
- Deal archive behavior.
- Basic CRM analytics cards.
- Customer 360 data aggregation.
- New RBAC permissions for deals, tasks, and pipeline configuration.
- API and UI planning for the next implementation tasks.

Out of scope:

- Drag-and-drop Kanban.
- AI lead scoring.
- AI customer summaries.
- Predictive forecasting.
- Duplicate matching and merge workflow.
- Marketing automation and email campaigns.
- Direct sales-order creation from won deals.
- Mobile app.

## 5. Data Model Plan

### DealStatus enum

```prisma
enum DealStatus {
  active
  won
  lost
  archived
  cancelled
}
```

### SalesTaskStatus enum

```prisma
enum SalesTaskStatus {
  pending
  in_progress
  completed
  cancelled
}
```

### SalesTaskPriority enum

```prisma
enum SalesTaskPriority {
  low
  medium
  high
  urgent
}
```

### PipelineStage model

Use a model instead of a fixed enum because every company can have different stage names and ordering.

Important decision: use stable `key` plus editable `name`. Do not use `order` as a field name; use `sortOrder`.

Planned fields:

- `id`
- `companyId`
- `key`
- `name`
- `sortOrder`
- `description`
- `isActive`
- `createdAt`
- `updatedAt`

Constraints and indexes:

- `@@unique([companyId, key])`
- `@@index([companyId])`
- `@@index([companyId, sortOrder])`
- `@@index([isActive])`

Do not use `@@unique([companyId, sortOrder])` in Phase 2 because reordering stages would become unnecessarily painful.

Default stages per company:

- qualification
- proposal
- negotiation
- closed_won
- closed_lost

Phase 2 should include a helper to ensure default pipeline stages exist for a company.

### Deal model

Planned fields:

- `id`
- `companyId`
- `name`
- `description`
- `value`
- `probability`
- `expectedCloseDate`
- `currentStageId`
- `leadId`
- `customerContactId`
- `status`
- `wonAt`
- `lostAt`
- `lostReason`
- `archivedAt`
- `createdAt`
- `updatedAt`

Important decisions:

- `probability` is an integer from 0 to 100.
- `value` should be decimal with two places.
- `leadId` and `customerContactId` are optional, but a deal should normally link to at least one of them.
- Closed deals are immutable except archive/visibility metadata.

Useful indexes:

- `@@index([companyId])`
- `@@index([currentStageId])`
- `@@index([status])`
- `@@index([expectedCloseDate])`
- `@@index([leadId])`
- `@@index([customerContactId])`
- `@@index([companyId, status])`

### DealStageHistory model

Planned fields:

- `id`
- `companyId`
- `dealId`
- `fromStageId`
- `toStageId`
- `changedByUserId`
- `probability`
- `value`
- `note`
- `createdAt`

Important decision: include `companyId` directly even though it can be reached through Deal. This keeps tenant-scoped queries simple and consistent.

Useful indexes:

- `@@index([companyId])`
- `@@index([dealId])`
- `@@index([toStageId])`
- `@@index([changedByUserId])`
- `@@index([createdAt])`

### SalesTask model

Planned fields:

- `id`
- `companyId`
- `dealId`
- `leadId`
- `customerContactId`
- `assignedToUserId`
- `createdByUserId`
- `title`
- `description`
- `dueAt`
- `completedAt`
- `status`
- `priority`
- `createdAt`
- `updatedAt`

Important decisions:

- Tasks can link to a deal, lead, customer, or any combination that makes sense.
- Tasks should be company-scoped independently.
- No hard delete in MVP; use `cancelled`.

Useful indexes:

- `@@index([companyId])`
- `@@index([dealId])`
- `@@index([leadId])`
- `@@index([customerContactId])`
- `@@index([assignedToUserId])`
- `@@index([createdByUserId])`
- `@@index([dueAt])`
- `@@index([status])`
- `@@index([companyId, status])`

### Existing model relation additions

Add relations where appropriate:

- `Company` -> `pipelineStages`, `deals`, `dealStageHistory`, `salesTasks`.
- `Lead` -> `deals`, `salesTasks`.
- `CustomerContact` -> `deals`, `salesTasks`.
- `User` -> assigned sales tasks, created sales tasks, changed deal stage history.
- `PipelineStage` -> active deals, from-stage history, to-stage history.

## 6. Business Rules

1. Every new CRM Phase 2 record must be company scoped.
2. APIs must derive `companyId` from the authenticated session only.
3. Request body/query `companyId` must be ignored.
4. Cross-company IDs must return `403` to preserve anti-enumeration behavior.
5. Pipeline stages must belong to the current company and be active before assignment.
6. Default pipeline stages must exist before creating the first deal.
7. Deal probability must be 0 to 100.
8. Active deals can be updated and moved between active pipeline stages.
9. Closing a deal as won sets `status = won`, sets `wonAt`, moves to `closed_won`, and writes history.
10. Closing a deal as lost requires `lostReason`, sets `status = lost`, sets `lostAt`, moves to `closed_lost`, and writes history.
11. Won/lost deals cannot be edited like active deals.
12. Archived deals are hidden by default but available with an explicit archived filter.
13. Sales tasks are overdue when `dueAt < now` and `status` is `pending` or `in_progress`.
14. Sales tasks are not hard deleted; use `cancelled`.
15. Audit logs should be written for deal close, stage change, archive, and task status changes.

## 7. Permissions Plan

Add these permissions:

- `crm.deals.read`
- `crm.deals.create`
- `crm.deals.update`
- `crm.deals.close`
- `crm.tasks.read`
- `crm.tasks.create`
- `crm.tasks.update`
- `crm.pipeline.read`
- `crm.pipeline.update`

Role defaults:

- Admin gets all new permissions.
- Staff gets:
  - `crm.deals.read`
  - `crm.deals.create`
  - `crm.deals.update`
  - `crm.tasks.read`
  - `crm.tasks.create`
  - `crm.tasks.update`
  - `crm.pipeline.read`
- Staff does not get:
  - `crm.deals.close`
  - `crm.pipeline.update`

Reasoning:

- Staff can manage normal deal and task work.
- Only admin can close deals and configure pipeline stages.
- Pipeline stage configuration must not be hidden behind `crm.deals.update`, because staff also needs deal updates.

## 8. API Plan

All endpoints are tenant-scoped and must use existing auth/RBAC guard patterns.

### Deals

- `GET /api/crm/deals` with `crm.deals.read`
- `POST /api/crm/deals` with `crm.deals.create`
- `GET /api/crm/deals/[id]` with `crm.deals.read`
- `PATCH /api/crm/deals/[id]` with `crm.deals.update`
- `POST /api/crm/deals/[id]/close-won` with `crm.deals.close`
- `POST /api/crm/deals/[id]/close-lost` with `crm.deals.close`
- `POST /api/crm/deals/[id]/archive` with `crm.deals.update`

### Sales tasks

- `GET /api/crm/tasks` with `crm.tasks.read`
- `POST /api/crm/tasks` with `crm.tasks.create`
- `GET /api/crm/tasks/[id]` with `crm.tasks.read`
- `PATCH /api/crm/tasks/[id]` with `crm.tasks.update`
- `POST /api/crm/tasks/[id]/complete` with `crm.tasks.update`
- `POST /api/crm/tasks/[id]/cancel` with `crm.tasks.update`

### Pipeline stages

- `GET /api/crm/pipeline-stages` with `crm.pipeline.read`
- `POST /api/crm/pipeline-stages` with `crm.pipeline.update`
- `PATCH /api/crm/pipeline-stages/[id]` with `crm.pipeline.update`

### Summary and Customer 360

- `GET /api/crm/summary` with `crm.deals.read`
- `GET /api/crm/customers/[id]/360` with `crm.read`

## 9. UI Plan

Update `/dashboard/crm` into a practical tabbed CRM workspace:

- Overview: analytics cards and follow-up summary.
- Pipeline: column view by stage, no drag-and-drop in MVP.
- Deals: searchable table/list view.
- Tasks: upcoming, overdue, and completed task sections.
- Customers: Customer 360 access from customer rows.

Controls:

- Create deal shown with `crm.deals.create`.
- Edit deal shown with `crm.deals.update`.
- Close-won/close-lost shown with `crm.deals.close`.
- Create task shown with `crm.tasks.create`.
- Update/complete task shown with `crm.tasks.update`.
- Pipeline stage configuration shown with `crm.pipeline.update`.

Design:

- Keep the existing professional office dashboard style.
- No marketing hero.
- No nested cards inside cards.
- Stable table/card dimensions.
- Mobile responsive tabs or stacked sections.

## 10. Tenant and Security Requirements

- Never trust client-supplied `companyId`.
- All reads and writes must scope by authenticated session company.
- Cross-company record access returns `403`.
- Responses must use explicit safe selects.
- No password hashes, token hashes, session tokens, API keys, or internal secrets.
- All mutation routes must validate input with schemas.
- All lifecycle actions must use transactions where multiple records change together.
- New permissions must be server-enforced, not only UI-hidden.

## 11. Acceptance Criteria

- Schema validates and Prisma Client generates successfully.
- Default permission catalog includes all new Phase 2 keys.
- Admin role gets all new Phase 2 permissions.
- Staff role gets deal/task work permissions but not close or pipeline configuration permissions.
- Default pipeline stages can be seeded per company.
- Deal records are company scoped.
- Deal stage history is company scoped.
- Sales task records are company scoped.
- `npm run lint` passes.
- `npm run build:ci` passes.

## 12. Risks

- Stage customization can add complexity. Mitigation: keep Phase 2 stage config simple and no drag-and-drop.
- Staff/admin permission confusion. Mitigation: separate `crm.pipeline.update` from `crm.deals.update`.
- Deal close rules can create data inconsistency. Mitigation: use transaction and history writes.
- Customer 360 can become too broad. Mitigation: keep it as a read aggregation in Phase 2.
- Scope creep into AI/forecasting. Mitigation: keep AI in Phase 3.

## 13. Next Implementation Task

HAL-109: CRM Phase 2 schema and permission foundation.

Scope:

- Add Prisma enums and models.
- Add relations to existing Company, Lead, CustomerContact, and User models.
- Add default pipeline stage helper or plan the helper in the next API task.
- Add new permission keys.
- Update admin/staff role defaults.
- Run Prisma validate/generate.
- Run lint and build:ci.
- Update Linear with schema and permission summary.

Do not implement API endpoints or UI in HAL-109.
