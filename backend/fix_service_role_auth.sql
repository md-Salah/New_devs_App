-- The current_tenant_id() function was raising an exception for service role
-- This migration fixes it to return NULL for service role instead of raising an exception

BEGIN;

-- Drop and recreate the current_tenant_id function to handle service role properly
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id uuid;
    v_user_id uuid;
    v_role text;
BEGIN
    -- Check if this is a service role first
    v_role := current_setting('request.jwt.claims', true)::json->>'role';
    IF v_role = 'service_role' THEN
        -- For service role, return NULL (RLS policies will check is_service_role() separately)
        RETURN NULL;
    END IF;
    
    -- Get user ID from auth.uid()
    v_user_id := auth.uid();
    
    -- If no authenticated user and not service role, raise exception
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
    END IF;
    
    -- Get tenant_id for this user
    SELECT tenant_id INTO v_tenant_id
    FROM public.user_tenants
    WHERE user_id = v_user_id
    AND is_active = true
    LIMIT 1;
    
    -- If no tenant found, raise exception
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'No active tenant found for user %', v_user_id USING ERRCODE = 'P0002';
    END IF;
    
    RETURN v_tenant_id;
END;
$$;

-- Also ensure is_service_role function is working correctly
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql 
STABLE
AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true)::json->>'role' = 'service_role', false);
$$;

-- Test the functions
DO $$
BEGIN
    RAISE NOTICE 'Testing functions...';
    
    -- This should not raise an exception when called as service role
    PERFORM public.is_service_role();
    RAISE NOTICE 'is_service_role() check passed';
    
    -- This should also not raise an exception for service role
    BEGIN
        PERFORM public.current_tenant_id();
        RAISE NOTICE 'current_tenant_id() returned without error';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'current_tenant_id() raised: %', SQLERRM;
    END;
END $$;

COMMIT;

-- Verify the RLS policies are correct
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'properties'
ORDER BY policyname;