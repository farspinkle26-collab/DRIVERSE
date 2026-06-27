import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeStore';
import { useTransactions } from '@/hooks/useTransactionStore';
import { useAuth } from '@/hooks/useAuthStore';
import { useRealtime } from '@/hooks/useRealtimeStore';
import { useTowing } from '@/hooks/useTowingStore';
import { router } from 'expo-router';
import { 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  DollarSign,
  Activity
} from 'lucide-react-native';
import Card from '@/components/Card';

export default function TransactionsScreen() {
  const { theme } = useTheme();
  const { 
    transactions, 
    loading, 
    formatCurrency,
    totalTransactions,
    completedTransactions,
    pendingTransactions,
    totalAmount,
    completedAmount,
    checkPaymentStatus,
    distributePayment,
    createSampleTransactions
  } = useTransactions();
  const { user } = useAuth();
  const { sendRequestToNearestDriver } = useRealtime();
  const { requestHistory, getRequestById } = useTowing();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');

  const onRefresh = async () => {
    setRefreshing(true);
    // Check status of pending transactions
    const pendingTxns = transactions.filter(t => t.status === 'pending' || t.status === 'processing');
    for (const txn of pendingTxns) {
      const result = await checkPaymentStatus(txn.id);
      
      // If payment is completed and we should start driver search
      if (result.success && result.status === 'completed' && result.shouldStartDriverSearch) {
        console.log('🚗 Payment completed! Starting driver search for transaction:', txn.id);
        
        // Distribute payment first
        await distributePayment(txn.id);
        
        // Find the tow request and start driver search
        const towRequest = getRequestById(txn.towRequestId);
        if (towRequest) {
          console.log('🚗 Found tow request, sending to nearest driver:', towRequest.id);
          const searchSuccess = await sendRequestToNearestDriver(towRequest);
          
          if (searchSuccess) {
            Alert.alert(
              'Pembayaran Berhasil!',
              'Pembayaran Anda telah dikonfirmasi. Kami sedang mencari driver terdekat untuk Anda.',
              [
                {
                  text: 'Lihat Status',
                  onPress: () => {
                    router.push({
                      pathname: '/request-details' as any,
                      params: { id: towRequest.id }
                    });
                  }
                },
                { text: 'OK' }
              ]
            );
          } else {
            Alert.alert(
              'Pembayaran Berhasil',
              'Pembayaran Anda telah dikonfirmasi, namun terjadi masalah saat mencari driver. Silakan hubungi customer service.',
              [{ text: 'OK' }]
            );
          }
        }
      }
    }
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getTransactionIcon = (status: string, paymentMethod: string) => {
    if (status === 'pending' || status === 'processing') return <Clock size={20} color="#FFA500" />;
    if (status === 'failed') return <XCircle size={20} color="#FF3B30" />;
    if (status === 'completed') return <CheckCircle size={20} color="#34C759" />;
    
    switch (paymentMethod) {
      case 'bank_transfer':
        return <CreditCard size={20} color="#007AFF" />;
      case 'e_wallet':
        return <ArrowDownLeft size={20} color="#34C759" />;
      case 'credit_card':
        return <CreditCard size={20} color="#FF9500" />;
      default:
        return <DollarSign size={20} color="#8E8E93" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#34C759';
      case 'pending': return '#FFA500';
      case 'processing': return '#007AFF';
      case 'failed': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Menunggu';
      case 'processing': return 'Diproses';
      case 'completed': return 'Berhasil';
      case 'failed': return 'Gagal';
      default: return status;
    }
  };

  const getPaymentMethodText = (method: string) => {
    switch (method) {
      case 'bank_transfer': return 'Transfer Bank';
      case 'e_wallet': return 'E-Wallet';
      case 'credit_card': return 'Kartu Kredit';
      case 'qr_code': return 'QR Code';
      default: return method;
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
    if (selectedFilter === 'all') return true;
    return transaction.status === selectedFilter;
  });

  const handleTransactionPress = (transaction: any) => {
    // Create detailed transaction info
    let details = `ID: ${transaction.id}\nStatus: ${getStatusText(transaction.status)}\nJumlah: ${formatCurrency(transaction.amount)}\nMetode: ${getPaymentMethodText(transaction.paymentMethod)}`;
    
    // Add Virtual Account info if available
    if (transaction.status === 'processing' && transaction.paymentMethod === 'bank_transfer') {
      details += `\n\nVirtual Account siap digunakan.\nSilakan lakukan pembayaran melalui transfer bank.`;
    }
    
    if (transaction.status === 'pending') {
      details += `\n\nMenunggu pembayaran.\nSilakan selesaikan pembayaran untuk melanjutkan.`;
    }
    
    if (transaction.status === 'completed') {
      details += `\n\nPembayaran berhasil!\nTerima kasih telah menggunakan layanan kami.`;
    }
    
    const buttons: any[] = [{ text: 'OK' }];
    
    // Add check status button for pending transactions
    if (transaction.status === 'pending' || transaction.status === 'processing') {
      buttons.unshift({
        text: 'Cek Status Pembayaran',
        onPress: async () => {
          const result = await checkPaymentStatus(transaction.id);
          
          if (result.success && result.status === 'completed' && result.shouldStartDriverSearch) {
            // Distribute payment first
            await distributePayment(transaction.id);
            
            // Find the tow request and start driver search
            const towRequest = getRequestById(transaction.towRequestId);
            if (towRequest) {
              const searchSuccess = await sendRequestToNearestDriver(towRequest);
              
              if (searchSuccess) {
                Alert.alert(
                  'Pembayaran Berhasil!',
                  'Pembayaran Anda telah dikonfirmasi. Kami sedang mencari driver terdekat untuk Anda.',
                  [
                    {
                      text: 'Lihat Status',
                      onPress: () => {
                        router.push({
                          pathname: '/request-details' as any,
                          params: { id: towRequest.id }
                        });
                      }
                    },
                    { text: 'OK' }
                  ]
                );
              }
            }
          }
        }
      });
    }
    
    Alert.alert('Detail Transaksi', details, buttons);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <Card style={[styles.statCard, { backgroundColor: theme.card }]}>
            <View style={[styles.statIcon, { backgroundColor: '#007AFF' + '20' }]}>
              <Activity size={24} color="#007AFF" />
            </View>
            <Text style={[styles.statValue, { color: theme.textDark }]}>
              {totalTransactions}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textLight }]}>
              Total Transaksi
            </Text>
          </Card>
          
          <Card style={[styles.statCard, { backgroundColor: theme.card }]}>
            <View style={[styles.statIcon, { backgroundColor: '#34C759' + '20' }]}>
              <CheckCircle size={24} color="#34C759" />
            </View>
            <Text style={[styles.statValue, { color: theme.textDark }]}>
              {completedTransactions}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textLight }]}>
              Berhasil
            </Text>
          </Card>
          
          <Card style={[styles.statCard, { backgroundColor: theme.card }]}>
            <View style={[styles.statIcon, { backgroundColor: '#FFA500' + '20' }]}>
              <Clock size={24} color="#FFA500" />
            </View>
            <Text style={[styles.statValue, { color: theme.textDark }]}>
              {pendingTransactions}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textLight }]}>
              Pending
            </Text>
          </Card>
        </View>

        {/* Total Amount Card */}
        <Card style={[styles.totalCard, { backgroundColor: theme.card }]}>
          <View style={styles.totalHeader}>
            <TrendingUp size={24} color="#FF3B30" />
            <Text style={[styles.totalTitle, { color: theme.textDark }]}>
              Total Transaksi
            </Text>
          </View>
          
          <Text style={[styles.totalAmount, { color: theme.textDark }]}>
            {formatCurrency(totalAmount)}
          </Text>
          
          <Text style={[styles.totalSubtext, { color: theme.textLight }]}>
            Berhasil: {formatCurrency(completedAmount)}
          </Text>
        </Card>

        {/* Filter Tabs */}
        <View style={[styles.filterContainer, { backgroundColor: theme.card }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterTabs}>
              {[
                { key: 'all', label: 'Semua' },
                { key: 'completed', label: 'Berhasil' },
                { key: 'pending', label: 'Pending' },
                { key: 'failed', label: 'Gagal' },
              ].map((filter) => (
                <TouchableOpacity
                  key={filter.key}
                  style={[
                    styles.filterTab,
                    {
                      backgroundColor: selectedFilter === filter.key ? theme.primary : 'transparent',
                      borderColor: theme.border,
                    }
                  ]}
                  onPress={() => setSelectedFilter(filter.key as any)}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      {
                        color: selectedFilter === filter.key ? '#FFFFFF' : theme.textDark,
                      }
                    ]}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Transactions List */}
        <Card style={[styles.transactionsSection, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            Riwayat Transaksi
          </Text>
          
          {filteredTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <CreditCard size={48} color={theme.textLight} />
              <Text style={[styles.emptyStateText, { color: theme.textLight }]}>
                {selectedFilter === 'all' ? 'Belum ada transaksi' : `Tidak ada transaksi ${selectedFilter}`}
              </Text>
              <Text style={[styles.emptyStateSubtext, { color: theme.textLight }]}>
                Transaksi Anda akan muncul di sini
              </Text>
              {selectedFilter === 'all' && totalTransactions === 0 && (
                <TouchableOpacity
                  style={[styles.sampleButton, { backgroundColor: theme.primary }]}
                  onPress={createSampleTransactions}
                >
                  <Text style={[styles.sampleButtonText, { color: '#FFFFFF' }]}>
                    Buat Contoh Transaksi
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {filteredTransactions.map((transaction) => (
                <TouchableOpacity
                  key={transaction.id}
                  style={[styles.transactionItem, { borderBottomColor: theme.border }]}
                  onPress={() => handleTransactionPress(transaction)}
                >
                  <View style={styles.transactionLeft}>
                    <View style={styles.transactionIcon}>
                      {getTransactionIcon(transaction.status, transaction.paymentMethod)}
                    </View>
                    <View style={styles.transactionDetails}>
                      <Text style={[styles.transactionDescription, { color: theme.textDark }]}>
                        Pembayaran Derek #{transaction.towRequestId.slice(-6)}
                      </Text>
                      <Text style={[styles.transactionDate, { color: theme.textLight }]}>
                        {formatDate(transaction.createdAt)} • {getPaymentMethodText(transaction.paymentMethod)}
                      </Text>
                      <Text style={[styles.transactionStatus, { color: getStatusColor(transaction.status) }]}>
                        {getStatusText(transaction.status)}
                      </Text>
                      {transaction.status === 'processing' && transaction.paymentMethod === 'bank_transfer' && (
                        <Text style={[styles.transactionNote, { color: theme.primary }]}>
                          Virtual Account siap digunakan
                        </Text>
                      )}
                      {transaction.status === 'pending' && (
                        <Text style={[styles.transactionNote, { color: theme.warning || '#FFA500' }]}>
                          Menunggu pembayaran
                        </Text>
                      )}
                    </View>
                  </View>
                  
                  <View style={styles.transactionRight}>
                    <Text
                      style={[
                        styles.transactionAmount,
                        { color: theme.textDark }
                      ]}
                    >
                      {formatCurrency(transaction.amount)}
                    </Text>
                    {transaction.status === 'pending' && (
                      <TouchableOpacity
                        style={[styles.checkStatusButton, { backgroundColor: theme.primary + '20' }]}
                        onPress={async () => {
                          const result = await checkPaymentStatus(transaction.id);
                          
                          if (result.success && result.status === 'completed' && result.shouldStartDriverSearch) {
                            // Distribute payment first
                            await distributePayment(transaction.id);
                            
                            // Find the tow request and start driver search
                            const towRequest = getRequestById(transaction.towRequestId);
                            if (towRequest) {
                              const searchSuccess = await sendRequestToNearestDriver(towRequest);
                              
                              if (searchSuccess) {
                                Alert.alert(
                                  'Pembayaran Berhasil!',
                                  'Pembayaran Anda telah dikonfirmasi. Kami sedang mencari driver terdekat untuk Anda.',
                                  [
                                    {
                                      text: 'Lihat Status',
                                      onPress: () => {
                                        router.push({
                                          pathname: '/request-details' as any,
                                          params: { id: towRequest.id }
                                        });
                                      }
                                    },
                                    { text: 'OK' }
                                  ]
                                );
                              }
                            }
                          }
                        }}
                      >
                        <Text style={[styles.checkStatusText, { color: theme.primary }]}>
                          Cek Status
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  totalCard: {
    padding: 20,
    marginBottom: 16,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  totalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  totalSubtext: {
    fontSize: 14,
  },
  filterContainer: {
    borderRadius: 12,
    marginBottom: 16,
    paddingVertical: 8,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
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
  transactionsSection: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 100,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
  },
  transactionsList: {
    gap: 0,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    marginBottom: 2,
  },
  transactionStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  transactionNote: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  checkStatusButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  checkStatusText: {
    fontSize: 10,
    fontWeight: '500',
  },
  sampleButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  sampleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});