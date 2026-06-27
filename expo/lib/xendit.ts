import { XenditAccount, XenditSplitRule, XenditPayment } from '@/types';
import { Platform } from 'react-native';

const XENDIT_BASE_URL = 'https://api.xendit.co';
const XENDIT_SECRET_KEY = process.env.EXPO_PUBLIC_XENDIT_SECRET_KEY || '';
const PLATFORM_ACCOUNT_ID = process.env.EXPO_PUBLIC_XENDIT_PLATFORM_ACCOUNT_ID || '';

// Revenue sharing configuration
const PLATFORM_REVENUE_PERCENTAGE = parseInt(process.env.EXPO_PUBLIC_PLATFORM_REVENUE_PERCENTAGE || '15');
const DRIVER_REVENUE_PERCENTAGE = parseInt(process.env.EXPO_PUBLIC_DRIVER_REVENUE_PERCENTAGE || '75');
const COMPANY_REVENUE_PERCENTAGE = parseInt(process.env.EXPO_PUBLIC_COMPANY_REVENUE_PERCENTAGE || '10');

// Helper function to create base64 encoding for different platforms
const createBase64Auth = (key: string): string => {
  if (Platform.OS === 'web') {
    return btoa(key + ':');
  } else {
    // For React Native, we'll use a simple base64 implementation
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const str = key + ':';
    let result = '';
    let i = 0;
    
    while (i < str.length) {
      const a = str.charCodeAt(i++);
      const b = i < str.length ? str.charCodeAt(i++) : 0;
      const c = i < str.length ? str.charCodeAt(i++) : 0;
      
      const bitmap = (a << 16) | (b << 8) | c;
      
      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
      result += i - 1 < str.length ? chars.charAt(bitmap & 63) : '=';
    }
    
    return result;
  }
};

class XenditService {
  private getHeaders(forUserId?: string) {
    const headers: Record<string, string> = {
      'Authorization': `Basic ${createBase64Auth(XENDIT_SECRET_KEY)}`,
      'Content-Type': 'application/json',
    };
    
    if (forUserId) {
      headers['for-user-id'] = forUserId;
    }
    
    return headers;
  }

