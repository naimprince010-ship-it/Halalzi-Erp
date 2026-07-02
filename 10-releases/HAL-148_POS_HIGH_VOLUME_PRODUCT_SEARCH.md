# HAL-148 POS High-Volume Product Search Performance Hardening

## Goal

Keep the cashier POS product search usable when a tenant has 100k+ products.

## What Changed

- Added tenant/status/search-field composite indexes to `Product`.
- Added a Postgres migration with `pg_trgm` GIN indexes for SKU, name, and category contains search.
- Changed `/api/pos/products` to keyset pagination with `cursor`, `limit + 1`, `nextCursor`, and `hasMore`.
- Kept the API capped at 50 rows per request.
- Updated `/dashboard/pos` to keep 24-row pages and append more products only when the cashier clicks `Load more products`.
- Kept the existing debounced search behavior so typing does not send a request on every keystroke.

## Performance Target

Target: sub-200ms indexed search under normal deployment conditions for a 100k+ product tenant.

The implementation is designed around:

- tenant-scoped filters,
- active-product filter,
- indexed SKU/name/category search,
- stable cursor order by name, SKU, and ID,
- small UI result pages.

## Verification

Run:

```powershell
npm run verify:hal148:performance
npm run regression:pos
npm run lint
npm run build:ci
```

Artifacts:

- `outputs/HAL-148_pos_search_performance_verification.json`
- `../outputs/HAL-148_pos_search_performance_verification.json`

## Notes

This is a structural hardening pass. It does not create a synthetic 100k-product production dataset. The artifact records the query strategy, pagination contract, and index coverage so a future load test can measure live database timing without changing app behavior.
