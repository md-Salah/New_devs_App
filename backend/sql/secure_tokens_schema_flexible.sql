-- Secure Token Storage Schema with Flexible City Assignment
-- This schema provides secure storage for API tokens with encryption

-- Drop existing objects if they exist (for re-running migration)
DROP TABLE IF EXISTS token_city_assignments CASCADE;
DROP TABLE IF EXISTS token_rotation_history CASCADE;
DROP TABLE IF EXISTS token_access_logs CASCADE;
DROP TABLE IF EXISTS secure_tokens CASCADE;
DROP FUNCTION IF EXISTS is_user_admin() CASCADE;
DROP FUNCTION IF EXISTS increment_token_usage(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP TYPE IF EXISTS token_type CASCADE;

-- Create enum for token types
CREATE TYPE token_type AS ENUM ('hostaway', 'stripe', 'sendgrid', 'openai', 'google', 'other');

-- Main tokens table
CREATE TABLE IF NOT EXISTS secure_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Token identification
    token_name VARCHAR(255) NOT NULL,
    token_type token_type NOT NULL,
    token_key VARCHAR(255) NOT NULL, -- Flexible key like 'hostaway_api', 'stripe_secret', etc.
    description TEXT,
    
    -- Encrypted token data
    encrypted_value TEXT NOT NULL,
    encryption_iv TEXT NOT NULL,
    encryption_tag TEXT NOT NULL,
    
    -- Token hint for identification (last 4 chars)
    token_hint VARCHAR(10) NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    
    -- Token lifecycle
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    
    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER DEFAULT 0,
    
    -- Additional metadata as JSONB (can store environment, version, etc.)
    metadata JSONB DEFAULT '{}',
    
    -- Unique constraint on token_key + is_active to ensure only one active token per key
    CONSTRAINT unique_active_token_key UNIQUE (token_key, is_active)
);

-- Table for city assignments (many-to-many relationship)
CREATE TABLE IF NOT EXISTS token_city_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID NOT NULL REFERENCES secure_tokens(id) ON DELETE CASCADE,
    city VARCHAR(50) NOT NULL, -- 'london', 'paris', 'algiers', 'lisbon', or 'global'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique assignment per token and city
    CONSTRAINT unique_token_city UNIQUE (token_id, city)
);

-- Create indexes for performance
CREATE INDEX idx_secure_tokens_type ON secure_tokens(token_type);
CREATE INDEX idx_secure_tokens_key ON secure_tokens(token_key);
CREATE INDEX idx_secure_tokens_active ON secure_tokens(is_active);
CREATE INDEX idx_secure_tokens_expires ON secure_tokens(expires_at);

-- Create indexes for city assignments
CREATE INDEX idx_token_city_token_id ON token_city_assignments(token_id);
CREATE INDEX idx_token_city_city ON token_city_assignments(city);

-- Token access logs for audit trail
CREATE TABLE IF NOT EXISTS token_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID REFERENCES secure_tokens(id) ON DELETE CASCADE,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    accessed_by UUID REFERENCES auth.users(id),
    access_type VARCHAR(50) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Create index for access logs
CREATE INDEX idx_token_access_logs_token ON token_access_logs(token_id);
CREATE INDEX idx_token_access_logs_time ON token_access_logs(accessed_at);
CREATE INDEX idx_token_access_logs_user ON token_access_logs(accessed_by);

-- Token rotation history
CREATE TABLE IF NOT EXISTS token_rotation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID REFERENCES secure_tokens(id) ON DELETE CASCADE,
    old_token_hint VARCHAR(10) NOT NULL,
    new_token_hint VARCHAR(10) NOT NULL,
    rotated_at TIMESTAMPTZ DEFAULT NOW(),
    rotated_by UUID REFERENCES auth.users(id),
    reason TEXT
);

