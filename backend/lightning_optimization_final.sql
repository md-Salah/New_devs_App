-- Lightning-Fast User Management Optimization (FINAL VERSION)
-- This version properly handles UUID/TEXT type conversions
-- Run in Supabase SQL editor with service_role privileges

-- =========================================
-- STEP 1: Create a safe view to access auth.users
-- This avoids permission issues with direct auth.users access
-- =========================================
DROP VIEW IF EXISTS public.user_details CASCADE;
CREATE VIEW public.user_details AS
SELECT 
    au.id,
    au.email,
    au.created_at,
    au.last_sign_in_at,
    au.raw_user_meta_data,
    au.raw_app_meta_data,
    COALESCE((au.raw_user_meta_data->>'name')::TEXT, split_part(au.email, '@', 1)) as name,
    COALESCE((au.raw_user_meta_data->>'status')::TEXT, 'active') as status
FROM auth.users au
WHERE au.deleted_at IS NULL
AND COALESCE((au.raw_user_meta_data->>'deleted')::BOOLEAN, false) = false;

-- Grant access to the view
GRANT SELECT ON public.user_details TO authenticated;
GRANT SELECT ON public.user_details TO service_role;
GRANT SELECT ON public.user_details TO anon;

-- =========================================
-- STEP 2: Main optimized function using the view
-- This handles all type conversions properly
-- =========================================
CREATE OR REPLACE FUNCTION public.get_all_tenant_users_fast(p_tenant_id UUID)
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
SECURITY INVOKER
STABLE
AS $$
    WITH tenant_users AS (
        -- Get all users for this tenant (user_id is TEXT in this table)
        SELECT 
            ut.user_id,  -- This is TEXT
            ut.role,
            ut.is_owner
        FROM public.user_tenants ut
        WHERE ut.tenant_id = p_tenant_id 
        AND ut.is_active = true
    ),
    user_perms AS (
        -- Get permissions (user_id is TEXT in this table too)
        SELECT 
            up.user_id,  -- This is TEXT
            jsonb_agg(
                jsonb_build_object(
                    'section', up.section,
                    'action', up.action
                )
            ) as permissions
        FROM public.user_permissions up
        WHERE up.user_id IN (SELECT user_id FROM tenant_users)  -- TEXT to TEXT comparison
        GROUP BY up.user_id
    ),
    user_cities AS (
        -- Get cities (user_id is TEXT in this table too)
        SELECT 
            uc.user_id,  -- This is TEXT
            array_agg(uc.city_name) as cities
        FROM public.users_city uc
        WHERE uc.user_id IN (SELECT user_id FROM tenant_users)  -- TEXT to TEXT comparison
        GROUP BY uc.user_id
    )
    SELECT 
        ud.id,
        ud.email::text,
        ud.name,
        ud.created_at,
        ud.last_sign_in_at,
        ud.raw_user_meta_data as user_metadata,
        ud.raw_app_meta_data as app_metadata,
        COALESCE(up.permissions, '[]'::jsonb) as permissions,
        COALESCE(uc.cities, ARRAY[]::TEXT[]) as cities,
        ud.status,
        (ud.email = ANY(ARRAY['sid@theflexliving.com', 'raouf@theflexliving.com', 'michael@theflexliving.com'])
         OR tu.role IN ('admin', 'owner') 
         OR tu.is_owner = true) as isAdmin,
        COALESCE(tu.role, 'member') as role,
        COALESCE(tu.is_owner, false) as is_owner
    FROM public.user_details ud
    INNER JOIN tenant_users tu ON tu.user_id::uuid = ud.id  -- Cast TEXT to UUID for join
    LEFT JOIN user_perms up ON up.user_id::uuid = ud.id    -- Cast TEXT to UUID for join
    LEFT JOIN user_cities uc ON uc.user_id::uuid = ud.id   -- Cast TEXT to UUID for join
    ORDER BY ud.created_at DESC;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_fast TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_fast TO service_role;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_fast TO anon;

