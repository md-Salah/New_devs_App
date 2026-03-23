-- Secure Token Storage Schema with Automatic City Detection
-- This schema provides secure storage for API tokens with automatic city validation

-- Drop existing objects if they exist (for re-running migration)
DROP TABLE IF EXISTS token_validations CASCADE;
DROP TABLE IF EXISTS token_rotation_history CASCADE;
DROP TABLE IF EXISTS token_access_logs CASCADE;
DROP TABLE IF EXISTS secure_tokens CASCADE;
DROP FUNCTION IF EXISTS is_user_admin() CASCADE;
DROP FUNCTION IF EXISTS increment_token_usage(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP TYPE IF EXISTS token_type CASCADE;
DROP TYPE IF EXISTS validation_status CASCADE;

-- Create enum for token types
CREATE TYPE token_type AS ENUM ('hostaway', 'stripe', 'sendgrid', 'openai', 'google', 'other');

-- Create enum for validation status
CREATE TYPE validation_status AS ENUM ('pending', 'valid', 'invalid', 'expired');

-- Main tokens table
CREATE TABLE IF NOT EXISTS secure_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Token identification
    token_name VARCHAR(255) NOT NULL,
    token_type token_type NOT NULL,
    token_key VARCHAR(255) NOT NULL, -- e.g., 'hostaway_api', 'stripe_secret'
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
    
    -- Validation
    last_validated_at TIMESTAMPTZ,
    validation_status validation_status DEFAULT 'pending',
    validation_message TEXT,
    
    -- Discovered cities (automatically populated)
    valid_cities TEXT[] DEFAULT '{}', -- Array of cities where token is valid
    invalid_cities TEXT[] DEFAULT '{}', -- Array of cities where token failed
    
    -- Additional metadata as JSONB
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX idx_secure_tokens_type ON secure_tokens(token_type);
CREATE INDEX idx_secure_tokens_key ON secure_tokens(token_key);
CREATE INDEX idx_secure_tokens_active ON secure_tokens(is_active);
CREATE INDEX idx_secure_tokens_expires ON secure_tokens(expires_at);
CREATE INDEX idx_secure_tokens_valid_cities ON secure_tokens USING GIN(valid_cities);

-- Token validation history
CREATE TABLE IF NOT EXISTS token_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID NOT NULL REFERENCES secure_tokens(id) ON DELETE CASCADE,
    city VARCHAR(50),
    validated_at TIMESTAMPTZ DEFAULT NOW(),
    is_valid BOOLEAN NOT NULL,
    status_code INTEGER,
    error_message TEXT,
    response_time_ms INTEGER,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for validation history
CREATE INDEX idx_token_validations_token ON token_validations(token_id);
CREATE INDEX idx_token_validations_city ON token_validations(city);
CREATE INDEX idx_token_validations_time ON token_validations(validated_at);

-- Token access logs for audit trail
CREATE TABLE IF NOT EXISTS token_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID REFERENCES secure_tokens(id) ON DELETE CASCADE,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    accessed_by UUID REFERENCES auth.users(id),
    access_type VARCHAR(50) NOT NULL,
    requested_city VARCHAR(50),
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

-- Function to update token validation status
CREATE OR REPLACE FUNCTION update_token_validation(
    p_token_id UUID,
    p_city VARCHAR,
    p_is_valid BOOLEAN,
    p_status_code INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_response_time_ms INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_valid_cities TEXT[];
    v_invalid_cities TEXT[];
BEGIN
    -- Insert validation record
    INSERT INTO token_validations (
        token_id, city, is_valid, status_code, 
        error_message, response_time_ms
    ) VALUES (
        p_token_id, p_city, p_is_valid, p_status_code,
        p_error_message, p_response_time_ms
    );
    
    -- Get current city arrays
    SELECT valid_cities, invalid_cities 
    INTO v_valid_cities, v_invalid_cities
    FROM secure_tokens 
    WHERE id = p_token_id;
    
    -- Update city arrays based on validation result
    IF p_is_valid THEN
        -- Add to valid cities if not already there
        IF NOT (p_city = ANY(v_valid_cities)) THEN
            v_valid_cities := array_append(v_valid_cities, p_city);
        END IF;
        -- Remove from invalid cities if present
        v_invalid_cities := array_remove(v_invalid_cities, p_city);
    ELSE
        -- Add to invalid cities if not already there
        IF NOT (p_city = ANY(v_invalid_cities)) THEN
            v_invalid_cities := array_append(v_invalid_cities, p_city);
        END IF;
        -- Remove from valid cities if present
        v_valid_cities := array_remove(v_valid_cities, p_city);
    END IF;
    
    -- Update token record
    UPDATE secure_tokens 
    SET 
        valid_cities = v_valid_cities,
        invalid_cities = v_invalid_cities,
        last_validated_at = NOW(),
        validation_status = CASE 
            WHEN array_length(v_valid_cities, 1) > 0 THEN 'valid'::validation_status
            WHEN array_length(v_invalid_cities, 1) > 0 THEN 'invalid'::validation_status
            ELSE 'pending'::validation_status
        END,
        validation_message = CASE
            WHEN p_is_valid THEN 'Token validated for ' || p_city
            ELSE 'Token invalid for ' || p_city || COALESCE(': ' || p_error_message, '')
        END
    WHERE id = p_token_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get best token for a city
CREATE OR REPLACE FUNCTION get_token_for_city(p_token_key VARCHAR, p_city VARCHAR)
RETURNS TABLE (
    token_id UUID,
    encrypted_value TEXT,
    encryption_iv TEXT,
    encryption_tag TEXT,
    validation_status validation_status,
    last_validated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        st.id,
        st.encrypted_value,
        st.encryption_iv,
        st.encryption_tag,
        st.validation_status,
        st.last_validated_at
    FROM secure_tokens st
    WHERE st.token_key = p_token_key
        AND st.is_active = true
        AND (st.expires_at IS NULL OR st.expires_at > NOW())
        AND (
            p_city = ANY(st.valid_cities)  -- Token is validated for this city
            OR (
                array_length(st.valid_cities, 1) IS NULL  -- No validations yet
                AND NOT (p_city = ANY(st.invalid_cities))  -- Not known to be invalid
            )
        )
    ORDER BY 
        CASE 
            WHEN p_city = ANY(st.valid_cities) THEN 0  -- Prefer validated tokens
            ELSE 1  -- Then unvalidated tokens
        END,
        st.last_validated_at DESC NULLS LAST
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row Level Security (RLS) Policies
ALTER TABLE secure_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_validations ENABLE ROW LEVEL SECURITY;
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

-- Policies for token_validations
CREATE POLICY admin_view_validations ON token_validations
    FOR SELECT
    USING (is_user_admin());

CREATE POLICY system_insert_validations ON token_validations
    FOR INSERT
    WITH CHECK (true);

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

CREATE POLICY service_role_bypass_validations ON token_validations
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_bypass_logs ON token_access_logs
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_bypass_rotation ON token_rotation_history
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON secure_tokens TO authenticated;
GRANT SELECT, INSERT ON token_validations TO authenticated;
GRANT SELECT, INSERT ON token_access_logs TO authenticated;
GRANT SELECT, INSERT ON token_rotation_history TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_token_for_city TO authenticated;
GRANT EXECUTE ON FUNCTION increment_token_usage TO authenticated;
GRANT EXECUTE ON FUNCTION update_token_validation TO authenticated;

-- Helper view for token overview
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
    st.last_validated_at,
    st.validation_status,
    st.valid_cities,
    st.invalid_cities,
    array_length(st.valid_cities, 1) as valid_city_count,
    array_length(st.invalid_cities, 1) as invalid_city_count
FROM secure_tokens st;

-- Grant access to the view
GRANT SELECT ON token_overview TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Token management schema with automatic city detection created successfully!';
END $$;