-- Create index for rotation history
CREATE INDEX idx_token_rotation_history_token ON token_rotation_history(token_id);
CREATE INDEX idx_token_rotation_history_time ON token_rotation_history(rotated_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_secure_tokens_updated_at 
    BEFORE UPDATE ON secure_tokens 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_token_usage(p_token_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE secure_tokens 
    SET 
        usage_count = usage_count + 1,
        last_used_at = NOW()
    WHERE id = p_token_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get token by key and city
CREATE OR REPLACE FUNCTION get_token_for_city(p_token_key VARCHAR, p_city VARCHAR)
RETURNS TABLE (
    token_id UUID,
    encrypted_value TEXT,
    encryption_iv TEXT,
    encryption_tag TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        st.id,
        st.encrypted_value,
        st.encryption_iv,
        st.encryption_tag
    FROM secure_tokens st
    LEFT JOIN token_city_assignments tca ON st.id = tca.token_id
    WHERE st.token_key = p_token_key
        AND st.is_active = true
        AND (st.expires_at IS NULL OR st.expires_at > NOW())
        AND (
            tca.city = p_city  -- Direct city match
            OR tca.city = 'global'  -- Global token
            OR tca.city IS NULL  -- No city restriction
        )
    ORDER BY 
        CASE 
            WHEN tca.city = p_city THEN 1  -- Prefer city-specific
            WHEN tca.city IS NULL THEN 2   -- Then no restriction
            WHEN tca.city = 'global' THEN 3  -- Then global
        END
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row Level Security (RLS) Policies
ALTER TABLE secure_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_city_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_rotation_history ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
    -- Check JWT app_metadata for admin role
    IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Check if user has admin permission in user_permissions table
    IF EXISTS (
        SELECT 1 FROM user_permissions 
        WHERE user_id = auth.uid() 
        AND section = 'users'
        AND (action = 'update' OR action = 'delete')
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- Check for known admin emails
    IF auth.jwt() ->> 'email' IN (
        'souheil@theflex.group',
        'sidharthapanda1@gmail.com',
        'sid@theflex.group'
    ) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for secure_tokens
CREATE POLICY admin_view_tokens ON secure_tokens
    FOR SELECT
    USING (is_user_admin());

CREATE POLICY admin_insert_tokens ON secure_tokens
    FOR INSERT
    WITH CHECK (is_user_admin());

CREATE POLICY admin_update_tokens ON secure_tokens
    FOR UPDATE
    USING (is_user_admin());

CREATE POLICY admin_delete_tokens ON secure_tokens
    FOR DELETE
    USING (is_user_admin());

-- Policies for token_city_assignments
CREATE POLICY admin_view_city_assignments ON token_city_assignments
    FOR SELECT
    USING (is_user_admin());

CREATE POLICY admin_manage_city_assignments ON token_city_assignments
    FOR ALL
    USING (is_user_admin());

-- Policies for token_access_logs
CREATE POLICY admin_view_access_logs ON token_access_logs
    FOR SELECT
    USING (is_user_admin());

CREATE POLICY system_insert_access_logs ON token_access_logs
    FOR INSERT
    WITH CHECK (true);

-- Policies for token_rotation_history
CREATE POLICY admin_view_rotation_history ON token_rotation_history
    FOR SELECT
    USING (is_user_admin());

CREATE POLICY service_role_bypass_tokens ON secure_tokens
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_bypass_city_assignments ON token_city_assignments
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_bypass_logs ON token_access_logs
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_bypass_rotation ON token_rotation_history
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON secure_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON token_city_assignments TO authenticated;
GRANT SELECT, INSERT ON token_access_logs TO authenticated;
GRANT SELECT, INSERT ON token_rotation_history TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_token_for_city TO authenticated;
GRANT EXECUTE ON FUNCTION increment_token_usage TO authenticated;

-- Helper view for easier token management
CREATE OR REPLACE VIEW token_overview AS
SELECT 
    st.id,
    st.token_name,
    st.token_type,
    st.token_key,
    st.token_hint,
    st.is_active,
    st.expires_at,
    st.usage_count,
    st.last_used_at,
    st.created_at,
    array_agg(DISTINCT tca.city) FILTER (WHERE tca.city IS NOT NULL) as assigned_cities
FROM secure_tokens st
LEFT JOIN token_city_assignments tca ON st.id = tca.token_id
GROUP BY st.id;

-- Grant access to the view
GRANT SELECT ON token_overview TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Token management schema with flexible city assignment created successfully!';
END $$;