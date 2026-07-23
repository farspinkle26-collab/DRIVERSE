import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePaymentStore } from '@/hooks/usePaymentStore';
import { useAuth } from '@/hooks/useAuthStore';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import { CheckCircle, XCircle, Clock, DollarSign, Building2, CreditCard } from 'lucide-react-native';

interface PaymentSetupScreenProps {
  companyId: string;
  companyName: string;
  companyEmail: string;
}

export default function PaymentSetupScreen({
  companyId,
  companyName,
  companyEmail,
}: PaymentSetupScreenProps) {
  const { user } = useAuth();
  const {
    loading,
    error,
    setupCompanyPayments,
    getCompanyPaymentSplit,
    processPayment,
    getTransactionHistory,
    transactions,
  } = usePaymentStore();

  const [paymentSetupComplete, setPaymentSetupComplete] = useState<boolean>(false);
  const [companyPercentage, setCompanyPercentage] = useState<string>('90');
  const [platformPercentage, setPlatformPercentage] = useState<string>('10');
  const [testAmount, setTestAmount] = useState<string>('100000');
  const [testEmail, setTestEmail] = useState<string>('customer@example.com');

  useEffect(() => {
    checkPaymentSetup();
    loadTransactionHistory();
  }, [companyId]);

  const checkPaymentSetup = async () => {
    try {
      const paymentSplit = await getCompanyPaymentSplit(companyId);
      setPaymentSetupComplete(!!paymentSplit);
      
      if (paymentSplit) {
        setCompanyPercentage(paymentSplit.companyPercentage.toString());
        setPlatformPercentage(paymentSplit.platformPercentage.toString());
      }
    } catch (err) {
      console.error('Error checking payment setup:', err);
    }
  };

  const loadTransactionHistory = async () => {
    try {
      await getTransactionHistory({ companyId, limit: 10 });
    } catch (err) {
      console.error('Error loading transaction history:', err);
    }
  };

  const handleSetupPayments = async () => {
    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    const companyPerc = parseInt(companyPercentage);
    const platformPerc = parseInt(platformPercentage);

    if (companyPerc + platformPerc !== 100) {
      Alert.alert('Error', 'Company and platform percentages must add up to 100%');
      return;
    }

    try {
      const success = await setupCompanyPayments({
        companyId,
        email: companyEmail,
        businessName: companyName,
        country: 'ID',
        companyPercentage: companyPerc,
        platformPercentage: platformPerc,
      });

      if (success) {
        setPaymentSetupComplete(true);
        Alert.alert(
          'Success',
          'Payment system has been set up successfully!'
        );
      } else {
        Alert.alert('Error', error || 'Failed to setup payment system');
      }
    } catch (err) {
      console.error('Error setting up payments:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleTestPayment = async () => {
    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    const amount = parseInt(testAmount);
    if (amount < 10000) {
      Alert.alert('Error', 'Minimum test amount is IDR 10,000');
      return;
    }

    try {
      const transaction = await processPayment({
        towRequestId: `test_${Date.now()}`,
        customerId: user.id,
        companyId,
        amount,
        payerEmail: testEmail,
        description: `Test payment for ${companyName}`,
        paymentMethod: 'bank_transfer',
      });

      if (transaction) {
        Alert.alert(
          'Test Payment Created',
          `Payment of IDR ${amount.toLocaleString()} has been created successfully. Transaction ID: ${transaction.id}`
        );
        await loadTransactionHistory();
      } else {
        Alert.alert('Error', error || 'Failed to create test payment');
      }
    } catch (err) {
      console.error('Error creating test payment:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={20} color="#10B981" />;
      case 'failed':
        return <XCircle size={20} color="#EF4444" />;
      case 'pending':
      case 'processing':
      default:
        return <Clock size={20} color="#F59E0B" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return `IDR ${amount.toLocaleString()}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Building2 size={32} color="#3B82F6" />
          <Text style={styles.title}>Payment Integration</Text>
          <Text style={styles.subtitle}>
            Setup automatic payment splitting for {companyName}
          </Text>
        </View>

        {error && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        )}

        <Card style={styles.setupCard}>
          <View style={styles.cardHeader}>
            <CreditCard size={24} color="#3B82F6" />
            <Text style={styles.cardTitle}>Payment Setup</Text>
            {paymentSetupComplete && (
              <CheckCircle size={24} color="#10B981" />
            )}
          </View>

          {!paymentSetupComplete ? (
            <View style={styles.setupForm}>
              <Text style={styles.sectionTitle}>Revenue Split Configuration</Text>
              <Text style={styles.description}>
                Configure how payments will be split between your company and the Towing Online platform.
              </Text>

              <View style={styles.splitContainer}>
                <View style={styles.splitItem}>
                  <Text style={styles.splitLabel}>Company Share (%)</Text>
                  <Input
                    value={companyPercentage}
                    onChangeText={setCompanyPercentage}
                    placeholder="90"
                    keyboardType="numeric"
                    style={styles.splitInput}
                  />
                </View>
                <View style={styles.splitItem}>
                  <Text style={styles.splitLabel}>Platform Share (%)</Text>
                  <Input
                    value={platformPercentage}
                    onChangeText={setPlatformPercentage}
                    placeholder="10"
                    keyboardType="numeric"
                    style={styles.splitInput}
                  />
                </View>
              </View>

              <Button
                title="Setup Payment System"
                onPress={handleSetupPayments}
                loading={loading}
                style={styles.setupButton}
              />
            </View>
          ) : (
            <View style={styles.setupComplete}>
              <Text style={styles.successText}>
                ✅ Payment system is configured and ready!
              </Text>
              <View style={styles.splitSummary}>
                <Text style={styles.splitSummaryText}>
                  Company receives: {companyPercentage}% of each payment
                </Text>
                <Text style={styles.splitSummaryText}>
                  Platform fee: {platformPercentage}% of each payment
                </Text>
              </View>
            </View>
          )}
        </Card>

        {paymentSetupComplete && (
          <Card style={styles.testCard}>
            <View style={styles.cardHeader}>
              <DollarSign size={24} color="#10B981" />
              <Text style={styles.cardTitle}>Test Payment</Text>
            </View>

            <View style={styles.testForm}>
              <Text style={styles.description}>
                Create a test payment to verify the integration is working correctly.
              </Text>

              <Input
                label="Test Amount (IDR)"
                value={testAmount}
                onChangeText={setTestAmount}
                placeholder="100000"
                keyboardType="numeric"
              />

              <Input
                label="Customer Email"
                value={testEmail}
                onChangeText={setTestEmail}
                placeholder="customer@example.com"
                keyboardType="email-address"
              />

              <Button
                title="Create Test Payment"
                onPress={handleTestPayment}
                loading={loading}
                style={styles.testButton}
              />
            </View>
          </Card>
        )}

        {transactions.length > 0 && (
          <Card style={styles.historyCard}>
            <Text style={styles.cardTitle}>Recent Transactions</Text>
            
            {transactions.slice(0, 5).map((transaction) => (
              <View key={transaction.id} style={styles.transactionItem}>
                <View style={styles.transactionHeader}>
                  <View style={styles.transactionStatus}>
                    {getStatusIcon(transaction.status)}
                    <Text style={styles.transactionId}>
                      {transaction.id.substring(0, 8)}...
                    </Text>
                  </View>
                  <Text style={styles.transactionAmount}>
                    {formatCurrency(transaction.amount)}
                  </Text>
                </View>
                
                <View style={styles.transactionDetails}>
                  <Text style={styles.transactionDate}>
                    {formatDate(transaction.createdAt)}
                  </Text>
                  <Text style={styles.transactionMethod}>
                    {transaction.paymentMethod.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
                
                <View style={styles.splitDetails}>
                  <Text style={styles.splitText}>
                    Company: {formatCurrency(transaction.splits.companyAmount)}
                  </Text>
                  <Text style={styles.splitText}>
                    Platform: {formatCurrency(transaction.splits.platformAmount)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How It Works</Text>
          <Text style={styles.infoText}>
            1. When customers pay for towing services, payments are automatically split
          </Text>
          <Text style={styles.infoText}>
            2. Your company receives the configured percentage directly
          </Text>
          <Text style={styles.infoText}>
            3. The platform fee is automatically deducted
          </Text>
          <Text style={styles.infoText}>
            4. All transactions are tracked and can be viewed in real-time
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  setupCard: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 8,
    flex: 1,
  },
  setupForm: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  splitContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  splitItem: {
    flex: 1,
  },
  splitLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  splitInput: {
    textAlign: 'center',
  },
  setupButton: {
    marginTop: 8,
  },
  setupComplete: {
    alignItems: 'center',
    gap: 12,
  },
  successText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '500',
  },
  splitSummary: {
    alignItems: 'center',
    gap: 4,
  },
  splitSummaryText: {
    fontSize: 14,
    color: '#6B7280',
  },
  testCard: {
    marginBottom: 16,
  },
  testForm: {
    gap: 16,
  },
  testButton: {
    marginTop: 8,
  },
  historyCard: {
    marginBottom: 16,
  },
  transactionItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 12,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  transactionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transactionId: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  transactionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  transactionDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  transactionMethod: {
    fontSize: 12,
    color: '#6B7280',
  },
  splitDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splitText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  infoCard: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    marginBottom: 8,
    lineHeight: 20,
  },
});
