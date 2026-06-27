-- Migration to update profiles table to support all roles and additional fields
-- Run this in your Supabase SQL Editor if you already have a profiles table

-- First, drop the existing role constraint if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new role constraint that includes 'company'
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('customer', 'driver', 'company'));

-- Add missing columns if they don't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_status TEXT 
  CHECK (account_status IN ('active', 'inactive', 'suspended')) DEFAULT 'active';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_status TEXT 
  CHECK (verification_status IN ('pending', 'verified', 'rejected', 'under_review', 'requires_documents')) DEFAULT 'pending';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registration_completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_id UUID;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS driver_verification_status TEXT 
  CHECK (driver_verification_status IN ('pending', 'verified', 'rejected', 'under_review'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_verification_status TEXT 
  CHECK (company_verification_status IN ('pending', 'verified', 'rejected', 'under_review'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS documents_submitted BOOLEAN DEFAULT FALSE;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS documents_approved BOOLEAN DEFAULT FALSE;

-- Update existing customer records to have verified status
UPDATE profiles SET verification_status = 'verified' WHERE role = 'customer' AND verification_status = 'pending';

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at if it doesn't exist
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;