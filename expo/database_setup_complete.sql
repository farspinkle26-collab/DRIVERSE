-- Complete Database Setup for Towing App
-- Run this in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table (main user profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT CHECK (role IN ('customer', 'driver', 'company')) NOT NULL,
  avatar TEXT,
  account_status TEXT CHECK (account_status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
  verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'rejected', 'under_review', 'requires_documents')) DEFAULT 'pending',
  registration_completed_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
  company_id UUID,
  driver_verification_status TEXT CHECK (driver_verification_status IN ('pending', 'verified', 'rejected', 'under_review')),
  company_verification_status TEXT CHECK (company_verification_status IN ('pending', 'verified', 'rejected', 'under_review')),
  documents_submitted BOOLEAN DEFAULT FALSE,
  documents_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create drivers table
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  license_number TEXT NOT NULL UNIQUE,
  license_expiry DATE NOT NULL,
  vehicle_type TEXT CHECK (vehicle_type IN ('flatbed', 'hook_chain', 'wheel_lift', 'heavy_duty', 'motorcycle_carrier', 'integrated', 'other')) NOT NULL,
  vehicle_brand TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL UNIQUE,
  vehicle_capacity TEXT NOT NULL,
  vehicle_photos JSONB DEFAULT '[]',
  insurance_number TEXT,
  insurance_expiry DATE,
  emergency_contact JSONB,
  bank_account JSONB,
  verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'rejected', 'under_review')) DEFAULT 'pending',
  is_available BOOLEAN DEFAULT FALSE,
  current_location JSONB,
  rating NUMERIC DEFAULT 5.0,
  total_jobs INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  total_earnings NUMERIC DEFAULT 0,
  monthly_earnings NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  business_license TEXT NOT NULL,
  tax_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address JSONB,
  verification_status TEXT CHECK (verification_status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
  is_active BOOLEAN DEFAULT TRUE,
  total_revenue NUMERIC DEFAULT 0,
  monthly_revenue NUMERIC DEFAULT 0,
  driver_count INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 5.0,
  total_jobs INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create company_registrations table
CREATE TABLE IF NOT EXISTS public.company_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'requires_revision')) DEFAULT 'draft' NOT NULL,
  submitted_at BIGINT,
  reviewed_at BIGINT,
  approved_at BIGINT,
  reviewed_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  revision_notes TEXT,
  company_info JSONB NOT NULL,
  contact_person JSONB NOT NULL,
  documents JSONB NOT NULL,
  fleet JSONB NOT NULL,
  drivers JSONB NOT NULL,
  services JSONB NOT NULL,
  pricing JSONB NOT NULL,
  payment_methods JSONB NOT NULL,
  operations JSONB NOT NULL,
  bank_info JSONB NOT NULL,
  technology JSONB,
  references JSONB,
  agreements JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create company_vehicles table
CREATE TABLE IF NOT EXISTS public.company_vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('flatbed', 'hook_chain', 'wheel_lift', 'heavy_duty', 'motorcycle_carrier', 'integrated', 'other')) NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year TEXT NOT NULL,
  license_plate TEXT NOT NULL UNIQUE,
  capacity TEXT NOT NULL,
  photos JSONB DEFAULT '[]',
  registration_document TEXT,
  insurance_document TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create company_drivers table
CREATE TABLE IF NOT EXISTS public.company_drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  joined_at BIGINT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  permissions JSONB DEFAULT '{"can_accept_requests": true, "can_view_earnings": true}',
  payout_settings JSONB DEFAULT '{"percentage": 70, "payout_schedule": "weekly"}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(driver_id, company_id)
);

-- Create tow_requests table
CREATE TABLE IF NOT EXISTS public.tow_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES auth.users(id),
  company_id UUID REFERENCES companies(id),
  pickup_location JSONB NOT NULL,
  dropoff_location JSONB NOT NULL,
  vehicle_info JSONB NOT NULL,
  breakdown_info JSONB NOT NULL,
  service_type TEXT CHECK (service_type IN ('hydraulic', 'ladder', 'accident', 'service', 'double_deck')) DEFAULT 'ladder' NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending' NOT NULL,
  distance_km NUMERIC NOT NULL,
  price_idr NUMERIC NOT NULL,
  payment_status TEXT CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending' NOT NULL,
  payment_transaction_id UUID,
  driver_location JSONB,
  estimated_arrival TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tow_request_id UUID NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message_type TEXT CHECK (message_type IN ('text', 'location', 'system', 'image', 'status_update')) DEFAULT 'text' NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payment_transactions table
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tow_request_id UUID REFERENCES tow_requests(id),
  external_id TEXT UNIQUE NOT NULL,
  payment_method TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'IDR',
  status TEXT CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')) DEFAULT 'pending',
  payment_url TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  expired_at TIMESTAMP WITH TIME ZONE,
  failure_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('top_up', 'payment', 'refund', 'withdrawal', 'commission')) NOT NULL,
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  description TEXT,
  reference_id UUID,
  reference_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_wallets table
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  balance NUMERIC DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS drivers_updated_at ON drivers;
CREATE TRIGGER drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS companies_updated_at ON companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS company_registrations_updated_at ON company_registrations;
CREATE TRIGGER company_registrations_updated_at
  BEFORE UPDATE ON company_registrations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS company_vehicles_updated_at ON company_vehicles;
