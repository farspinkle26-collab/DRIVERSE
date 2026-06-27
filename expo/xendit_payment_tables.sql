-- Xendit Payment System Tables for Supabase
-- Run these SQL commands in your Supabase SQL Editor

-- 1. Company Xendit Accounts Table
CREATE TABLE IF NOT EXISTS company_xendit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  xendit_account_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  business_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'LIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for company_xendit_accounts
CREATE INDEX IF NOT EXISTS idx_company_xendit_accounts_company_id ON company_xendit_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_xendit_accounts_xendit_id ON company_xendit_accounts(xendit_account_id);

-- 2. Payment Splits Table
CREATE TABLE IF NOT EXISTS payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_account_id TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  split_rule_id TEXT NOT NULL UNIQUE,
  company_percentage INTEGER NOT NULL DEFAULT 90,
  platform_percentage INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure percentages add up to 100
  CONSTRAINT check_percentage_sum CHECK (company_percentage + platform_percentage = 100)
);

-- Index for payment_splits
CREATE INDEX IF NOT EXISTS idx_payment_splits_company_id ON payment_splits(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_splits_split_rule_id ON payment_splits(split_rule_id);

-- 3. Payment Transactions Table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  tow_request_id TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES auth.users(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  driver_id UUID REFERENCES auth.users(id),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payment_method TEXT NOT NULL,
  xendit_payment_id TEXT,
  split_rule_id TEXT NOT NULL,
  company_amount INTEGER NOT NULL,
  platform_amount INTEGER NOT NULL,
  driver_amount INTEGER,
  xendit_fee INTEGER NOT NULL DEFAULT 0,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  failure_reason TEXT
);

-- Indexes for payment_transactions
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tow_request_id ON payment_transactions(tow_request_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_id ON payment_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_company_id ON payment_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_driver_id ON payment_transactions(driver_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);

-- 4. Payout Details Table
CREATE TABLE IF NOT EXISTS payout_details (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL CHECK (user_type IN ('driver', 'company')),
  account_type TEXT NOT NULL CHECK (account_type IN ('bank', 'e_wallet')),
  
  -- Bank details
  bank_provider TEXT,
  bank_account_number TEXT,
  bank_account_holder_name TEXT,
  bank_branch_name TEXT,
  
  -- E-wallet details
  ewallet_provider TEXT,
  ewallet_account_number TEXT,
  ewallet_account_holder_name TEXT,
  
  -- Common fields
  email TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'failed', 'requires_update')),
  verification_failure_reason TEXT,
  last_verification_attempt TIMESTAMP WITH TIME ZONE,
  xendit_recipient_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure bank details are provided when account_type is bank
  CONSTRAINT check_bank_details CHECK (
    account_type != 'bank' OR (
      bank_provider IS NOT NULL AND 
      bank_account_number IS NOT NULL AND 
      bank_account_holder_name IS NOT NULL
    )
  ),
  
  -- Ensure e-wallet details are provided when account_type is e_wallet
  CONSTRAINT check_ewallet_details CHECK (
    account_type != 'e_wallet' OR (
      ewallet_provider IS NOT NULL AND 
      ewallet_account_number IS NOT NULL AND 
      ewallet_account_holder_name IS NOT NULL
    )
  )
);

-- Indexes for payout_details
CREATE INDEX IF NOT EXISTS idx_payout_details_user_id ON payout_details(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_details_user_type ON payout_details(user_type);
CREATE INDEX IF NOT EXISTS idx_payout_details_verification_status ON payout_details(verification_status);

-- Unique constraint to ensure one payout detail per user per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_details_user_unique ON payout_details(user_id, user_type);

-- 5. Disbursement Requests Table
CREATE TABLE IF NOT EXISTS disbursement_requests (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_type TEXT NOT NULL CHECK (user_type IN ('driver', 'company')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  payout_details_id TEXT NOT NULL REFERENCES payout_details(id),
  xendit_disbursement_id TEXT,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  description TEXT NOT NULL,
  related_transaction_id TEXT REFERENCES payment_transactions(id),
  tow_request_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  failure_reason TEXT
);

-- Indexes for disbursement_requests
CREATE INDEX IF NOT EXISTS idx_disbursement_requests_user_id ON disbursement_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_disbursement_requests_user_type ON disbursement_requests(user_type);
CREATE INDEX IF NOT EXISTS idx_disbursement_requests_status ON disbursement_requests(status);
CREATE INDEX IF NOT EXISTS idx_disbursement_requests_created_at ON disbursement_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_disbursement_requests_external_id ON disbursement_requests(external_id);

-- 6. Enable Row Level Security (RLS) on all tables
ALTER TABLE company_xendit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursement_requests ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for company_xendit_accounts
CREATE POLICY "Company owners can view their xendit accounts" ON company_xendit_accounts
  FOR SELECT USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Company owners can insert their xendit accounts" ON company_xendit_accounts
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

-- 8. RLS Policies for payment_splits
CREATE POLICY "Company owners can view their payment splits" ON payment_splits
  FOR SELECT USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Company owners can insert their payment splits" ON payment_splits
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

-- 9. RLS Policies for payment_transactions
CREATE POLICY "Users can view their payment transactions" ON payment_transactions
  FOR SELECT USING (
    customer_id = auth.uid() OR 
    driver_id = auth.uid() OR
    company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "System can insert payment transactions" ON payment_transactions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update payment transactions" ON payment_transactions
  FOR UPDATE USING (true);

-- 10. RLS Policies for payout_details
CREATE POLICY "Users can view their own payout details" ON payout_details
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own payout details" ON payout_details
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own payout details" ON payout_details
  FOR UPDATE USING (user_id = auth.uid());

-- 11. RLS Policies for disbursement_requests
CREATE POLICY "Users can view their own disbursement requests" ON disbursement_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can insert disbursement requests" ON disbursement_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update disbursement requests" ON disbursement_requests
  FOR UPDATE USING (true);

-- 12. Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 13. Create triggers for automatic timestamp updates
CREATE TRIGGER update_company_xendit_accounts_updated_at 
  BEFORE UPDATE ON company_xendit_accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_splits_updated_at 
  BEFORE UPDATE ON payment_splits 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at 
  BEFORE UPDATE ON payment_transactions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payout_details_updated_at 
  BEFORE UPDATE ON payout_details 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disbursement_requests_updated_at 
  BEFORE UPDATE ON disbursement_requests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 14. Insert sample data (optional - for testing)
-- You can uncomment these if you want sample data for testing

/*
-- Sample company (you'll need to replace with actual company IDs from your companies table)
INSERT INTO companies (id, name, email, phone, tax_id, business_license, owner_id) 
VALUES (
  'sample-company-uuid',
  'Test Towing Company',
  'test@towingcompany.com',
  '+6281234567890',
  'TAX123456789',
  'LICENSE123456789',
  'sample-user-uuid'
) ON CONFLICT DO NOTHING;
*/

-- Success message
SELECT 'Xendit payment tables created successfully!' as message;