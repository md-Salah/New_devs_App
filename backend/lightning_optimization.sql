-- Lightning-Fast User Management Optimization
-- Run these SQL commands in your Supabase SQL editor to enable sub-100ms user list loading

-- =========================================
-- FUNCTION 1: Get all tenant users in a single query
-- This is the main optimization - returns ALL user data with ONE query
-- =========================================
CREATE OR REPLACE FUNCTION get_all_tenant_users_lightning(p_tenant_id UUID)
RETURNS TABLE (
    id UUID,
    email TEXT,
    name TEXT,
    created_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    user_metadata JSONB,
    app_metadata JSONB,
    permissions JSONB,
    cities TEXT[],
    status TEXT,
    isAdmin BOOLEAN,
    role TEXT,
    is_owner BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
PARALLEL SAFE
AS $$
    WITH user_perms AS (
        SELECT 
            up.user_id,
            jsonb_agg(
                jsonb_build_object(
                    'section', up.section,
                    'action', up.action
                )
                ORDER BY up.section, up.action
            ) as permissions
        FROM user_permissions up
        WHERE up.user_id IN (
            SELECT user_id FROM user_tenants 
            WHERE tenant_id = p_tenant_id AND is_active = true
        )
        GROUP BY up.user_id
    ),
    user_cities AS (
        SELECT 
            uc.user_id,
            array_agg(uc.city_name ORDER BY uc.city_name) as cities
        FROM users_city uc
        WHERE uc.user_id IN (
            SELECT user_id FROM user_tenants 
            WHERE tenant_id = p_tenant_id AND is_active = true
        )
        GROUP BY uc.user_id
    )
    SELECT 
        au.id,
        au.email,
        COALESCE((au.raw_user_meta_data->>'name')::TEXT, split_part(au.email, '@', 1)) as name,
        au.created_at,
        au.last_sign_in_at,
        au.raw_user_meta_data as user_metadata,
        au.raw_app_meta_data as app_metadata,
        COALESCE(up.permissions, '[]'::jsonb) as permissions,
        COALESCE(uc.cities, ARRAY[]::TEXT[]) as cities,
        COALESCE((au.raw_user_meta_data->>'status')::TEXT, 'active') as status,
        (au.email = ANY(ARRAY['sid@theflexliving.com', 'raouf@theflexliving.com', 'michael@theflexliving.com'])
         OR ut.role IN ('admin', 'owner') 
         OR ut.is_owner = true) as isAdmin,
        COALESCE(ut.role, 'member') as role,
        COALESCE(ut.is_owner, false) as is_owner
    FROM auth.users au
    INNER JOIN user_tenants ut ON ut.user_id::uuid = au.id
    LEFT JOIN user_perms up ON up.user_id::uuid = au.id
    LEFT JOIN user_cities uc ON uc.user_id::uuid = au.id
    WHERE ut.tenant_id = p_tenant_id
    AND ut.is_active = true
    AND au.deleted_at IS NULL
    AND COALESCE((au.raw_user_meta_data->>'deleted')::BOOLEAN, false) = false
    ORDER BY au.created_at DESC;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_all_tenant_users_lightning TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_tenant_users_lightning TO service_role;

-- =========================================
-- FUNCTION 2: Batch get auth users
-- Fallback function for getting user data in bulk
-- =========================================
CREATE OR REPLACE FUNCTION get_auth_users_batch(user_ids TEXT[])
RETURNS TABLE (
    id UUID,
    email TEXT,
    name TEXT,
    created_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    user_metadata JSONB,
    app_metadata JSONB,
    status TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
PARALLEL SAFE
AS $$
    SELECT 
        au.id,
        au.email,
        COALESCE((au.raw_user_meta_data->>'name')::TEXT, split_part(au.email, '@', 1)) as name,
        au.created_at,
        au.last_sign_in_at,
        au.raw_user_meta_data as user_metadata,
        au.raw_app_meta_data as app_metadata,
        COALESCE((au.raw_user_meta_data->>'status')::TEXT, 'active') as status
    FROM auth.users au
    WHERE au.id = ANY(user_ids::uuid[])
    AND au.deleted_at IS NULL
    AND COALESCE((au.raw_user_meta_data->>'deleted')::BOOLEAN, false) = false
    ORDER BY au.created_at DESC;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_auth_users_batch TO authenticated;
GRANT EXECUTE ON FUNCTION get_auth_users_batch TO service_role;

-- =========================================
-- PERFORMANCE INDEXES
-- These indexes make the queries lightning fast
-- =========================================

CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_active 
ON user_tenants(tenant_id, is_active) 
WHERE is_active = true;

-- Index for user_tenants by user_id
CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id 
ON user_tenants(user_id);

-- Index for permissions lookup
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id 
ON user_permissions(user_id)
INCLUDE (section, action);

-- Index for cities lookup
CREATE INDEX IF NOT EXISTS idx_users_city_user_id 
ON users_city(user_id)
INCLUDE (city_name);

-- Index for auth.users metadata
CREATE INDEX IF NOT EXISTS idx_auth_users_deleted 
ON auth.users((raw_user_meta_data->>'deleted'))
WHERE deleted_at IS NULL;

-- Index for auth.users email (for admin check)
CREATE INDEX IF NOT EXISTS idx_auth_users_email 
ON auth.users(email);

-- =========================================
-- MATERIALIZED VIEW (Optional - for even faster performance)
-- Refresh this periodically for cached results
-- =========================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tenant_users AS
WITH tenant_user_data AS (
    SELECT 
        ut.tenant_id,
        au.id as user_id,
        au.email,
        COALESCE((au.raw_user_meta_data->>'name')::TEXT, split_part(au.email, '@', 1)) as name,
        au.created_at,
        au.last_sign_in_at,
        au.raw_user_meta_data as user_metadata,
        au.raw_app_meta_data as app_metadata,
        COALESCE((au.raw_user_meta_data->>'status')::TEXT, 'active') as status,
        ut.role,
        ut.is_owner
    FROM auth.users au
    INNER JOIN user_tenants ut ON ut.user_id::uuid = au.id
    WHERE ut.is_active = true
    AND au.deleted_at IS NULL
    AND COALESCE((au.raw_user_meta_data->>'deleted')::BOOLEAN, false) = false
),
user_perms_agg AS (
    SELECT 
        up.user_id,
        jsonb_agg(
            jsonb_build_object(
                'section', up.section,
                'action', up.action
            )
        ) as permissions
    FROM user_permissions up
    GROUP BY up.user_id
),
user_cities_agg AS (
    SELECT 
        uc.user_id,
        array_agg(uc.city_name) as cities
    FROM users_city uc
    GROUP BY uc.user_id
)
SELECT 
    tud.tenant_id,
    tud.user_id,
    tud.email,
    tud.name,
    tud.created_at,
    tud.last_sign_in_at,
    tud.user_metadata,
    tud.app_metadata,
    COALESCE(upa.permissions, '[]'::jsonb) as permissions,
    COALESCE(uca.cities, ARRAY[]::TEXT[]) as cities,
    tud.status,
    (tud.email = ANY(ARRAY['sid@theflexliving.com', 'raouf@theflexliving.com', 'michael@theflexliving.com'])
     OR tud.role IN ('admin', 'owner') 
     OR tud.is_owner = true) as is_admin,
    tud.role,
    tud.is_owner
FROM tenant_user_data tud
LEFT JOIN user_perms_agg upa ON upa.user_id::uuid = tud.user_id
LEFT JOIN user_cities_agg uca ON uca.user_id::uuid = tud.user_id;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tenant_users_unique 
ON mv_tenant_users(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_mv_tenant_users_tenant 
ON mv_tenant_users(tenant_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_tenant_users_mv()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_users;
$$;

-- Grant permissions
GRANT SELECT ON mv_tenant_users TO authenticated;
GRANT SELECT ON mv_tenant_users TO service_role;

-- =========================================
-- ANALYZE TABLES FOR QUERY OPTIMIZATION
-- Run this to update table statistics
-- =========================================
ANALYZE auth.users;
ANALYZE user_tenants;
ANALYZE user_permissions;
ANALYZE users_city;

-- =========================================
-- TEST THE PERFORMANCE
-- Run this with your tenant_id to test
-- =========================================
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
-- SELECT * FROM get_all_tenant_users_lightning('your-tenant-id-here');

-- =========================================
-- SCHEDULE PERIODIC REFRESH (Optional)
-- If using materialized view, refresh every 5 minutes
-- =========================================
-- SELECT cron.schedule(
--     'refresh-tenant-users',
--     '*/5 * * * *',
--     'SELECT refresh_tenant_users_mv();'
-- );

-- =========================================
-- VERIFICATION
-- Check that functions were created successfully
-- =========================================
SELECT 
    proname as function_name,
    pronargs as num_arguments
FROM pg_proc 
WHERE proname IN ('get_all_tenant_users_lightning', 'get_auth_users_batch');

-- Check indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('user_tenants', 'user_permissions', 'users_city')
ORDER BY tablename, indexname;