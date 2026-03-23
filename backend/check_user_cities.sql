-- Check user's city assignments
SELECT * FROM users_city WHERE user_id = 'b1047c3d-056a-4cab-8961-505d6170f61e';

-- Check all_properties table structure and sample data
SELECT id, name, city, status, tenant_id FROM all_properties LIMIT 5;

-- Count properties by city
SELECT city, COUNT(*) as count FROM all_properties WHERE status = 'active' GROUP BY city;