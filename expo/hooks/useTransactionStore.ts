import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState, useCallback, useMemo } from "react";
import { PaymentTransaction } from "@/types";
import { useAuth } from "@/hooks/useAuthStore";
import AsyncStorage from '@react-native-async-storage/async-storage';

const TRANSACTIONS_STORAGE_KEY = 'payment_transactions';

export const [TransactionContext, useTransactions] = createContextHook(() => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load transactions from storage
  const loadTransactions = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const transactionsData = await AsyncStorage.getItem(`${TRANSACTIONS_STORAGE_KEY}_${user.id}`);
      if (transactionsData) {
        setTransactions(JSON.parse(transactionsData));
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError('Gagal memuat data transaksi');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Save transactions to storage
  const saveTransactions = useCallback(async (transactionsData: PaymentTransaction[]) => {
    if (!user) return;

    try {
      await AsyncStorage.setItem(`${TRANSACTIONS_STORAGE_KEY}_${user.id}`, JSON.stringify(transactionsData));
    } catch (err) {
      console.error('Failed to save transactions:', err);
    }
  }, [user]);

  // Create a new payment transaction
  const createPaymentTransaction = useCallback(async ({
    towRequestId,
    companyId,
    driverId,
    amount,
    paymentMethod = 'bank_transfer'
  }: {
    towRequestId: string;
    companyId: string;
    driverId?: string;
    amount: number;
    paymentMethod?: 'bank_transfer' | 'e_wallet' | 'credit_card' | 'qr_code';
  }): Promise<PaymentTransaction | null> => {
    if (!user) return null;

    try {
      setLoading(true);
      setError(null);

      // Calculate splits (90% to company, 10% to platform)
      const companyAmount = Math.floor(amount * 0.9);
      const platformAmount = amount - companyAmount;
      const platformFee = Math.floor(amount * 0.05); // 5% platform fee

      const transaction: PaymentTransaction = {
        id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        towRequestId,
        customerId: user.id,
        companyId,
        driverId,
        amount,
        currency: 'IDR',
        status: 'pending',
        paymentMethod,
        splits: {
          companyAmount,
          platformAmount,
          driverAmount: driverId ? Math.floor(companyAmount * 0.8) : undefined, // 80% of company share goes to driver
        },
        fees: {
          platformFee,
        },
        createdAt: Date.now(),
      };

      const updatedTransactions = [transaction, ...transactions];
      setTransactions(updatedTransactions);
      await saveTransactions(updatedTransactions);

      return transaction;
    } catch (err) {
      console.error('Failed to create payment transaction:', err);
      setError('Gagal membuat transaksi pembayaran');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, transactions, saveTransactions]);

  // Check payment status for a pending/processing transaction.
  // NOTE: this previously delegated to a Xendit Virtual Account status
  // check; that integration has been removed, so this now just reports
  // the transaction's current locally-tracked status.
  const checkPaymentStatus = useCallback(async (transactionId: string): Promise<{
    success: boolean;
    status?: PaymentTransaction['status'];
    error?: string;
  }> => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) {
      return { success: false, error: 'Transaction not found' };
    }

    return { success: true, status: transaction.status };
  }, [transactions]);

  // Format currency
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  // Get transactions by status
  const getTransactionsByStatus = useCallback((status: PaymentTransaction['status']) => {
    return transactions.filter(t => t.status === status);
  }, [transactions]);

  // Get total amount by status
  const getTotalAmountByStatus = useCallback((status: PaymentTransaction['status']) => {
    return transactions
      .filter(t => t.status === status)
      .reduce((total, t) => total + t.amount, 0);
  }, [transactions]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Distribute payment to driver and platform
  const distributePayment = useCallback(async (transactionId: string): Promise<{
    success: boolean;
    error?: string;
  }> => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction || transaction.status !== 'completed') {
      return { success: false, error: 'Transaction not found or not completed' };
    }

    try {
      console.log('💰 Distributing payment for transaction:', transactionId);
      console.log('💰 Company amount:', transaction.splits.companyAmount);
      console.log('💰 Platform amount:', transaction.splits.platformAmount);
      console.log('💰 Driver amount:', transaction.splits.driverAmount);
      console.log('💰 Platform fee:', transaction.fees.platformFee);

      // In a real implementation, this would:
      // 1. Transfer money to driver's account (if driverId exists)
      // 2. Transfer platform fee to developer account
      // 3. Update transaction with distribution details

      // For now, we'll just log the distribution
      const distributionDetails = {
        distributedAt: Date.now(),
        driverPaid: transaction.splits.driverAmount || 0,
        platformPaid: transaction.splits.platformAmount,
      };
      
      // Update transaction with distribution info
      const updatedTransactions = transactions.map(t => 
        t.id === transactionId 
          ? { 
              ...t, 
              distributionDetails
            }
          : t
      );
      
      setTransactions(updatedTransactions);
      await saveTransactions(updatedTransactions);
      
      return { success: true };
    } catch (err) {
      console.error('Failed to distribute payment:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }, [transactions, saveTransactions]);

  // Create sample transactions for testing (only in development)
  const createSampleTransactions = useCallback(async () => {
    if (!user) return;
    
    const sampleTransactions: PaymentTransaction[] = [
      {
        id: `txn_${Date.now()}_sample1`,
        towRequestId: 'tow_req_001',
        customerId: user.id,
        companyId: 'company_1',
        driverId: 'driver_1',
        amount: 850000,
        currency: 'IDR',
        status: 'processing',
        paymentMethod: 'bank_transfer',
        splits: {
          companyAmount: 765000,
          platformAmount: 85000,
          driverAmount: 612000,
        },
        fees: {
          platformFee: 42500,
        },
        createdAt: Date.now() - 3600000, // 1 hour ago
      },
      {
        id: `txn_${Date.now()}_sample2`,
        towRequestId: 'tow_req_002',
        customerId: user.id,
        companyId: 'company_2',
        amount: 1200000,
        currency: 'IDR',
        status: 'completed',
        paymentMethod: 'bank_transfer',
        splits: {
          companyAmount: 1080000,
          platformAmount: 120000,
        },
        fees: {
          platformFee: 60000,
        },
        createdAt: Date.now() - 86400000, // 1 day ago
        completedAt: Date.now() - 82800000, // 23 hours ago
      },
      {
        id: `txn_${Date.now()}_sample3`,
        towRequestId: 'tow_req_003',
        customerId: user.id,
        companyId: 'company_1',
        amount: 595000,
        currency: 'IDR',
        status: 'pending',
        paymentMethod: 'bank_transfer',
        splits: {
          companyAmount: 535500,
          platformAmount: 59500,
        },
        fees: {
          platformFee: 29750,
        },
        createdAt: Date.now() - 1800000, // 30 minutes ago
      },
    ];
    
    const updatedTransactions = [...sampleTransactions, ...transactions];
    setTransactions(updatedTransactions);
    await saveTransactions(updatedTransactions);
  }, [user, transactions, saveTransactions]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  return useMemo(() => ({
    transactions,
    loading,
    error,
    createPaymentTransaction,
    checkPaymentStatus,
    distributePayment,
    formatCurrency,
    getTransactionsByStatus,
    getTotalAmountByStatus,
    clearError,
    createSampleTransactions,
    // Statistics
    totalTransactions: transactions.length,
    completedTransactions: transactions.filter(t => t.status === 'completed').length,
    pendingTransactions: transactions.filter(t => t.status === 'pending' || t.status === 'processing').length,
    totalAmount: transactions.reduce((total, t) => total + t.amount, 0),
    completedAmount: transactions.filter(t => t.status === 'completed').reduce((total, t) => total + t.amount, 0),
  }), [
    transactions,
    loading,
    error,
    createPaymentTransaction,
    checkPaymentStatus,
    distributePayment,
    formatCurrency,
    getTransactionsByStatus,
    getTotalAmountByStatus,
    clearError,
    createSampleTransactions,
  ]);
});