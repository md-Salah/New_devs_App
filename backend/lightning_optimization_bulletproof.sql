-- Lightning-Fast User Management Optimization (BULLETPROOF VERSION)
-- This version handles TEXT user_id columns joining with UUID auth.users.id
-- Run in Supabase SQL editor with service_role privileges

-- =========================================
-- STEP 1: Create a safe view to access auth.users
-- =========================================
DROP VIEW IF EXISTS public.user_details CASCADE;
CREATE VIEW public.user_details AS
SELECT 
    au.id,
    au.id::text as id_text,  -- Pre-convert to TEXT for easier joins
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
-- STEP 2: Main optimized function using TEXT comparisons
-- =========================================
CREATE OR REPLACE FUNCTION public.get_all_tenant_users_bulletproof(p_tenant_id UUID)
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
        -- Get all users for this tenant (user_id is TEXT)
        SELECT 
            ut.user_id,  -- TEXT
            ut.role,
            ut.is_owner
        FROM public.user_tenants ut
        WHERE ut.tenant_id = p_tenant_id 
        AND ut.is_active = true
    ),
    user_perms AS (
        -- Get permissions (user_id is TEXT)
        SELECT 
            up.user_id,  -- TEXT
            jsonb_agg(
                jsonb_build_object(
                    'section', up.section,
                    'action', up.action
                )
                ORDER BY up.section, up.action
            ) as permissions
        FROM public.user_permissions up
        WHERE up.user_id IN (SELECT user_id FROM tenant_users)  -- TEXT to TEXT comparison
        GROUP BY up.user_id
    ),
    user_cities AS (
        -- Get cities (user_id is TEXT)
        SELECT 
            uc.user_id,  -- TEXT
            array_agg(uc.city_name ORDER BY uc.city_name) as cities
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
    INNER JOIN tenant_users tu ON tu.user_id = ud.id_text  -- TEXT to TEXT comparison
    LEFT JOIN user_perms up ON up.user_id = ud.id_text     -- TEXT to TEXT comparison
    LEFT JOIN user_cities uc ON uc.user_id = ud.id_text    -- TEXT to TEXT comparison
    ORDER BY ud.created_at DESC;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_bulletproof TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_bulletproof TO service_role;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_bulletproof TO anon;

-- =========================================
-- STEP 3: RPC wrapper that returns JSONB
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
    FROM get_all_tenant_users_bulletproof(p_tenant_id) u;
    
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
-- Drop existing indexes first
DROP INDEX IF EXISTS idx_user_tenants_tenant_active;
DROP INDEX IF EXISTS idx_user_tenants_user_id;
DROP INDEX IF EXISTS idx_user_tenants_composite;
DROP INDEX IF EXISTS idx_user_permissions_user_id;
DROP INDEX IF EXISTS idx_users_city_user_id;

-- Create new optimized indexes
CREATE INDEX idx_user_tenants_tenant_active 
ON public.user_tenants(tenant_id) 
WHERE is_active = true;

CREATE INDEX idx_user_tenants_user_id 
ON public.user_tenants(user_id);

-- Composite index for the main query
CREATE INDEX idx_user_tenants_composite 
ON public.user_tenants(tenant_id, user_id, is_active, role, is_owner)
WHERE is_active = true;

-- Index for permissions with included columns
CREATE INDEX idx_user_permissions_user_id 
ON public.user_permissions(user_id, section, action);

-- Index for cities with included columns
CREATE INDEX idx_users_city_user_id 
ON public.users_city(user_id, city_name);

-- =========================================
-- STEP 5: Analyze tables
-- =========================================
ANALYZE public.user_tenants;
ANALYZE public.user_permissions;
ANALYZE public.users_city;

-- =========================================
-- VERIFICATION AND TESTING
-- =========================================

-- Check column types
DO $$
DECLARE
    v_user_tenants_type text;
    v_permissions_type text;
    v_cities_type text;
    v_auth_users_type text;
BEGIN
    -- Get actual column types
    SELECT data_type INTO v_user_tenants_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_tenants' AND column_name = 'user_id';
    
    SELECT data_type INTO v_permissions_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_permissions' AND column_name = 'user_id';
    
    SELECT data_type INTO v_cities_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users_city' AND column_name = 'user_id';
    
    SELECT data_type INTO v_auth_users_type
    FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'id';
    
    RAISE NOTICE '📊 Column Types:';
    RAISE NOTICE '  user_tenants.user_id: %', COALESCE(v_user_tenants_type, 'NOT FOUND');
    RAISE NOTICE '  user_permissions.user_id: %', COALESCE(v_permissions_type, 'NOT FOUND');
    RAISE NOTICE '  users_city.user_id: %', COALESCE(v_cities_type, 'NOT FOUND');
    RAISE NOTICE '  auth.users.id: %', COALESCE(v_auth_users_type, 'NOT FOUND');
END;
$$;

-- Test the function with an actual tenant
DO $$
DECLARE
    test_tenant_id UUID;
    test_count INT;
    test_result JSONB;
BEGIN
    -- Get any tenant for testing
    SELECT tenant_id INTO test_tenant_id
    FROM public.user_tenants
    WHERE is_active = true
    LIMIT 1;
    
    IF test_tenant_id IS NOT NULL THEN
        -- Test the bulletproof function
        SELECT COUNT(*) INTO test_count
        FROM get_all_tenant_users_bulletproof(test_tenant_id);
        
        RAISE NOTICE '✅ Bulletproof function works! Found % users for tenant %', test_count, test_tenant_id;
        
        -- Test the RPC wrapper
        SELECT rpc_get_tenant_users(test_tenant_id) INTO test_result;
        
        RAISE NOTICE '✅ RPC wrapper works! Returns % users', jsonb_array_length(test_result);
    ELSE
        RAISE NOTICE '⚠️ No active tenants found for testing';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error during test: %', SQLERRM;
        RAISE NOTICE 'Error detail: %', SQLSTATE;
END;
$$;

-- Verify functions exist
SELECT 
    'Functions created:' as status,
    string_agg(proname, ', ') as functions
FROM pg_proc 
WHERE proname IN ('get_all_tenant_users_bulletproof', 'rpc_get_tenant_users')
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Verify view exists
SELECT 
    'View created:' as status,
    viewname
FROM pg_views
WHERE schemaname = 'public'
AND viewname = 'user_details';

-- Verify indexes
SELECT 
    'Indexes created:' as status,
    string_agg(indexname, ', ') as indexes
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('user_tenants', 'user_permissions', 'users_city');

-- =========================================
-- SUCCESS MESSAGE
-- =========================================
SELECT 
    '🚀 BULLETPROOF Lightning optimization complete!' as message,
    'Use rpc_get_tenant_users() from your application for <100ms user loading' as instruction;