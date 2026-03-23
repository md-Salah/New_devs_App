-- Migration to add default dashboard permission to create_new_user function
-- This ensures all new users get dashboard read access by default

CREATE OR REPLACE FUNCTION "public"."create_new_user"(
    "p_email" "text", 
    "p_password" "text", 
    "p_name" "text", 
    "p_phone" "text" DEFAULT NULL::"text", 
    "p_department" "text" DEFAULT NULL::"text", 
    "p_is_admin" boolean DEFAULT false, 
    "p_permissions" "jsonb" DEFAULT '[]'::"jsonb", 
    "p_cities" "text"[] DEFAULT ARRAY[]::"text"[]
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  perm JSONB;
  city TEXT;
BEGIN
  -- The user should already be created by adminClient.auth.admin.createUser
  -- This function just handles the permissions and cities setup
  
  -- Get the user ID from the most recently created user with this email
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE email = p_email 
  ORDER BY created_at DESC 
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', p_email;
  END IF;
  
  -- Get tenant_id from user_tenants table (for multi-tenant support)
  SELECT tenant_id INTO v_tenant_id
  FROM user_tenants
  WHERE user_id = v_user_id
  AND is_active = true
  ORDER BY is_owner DESC, created_at DESC
  LIMIT 1;
  
  -- Insert default dashboard permission for all users
  INSERT INTO user_permissions (user_id, section, action, tenant_id)
  VALUES (v_user_id, 'dashboard', 'read', v_tenant_id)
  ON CONFLICT (user_id, section, action) DO NOTHING;
  
  -- Insert custom permissions if provided
  IF p_permissions IS NOT NULL AND jsonb_array_length(p_permissions) > 0 THEN
    FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions)
    LOOP
      INSERT INTO user_permissions (user_id, section, action, tenant_id)
      VALUES (v_user_id, perm->>'section', perm->>'action', v_tenant_id)
      ON CONFLICT (user_id, section, action) DO NOTHING;
    END LOOP;
  END IF;
  
  -- Insert cities if provided
  IF p_cities IS NOT NULL AND array_length(p_cities, 1) > 0 THEN
    FOREACH city IN ARRAY p_cities
    LOOP
      INSERT INTO users_city (user_id, city_name, tenant_id)
      VALUES (v_user_id, city, v_tenant_id)
      ON CONFLICT (user_id, city_name) DO NOTHING;
    END LOOP;
  END IF;
  
  RETURN v_user_id;
END;
$$;

-- Update the function permissions
ALTER FUNCTION "public"."create_new_user"("p_email" "text", "p_password" "text", "p_name" "text", "p_phone" "text", "p_department" "text", "p_is_admin" boolean, "p_permissions" "jsonb", "p_cities" "text"[]) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."create_new_user"("p_email" "text", "p_password" "text", "p_name" "text", "p_phone" "text", "p_department" "text", "p_is_admin" boolean, "p_permissions" "jsonb", "p_cities" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_new_user"("p_email" "text", "p_password" "text", "p_name" "text", "p_phone" "text", "p_department" "text", "p_is_admin" boolean, "p_permissions" "jsonb", "p_cities" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_new_user"("p_email" "text", "p_password" "text", "p_name" "text", "p_phone" "text", "p_department" "text", "p_is_admin" boolean, "p_permissions" "jsonb", "p_cities" "text"[]) TO "service_role";