  async createSubAccount(companyData: {
    email: string;
    businessName: string;
    country?: string;
  }): Promise<XenditAccount> {
    console.log('Creating Xendit sub-account for:', companyData.businessName);
    
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const requestBody = {
        email: companyData.email,
        type: 'MANAGED',
        public_profile: {
          business_name: companyData.businessName,
        },
        country: companyData.country || 'ID',
      };
      
      console.log('Creating sub-account with data:', requestBody);
      
      const response = await fetch(`${XENDIT_BASE_URL}/accounts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Xendit response status:', response.status);
      console.log('Xendit response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        console.error('Xendit account creation failed:', error);
        throw new Error(`Failed to create Xendit account: ${error.message || error.error_code || response.statusText}`);
      }

      const account = JSON.parse(responseText);
      console.log('Xendit sub-account created successfully:', account.id);
      return account;
    } catch (error) {
      console.error('Error creating Xendit sub-account:', error);
      throw error;
    }
  }

  async createSplitRule({
    companyAccountId,
    companyPercentage = 90,
    platformPercentage = 10,
  }: {
    companyAccountId: string;
    companyPercentage?: number;
    platformPercentage?: number;
  }): Promise<XenditSplitRule> {
    console.log('Creating split rule for company account:', companyAccountId);
    
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    if (!PLATFORM_ACCOUNT_ID) {
      throw new Error('Platform account ID is not configured');
    }
    
    try {
      const requestBody = {
        split_rule_items: [
          {
            account_id: companyAccountId,
            percentage: companyPercentage,
          },
          {
            account_id: PLATFORM_ACCOUNT_ID,
            percentage: platformPercentage,
          },
        ],
      };
      
      console.log('Creating split rule with data:', requestBody);
      
      const response = await fetch(`${XENDIT_BASE_URL}/split_rules`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Split rule response status:', response.status);
      console.log('Split rule response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        console.error('Split rule creation failed:', error);
        throw new Error(`Failed to create split rule: ${error.message || error.error_code || response.statusText}`);
      }

      const splitRule = JSON.parse(responseText);
      console.log('Split rule created successfully:', splitRule.id);
      return splitRule;
    } catch (error) {
      console.error('Error creating split rule:', error);
      throw error;
    }
  }

  async createPayment({
    externalId,
    amount,
    payerEmail,
    description,
    splitRuleId,
    paymentMethod = 'BANK_TRANSFER',
  }: {
    externalId: string;
    amount: number;
    payerEmail: string;
    description: string;
    splitRuleId: string;
    paymentMethod?: string;
  }): Promise<XenditPayment> {
    console.log('Creating Xendit payment:', { externalId, amount, splitRuleId });
    
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const requestBody = {
        external_id: externalId,
        amount,
        payer_email: payerEmail,
        description,
        currency: 'IDR',
        payment_methods: [paymentMethod],
        // Only include split_rule_id if it's provided and not empty
        ...(splitRuleId && { split_rule_id: splitRuleId }),
        success_redirect_url: 'https://your-app.com/payment/success',
        failure_redirect_url: 'https://your-app.com/payment/failed',
      };
      
      console.log('Creating payment with data:', requestBody);
      
      const response = await fetch(`${XENDIT_BASE_URL}/v2/invoices`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Payment response status:', response.status);
      console.log('Payment response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        console.error('Payment creation failed:', error);
        throw new Error(`Failed to create payment: ${error.message || error.error_code || response.statusText}`);
      }

      const payment = JSON.parse(responseText);
      console.log('Payment created successfully:', payment.id);
      return payment;
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  }

  // Create Virtual Account specifically with fallback bank options
  async createVirtualAccount({
    externalId,
    amount,
    payerEmail,
    description,
    bankCode = 'BNI', // Default to BNI (more commonly activated)
  }: {
    externalId: string;
    amount: number;
    payerEmail: string;
    description: string;
    bankCode?: string;
  }): Promise<{
    id: string;
    external_id: string;
    bank_code: string;
    account_number: string;
    name: string;
    amount: number;
    currency: string;
    status: string;
    expiration_date: string;
    invoice_url?: string;
  }> {
    console.log('Creating Xendit Virtual Account:', { externalId, amount, bankCode });
    
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    // List of banks to try in order of preference
    const bankFallbacks = [bankCode, 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'BCA'];
    const uniqueBanks = [...new Set(bankFallbacks)];
    
    let lastError: any = null;
    
    for (const tryBankCode of uniqueBanks) {
      try {
        const requestBody = {
          external_id: externalId,
          bank_code: tryBankCode,
          name: description,
          expected_amount: amount,
          currency: 'IDR',
          is_closed: true, // Closed VA - exact amount required
          expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        };
        
        console.log(`Trying to create Virtual Account with ${tryBankCode}:`, requestBody);
        
        const response = await fetch(`${XENDIT_BASE_URL}/callback_virtual_accounts`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();
        console.log(`Virtual Account response for ${tryBankCode} - status:`, response.status);
        console.log(`Virtual Account response for ${tryBankCode}:`, responseText);

        if (response.ok) {
          const virtualAccount = JSON.parse(responseText);
          console.log(`Virtual Account created successfully with ${tryBankCode}:`, virtualAccount.id);
          return virtualAccount;
        } else {
          let error;
          try {
            error = JSON.parse(responseText);
          } catch {
            error = { message: responseText };
          }
          
          console.warn(`Failed to create VA with ${tryBankCode}:`, error.message || error.error_code);
          lastError = error;
          
          // If this bank is not activated, try the next one
          if (error.message && error.message.includes('not activated')) {
            continue;
          }
          
          // If it's a different error, don't try other banks
          break;
        }
      } catch (error) {
        console.warn(`Error trying ${tryBankCode}:`, error);
        lastError = error;
        continue;
      }
    }
    
    // If we get here, all banks failed
    console.error('All bank options failed for Virtual Account creation');
    const errorMessage = lastError?.message || lastError?.error_code || 'All available banks failed to create Virtual Account';
    throw new Error(`Failed to create Virtual Account: ${errorMessage}. Please contact support to activate virtual account services.`);
  }

  async getVirtualAccountStatus(vaId: string): Promise<{
    id: string;
    external_id: string;
    bank_code: string;
    account_number: string;
    name: string;
    amount: number;
    currency: string;
    status: string;
    expiration_date: string;
  }> {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const response = await fetch(`${XENDIT_BASE_URL}/callback_virtual_accounts/${vaId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const responseText = await response.text();
      console.log('Virtual Account status response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        throw new Error(`Failed to get Virtual Account status: ${error.message || error.error_code || response.statusText}`);
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error getting Virtual Account status:', error);
      throw error;
    }
  }

  async getPaymentStatus(paymentId: string): Promise<XenditPayment> {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const response = await fetch(`${XENDIT_BASE_URL}/v2/invoices/${paymentId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const responseText = await response.text();
      console.log('Payment status response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        throw new Error(`Failed to get payment status: ${error.message || error.error_code || response.statusText}`);
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error getting payment status:', error);
      throw error;
    }
  }

  // Get Virtual Account payment callbacks/transactions
  async getVirtualAccountPayments(vaId: string): Promise<any[]> {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const response = await fetch(`${XENDIT_BASE_URL}/callback_virtual_account_payments?virtual_account_id=${vaId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const responseText = await response.text();
      console.log('Virtual Account payments response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        throw new Error(`Failed to get Virtual Account payments: ${error.message || error.error_code || response.statusText}`);
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error getting Virtual Account payments:', error);
      throw error;
    }
  }

  async getAccountBalance(accountId: string): Promise<{ balance: number; currency: string }> {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const response = await fetch(`${XENDIT_BASE_URL}/balance?account_type=CASH&currency=IDR`, {
        method: 'GET',
        headers: this.getHeaders(accountId),
      });

      const responseText = await response.text();
      console.log('Balance response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        throw new Error(`Failed to get account balance: ${error.message || error.error_code || response.statusText}`);
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error getting account balance:', error);
      throw error;
    }
  }

  async createDisbursementRecipient({
    type,
    name,
    email,
    bankCode,
    accountNumber,
    accountHolderName,
  }: {
    type: 'INDIVIDUAL' | 'CORPORATION';
    name: string;
    email: string;
    bankCode?: string;
    accountNumber?: string;
    accountHolderName?: string;
  }) {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const requestBody = {
        type,
        individual_detail: type === 'INDIVIDUAL' ? {
          given_names: name,
        } : undefined,
        corporation_detail: type === 'CORPORATION' ? {
          party_name: name,
        } : undefined,
        kyc_documents: [],
        email,
      };
      
      console.log('Creating disbursement recipient with data:', requestBody);
      
      const response = await fetch(`${XENDIT_BASE_URL}/recipients`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Recipient response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        throw new Error(`Failed to create recipient: ${error.message || error.error_code || response.statusText}`);
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error creating disbursement recipient:', error);
      throw error;
    }
  }

  async createDisbursement({
    recipientId,
    externalId,
    amount,
    description,
    currency = 'IDR',
  }: {
    recipientId: string;
    externalId: string;
    amount: number;
    description: string;
    currency?: string;
  }) {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const requestBody = {
        reference_id: externalId,
        channel_code: 'ID_BANK_TRANSFER',
        channel_properties: {
          account_holder_name: 'Recipient Name', // This should come from recipient data
        },
        amount,
        currency,
        description,
        recipient_id: recipientId,
      };
      
      console.log('Creating disbursement with data:', requestBody);
      
      const response = await fetch(`${XENDIT_BASE_URL}/v2/disbursements`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Disbursement response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        throw new Error(`Failed to create disbursement: ${error.message || error.error_code || response.statusText}`);
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error creating disbursement:', error);
      throw error;
    }
  }

  async getDisbursementStatus(disbursementId: string) {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const response = await fetch(`${XENDIT_BASE_URL}/v2/disbursements/${disbursementId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const responseText = await response.text();
      console.log('Disbursement status response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        throw new Error(`Failed to get disbursement status: ${error.message || error.error_code || response.statusText}`);
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error getting disbursement status:', error);
      throw error;
    }
  }

  async disburseFunds({
    accountId,
    amount,
    bankCode,
    accountHolderName,
    accountNumber,
    description,
  }: {
    accountId: string;
    amount: number;
    bankCode: string;
    accountHolderName: string;
    accountNumber: string;
    description: string;
  }) {
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    try {
      const requestBody = {
        external_id: `disbursement_${Date.now()}`,
        amount,
        bank_code: bankCode,
        account_holder_name: accountHolderName,
        account_number: accountNumber,
        description,
      };
      
      console.log('Creating disbursement with data:', requestBody);
      
      const response = await fetch(`${XENDIT_BASE_URL}/disbursements`, {
        method: 'POST',
        headers: this.getHeaders(accountId),
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Disbursement response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        throw new Error(`Failed to disburse funds: ${error.message || error.error_code || response.statusText}`);
      }

      return JSON.parse(responseText);
    } catch (error) {
      console.error('Error disbursing funds:', error);
      throw error;
    }
  }
  
  // Helper method to validate configuration
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!XENDIT_SECRET_KEY) {
      errors.push('Xendit secret key is not configured');
    }
    
    if (!PLATFORM_ACCOUNT_ID) {
      errors.push('Platform account ID is not configured');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }
  
  // Create a comprehensive revenue sharing split rule
  async createRevenueShareSplitRule({
    companyAccountId,
    driverAccountId,
  }: {
    companyAccountId: string;
    driverAccountId?: string;
  }): Promise<XenditSplitRule> {
    console.log('Creating revenue sharing split rule');
    
    if (!XENDIT_SECRET_KEY) {
      throw new Error('Xendit secret key is not configured');
    }
    
    if (!PLATFORM_ACCOUNT_ID) {
      throw new Error('Platform account ID is not configured');
    }
    
    try {
      const splitRuleItems = [
        {
          account_id: PLATFORM_ACCOUNT_ID,
          percentage: PLATFORM_REVENUE_PERCENTAGE,
        },
        {
          account_id: companyAccountId,
          percentage: COMPANY_REVENUE_PERCENTAGE,
        },
      ];

      // If driver account is provided, add driver split
      if (driverAccountId) {
        splitRuleItems.push({
          account_id: driverAccountId,
          percentage: DRIVER_REVENUE_PERCENTAGE,
        });
      } else {
        // If no driver, company gets the driver's share too
        splitRuleItems[1].percentage = COMPANY_REVENUE_PERCENTAGE + DRIVER_REVENUE_PERCENTAGE;
      }
      
      const requestBody = {
        split_rule_items: splitRuleItems,
      };
      
      console.log('Creating revenue share split rule with data:', requestBody);
      
      const response = await fetch(`${XENDIT_BASE_URL}/split_rules`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log('Revenue share split rule response status:', response.status);
      console.log('Revenue share split rule response:', responseText);

      if (!response.ok) {
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          error = { message: responseText };
        }
        console.error('Revenue share split rule creation failed:', error);
        throw new Error(`Failed to create revenue share split rule: ${error.message || error.error_code || response.statusText}`);
      }

      const splitRule = JSON.parse(responseText);
      console.log('Revenue share split rule created successfully:', splitRule.id);
      return splitRule;
    } catch (error) {
      console.error('Error creating revenue share split rule:', error);
      throw error;
    }
  }

  // Create Virtual Account with automatic revenue sharing
  async createVirtualAccountWithRevenueSplit({
    externalId,
    amount,
    payerEmail,
    description,
    companyAccountId,
    driverAccountId,
    bankCode = 'BCA',
  }: {
    externalId: string;
    amount: number;
    payerEmail: string;
    description: string;
    companyAccountId: string;
    driverAccountId?: string;
    bankCode?: string;
  }): Promise<{
    virtualAccount: any;
    splitRule: XenditSplitRule;
    revenueBreakdown: {
      platformAmount: number;
      companyAmount: number;
      driverAmount: number;
      totalAmount: number;
    };
  }> {
    console.log('Creating Virtual Account with revenue sharing:', { externalId, amount });
    
    try {
      // Create split rule for revenue sharing
      const splitRule = await this.createRevenueShareSplitRule({
        companyAccountId,
        driverAccountId,
      });

      // Calculate revenue breakdown
      const platformAmount = Math.floor(amount * (PLATFORM_REVENUE_PERCENTAGE / 100));
      const driverAmount = driverAccountId ? Math.floor(amount * (DRIVER_REVENUE_PERCENTAGE / 100)) : 0;
      const companyAmount = amount - platformAmount - driverAmount;

      const revenueBreakdown = {
        platformAmount,
        companyAmount,
        driverAmount,
        totalAmount: amount,
      };

      console.log('Revenue breakdown:', revenueBreakdown);

      // Create virtual account
      const virtualAccount = await this.createVirtualAccount({
        externalId,
        amount,
        payerEmail,
        description,
        bankCode,
      });

      return {
        virtualAccount,
        splitRule,
        revenueBreakdown,
      };
    } catch (error) {
      console.error('Error creating Virtual Account with revenue split:', error);
      throw error;
    }
  }

  // Process payment with automatic revenue sharing
  async processPaymentWithRevenueSplit({
    externalId,
    amount,
    payerEmail,
    description,
    companyAccountId,
    driverAccountId,
    paymentMethod = 'BANK_TRANSFER',
  }: {
    externalId: string;
    amount: number;
    payerEmail: string;
    description: string;
    companyAccountId: string;
    driverAccountId?: string;
    paymentMethod?: string;
  }): Promise<{
    payment: XenditPayment;
    splitRule: XenditSplitRule;
    revenueBreakdown: {
      platformAmount: number;
      companyAmount: number;
      driverAmount: number;
      totalAmount: number;
    };
  }> {
    console.log('Processing payment with revenue sharing:', { externalId, amount });
    
    try {
      // Create split rule for revenue sharing
      const splitRule = await this.createRevenueShareSplitRule({
        companyAccountId,
        driverAccountId,
      });

      // Calculate revenue breakdown
      const platformAmount = Math.floor(amount * (PLATFORM_REVENUE_PERCENTAGE / 100));
      const driverAmount = driverAccountId ? Math.floor(amount * (DRIVER_REVENUE_PERCENTAGE / 100)) : 0;
      const companyAmount = amount - platformAmount - driverAmount;

      const revenueBreakdown = {
        platformAmount,
        companyAmount,
        driverAmount,
        totalAmount: amount,
      };

      console.log('Revenue breakdown:', revenueBreakdown);

      // Create payment with split rule
      const payment = await this.createPayment({
        externalId,
        amount,
        payerEmail,
        description,
        splitRuleId: splitRule.id,
        paymentMethod,
      });

      return {
        payment,
        splitRule,
        revenueBreakdown,
      };
    } catch (error) {
      console.error('Error processing payment with revenue split:', error);
      throw error;
    }
  }

  // Get revenue sharing configuration
  getRevenueConfig() {
    return {
      platformPercentage: PLATFORM_REVENUE_PERCENTAGE,
      driverPercentage: DRIVER_REVENUE_PERCENTAGE,
      companyPercentage: COMPANY_REVENUE_PERCENTAGE,
      platformAccountId: PLATFORM_ACCOUNT_ID,
    };
  }

  // Method to test the connection
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const validation = this.validateConfiguration();
      if (!validation.isValid) {
        return {
          success: false,
          message: `Configuration errors: ${validation.errors.join(', ')}`,
        };
      }
      
      // Test with a simple balance check
      const response = await fetch(`${XENDIT_BASE_URL}/balance?account_type=CASH&currency=IDR`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      
      if (response.ok) {
        return {
          success: true,
          message: 'Xendit connection successful',
        };
      } else {
        const errorText = await response.text();
        return {
          success: false,
          message: `Connection failed: ${response.status} - ${errorText}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

export const xenditService = new XenditService();
export default xenditService;