import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeStore';
import { useWallet } from '@/hooks/useWalletStore';
import { router } from 'expo-router';
import { ArrowLeft, ArrowDownLeft, Clock, CheckCircle, XCircle } from 'lucide-react-native';

export default function TopUpHistoryScreen() {
  const { theme } = useTheme();
  const { transactions, formatCurrency } = useWallet();

  const topUpTransactions = transactions.filter(t => t.type === 'top_up');

  const getTransactionIcon = (status: string) => {
    if (status === 'pending') return <Clock size={20} color="#FFA500" />;
    if (status === 'failed') return <XCircle size={20} color="#FF3B30" />;
    return <ArrowDownLeft size={20} color="#34C759" />;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Menunggu';
      case 'completed': return 'Berhasil';
      case 'failed': return 'Gagal';
      default: return status;
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={theme.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textDark }]}>Riwayat Top Up</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {topUpTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <ArrowDownLeft size={48} color={theme.textLight} />
            <Text style={[styles.emptyStateText, { color: theme.textLight }]}>
              Belum ada top up
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: theme.textLight }]}>
              Riwayat top up Anda akan muncul di sini
            </Text>
          </View>
        ) : (
          <View style={[styles.transactionsList, { backgroundColor: theme.card }]}>
            {topUpTransactions.map((transaction, index) => (
              <View
                key={transaction.id}
                style={[
                  styles.transactionItem,
                  { 
                    borderBottomColor: theme.border,
                    borderBottomWidth: index === topUpTransactions.length - 1 ? 0 : 1
                  }
                ]}
              >
                <View style={styles.transactionLeft}>
                  <View style={styles.transactionIcon}>
                    {getTransactionIcon(transaction.status)}
                  </View>
                  <View style={styles.transactionDetails}>
                    <Text style={[styles.transactionDescription, { color: theme.textDark }]}>
                      {transaction.description}
                    </Text>
                    <Text style={[styles.transactionMeta, { color: theme.textLight }]}>
                      {getStatusText(transaction.status)}
                    </Text>
                    <Text style={[styles.transactionDate, { color: theme.textLight }]}>
                      {formatDate(transaction.createdAt)}
                    </Text>
                    {transaction.paymentMethod && (
                      <Text style={[styles.paymentMethod, { color: theme.textLight }]}>
                        {transaction.paymentMethod === 'bank_transfer' && 'Transfer Bank'}
                        {transaction.paymentMethod === 'credit_card' && 'Kartu Kredit'}
                        {transaction.paymentMethod === 'e_wallet' && 'E-Wallet'}
                      </Text>
                    )}
                  </View>
                </View>
                
                <Text style={[styles.transactionAmount, { color: '#34C759' }]}>
                  +{formatCurrency(transaction.amount)}
                </Text>
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
  placeholder: {
    width: 32,
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
  paymentMethod: {
    fontSize: 10,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
});