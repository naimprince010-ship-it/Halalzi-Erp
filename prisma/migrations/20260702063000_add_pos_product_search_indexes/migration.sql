CREATE INDEX IF NOT EXISTS "Product_companyId_status_sku_idx" ON "Product"("companyId", "status", "sku");
CREATE INDEX IF NOT EXISTS "Product_companyId_status_name_idx" ON "Product"("companyId", "status", "name");
CREATE INDEX IF NOT EXISTS "Product_companyId_status_category_idx" ON "Product"("companyId", "status", "category");

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_pos_sku_trgm_idx" ON "Product" USING GIN (lower("sku") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_pos_name_trgm_idx" ON "Product" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_pos_category_trgm_idx" ON "Product" USING GIN (lower(coalesce("category", '')) gin_trgm_ops);
