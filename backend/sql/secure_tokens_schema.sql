-- Secure Token Storage Schema
-- This schema provides secure storage for API tokens with encryption

-- Drop existing types if they exist (for re-running migration)
DROP TYPE IF EXISTS token_type CASCADE;
DROP TYPE IF EXISTS token_purpose CASCADE;

-- Create enum for token types
CREATE TYPE token_type AS ENUM ('hostaway', 'stripe', 'other');

-- Create enum for token purpose
CREATE TYPE token_purpose AS ENUM (
    'hostaway_api_london',
    'hostaway_api_paris',
    'hostaway_api_algiers',
    'hostaway_api_lisbon',
    'stripe_secret_key',
    'stripe_publishable_key',
    'stripe_webhook_secret',
    'other'
);

-- Main tokens table
CREATE TABLE IF NOT EXISTS secure_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Token identification
    token_name VARCHAR(255) NOT NULL,
    token_type token_type NOT NULL,
    token_purpose token_purpose NOT NULL,
    description TEXT,
    
    -- Encrypted token data
    encrypted_value TEXT NOT NULL,
    encryption_iv TEXT NOT NULL, -- Initialization vector for AES-256-GCM
    encryption_tag TEXT NOT NULL, -- Authentication tag for GCM
    
    -- Token hint for identification (last 4 chars)
    token_hint VARCHAR(10) NOT NULL, -- e.g., "...abc123"
    
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
    
    -- Additional metadata as JSONB
    metadata JSONB DEFAULT '{}'
);

-- Create unique partial index to ensure only one active token per purpose
CREATE UNIQUE INDEX idx_unique_active_token_purpose 
    ON secure_tokens(token_purpose) 
    WHERE is_active = true;

-- Create indexes for performance
CREATE INDEX idx_secure_tokens_type ON secure_tokens(token_type);
CREATE INDEX idx_secure_tokens_purpose ON secure_tokens(token_purpose);
CREATE INDEX idx_secure_tokens_active ON secure_tokens(is_active);
CREATE INDEX idx_secure_tokens_expires ON secure_tokens(expires_at);

-- Token access logs for audit trail
CREATE TABLE IF NOT EXISTS token_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID REFERENCES secure_tokens(id) ON DELETE CASCADE,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    accessed_by UUID REFERENCES auth.users(id),
    access_type VARCHAR(50) NOT NULL, -- 'read', 'update', 'delete', 'rotate'
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

-- Row Level Security (RLS) Policies
ALTER TABLE secure_tokens ENABLE ROW LEVEL SECURITY;
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

-- Policy: Only admins can view tokens
CREATE POLICY admin_view_tokens ON secure_tokens
    FOR SELECT
    USING (is_user_admin());

-- Policy: Only admins can insert tokens
CREATE POLICY admin_insert_tokens ON secure_tokens
    FOR INSERT
    WITH CHECK (is_user_admin());

-- Policy: Only admins can update tokens
CREATE POLICY admin_update_tokens ON secure_tokens
    FOR UPDATE
    USING (is_user_admin());

-- Policy: Only admins can delete tokens
CREATE POLICY admin_delete_tokens ON secure_tokens
    FOR DELETE
    USING (is_user_admin());

-- Policy: Admins can view all access logs
CREATE POLICY admin_view_access_logs ON token_access_logs
    FOR SELECT
    USING (is_user_admin());

-- Policy: System can insert access logs (no auth check for logging)
CREATE POLICY system_insert_access_logs ON token_access_logs
    FOR INSERT
    WITH CHECK (true);

-- Policy: Admins can view rotation history
CREATE POLICY admin_view_rotation_history ON token_rotation_history
    FOR SELECT
    USING (is_user_admin());

CREATE POLICY service_role_bypass_tokens ON secure_tokens
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_bypass_logs ON token_access_logs
    USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_bypass_rotation ON token_rotation_history
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions to authenticated users (controlled by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON secure_tokens TO authenticated;
GRANT SELECT, INSERT ON token_access_logs TO authenticated;
GRANT SELECT, INSERT ON token_rotation_history TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;