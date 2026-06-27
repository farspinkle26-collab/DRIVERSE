import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeStore';
import { useWallet } from '@/hooks/useWalletStore';
import { TopUpMethod } from '@/types';
import { router } from 'expo-router';
import { ArrowLeft, CreditCard } from 'lucide-react-native';

const quickAmounts = [50000, 100000, 200000, 500000, 1000000, 2000000];

export default function TopUpScreen() {
  const { theme } = useTheme();
  const { topUpWallet, getTopUpMethods, formatCurrency, loading } = useWallet();
  const [selectedAmount, setSelectedAmount] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<TopUpMethod | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const topUpMethods = getTopUpMethods();

  const handleAmountSelect = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomAmount(numericText);
    setSelectedAmount(parseInt(numericText) || 0);
  };

  const getFinalAmount = () => {
    return customAmount ? parseInt(customAmount) || 0 : selectedAmount;
  };

  const getTotalAmount = () => {
    const amount = getFinalAmount();
    const fee = selectedMethod?.fee || 0;
    return amount + fee;
  };

  const isValidAmount = () => {
    const amount = getFinalAmount();
    if (!selectedMethod) return false;
    return amount >= selectedMethod.minAmount && amount <= selectedMethod.maxAmount;
  };

  const handleTopUp = async () => {
    if (!selectedMethod || !isValidAmount()) {
      Alert.alert('Error', 'Pilih metode pembayaran dan masukkan jumlah yang valid');
      return;
    }

    const amount = getFinalAmount();
    
    Alert.alert(
      'Konfirmasi Top Up',
      `Anda akan melakukan top up sebesar ${formatCurrency(amount)} dengan biaya admin ${formatCurrency(selectedMethod.fee)}.\n\nTotal: ${formatCurrency(getTotalAmount())}`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Lanjutkan',
          onPress: async () => {
            setIsProcessing(true);
            try {
              const success = await topUpWallet(amount, selectedMethod);
              if (success) {
                Alert.alert(
                  'Top Up Berhasil',
                  `Saldo Anda telah bertambah ${formatCurrency(amount)}`,
                  [{ text: 'OK', onPress: () => router.back() }]
                );
              } else {
                Alert.alert('Error', 'Top up gagal. Silakan coba lagi.');
              }
            } catch (error) {
              Alert.alert('Error', 'Terjadi kesalahan. Silakan coba lagi.');
            } finally {
              setIsProcessing(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={theme.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textDark }]}>Top Up Dompet</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Amount Selection */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            Pilih Jumlah
          </Text>
          
          <View style={styles.quickAmountGrid}>
            {quickAmounts.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.quickAmountButton,
                  { 
                    backgroundColor: selectedAmount === amount && !customAmount ? '#FF3B30' : theme.background,
                    borderColor: theme.border 
                  }
                ]}
                onPress={() => handleAmountSelect(amount)}
              >
                <Text
                  style={[
                    styles.quickAmountText,
                    { 
                      color: selectedAmount === amount && !customAmount ? '#FFFFFF' : theme.textDark 
                    }
                  ]}
                >
                  {formatCurrency(amount)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.customAmountContainer}>
            <Text style={[styles.customAmountLabel, { color: theme.textDark }]}>
              Atau masukkan jumlah lain:
            </Text>
            <TextInput
              style={[
                styles.customAmountInput,
                { 
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.textDark 
                }
              ]}
              placeholder="Masukkan jumlah"
              placeholderTextColor={theme.textLight}
              value={customAmount}
              onChangeText={handleCustomAmountChange}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Payment Methods */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
            Metode Pembayaran
          </Text>
          
          {topUpMethods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.methodItem,
                { 
                  backgroundColor: selectedMethod?.id === method.id ? '#FFF5F5' : theme.background,
                  borderColor: selectedMethod?.id === method.id ? '#FF3B30' : theme.border 
                }
              ]}
              onPress={() => setSelectedMethod(method)}
            >
              <View style={styles.methodLeft}>
                <View style={styles.methodIcon}>
                  <Text style={styles.methodEmoji}>{method.icon}</Text>
                </View>
                <View style={styles.methodDetails}>
                  <Text style={[styles.methodName, { color: theme.textDark }]}>
                    {method.name}
                  </Text>
                  <Text style={[styles.methodInfo, { color: theme.textLight }]}>
                    {method.processingTime} • Min: {formatCurrency(method.minAmount)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.methodRight}>
                {method.fee > 0 && (
                  <Text style={[styles.methodFee, { color: theme.textLight }]}>
                    +{formatCurrency(method.fee)}
                  </Text>
                )}
                <View
                  style={[
                    styles.radioButton,
                    { 
                      borderColor: selectedMethod?.id === method.id ? '#FF3B30' : theme.border,
                      backgroundColor: selectedMethod?.id === method.id ? '#FF3B30' : 'transparent'
                    }
                  ]}
                >
                  {selectedMethod?.id === method.id && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary */}
        {selectedMethod && getFinalAmount() > 0 && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.textDark }]}>
              Ringkasan
            </Text>
            
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textLight }]}>
                Jumlah Top Up
              </Text>
              <Text style={[styles.summaryValue, { color: theme.textDark }]}>
                {formatCurrency(getFinalAmount())}
              </Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textLight }]}>
                Biaya Admin
              </Text>
              <Text style={[styles.summaryValue, { color: theme.textDark }]}>
                {formatCurrency(selectedMethod.fee)}
              </Text>
            </View>
            
            <View style={[styles.summaryRow, styles.summaryTotal, { borderTopColor: theme.border }]}>
              <Text style={[styles.summaryTotalLabel, { color: theme.textDark }]}>
                Total Pembayaran
              </Text>
              <Text style={[styles.summaryTotalValue, { color: theme.textDark }]}>
                {formatCurrency(getTotalAmount())}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Button */}
      <View style={[styles.bottomContainer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.topUpButton,
            { 
              backgroundColor: isValidAmount() && !isProcessing ? '#FF3B30' : '#CCCCCC' 
            }
          ]}
          onPress={handleTopUp}
          disabled={!isValidAmount() || isProcessing || loading}
        >
          <CreditCard size={20} color="#FFFFFF" />
          <Text style={styles.topUpButtonText}>
            {isProcessing ? 'Memproses...' : 'Top Up Sekarang'}
          </Text>
        </TouchableOpacity>
      </View>
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
  section: {
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  quickAmountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  quickAmountButton: {
    width: '30%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  customAmountContainer: {
    marginTop: 8,
  },
  customAmountLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  customAmountInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  methodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  methodEmoji: {
    fontSize: 20,
  },
  methodDetails: {
    flex: 1,
  },
  methodName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  methodInfo: {
    fontSize: 12,
  },
  methodRight: {
    alignItems: 'flex-end',
  },
  methodFee: {
    fontSize: 12,
    marginBottom: 4,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  summaryTotal: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 16,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  topUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  topUpButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});