import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeStore';
import { useWallet } from '@/hooks/useWalletStore';
import { router } from 'expo-router';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle, XCircle, Filter } from 'lucide-react-native';

export default function TransactionHistoryScreen() {
  const { theme } = useTheme();
  const { transactions, formatCurrency } = useWallet();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'top_up' | 'payment' | 'refund'>('all');

  const onRefresh = async () => {
    setRefreshing(true);
    // In a real app, you would refresh transaction data from server
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getTransactionIcon = (type: string, status: string) => {
    if (status === 'pending') return <Clock size={20} color="#FFA500" />;
    if (status === 'failed') return <XCircle size={20} color="#FF3B30" />;
    
    switch (type) {
      case 'top_up':
        return <ArrowDownLeft size={20} color="#34C759" />;
      case 'payment':
        return <ArrowUpRight size={20} color="#FF3B30" />;
      case 'refund':
        return <ArrowDownLeft size={20} color="#34C759" />;
      default:
        return <CheckCircle size={20} color="#34C759" />;
    }
  };

  const getTransactionColor = (amount: number, status: string) => {
    if (status === 'failed') return '#FF3B30';
    return amount > 0 ? '#34C759' : '#FF3B30';
  };

  const formatTransactionAmount = (amount: number) => {
    const prefix = amount > 0 ? '+' : '';
    return `${prefix}${formatCurrency(Math.abs(amount))}`;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Menunggu';
      case 'completed': return 'Berhasil';
      case 'failed': return 'Gagal';
      default: return status;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'top_up': return 'Top Up';
      case 'payment': return 'Pembayaran';
      case 'refund': return 'Refund';
      case 'withdrawal': return 'Tarik Saldo';
      default: return type;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredTransactions = transactions.filter(transaction => {
    if (filter === 'all') return true;
    return transaction.type === filter;
  });

  const filterOptions = [
    { key: 'all', label: 'Semua' },
    { key: 'top_up', label: 'Top Up' },
    { key: 'payment', label: 'Pembayaran' },
    { key: 'refund', label: 'Refund' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={theme.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textDark }]}>Riwayat Transaksi</Text>
        <TouchableOpacity style={styles.filterButton}>
          <Filter size={20} color={theme.textDark} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { backgroundColor: theme.card }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollView}>
          {filterOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.filterTab,
                { 
                  backgroundColor: filter === option.key ? '#FF3B30' : theme.background,
                  borderColor: theme.border 
                }
              ]}
              onPress={() => setFilter(option.key as any)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: filter === option.key ? '#FFFFFF' : theme.textDark }
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <ArrowUpRight size={48} color={theme.textLight} />
            <Text style={[styles.emptyStateText, { color: theme.textLight }]}>
              Tidak ada transaksi
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: theme.textLight }]}>
              {filter === 'all' 
                ? 'Belum ada transaksi yang dilakukan'
                : `Belum ada transaksi ${getTypeText(filter).toLowerCase()}`
              }
            </Text>
          </View>
        ) : (
          <View style={[styles.transactionsList, { backgroundColor: theme.card }]}>
            {filteredTransactions.map((transaction, index) => (
              <View
                key={transaction.id}
                style={[
                  styles.transactionItem,
                  { 
                    borderBottomColor: theme.border,
                    borderBottomWidth: index === filteredTransactions.length - 1 ? 0 : 1
                  }
                ]}
              >
                <View style={styles.transactionLeft}>
                  <View style={styles.transactionIcon}>
                    {getTransactionIcon(transaction.type, transaction.status)}
                  </View>
                  <View style={styles.transactionDetails}>
                    <Text style={[styles.transactionDescription, { color: theme.textDark }]}>
                      {transaction.description}
                    </Text>
                    <Text style={[styles.transactionMeta, { color: theme.textLight }]}>
                      {getTypeText(transaction.type)} • {getStatusText(transaction.status)}
                    </Text>
                    <Text style={[styles.transactionDate, { color: theme.textLight }]}>
                      {formatDate(transaction.createdAt)}
                    </Text>
                    {transaction.referenceId && (
                      <Text style={[styles.transactionRef, { color: theme.textLight }]}>
                        Ref: {transaction.referenceId}
                      </Text>
                    )}
                  </View>
                </View>
                
                <View style={styles.transactionRight}>
                  <Text
                    style={[
                      styles.transactionAmount,
                      { color: getTransactionColor(transaction.amount, transaction.status) }
                    ]}
                  >
                    {formatTransactionAmount(transaction.amount)}
                  </Text>
                  {transaction.paymentMethod && (
                    <Text style={[styles.paymentMethod, { color: theme.textLight }]}>
                      {transaction.paymentMethod === 'bank_transfer' && 'Transfer Bank'}
                      {transaction.paymentMethod === 'credit_card' && 'Kartu Kredit'}
                      {transaction.paymentMethod === 'e_wallet' && 'E-Wallet'}
                      {transaction.paymentMethod === 'cash' && 'Tunai'}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  filterButton: {
    padding: 4,
  },
  filterContainer: {
    paddingVertical: 12,
  },
  filterScrollView: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  transactionsList: {
    borderRadius: 16,
    marginTop: 16,
    marginBottom: 100,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 16,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 18,
  },
  transactionMeta: {
    fontSize: 12,
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    marginBottom: 2,
  },
  transactionRef: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  paymentMethod: {
    fontSize: 10,
    textAlign: 'right',
  },
});