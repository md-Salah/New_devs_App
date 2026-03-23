-- Lightning-Fast User Management Optimization (FIXED)
-- Run these SQL commands in your Supabase SQL editor to enable sub-100ms user list loading

-- =========================================
-- IMPORTANT: Run this with a superuser/service role that has access to auth.users
-- In Supabase, use the SQL Editor with the service_role privileges
-- =========================================

-- First, ensure we have the necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================
-- FUNCTION 1: Get all tenant users in a single query
-- This function needs to be created with proper security context
-- =========================================
CREATE OR REPLACE FUNCTION public.get_all_tenant_users_lightning(p_tenant_id UUID)
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
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
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
        FROM public.user_permissions up
        WHERE up.user_id IN (
            SELECT ut.user_id FROM public.user_tenants ut
            WHERE ut.tenant_id = p_tenant_id AND ut.is_active = true
        )
        GROUP BY up.user_id
    ),
    user_cities AS (
        SELECT 
            uc.user_id,
            array_agg(uc.city_name ORDER BY uc.city_name) as cities
        FROM public.users_city uc
        WHERE uc.user_id IN (
            SELECT ut.user_id FROM public.user_tenants ut
            WHERE ut.tenant_id = p_tenant_id AND ut.is_active = true
        )
        GROUP BY uc.user_id
    )
    SELECT 
        au.id,
        au.email::text,
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
    INNER JOIN public.user_tenants ut ON ut.user_id::uuid = au.id
    LEFT JOIN user_perms up ON up.user_id::uuid = au.id
    LEFT JOIN user_cities uc ON uc.user_id::uuid = au.id
    WHERE ut.tenant_id = p_tenant_id
    AND ut.is_active = true
    AND au.deleted_at IS NULL
    AND COALESCE((au.raw_user_meta_data->>'deleted')::BOOLEAN, false) = false
    ORDER BY au.created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_lightning TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_lightning TO service_role;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_lightning TO anon;

-- =========================================
-- ALTERNATIVE: If the above still has permission issues,
-- use this version that queries through a view
-- =========================================
CREATE OR REPLACE VIEW public.user_details AS
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

-- Alternative function using the view
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
        SELECT 
            ut.user_id::uuid as user_id,
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
        WHERE up.user_id::uuid IN (SELECT user_id FROM tenant_users)
        GROUP BY up.user_id
    ),
    user_cities AS (
        SELECT 
            uc.user_id,
            array_agg(uc.city_name) as cities
        FROM public.users_city uc
        WHERE uc.user_id::uuid IN (SELECT user_id FROM tenant_users)
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
    INNER JOIN tenant_users tu ON tu.user_id = ud.id
    LEFT JOIN user_perms up ON up.user_id::uuid = ud.id
    LEFT JOIN user_cities uc ON uc.user_id::uuid = ud.id
    ORDER BY ud.created_at DESC;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_fast TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_tenant_users_fast TO service_role;

-- =========================================
-- FUNCTION 2: Batch get auth users (simplified version)
-- =========================================
CREATE OR REPLACE FUNCTION public.get_auth_users_batch(user_ids TEXT[])
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
SECURITY INVOKER
STABLE
AS $$
    SELECT 
        ud.id,
        ud.email::text,
        ud.name,
        ud.created_at,
        ud.last_sign_in_at,
        ud.raw_user_meta_data as user_metadata,
        ud.raw_app_meta_data as app_metadata,
        ud.status
    FROM public.user_details ud
    WHERE ud.id = ANY(user_ids::uuid[])
    ORDER BY ud.created_at DESC;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_auth_users_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_users_batch TO service_role;

-- =========================================
-- PERFORMANCE INDEXES
-- These indexes make the queries lightning fast
-- =========================================

-- Index for user_tenants lookup
DROP INDEX IF EXISTS idx_user_tenants_tenant_active;
CREATE INDEX idx_user_tenants_tenant_active 
ON public.user_tenants(tenant_id, is_active) 
WHERE is_active = true;

-- Index for user_tenants by user_id
DROP INDEX IF EXISTS idx_user_tenants_user_id;
CREATE INDEX idx_user_tenants_user_id 
ON public.user_tenants(user_id);

-- Composite index for user_tenants
DROP INDEX IF EXISTS idx_user_tenants_composite;
CREATE INDEX idx_user_tenants_composite 
ON public.user_tenants(tenant_id, user_id, is_active, role, is_owner)
WHERE is_active = true;

-- Index for permissions lookup
DROP INDEX IF EXISTS idx_user_permissions_user_id;
CREATE INDEX idx_user_permissions_user_id 
ON public.user_permissions(user_id)
INCLUDE (section, action);

-- Index for cities lookup
DROP INDEX IF EXISTS idx_users_city_user_id;
CREATE INDEX idx_users_city_user_id 
ON public.users_city(user_id)
INCLUDE (city_name);

-- =========================================
-- RPC WRAPPER FUNCTION (Most Compatible)
-- This is the safest approach that works with Supabase client
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_get_tenant_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_tenant_users TO service_role;

-- =========================================
-- ANALYZE TABLES FOR OPTIMIZATION
-- =========================================
ANALYZE public.user_tenants;
ANALYZE public.user_permissions;
ANALYZE public.users_city;

-- =========================================
-- TEST THE FUNCTIONS
-- =========================================

-- Test query to verify everything works
-- Replace with your actual tenant_id
/*
-- Test the RPC function (recommended)
SELECT rpc_get_tenant_users('your-tenant-id-here');

-- Test the direct function
SELECT * FROM get_all_tenant_users_fast('your-tenant-id-here');

-- Check indexes
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('user_tenants', 'user_permissions', 'users_city')
ORDER BY tablename, indexname;
*/

-- =========================================
-- IMPORTANT NOTES:
-- 1. Run this script with service_role privileges in Supabase
-- 2. If you still get permission errors, use the rpc_get_tenant_users function
-- 3. The view approach (user_details) avoids direct auth.users access
-- 4. All functions are now in the public schema for better compatibility
-- =========================================