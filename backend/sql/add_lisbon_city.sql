-- Add Lisbon as a valid city to the users_city table constraint
-- This migration updates the valid_city_name constraint to include 'lisbon'

-- Drop the existing constraint
ALTER TABLE users_city DROP CONSTRAINT valid_city_name;

-- Add the new constraint with lisbon included
ALTER TABLE users_city 
ADD CONSTRAINT valid_city_name 
CHECK (city_name = ANY (ARRAY['london'::text, 'paris'::text, 'algiers'::text, 'lisbon'::text]));

-- Verify the constraint was added
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conname = 'valid_city_name';