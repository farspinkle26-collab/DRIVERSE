import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CreditCard, Smartphone, QrCode, Building2, CheckCircle, Clock, XCircle, Copy, RefreshCw } from 'lucide-react-native';

import Card from '@/components/Card';
import Button from '@/components/Button';
import { useAuth } from '@/hooks/useAuthStore';
import { usePaymentStore } from '@/hooks/usePaymentStore';
import { useTowing } from '@/hooks/useTowingStore';
import { useTheme } from '@/hooks/useThemeStore';
import xenditService from '@/lib/xendit';


type PaymentMethod = 'bank_transfer' | 'e_wallet' | 'credit_card' | 'qr_code';

interface PaymentMethodOption {
  id: PaymentMethod;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  available: boolean;
}

export default function PaymentCheckoutScreen() {
  const router = useRouter();
  const { towRequestId, amount, companyId, driverId } = useLocalSearchParams<{
    towRequestId: string;
    amount: string;
    companyId: string;
    driverId?: string;
  }>();
  
  const { user } = useAuth();
  const { theme } = useTheme();
  const {
    loading,
    error,
    processPayment,
    updatePaymentStatus,
    getCompanyPaymentSplit,
  } = usePaymentStore();

  
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('bank_transfer');
  const [selectedBank, setSelectedBank] = useState<string>('BNI');
  const [paymentSplit, setPaymentSplit] = useState<any>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [virtualAccount, setVirtualAccount] = useState<any>(null);
  const [checkingPayment, setCheckingPayment] = useState<boolean>(false);
  
  const paymentAmount = parseInt(amount || '0');
  
  const paymentMethods: PaymentMethodOption[] = [
    {
      id: 'bank_transfer',
      name: 'Virtual Account',
      description: 'Transfer melalui Virtual Account Bank',
      icon: Building2,
      available: true,
    },
    {
      id: 'e_wallet',
      name: 'E-Wallet',
      description: 'OVO, GoPay, DANA, dll',
      icon: Smartphone,
      available: false, // Coming soon
    },
    {
      id: 'qr_code',
      name: 'QR Code',
      description: 'Scan QR untuk pembayaran',
      icon: QrCode,
      available: false, // Coming soon
    },
    {
      id: 'credit_card',
      name: 'Kartu Kredit',
      description: 'Visa, Mastercard, dll',
      icon: CreditCard,
      available: false, // Coming soon
    },
  ];
  
  const bankOptions = [
    { code: 'BNI', name: 'Bank Negara Indonesia (BNI)', available: true },
    { code: 'BRI', name: 'Bank Rakyat Indonesia (BRI)', available: true },
    { code: 'MANDIRI', name: 'Bank Mandiri', available: true },
    { code: 'PERMATA', name: 'Bank Permata', available: true },
    { code: 'CIMB', name: 'CIMB Niaga', available: true },
    { code: 'BCA', name: 'Bank Central Asia (BCA)', available: true },
  ];
  
  const loadPaymentSplit = useCallback(async () => {
    try {
      const split = await getCompanyPaymentSplit(companyId);
      setPaymentSplit(split);
    } catch (err) {
      console.error('Error loading payment split:', err);
    }
  }, [companyId, getCompanyPaymentSplit]);
  
  useEffect(() => {
    if (companyId) {
      loadPaymentSplit();
    }
  }, [companyId, loadPaymentSplit]);
  
  const createVirtualAccount = useCallback(async () => {
    if (!user || !towRequestId) {
      Alert.alert('Error', 'Informasi pembayaran tidak lengkap');
      return;
    }
    
    setProcessing(true);
    
    try {
      const externalId = `tow_${towRequestId}_${Date.now()}`;
      
      const va = await xenditService.createVirtualAccount({
        externalId,
        amount: paymentAmount,
        payerEmail: user.email,
        description: `Pembayaran Towing - ${towRequestId}`,
        bankCode: selectedBank,
      });
      
      console.log('Virtual Account created:', va);
      setVirtualAccount(va);
      
      // Save transaction to database
      const transaction = await processPayment({
        towRequestId,
        customerId: user.id,
        companyId,
        driverId,
        amount: paymentAmount,
        payerEmail: user.email,
        description: `Pembayaran layanan towing - ${towRequestId}`,
        paymentMethod: selectedMethod,
      });
      
      if (transaction) {
        setPaymentResult({ ...transaction, virtualAccount: va });
      }
      
    } catch (err) {
      console.error('Virtual Account creation error:', err);
      Alert.alert('Error', 'Gagal membuat Virtual Account. Silakan coba lagi.');
    } finally {
      setProcessing(false);
    }
  }, [user, towRequestId, companyId, driverId, paymentAmount, selectedBank, selectedMethod, processPayment]);
  
  const checkPaymentStatus = useCallback(async () => {
    if (!virtualAccount) return;
    
    setCheckingPayment(true);
    
    try {
      const payments = await xenditService.getVirtualAccountPayments(virtualAccount.id);
      console.log('VA Payments:', payments);
      
      if (payments && payments.length > 0) {
        const latestPayment = payments[0];
        if (latestPayment.status === 'COMPLETED') {
          // Update payment status
          if (paymentResult) {
            await updatePaymentStatus(paymentResult.id, 'completed');
            setPaymentResult((prev: any) => ({ ...prev, status: 'completed' }));
            
            Alert.alert(
              'Pembayaran Berhasil!',
              'Terima kasih! Pembayaran Anda telah berhasil diproses.',
              [
                {
                  text: 'OK',
                  onPress: () => router.replace('/orders'),
                },
              ]
            );
          }
        }
      }
    } catch (err) {
      console.error('Error checking payment status:', err);
    } finally {
      setCheckingPayment(false);
    }
  }, [virtualAccount, paymentResult, updatePaymentStatus, router]);
  
  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Tersalin!', `${label} telah disalin ke clipboard`);
  };
  
  const formatCurrency = (amount: number) => {
    return `IDR ${amount.toLocaleString()}`;
  };
  
  const calculateSplit = () => {
    if (!paymentSplit) return null;
    
    const companyAmount = Math.floor(paymentAmount * (paymentSplit.companyPercentage / 100));
    const platformAmount = paymentAmount - companyAmount;
    const driverAmount = driverId ? Math.floor(companyAmount * 0.8) : undefined;
    
    return {
      total: paymentAmount,
      companyAmount,
      platformAmount,
      driverAmount,
    };
  };
  
  const split = calculateSplit();
  
  const getPaymentStatusIcon = () => {
    if (!paymentResult) return null;
    
    switch (paymentResult.status) {
      case 'completed':
        return <CheckCircle size={24} color="#10B981" />;
      case 'failed':
        return <XCircle size={24} color="#EF4444" />;
      case 'pending':
      case 'processing':
      default:
        return <Clock size={24} color="#F59E0B" />;
    }
  };
  
  const getPaymentStatusText = () => {
    if (!paymentResult) return '';
    
    switch (paymentResult.status) {
      case 'completed':
        return 'Pembayaran Berhasil';
      case 'failed':
        return 'Pembayaran Gagal';
      case 'pending':
        return 'Menunggu Pembayaran';
      case 'processing':
        return 'Memproses Pembayaran';
      default:
        return 'Status Tidak Diketahui';
    }
  };
  
  if (paymentResult) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen 
          options={{ 
            title: 'Status Pembayaran',
            headerLeft: () => null,
          }} 
        />
        
        <View style={styles.resultContainer}>
          <View style={styles.resultIcon}>
            {getPaymentStatusIcon()}
          </View>
          
          <Text style={[styles.resultTitle, { color: theme.textDark }]}>
            {getPaymentStatusText()}
          </Text>
          
          <Text style={[styles.resultAmount, { color: theme.primary }]}>
            {formatCurrency(paymentAmount)}
          </Text>
          
          <Card style={[styles.resultCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.resultLabel, { color: theme.textLight }]}>Transaction ID</Text>
            <Text style={[styles.resultValue, { color: theme.textDark }]}>{paymentResult.id}</Text>
            
            <Text style={[styles.resultLabel, { color: theme.textLight }]}>Metode Pembayaran</Text>
            <Text style={[styles.resultValue, { color: theme.textDark }]}>
              {paymentMethods.find(m => m.id === selectedMethod)?.name}
            </Text>
            
            <Text style={[styles.resultLabel, { color: theme.textLight }]}>Waktu</Text>
            <Text style={[styles.resultValue, { color: theme.textDark }]}>
              {new Date(paymentResult.createdAt).toLocaleString('id-ID')}
            </Text>
          </Card>
          
          {paymentResult.status === 'pending' && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.processingText, { color: theme.textLight }]}>
                Memproses pembayaran...
              </Text>
            </View>
          )}
          
          {paymentResult.status === 'completed' && (
            <Button
              title="Kembali ke Pesanan"
              onPress={() => router.replace('/orders')}
              style={styles.backButton}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen 
        options={{ 
          title: 'Pembayaran',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft size={24} color={theme.textDark} />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Payment Summary */}
        <Card style={[styles.summaryCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Ringkasan Pembayaran</Text>
          
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.textLight }]}>Layanan Towing</Text>
            <Text style={[styles.summaryValue, { color: theme.textDark }]}>
              {formatCurrency(paymentAmount)}
            </Text>
          </View>
          
          {split && (
            <>
              <View style={styles.divider} />
              <Text style={[styles.splitTitle, { color: theme.textLight }]}>Pembagian Pembayaran:</Text>
              
              <View style={styles.splitRow}>
                <Text style={[styles.splitLabel, { color: theme.textLight }]}>Perusahaan Towing</Text>
                <Text style={[styles.splitValue, { color: theme.textDark }]}>
                  {formatCurrency(split.companyAmount)} ({paymentSplit.companyPercentage}%)
                </Text>
              </View>
              
              {split.driverAmount && (
                <View style={styles.splitRow}>
                  <Text style={[styles.splitLabel, { color: theme.textLight }]}>Driver</Text>
                  <Text style={[styles.splitValue, { color: theme.textDark }]}>
                    {formatCurrency(split.driverAmount)} (80% dari perusahaan)
                  </Text>
                </View>
              )}
              
              <View style={styles.splitRow}>
                <Text style={[styles.splitLabel, { color: theme.textLight }]}>Platform Fee</Text>
                <Text style={[styles.splitValue, { color: theme.textDark }]}>
                  {formatCurrency(split.platformAmount)} ({paymentSplit.platformPercentage}%)
                </Text>
              </View>
            </>
          )}
          
          <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.totalLabel, { color: theme.textDark }]}>Total Pembayaran</Text>
            <Text style={[styles.totalValue, { color: theme.primary }]}>
              {formatCurrency(paymentAmount)}
            </Text>
          </View>
        </Card>
        
        {!virtualAccount && (
          <>
            {/* Payment Methods */}
            <Card style={[styles.methodCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Pilih Metode Pembayaran</Text>
              
              {paymentMethods.map((method) => {
                const IconComponent = method.icon;
                const isSelected = selectedMethod === method.id;
                
                return (
                  <TouchableOpacity
                    key={method.id}
                    style={[
                      styles.methodOption,
                      isSelected && styles.methodOptionSelected,
                      !method.available && styles.methodOptionDisabled,
                      { borderColor: isSelected ? theme.primary : theme.border }
                    ]}
                    onPress={() => method.available && setSelectedMethod(method.id)}
                    disabled={!method.available}
                  >
                    <View style={styles.methodIcon}>
                      <IconComponent 
                        size={24} 
                        color={method.available ? (isSelected ? theme.primary : theme.textLight) : '#CCCCCC'} 
                      />
                    </View>
                    
                    <View style={styles.methodInfo}>
                      <Text style={[
                        styles.methodName,
                        { color: method.available ? theme.textDark : '#CCCCCC' }
                      ]}>
                        {method.name}
                      </Text>
                      <Text style={[
                        styles.methodDescription,
                        { color: method.available ? theme.textLight : '#CCCCCC' }
                      ]}>
                        {method.description}
                      </Text>
                    </View>
                    
                    {!method.available && (
                      <Text style={styles.unavailableText}>Segera Hadir</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </Card>
            
            {/* Bank Selection for Virtual Account */}
            {selectedMethod === 'bank_transfer' && (
              <Card style={[styles.bankCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Pilih Bank</Text>
                
                {bankOptions.map((bank) => {
                  const isSelected = selectedBank === bank.code;
                  
                  return (
                    <TouchableOpacity
                      key={bank.code}
                      style={[
                        styles.bankOption,
                        isSelected && styles.bankOptionSelected,
                        !bank.available && styles.bankOptionDisabled,
                        { borderColor: isSelected ? theme.primary : theme.border }
                      ]}
                      onPress={() => bank.available && setSelectedBank(bank.code)}
                      disabled={!bank.available}
                    >
                      <View style={styles.bankInfo}>
                        <Text style={[
                          styles.bankName,
                          { color: bank.available ? theme.textDark : '#CCCCCC' }
                        ]}>
                          {bank.name}
                        </Text>
                      </View>
                      
                      {isSelected && (
                        <CheckCircle size={20} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </Card>
            )}
          </>
        )}
        
        {/* Virtual Account Details */}
        {virtualAccount && (
          <Card style={[styles.vaCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Virtual Account</Text>
            
            <View style={styles.vaHeader}>
              <Text style={[styles.vaBank, { color: theme.primary }]}>
                {bankOptions.find(b => b.code === selectedBank)?.name}
              </Text>
              <TouchableOpacity 
                onPress={checkPaymentStatus}
                disabled={checkingPayment}
                style={styles.refreshButton}
              >
                <RefreshCw 
                  size={20} 
                  color={theme.primary} 
                  style={checkingPayment ? { opacity: 0.5 } : {}}
                />
              </TouchableOpacity>
            </View>
            
            <View style={styles.vaDetails}>
              <View style={styles.vaRow}>
                <Text style={[styles.vaLabel, { color: theme.textLight }]}>Nomor Virtual Account</Text>
                <TouchableOpacity 
                  style={styles.copyButton}
                  onPress={() => copyToClipboard(virtualAccount.account_number, 'Nomor Virtual Account')}
                >
                  <Text style={[styles.vaValue, { color: theme.textDark }]}>
                    {virtualAccount.account_number}
                  </Text>
                  <Copy size={16} color={theme.primary} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.vaRow}>
                <Text style={[styles.vaLabel, { color: theme.textLight }]}>Jumlah Transfer</Text>
                <TouchableOpacity 
                  style={styles.copyButton}
                  onPress={() => copyToClipboard(paymentAmount.toString(), 'Jumlah Transfer')}
                >
                  <Text style={[styles.vaAmount, { color: theme.primary }]}>
                    {formatCurrency(paymentAmount)}
                  </Text>
                  <Copy size={16} color={theme.primary} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.vaRow}>
                <Text style={[styles.vaLabel, { color: theme.textLight }]}>Berlaku Hingga</Text>
                <Text style={[styles.vaExpiry, { color: theme.textDark }]}>
                  {new Date(virtualAccount.expiration_date).toLocaleString('id-ID')}
                </Text>
              </View>
            </View>
            
            <View style={[styles.vaInstructions, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.instructionTitle, { color: '#92400E' }]}>Cara Pembayaran:</Text>
              <Text style={[styles.instructionText, { color: '#92400E' }]}>1. Buka aplikasi mobile banking atau ATM</Text>
              <Text style={[styles.instructionText, { color: '#92400E' }]}>2. Pilih menu Transfer ke Virtual Account</Text>
              <Text style={[styles.instructionText, { color: '#92400E' }]}>3. Masukkan nomor Virtual Account di atas</Text>
              <Text style={[styles.instructionText, { color: '#92400E' }]}>4. Masukkan jumlah transfer yang tepat</Text>
              <Text style={[styles.instructionText, { color: '#92400E' }]}>5. Konfirmasi dan selesaikan pembayaran</Text>
            </View>
            
            {checkingPayment && (
              <View style={styles.checkingContainer}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.checkingText, { color: theme.textLight }]}>
                  Mengecek status pembayaran...
                </Text>
              </View>
            )}
          </Card>
        )}
        
        {error && (
          <Card style={[styles.errorCard, { backgroundColor: '#FEF2F2' }]}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        )}
        
        {/* Info */}
        <Card style={[styles.infoCard, { backgroundColor: '#EFF6FF' }]}>
          <Text style={[styles.infoTitle, { color: '#1E40AF' }]}>Informasi Pembayaran</Text>
          <Text style={[styles.infoText, { color: '#1E40AF' }]}>
            • Pembayaran akan diproses secara otomatis melalui Xendit
          </Text>
          <Text style={[styles.infoText, { color: '#1E40AF' }]}>
            • Dana akan langsung diteruskan ke perusahaan towing
          </Text>
          <Text style={[styles.infoText, { color: '#1E40AF' }]}>
            • Anda akan menerima konfirmasi pembayaran via email
          </Text>
        </Card>
      </ScrollView>
      
      {/* Action Button */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        {!virtualAccount ? (
          <Button
            title={`Buat Virtual Account - ${formatCurrency(paymentAmount)}`}
            onPress={createVirtualAccount}
            loading={processing || loading}
            disabled={selectedMethod === 'bank_transfer' && !selectedBank}
            size="large"
          />
        ) : (
          <View style={styles.footerActions}>
            <Button
              title="Cek Status Pembayaran"
              onPress={checkPaymentStatus}
              loading={checkingPayment}
              variant="outline"
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button
              title="Selesai"
              onPress={() => router.replace('/orders')}
              style={{ flex: 1, marginLeft: 8 }}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  summaryCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  splitTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  splitLabel: {
    fontSize: 14,
  },
  splitValue: {
    fontSize: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  methodCard: {
    marginBottom: 16,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 2,
    borderRadius: 12,
    marginBottom: 12,
  },
  methodOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  methodOptionDisabled: {
    opacity: 0.5,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  methodDescription: {
    fontSize: 14,
  },
  unavailableText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  errorCard: {
    marginBottom: 16,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  infoCard: {
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    marginBottom: 4,
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  resultIcon: {
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  resultAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  resultCard: {
    width: '100%',
    marginBottom: 24,
  },
  resultLabel: {
    fontSize: 14,
    marginBottom: 4,
    marginTop: 12,
  },
  resultValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  processingText: {
    fontSize: 16,
  },
  bankCard: {
    marginBottom: 16,
  },
  bankOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  bankOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  bankOptionDisabled: {
    opacity: 0.5,
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '500',
  },
  vaCard: {
    marginBottom: 16,
  },
  vaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  vaBank: {
    fontSize: 18,
    fontWeight: '600',
  },
  refreshButton: {
    padding: 8,
  },
  vaDetails: {
    marginBottom: 16,
  },
  vaRow: {
    marginBottom: 12,
  },
  vaLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  vaValue: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  vaAmount: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  vaExpiry: {
    fontSize: 16,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vaInstructions: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    marginBottom: 4,
    lineHeight: 20,
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  checkingText: {
    fontSize: 14,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});