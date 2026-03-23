-- Lightning-Fast User Management Optimization (UNIVERSAL VERSION)
-- This version works regardless of whether user_id is stored as TEXT or UUID
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
-- STEP 2: Universal function that works with any data type
-- =========================================
CREATE OR REPLACE FUNCTION public.get_all_tenant_users_universal(p_tenant_id UUID)
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
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    WITH tenant_users AS (
        -- Get all users for this tenant
        SELECT 
            CASE 
                WHEN ut.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                THEN ut.user_id::uuid  -- If it looks like a UUID, cast it
                ELSE NULL 
            END as user_id_uuid,
            ut.user_id as user_id_text,
            ut.role,
            ut.is_owner
        FROM public.user_tenants ut
        WHERE ut.tenant_id = p_tenant_id 
        AND ut.is_active = true
    ),
    user_perms AS (
        -- Get permissions
        SELECT 
            up.user_id as user_id_text,
            jsonb_agg(
                jsonb_build_object(
                    'section', up.section,
                    'action', up.action
                )
                ORDER BY up.section, up.action
            ) as permissions
        FROM public.user_permissions up
        WHERE EXISTS (
            SELECT 1 FROM tenant_users tu 
            WHERE tu.user_id_text = up.user_id
        )
        GROUP BY up.user_id
    ),
    user_cities AS (
        -- Get cities
        SELECT 
            uc.user_id as user_id_text,
            array_agg(uc.city_name ORDER BY uc.city_name) as cities
        FROM public.users_city uc
        WHERE EXISTS (
            SELECT 1 FROM tenant_users tu 
            WHERE tu.user_id_text = uc.user_id
        )
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
    INNER JOIN tenant_users tu ON (
        tu.user_id_uuid = ud.id  -- Try UUID match
        OR tu.user_id_text = ud.id_text  -- Or TEXT match
    )
    LEFT JOIN user_perms up ON up.user_id_text = ud.id_text
    LEFT JOIN user_cities uc ON uc.user_id_text = ud.id_text
    ORDER BY ud.created_at DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_universal TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_universal TO service_role;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_universal TO anon;

-- =========================================
-- STEP 3: Simple SQL version using text comparison
-- =========================================
CREATE OR REPLACE FUNCTION public.get_all_tenant_users_simple(p_tenant_id UUID)
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
        SELECT 
            ut.user_id,
            ut.role,
            ut.is_owner
        FROM public.user_tenants ut
        WHERE ut.tenant_id = p_tenant_id 
        AND ut.is_active = true
    ),
    user_perms AS (
        SELECT 
            up.user_id,
            jsonb_agg(
                jsonb_build_object(
                    'section', up.section,
                    'action', up.action
                )
            ) as permissions
        FROM public.user_permissions up
        INNER JOIN tenant_users tu ON tu.user_id = up.user_id
        GROUP BY up.user_id
    ),
    user_cities AS (
        SELECT 
            uc.user_id,
            array_agg(uc.city_name) as cities
        FROM public.users_city uc
        INNER JOIN tenant_users tu ON tu.user_id = uc.user_id
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
    INNER JOIN tenant_users tu ON tu.user_id = ud.id_text  -- Use pre-converted text column
    LEFT JOIN user_perms up ON up.user_id = ud.id_text
    LEFT JOIN user_cities uc ON uc.user_id = ud.id_text
    ORDER BY ud.created_at DESC;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_simple TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_simple TO service_role;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_simple TO anon;

-- =========================================
-- STEP 4: RPC wrapper that returns JSONB
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_get_tenant_users(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_users JSONB;
BEGIN
    -- Try the simple version first
    BEGIN
        SELECT jsonb_agg(row_to_json(u.*)) INTO v_users
        FROM get_all_tenant_users_simple(p_tenant_id) u;
        
        IF v_users IS NOT NULL THEN
            RETURN v_users;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- Fall back to universal version
            NULL;
    END;
    
    -- Try universal version
    SELECT jsonb_agg(row_to_json(u.*)) INTO v_users
    FROM get_all_tenant_users_universal(p_tenant_id) u;
    
    RETURN COALESCE(v_users, '[]'::jsonb);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.rpc_get_tenant_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_tenant_users TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_tenant_users TO anon;

-- =========================================
-- STEP 5: Create indexes for performance
-- =========================================
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_active 
ON public.user_tenants(tenant_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id 
ON public.user_tenants(user_id);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id 
ON public.user_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_users_city_user_id 
ON public.users_city(user_id);

-- =========================================
-- STEP 6: Analyze tables
-- =========================================
ANALYZE public.user_tenants;
ANALYZE public.user_permissions;
ANALYZE public.users_city;

-- =========================================
-- VERIFICATION
-- =========================================
DO $$
DECLARE
    test_tenant_id UUID;
    test_count INT;
BEGIN
    -- Get any tenant for testing
    SELECT tenant_id INTO test_tenant_id
    FROM public.user_tenants
    WHERE is_active = true
    LIMIT 1;
    
    IF test_tenant_id IS NOT NULL THEN
        -- Count results
        SELECT COUNT(*) INTO test_count
        FROM get_all_tenant_users_simple(test_tenant_id);
        
        RAISE NOTICE '✅ Function works! Found % users for tenant %', test_count, test_tenant_id;
    ELSE
        RAISE NOTICE '⚠️ No active tenants found for testing';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error during test: %', SQLERRM;
        RAISE NOTICE 'Trying universal function...';
        
        BEGIN
            SELECT COUNT(*) INTO test_count
            FROM get_all_tenant_users_universal(test_tenant_id);
            RAISE NOTICE '✅ Universal function works! Found % users', test_count;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '❌ Both functions failed: %', SQLERRM;
        END;
END;
$$;

-- Success message
SELECT 'Lightning optimization setup complete! Use rpc_get_tenant_users() from your application.' as message;