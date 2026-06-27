import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Wallet, WalletTransaction, TopUpMethod } from "@/types";
import { useAuth } from "@/hooks/useAuthStore";
import AsyncStorage from '@react-native-async-storage/async-storage';

const WALLET_STORAGE_KEY = 'wallet_data';
const TRANSACTIONS_STORAGE_KEY = 'wallet_transactions';

const mockTopUpMethods: TopUpMethod[] = [
  {
    id: '1',
    name: 'Transfer Bank',
    type: 'bank_transfer',
    icon: '🏦',
    minAmount: 10000,
    maxAmount: 10000000,
    fee: 0,
    processingTime: '1-3 menit',
    isActive: true,
  },
  {
    id: '2',
    name: 'Kartu Kredit/Debit',
    type: 'credit_card',
    icon: '💳',
    minAmount: 10000,
    maxAmount: 5000000,
    fee: 2500,
    processingTime: 'Instan',
    isActive: true,
  },
  {
    id: '3',
    name: 'GoPay',
    type: 'e_wallet',
    icon: '📱',
    minAmount: 10000,
    maxAmount: 2000000,
    fee: 0,
    processingTime: 'Instan',
    isActive: true,
  },
  {
    id: '4',
    name: 'OVO',
    type: 'e_wallet',
    icon: '💙',
    minAmount: 10000,
    maxAmount: 2000000,
    fee: 0,
    processingTime: 'Instan',
    isActive: true,
  },
  {
    id: '5',
    name: 'DANA',
    type: 'e_wallet',
    icon: '💰',
    minAmount: 10000,
    maxAmount: 2000000,
    fee: 0,
    processingTime: 'Instan',
    isActive: true,
  },
];

export const [WalletContext, useWallet] = createContextHook(() => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load wallet data from storage
  const loadWalletData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Load wallet
      const walletData = await AsyncStorage.getItem(`${WALLET_STORAGE_KEY}_${user.id}`);
      if (walletData) {
        setWallet(JSON.parse(walletData));
      } else {
        // Create new wallet
        const newWallet: Wallet = {
          id: `wallet_${user.id}`,
          userId: user.id,
          balance: 0,
          currency: 'IDR',
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setWallet(newWallet);
        await AsyncStorage.setItem(`${WALLET_STORAGE_KEY}_${user.id}`, JSON.stringify(newWallet));
      }

      // Load transactions
      const transactionsData = await AsyncStorage.getItem(`${TRANSACTIONS_STORAGE_KEY}_${user.id}`);
      if (transactionsData) {
        setTransactions(JSON.parse(transactionsData));
      }
    } catch (err) {
      console.error('Failed to load wallet data:', err);
      setError('Gagal memuat data dompet');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Save wallet data to storage
  const saveWalletData = useCallback(async (walletData: Wallet, transactionsData: WalletTransaction[]) => {
    if (!user) return;

    try {
      await AsyncStorage.setItem(`${WALLET_STORAGE_KEY}_${user.id}`, JSON.stringify(walletData));
      await AsyncStorage.setItem(`${TRANSACTIONS_STORAGE_KEY}_${user.id}`, JSON.stringify(transactionsData));
    } catch (err) {
      console.error('Failed to save wallet data:', err);
    }
  }, [user]);

  // Top up wallet
  const topUpWallet = useCallback(async (amount: number, paymentMethod: TopUpMethod) => {
    if (!wallet || !user) return false;

    try {
      setLoading(true);
      setError(null);

      // Create transaction
      const transaction: WalletTransaction = {
        id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        type: 'top_up',
        amount: amount,
        description: `Top up via ${paymentMethod.name}`,
        status: 'completed', // In real app, this would be 'pending' initially
        createdAt: Date.now(),
        completedAt: Date.now(),
        paymentMethod: paymentMethod.type,
      };

      // Update wallet balance
      const updatedWallet: Wallet = {
        ...wallet,
        balance: wallet.balance + amount,
        updatedAt: Date.now(),
      };

      const updatedTransactions = [transaction, ...transactions];

      setWallet(updatedWallet);
      setTransactions(updatedTransactions);
      await saveWalletData(updatedWallet, updatedTransactions);

      return true;
    } catch (err) {
      console.error('Top up failed:', err);
      setError('Gagal melakukan top up');
      return false;
    } finally {
      setLoading(false);
    }
  }, [wallet, user, transactions, saveWalletData]);

  // Make payment from wallet
  const makePayment = useCallback(async (amount: number, description: string, referenceId?: string) => {
    if (!wallet || !user) return false;

    if (wallet.balance < amount) {
      setError('Saldo tidak mencukupi');
      return false;
    }

    try {
      setLoading(true);
      setError(null);

      // Create transaction
      const transaction: WalletTransaction = {
        id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        type: 'payment',
        amount: -amount, // Negative for payment
        description,
        status: 'completed',
        createdAt: Date.now(),
        completedAt: Date.now(),
        referenceId,
      };

      // Update wallet balance
      const updatedWallet: Wallet = {
        ...wallet,
        balance: wallet.balance - amount,
        updatedAt: Date.now(),
      };

      const updatedTransactions = [transaction, ...transactions];

      setWallet(updatedWallet);
      setTransactions(updatedTransactions);
      await saveWalletData(updatedWallet, updatedTransactions);

      return true;
    } catch (err) {
      console.error('Payment failed:', err);
      setError('Gagal melakukan pembayaran');
      return false;
    } finally {
      setLoading(false);
    }
  }, [wallet, user, transactions, saveWalletData]);

  // Format currency
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  // Get available top up methods
  const getTopUpMethods = useCallback(() => {
    return mockTopUpMethods.filter(method => method.isActive);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    loadWalletData();
  }, [loadWalletData]);

  return useMemo(() => ({
    wallet,
    transactions,
    loading,
    error,
    topUpWallet,
    makePayment,
    formatCurrency,
    getTopUpMethods,
    clearError,
    hasBalance: (amount: number) => wallet ? wallet.balance >= amount : false,
  }), [wallet, transactions, loading, error, topUpWallet, makePayment, formatCurrency, getTopUpMethods, clearError]);
});