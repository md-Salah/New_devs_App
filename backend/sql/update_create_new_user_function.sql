-- Update the create_new_user function to automatically add dashboard.read permission
-- This ensures all new users get dashboard access by default

CREATE OR REPLACE FUNCTION create_new_user(
  p_email TEXT,
  p_password TEXT,
  p_name TEXT DEFAULT '',
  p_phone TEXT DEFAULT '',
  p_department TEXT DEFAULT '',
  p_is_admin BOOLEAN DEFAULT FALSE,
  p_permissions JSONB DEFAULT '[]',
  p_cities JSONB DEFAULT '[]'
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  perm JSONB;
  city JSONB;
BEGIN
  -- Get the user ID from auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found for email: %', p_email;
  END IF;
  
  -- Get tenant_id from user_tenants table (for multi-tenant support)
  SELECT tenant_id INTO v_tenant_id
  FROM user_tenants
  WHERE user_id = v_user_id
  AND is_active = true
  ORDER BY is_owner DESC, created_at DESC
  LIMIT 1;
  
  -- If no tenant found, try to get the default Flex tenant
  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id
    FROM organizations
    WHERE name ILIKE '%flex%'
    LIMIT 1;
  END IF;
  
  -- Insert default dashboard.read permission for all users
  INSERT INTO user_permissions (user_id, section, action)
  VALUES (v_user_id, 'dashboard', 'read')
  ON CONFLICT (user_id, section, action) DO NOTHING;
  
  -- Insert custom permissions if provided
  IF p_permissions IS NOT NULL AND jsonb_array_length(p_permissions) > 0 THEN
    FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions)
    LOOP
      -- Skip dashboard.read if it's in the list (we already added it)
      IF NOT (perm->>'section' = 'dashboard' AND perm->>'action' = 'read') THEN
        INSERT INTO user_permissions (user_id, section, action)
        VALUES (v_user_id, perm->>'section', perm->>'action')
        ON CONFLICT (user_id, section, action) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  
  -- Insert city associations if provided
  IF p_cities IS NOT NULL AND jsonb_array_length(p_cities) > 0 THEN
    FOR city IN SELECT * FROM jsonb_array_elements(p_cities)
    LOOP
      -- Extract city_name from the JSON (handle both string and object formats)
      IF jsonb_typeof(city) = 'string' THEN
        INSERT INTO users_city (user_id, city_name)
        VALUES (v_user_id, city::TEXT)
        ON CONFLICT (user_id, city_name) DO NOTHING;
      ELSE
        INSERT INTO users_city (user_id, city_name)
        VALUES (v_user_id, city->>'city_name')
        ON CONFLICT (user_id, city_name) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_new_user TO authenticated;
GRANT EXECUTE ON FUNCTION create_new_user TO service_role;