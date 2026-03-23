-- One-off backfill: stamp metadata.tenant_id for existing secure_tokens rows
-- so that tenant isolation applies to legacy tokens.
--
-- How it works:
-- - For each token missing metadata->>'tenant_id', we try to infer the tenant
--   from the creator (created_by) or last updater (updated_by) via user_tenants.
-- - The inferred tenant_id is written to metadata.tenant_id.
--
-- Run this once after deploying the tenant-aware token isolation.

BEGIN;

-- Optional: preview how many tokens lack tenant id
-- SELECT count(*) AS without_tenant FROM secure_tokens WHERE (metadata->>'tenant_id') IS NULL;

WITH matched AS (
  SELECT st.id AS token_id, ut.tenant_id
  FROM secure_tokens st
  LEFT JOIN LATERAL (
    SELECT ut.tenant_id
    FROM user_tenants ut
    WHERE ut.user_id = COALESCE(st.created_by, st.updated_by)
      AND ut.is_active = true
    ORDER BY ut.is_owner DESC, ut.created_at
    LIMIT 1
  ) ut ON true
  WHERE (st.metadata->>'tenant_id') IS NULL
    AND ut.tenant_id IS NOT NULL
)
UPDATE secure_tokens st
SET metadata = jsonb_set(
  COALESCE(st.metadata, '{}'::jsonb),
  '{tenant_id}',
  to_jsonb(m.tenant_id::text),
  true
)
FROM matched m
WHERE st.id = m.token_id;

-- Report summary
DO $$
DECLARE
  remaining integer;
  updated integer;
BEGIN
  SELECT count(*) INTO remaining FROM secure_tokens WHERE (metadata->>'tenant_id') IS NULL;
  SELECT count(*) INTO updated FROM secure_tokens WHERE (metadata->>'tenant_id') IS NOT NULL;
  RAISE NOTICE 'secure_tokens backfill complete: % updated, % remaining without tenant_id', updated, remaining;
END $$;

COMMIT;

