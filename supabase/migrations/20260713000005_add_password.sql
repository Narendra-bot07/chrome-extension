-- Add password_hash column to auth.users table
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS password_hash VARCHAR;

-- Update the seeded developer user with a hashed password for "dev"
UPDATE auth.users 
SET password_hash = '5c78a05c75de8c59f0f9c2cd7b55f1ad$a8e6874c9e549fdfbe6851e6388aa0c82ecee1c58a79e6e38e3b98a977cb42d8'
WHERE id = '00000000-0000-0000-0000-000000000000';
