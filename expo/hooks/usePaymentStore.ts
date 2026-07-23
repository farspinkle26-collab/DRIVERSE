import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo } from 'react';
import { PaymentSplit, PaymentTransaction } from '@/types';
import { supabase } from '@/lib/supabase';

export const [PaymentContext, usePaymentStore] = createContextHook(() => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);

  // NOTE: this previously created a sub-account with Xendit and persisted it
  // to a Xendit-specific table; that integration has been removed. This now
  // just generates a local account identifier so the rest of the payment
  // split flow (which is provider-agnostic) keeps working. Wire this up to
  // a real payment provider before using it for actual payouts.
  const createCompanySubAccount = useCallback(async (companyData: {
    companyId: string;
    email: string;
    businessName: string;
    country?: string;
  }): Promise<string | null> => {
    console.log('Creating sub-account for company:', companyData.companyId);

    try {
      setLoading(true);
      setError(null);

      const accountId = `acct_${companyData.companyId}_${Date.now()}`;

      console.log('Company sub-account created successfully:', accountId);
      return accountId;
    } catch (err) {
      console.error('Error creating company sub-account:', err);
      setError(err instanceof Error ? err.message : 'Failed to create sub-account');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createPaymentSplit = useCallback(async ({
    companyId,
    companyAccountId,
    companyPercentage = 90,
    platformPercentage = 10,
  }: {
    companyId: string;
    companyAccountId: string;
    companyPercentage?: number;
    platformPercentage?: number;
  }): Promise<string | null> => {
    console.log('Creating payment split for company:', companyId);
    
    try {
      setLoading(true);
      setError(null);

      // NOTE: split rule creation previously delegated to Xendit; that
      // integration has been removed, so a local split rule id is used
      // instead. Wire this up to a real payment provider before relying on
      // it for actual revenue splitting.
      const splitRuleId = `split_${companyId}_${Date.now()}`;
      const platformAccountId = process.env.EXPO_PUBLIC_PLATFORM_ACCOUNT_ID || '';

      const paymentSplit: PaymentSplit = {
        companyId,
        companyAccountId,
        platformAccountId,
        splitRuleId,
        companyPercentage,
        platformPercentage,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const { error: dbError } = await supabase
        .from('payment_splits')
        .insert({
          company_id: paymentSplit.companyId,
          company_account_id: paymentSplit.companyAccountId,
          platform_account_id: paymentSplit.platformAccountId,
          split_rule_id: paymentSplit.splitRuleId,
          company_percentage: paymentSplit.companyPercentage,
          platform_percentage: paymentSplit.platformPercentage,
          is_active: paymentSplit.isActive,
          created_at: new Date(paymentSplit.createdAt).toISOString(),
          updated_at: new Date(paymentSplit.updatedAt).toISOString(),
        });

      if (dbError) {
        console.error('Failed to save payment split to database:', dbError);
        throw new Error('Failed to save split rule information');
      }

      setPaymentSplits(prev => [...prev, paymentSplit]);
      console.log('Payment split created successfully:', splitRuleId);
      return splitRuleId;
    } catch (err) {
      console.error('Error creating payment split:', err);
      setError(err instanceof Error ? err.message : 'Failed to create payment split');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const processPayment = useCallback(async ({
    towRequestId,
    customerId,
    companyId,
    driverId,
    amount,
    payerEmail,
    description,
    paymentMethod = 'bank_transfer',
  }: {
    towRequestId: string;
    customerId: string;
    companyId: string;
    driverId?: string;
    amount: number;
    payerEmail: string;
    description: string;
    paymentMethod?: 'bank_transfer' | 'e_wallet' | 'credit_card' | 'qr_code';
  }): Promise<PaymentTransaction | null> => {
    console.log('Processing payment for tow request:', towRequestId);
    
    try {
      setLoading(true);
      setError(null);

      const { data: splitData, error: splitError } = await supabase
        .from('payment_splits')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single();

      if (splitError || !splitData) {
        throw new Error('No active payment split found for this company');
      }

      // NOTE: payment creation previously delegated to Xendit; that
      // integration has been removed. Wire this up to a real payment
      // provider before relying on it for actual payment collection.
      const companyAmount = Math.floor(amount * (splitData.company_percentage / 100));
      const platformAmount = amount - companyAmount;
      const platformFee = Math.floor(amount * 0.05); // Platform service fee

      const transaction: PaymentTransaction = {
        id: `txn_${Date.now()}`,
        towRequestId,
        customerId,
        companyId,
        driverId,
        amount,
        currency: 'IDR',
        status: 'pending',
        paymentMethod,
        splitRuleId: splitData.split_rule_id,
        splits: {
          companyAmount,
          platformAmount,
          driverAmount: driverId ? Math.floor(companyAmount * 0.8) : undefined,
        },
        fees: {
          platformFee,
        },
        createdAt: Date.now(),
      };

      const { error: dbError } = await supabase
        .from('payment_transactions')
        .insert({
          id: transaction.id,
          tow_request_id: transaction.towRequestId,
          customer_id: transaction.customerId,
          company_id: transaction.companyId,
          driver_id: transaction.driverId,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          payment_method: transaction.paymentMethod,
          split_rule_id: transaction.splitRuleId,
          company_amount: transaction.splits.companyAmount,
          platform_amount: transaction.splits.platformAmount,
          driver_amount: transaction.splits.driverAmount,
          platform_fee: transaction.fees.platformFee,
          created_at: new Date(transaction.createdAt).toISOString(),
        });

      if (dbError) {
        console.error('Failed to save transaction to database:', dbError);
        throw new Error('Failed to save transaction information');
      }

      setTransactions(prev => [...prev, transaction]);
      console.log('Payment processed successfully:', transaction.id);
      return transaction;
    } catch (err) {
      console.error('Error processing payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to process payment');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePaymentStatus = useCallback(async (
    transactionId: string,
    status: PaymentTransaction['status']
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      let completedAt: number | undefined;
      if (status === 'completed') {
        completedAt = Date.now();
      }

      const { error: dbError } = await supabase
        .from('payment_transactions')
        .update({
          status,
          completed_at: completedAt ? new Date(completedAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transactionId);

      if (dbError) {
        console.error('Failed to update transaction status:', dbError);
        throw new Error('Failed to update transaction status');
      }

      setTransactions(prev => 
        prev.map(txn => 
          txn.id === transactionId 
            ? { ...txn, status, completedAt }
            : txn
        )
      );

      console.log('Payment status updated successfully:', transactionId, status);
      return true;
    } catch (err) {
      console.error('Error updating payment status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update payment status');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const getCompanyPaymentSplit = useCallback(async (companyId: string): Promise<PaymentSplit | null> => {
    try {
      const { data, error } = await supabase
        .from('payment_splits')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        console.log('No payment split found for company:', companyId);
        return null;
      }

      const paymentSplit: PaymentSplit = {
        companyId: data.company_id,
        companyAccountId: data.company_account_id,
        platformAccountId: data.platform_account_id,
        splitRuleId: data.split_rule_id,
        companyPercentage: data.company_percentage,
        platformPercentage: data.platform_percentage,
        isActive: data.is_active,
        createdAt: new Date(data.created_at).getTime(),
        updatedAt: new Date(data.updated_at).getTime(),
      };

      return paymentSplit;
    } catch (err) {
      console.error('Error getting company payment split:', err);
      return null;
    }
  }, []);

  const getTransactionHistory = useCallback(async (filters: {
    companyId?: string;
    customerId?: string;
    driverId?: string;
    status?: PaymentTransaction['status'];
    limit?: number;
  } = {}): Promise<PaymentTransaction[]> => {
    try {
      let query = supabase
        .from('payment_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.companyId) {
        query = query.eq('company_id', filters.companyId);
      }
      if (filters.customerId) {
        query = query.eq('customer_id', filters.customerId);
      }
      if (filters.driverId) {
        query = query.eq('driver_id', filters.driverId);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching transaction history:', error);
        return [];
      }

      const transactions: PaymentTransaction[] = data.map(row => ({
        id: row.id,
        towRequestId: row.tow_request_id,
        customerId: row.customer_id,
        companyId: row.company_id,
        driverId: row.driver_id,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        paymentMethod: row.payment_method,
        splitRuleId: row.split_rule_id,
        splits: {
          companyAmount: row.company_amount,
          platformAmount: row.platform_amount,
          driverAmount: row.driver_amount,
        },
        fees: {
          platformFee: row.platform_fee,
        },
        createdAt: new Date(row.created_at).getTime(),
        completedAt: row.completed_at ? new Date(row.completed_at).getTime() : undefined,
        failureReason: row.failure_reason,
      }));

      setTransactions(transactions);
      return transactions;
    } catch (err) {
      console.error('Error getting transaction history:', err);
      return [];
    }
  }, []);

  const setupCompanyPayments = useCallback(async (companyData: {
    companyId: string;
    email: string;
    businessName: string;
    country?: string;
    companyPercentage?: number;
    platformPercentage?: number;
  }): Promise<boolean> => {
    console.log('Setting up complete payment system for company:', companyData.companyId);
    
    try {
      setLoading(true);
      setError(null);

      const accountId = await createCompanySubAccount({
        companyId: companyData.companyId,
        email: companyData.email,
        businessName: companyData.businessName,
        country: companyData.country,
      });

      if (!accountId) {
        throw new Error('Failed to create sub-account');
      }

      const splitRuleId = await createPaymentSplit({
        companyId: companyData.companyId,
        companyAccountId: accountId,
        companyPercentage: companyData.companyPercentage,
        platformPercentage: companyData.platformPercentage,
      });

      if (!splitRuleId) {
        throw new Error('Failed to create payment split');
      }

      console.log('Company payment system setup completed successfully');
      return true;
    } catch (err) {
      console.error('Error setting up company payments:', err);
      setError(err instanceof Error ? err.message : 'Failed to setup payment system');
      return false;
    } finally {
      setLoading(false);
    }
  }, [createCompanySubAccount, createPaymentSplit]);

  return useMemo(() => ({
    loading,
    error,
    paymentSplits,
    transactions,
    createCompanySubAccount,
    createPaymentSplit,
    processPayment,
    updatePaymentStatus,
    getCompanyPaymentSplit,
    getTransactionHistory,
    setupCompanyPayments,
  }), [
    loading,
    error,
    paymentSplits,
    transactions,
    createCompanySubAccount,
    createPaymentSplit,
    processPayment,
    updatePaymentStatus,
    getCompanyPaymentSplit,
    getTransactionHistory,
    setupCompanyPayments,
  ]);
});