CREATE TRIGGER company_vehicles_updated_at
  BEFORE UPDATE ON company_vehicles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS company_drivers_updated_at ON company_drivers;
CREATE TRIGGER company_drivers_updated_at
  BEFORE UPDATE ON company_drivers
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS tow_requests_updated_at ON tow_requests;
CREATE TRIGGER tow_requests_updated_at
  BEFORE UPDATE ON tow_requests
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS chat_messages_updated_at ON chat_messages;
CREATE TRIGGER chat_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS user_wallets_updated_at ON user_wallets;
CREATE TRIGGER user_wallets_updated_at
  BEFORE UPDATE ON user_wallets
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create RLS policies for drivers
CREATE POLICY "Drivers can view their own data" ON drivers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Drivers can update their own data" ON drivers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Drivers can insert their own data" ON drivers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can view verified drivers" ON drivers
  FOR SELECT USING (verification_status = 'verified');

-- Create RLS policies for companies
CREATE POLICY "Company owners can view their company" ON companies
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Company owners can update their company" ON companies
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Company owners can insert their company" ON companies
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Public can view verified companies" ON companies
  FOR SELECT USING (verification_status = 'verified' AND is_active = true);

-- Create RLS policies for company_registrations
CREATE POLICY "Users can view their own registrations" ON company_registrations
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own registrations" ON company_registrations
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own draft registrations" ON company_registrations
  FOR UPDATE USING (auth.uid() = owner_id AND status = 'draft');

-- Create RLS policies for tow_requests
CREATE POLICY "Customers can view their own requests" ON tow_requests
  FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Drivers can view requests assigned to them" ON tow_requests
  FOR SELECT USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can view pending requests" ON tow_requests
  FOR SELECT USING (status = 'pending' AND driver_id IS NULL);

CREATE POLICY "Customers can create requests" ON tow_requests
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update their own pending requests" ON tow_requests
  FOR UPDATE USING (auth.uid() = customer_id AND status = 'pending');

CREATE POLICY "Drivers can accept pending requests" ON tow_requests
  FOR UPDATE USING (status = 'pending' AND auth.uid() = driver_id);

CREATE POLICY "Drivers can update their assigned requests" ON tow_requests
  FOR UPDATE USING (auth.uid() = driver_id);

-- Create RLS policies for chat_messages
CREATE POLICY "Users can view messages they sent or received" ON chat_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can insert messages they are sending" ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update read status of messages they received" ON chat_messages
  FOR UPDATE USING (auth.uid() = receiver_id);

-- Create RLS policies for payment_transactions
CREATE POLICY "Users can view their own transactions" ON payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" ON payment_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions" ON payment_transactions
  FOR UPDATE USING (auth.uid() = user_id);

-- Create RLS policies for wallet_transactions
CREATE POLICY "Users can view their own wallet transactions" ON wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wallet transactions" ON wallet_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for user_wallets
CREATE POLICY "Users can view their own wallet" ON user_wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wallet" ON user_wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallet" ON user_wallets
  FOR UPDATE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_verification_status ON drivers(verification_status);
CREATE INDEX IF NOT EXISTS idx_drivers_is_available ON drivers(is_available);
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_companies_verification_status ON companies(verification_status);
CREATE INDEX IF NOT EXISTS idx_company_registrations_owner_id ON company_registrations(owner_id);
CREATE INDEX IF NOT EXISTS idx_company_registrations_status ON company_registrations(status);
CREATE INDEX IF NOT EXISTS idx_company_vehicles_company_id ON company_vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_company_drivers_driver_id ON company_drivers(driver_id);
CREATE INDEX IF NOT EXISTS idx_company_drivers_company_id ON company_drivers(company_id);
CREATE INDEX IF NOT EXISTS idx_tow_requests_customer_id ON tow_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_tow_requests_driver_id ON tow_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_tow_requests_status ON tow_requests(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tow_request_id ON chat_messages(tow_request_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_id ON chat_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_external_id ON payment_transactions(external_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);

-- Create function to automatically create wallet for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_wallets (user_id, balance)
  VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create wallet for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Update existing customer profiles to have verified status
UPDATE profiles SET verification_status = 'verified' 
WHERE role = 'customer' AND verification_status = 'pending';

COMMIT;