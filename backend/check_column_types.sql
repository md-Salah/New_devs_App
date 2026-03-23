-- Check the actual data types of columns to ensure correct casting
-- Run this first to understand the schema

-- Check user_tenants table
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'user_tenants'
AND column_name IN ('user_id', 'tenant_id')
ORDER BY ordinal_position;

-- Check user_permissions table
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'user_permissions'
AND column_name = 'user_id'
ORDER BY ordinal_position;

-- Check users_city table
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'users_city'
AND column_name = 'user_id'
ORDER BY ordinal_position;

-- Check auth.users table
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'auth' 
AND table_name = 'users'
AND column_name = 'id'
ORDER BY ordinal_position;

-- Sample data to see actual format
SELECT 'user_tenants' as table_name, user_id, pg_typeof(user_id) as type FROM public.user_tenants LIMIT 1
UNION ALL
SELECT 'user_permissions' as table_name, user_id, pg_typeof(user_id) as type FROM public.user_permissions LIMIT 1
UNION ALL
SELECT 'users_city' as table_name, user_id, pg_typeof(user_id) as type FROM public.users_city LIMIT 1;

-- Check if user_id values are valid UUIDs
SELECT 
    'user_tenants' as table_name,
    COUNT(*) as total,
    COUNT(CASE WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 1 END) as valid_uuids,
    COUNT(CASE WHEN user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 1 END) as invalid_uuids
FROM public.user_tenants
WHERE user_id IS NOT NULL;