-- =========================================
-- STEP 3: RPC wrapper that returns JSONB (Most compatible with Supabase client)
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_get_tenant_users(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_users JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'name', u.name,
            'created_at', u.created_at,
            'last_sign_in_at', u.last_sign_in_at,
            'user_metadata', u.user_metadata,
            'app_metadata', u.app_metadata,
            'permissions', u.permissions,
            'cities', u.cities,
            'status', u.status,
            'isAdmin', u.isAdmin,
            'role', u.role,
            'is_owner', u.is_owner
        )
    ) INTO v_users
    FROM get_all_tenant_users_fast(p_tenant_id) u;
    
    RETURN COALESCE(v_users, '[]'::jsonb);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.rpc_get_tenant_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_tenant_users TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_tenant_users TO anon;

-- =========================================
-- STEP 4: Create optimized indexes
-- =========================================

-- Drop existing indexes to avoid conflicts
DROP INDEX IF EXISTS public.idx_user_tenants_tenant_active;
DROP INDEX IF EXISTS public.idx_user_tenants_user_id;
DROP INDEX IF EXISTS public.idx_user_tenants_composite;
DROP INDEX IF EXISTS public.idx_user_permissions_user_id;
DROP INDEX IF EXISTS public.idx_users_city_user_id;

-- Create optimized indexes
CREATE INDEX idx_user_tenants_tenant_active 
ON public.user_tenants(tenant_id) 
WHERE is_active = true;

CREATE INDEX idx_user_tenants_user_id 
ON public.user_tenants(user_id);

CREATE INDEX idx_user_tenants_composite 
ON public.user_tenants(tenant_id, user_id, is_active, role, is_owner)
WHERE is_active = true;

CREATE INDEX idx_user_permissions_user_id 
ON public.user_permissions(user_id, section, action);

CREATE INDEX idx_users_city_user_id 
ON public.users_city(user_id, city_name);

-- =========================================
-- STEP 5: Analyze tables for query optimization
-- =========================================
ANALYZE public.user_tenants;
ANALYZE public.user_permissions;
ANALYZE public.users_city;

-- =========================================
-- STEP 6: Test function to verify it works
-- =========================================
-- Get a sample tenant_id for testing
DO $$
DECLARE
    test_tenant_id UUID;
    test_result JSONB;
BEGIN
    -- Get any tenant_id for testing
    SELECT tenant_id INTO test_tenant_id
    FROM public.user_tenants
    WHERE is_active = true
    LIMIT 1;
    
    IF test_tenant_id IS NOT NULL THEN
        -- Test the RPC function
        SELECT rpc_get_tenant_users(test_tenant_id) INTO test_result;
        
        -- Output result
        RAISE NOTICE 'Test successful! Found % users', jsonb_array_length(test_result);
    ELSE
        RAISE NOTICE 'No active tenants found for testing';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test failed with error: %', SQLERRM;
END;
$$;

-- =========================================
-- VERIFICATION QUERIES
-- =========================================

-- Check that functions were created
SELECT 
    proname as function_name,
    pronargs as num_arguments
FROM pg_proc 
WHERE proname IN ('get_all_tenant_users_fast', 'rpc_get_tenant_users')
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Check that view was created
SELECT 
    viewname,
    viewowner
FROM pg_views
WHERE schemaname = 'public'
AND viewname = 'user_details';

-- Check indexes
SELECT 
    indexname,
    tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('user_tenants', 'user_permissions', 'users_city')
ORDER BY tablename, indexname;

-- =========================================
-- SUCCESS MESSAGE
-- =========================================
DO $$
BEGIN
    RAISE NOTICE '✅ Lightning optimization setup complete!';
    RAISE NOTICE '📝 Functions created: get_all_tenant_users_fast, rpc_get_tenant_users';
    RAISE NOTICE '🔍 View created: user_details';
    RAISE NOTICE '⚡ Indexes created for optimal performance';
    RAISE NOTICE '🚀 Ready for lightning-fast user loading!';
END;
$$;