# Xendit Payment Integration for Towing Online Platform

This document provides a complete guide for integrating Xendit xenPlatform to handle automatic payment splitting between towing companies and the platform.

## Overview

The Xendit integration enables:
- Automatic sub-account creation for each towing company
- Configurable revenue splitting (e.g., 90% company, 10% platform)
- Real-time payment processing and status tracking
- Complete transaction history and reporting
- Support for multiple payment methods

## Architecture

```
Customer Payment
       ↓
   Xendit API
       ↓
  Split Rules
   ↙      ↘
Company   Platform
Account   Account
(90%)     (10%)
```

## Setup Instructions

### 1. Xendit Account Setup

1. **Create Xendit Account**: Sign up at https://dashboard.xendit.co/
2. **Get API Keys**: Go to Settings > API Keys and copy your secret key
3. **Enable xenPlatform**: Contact Xendit support to enable xenPlatform features
4. **Get Platform Account ID**: This will be provided by Xendit after xenPlatform is enabled

### 2. Environment Variables

Add the following to your `.env` file:

```env
# Xendit Payment Integration
EXPO_PUBLIC_XENDIT_SECRET_KEY=xnd_production_40k8cb0EZXBPof6VaSF5yMGtD4YuY4KuwG6Nm32qKtGCLPsAPmXnZM4anOtA6
EXPO_PUBLIC_XENDIT_PLATFORM_ACCOUNT_ID=your_platform_account_id_here
```

**Important Notes:**
- The secret key provided is already configured for production
- You need to get your platform account ID from Xendit support
- Never commit these keys to version control

### 3. Database Schema

Create the following tables in Supabase:

#### company_xendit_accounts
```sql
CREATE TABLE company_xendit_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  xendit_account_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  business_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INVITED',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### payment_splits
```sql
CREATE TABLE payment_splits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  company_account_id TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  split_rule_id TEXT NOT NULL UNIQUE,
  company_percentage INTEGER NOT NULL DEFAULT 90,
  platform_percentage INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### payment_transactions
```sql
CREATE TABLE payment_transactions (
  id TEXT PRIMARY KEY,
  tow_request_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  driver_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL,
  xendit_payment_id TEXT NOT NULL,
  split_rule_id TEXT NOT NULL,
  company_amount INTEGER NOT NULL,
  platform_amount INTEGER NOT NULL,
  driver_amount INTEGER,
  xendit_fee INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  failure_reason TEXT
);
```

## Usage Examples

### 1. Setting Up a New Towing Company

```typescript
import { usePaymentStore } from '@/hooks/usePaymentStore';

const { setupCompanyPayments } = usePaymentStore();

// Complete setup for a new company
const success = await setupCompanyPayments({
  companyId: 'company_123',
  email: 'finance@towingcompany.com',
  businessName: 'ABC Towing Services',
  country: 'ID',
  companyPercentage: 90,
  platformPercentage: 10,
});
```

### 2. Processing a Payment

```typescript
const { processPayment } = usePaymentStore();

const transaction = await processPayment({
  towRequestId: 'tow_456',
  customerId: 'customer_789',
  companyId: 'company_123',
  driverId: 'driver_101',
  amount: 150000, // IDR 150,000
  payerEmail: 'customer@example.com',
  description: 'Emergency towing service',
  paymentMethod: 'bank_transfer',
});
```

### 3. Checking Transaction Status

```typescript
const { getTransactionHistory } = usePaymentStore();

// Get all transactions for a company
const transactions = await getTransactionHistory({
  companyId: 'company_123',
  limit: 50,
});

// Get pending transactions only
const pendingTransactions = await getTransactionHistory({
  status: 'pending',
  limit: 20,
});
```

## Testing

A comprehensive demo screen is available at `/xendit-integration-demo` to test all integration features:

1. **Connection Test**: Verify API credentials and connectivity
2. **Sub-Account Creation**: Test creating Xendit sub-accounts for companies
3. **Split Rule Creation**: Test payment splitting configuration
4. **Full Payment Setup**: Complete end-to-end setup process
5. **Payment Processing**: Test actual payment creation and processing

## Payment Flow

1. **Company Registration**: When a towing company registers, create Xendit sub-account
2. **Split Rule Setup**: Configure revenue splitting (90% company, 10% platform)
3. **Customer Payment**: Customer pays through Xendit invoice
4. **Automatic Split**: Xendit automatically splits payment according to rules
5. **Real-time Updates**: Transaction status updates in real-time
6. **Disbursement**: Companies can withdraw their funds anytime

## Revenue Splitting

Default configuration:
- **Towing Company**: 90% of payment
- **Platform**: 10% of payment
- **Driver**: 80% of company share (if applicable)
- **Xendit Fees**: ~2.9% (deducted automatically)

## Security

- All API calls use HTTPS encryption
- API keys are environment-specific
- Webhook verification for payment status updates
- Database-level access controls
- Audit trail for all transactions

## Support

For technical issues:
1. Check the demo screen for connection status
2. Review console logs for detailed error messages
3. Verify environment variables are correctly set
4. Contact Xendit support for platform-specific issues

## Next Steps

1. **Get Platform Account ID**: Contact Xendit support to enable xenPlatform and get your platform account ID
2. **Update Environment**: Add the platform account ID to your `.env` file
3. **Test Integration**: Use the demo screen to test all features
4. **Database Setup**: Create the required tables in Supabase
5. **Production Deployment**: Deploy with proper security measures