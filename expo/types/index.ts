export type UserRole = 'customer' | 'driver' | 'company';
export type AccountStatus = 'active' | 'pending_verification' | 'suspended' | 'rejected';
export type VerificationStatus = 'pending' | 'under_review' | 'verified' | 'rejected' | 'requires_documents';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  profilePicture?: string;
  accountStatus: AccountStatus;
  verificationStatus: VerificationStatus;
  canSwitchRoles: boolean; // Always false - roles are fixed once set
  registrationCompletedAt?: number;
  verifiedAt?: number;

}

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

export interface VehicleInfo {
  make: string;
  model: string;
  color: string;
  licensePlate: string;
  photos: string[]; // Array of URIs, minimum 1, maximum 3
}

export interface BreakdownInfo {
  type: 'engine_wont_start' | 'accident' | 'flat_tire' | 'stuck' | 'battery_dead' | 'overheating' | 'other';
  notes?: string;
}

export interface TowingType {
  id: string;
  name: string;
  price: string;
  description: string;
  detailedDescription: string;
  icon: string;
}

export interface ServiceType {
  id: string;
  name: string;
  baseFare: number;
  pricePerKm: number;
  baseDistance: number;
  isFixed: boolean;
  maxDistance?: number;
  dkiOnly?: boolean;
  specialPricing?: {
    jakarta_surabaya?: number;
    jakarta_medan?: number;
    jakarta_aceh?: number;
    event_special?: number;
  };
}

export interface TowRequest {
  id: string;
  customerId: string;
  driverId?: string;
  pickup: Location;
  dropoff: Location;
  vehicleInfo: VehicleInfo;
  breakdownInfo: BreakdownInfo;
  serviceType?: string; // Service type ID (hydraulic, ladder, accident, service)
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  distance: number; // in kilometers
  price: number; // in IDR
  createdAt: number; // timestamp
  completedAt?: number; // timestamp
  rating?: DriverRating;
  tip?: TipTransaction;
}

export interface Driver {
  id: string;
  userId: string;
  name: string;
  phone: string;
  vehicleType: string;
  licensePlate: string;
  rating: number;
  profilePicture?: string;
  location?: Location;
  isAvailable: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  documents?: DriverDocuments;
  companyId?: string; // For company-linked drivers
  isCompanyDriver: boolean;
  earnings?: {
    total: number;
    thisMonth: number;
    lastMonth: number;
  };
}

export interface DriverDocuments {
  ktp: {
    number: string;
    name: string;
    address: string;
    photo: string; // URI to KTP photo
  };
  sim: {
    number: string;
    expiryDate: string;
    photo: string; // URI to SIM photo
  };
  vehicle: {
    type: 'hydraulic' | 'ladder' | 'flatbed' | 'other';
    brand: string;
    model: string;
    year: string;
    licensePlate: string;
    photo: string; // URI to vehicle photo
  };
  company: {
    name: string;
    type: 'company' | 'independent' | 'join_company';
    registrationNumber?: string; // For companies
    address?: string;
  };
}

export interface DriverRegistration {
  personalInfo: {
    name: string;
    phone: string;
    email: string;
  };
  documents: DriverDocuments;
  agreedToTerms: boolean;
  submittedAt: number;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
  read: boolean;
}

// Supabase Chat Message Types
export interface ChatMessage {
  id: string;
  tow_request_id: string;
  sender_id: string;
  receiver_id: string;
  message_type: 'text' | 'location' | 'system' | 'image' | 'status_update';
  content: string;
  metadata?: {
    latitude?: number;
    longitude?: number;
    image_url?: string;
    status_change?: {
      from: string;
      to: string;
    };
  };
  is_read: boolean;
  read_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatConversation {
  tow_request_id: string;
  customer_id: string;
  driver_id: string;
  request_status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  service_type: string;
  pickup_location: Location;
  dropoff_location: Location;
  vehicle_info: VehicleInfo;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface SupabaseTowRequest {
  id: string;
  customer_id: string;
  driver_id?: string;
  company_id?: string;
  pickup_location: Location;
  dropoff_location: Location;
  vehicle_info: VehicleInfo;
  breakdown_info: BreakdownInfo;
  service_type: 'hydraulic' | 'ladder' | 'accident' | 'service' | 'double_deck';
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  distance_km: number;
  price_idr: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_transaction_id?: string;
  driver_location?: Location;
  estimated_arrival?: string;
  accepted_at?: string;
  started_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  rating?: number;
  review?: string;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'top_up' | 'payment' | 'refund' | 'withdrawal';
  amount: number; // in IDR
  description: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  paymentMethod?: 'bank_transfer' | 'credit_card' | 'e_wallet' | 'cash';
  referenceId?: string; // For linking to tow requests or other transactions
}

export interface Wallet {
  id: string;
  userId: string;
  balance: number; // in IDR
  currency: 'IDR';
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TopUpMethod {
  id: string;
  name: string;
  type: 'bank_transfer' | 'credit_card' | 'e_wallet';
  icon: string;
  minAmount: number;
  maxAmount: number;
  fee: number; // in IDR
  processingTime: string; // e.g., "Instant", "1-3 minutes", etc.
  isActive: boolean;
}

export interface Company {
  id: string;
  name: string;
  businessLicense: string; // Document URI
  taxId: string; // NPWP
  email: string;
  phone: string;
  address?: string;
  ownerId: string; // User ID of company owner
  verificationStatus: 'pending' | 'verified' | 'rejected';
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  totalRevenue: number;
  monthlyRevenue: number;
  driverCount: number;
}

export interface VehicleFleet {
  id: string;
  type: 'flatbed' | 'hook_chain' | 'wheel_lift' | 'heavy_duty' | 'motorcycle_carrier' | 'integrated' | 'other';
  brand: string;
  model: string;
  year: string;
  licensePlate: string;
  capacity: string; // e.g., "3 tons", "5 tons"
  photos: string[]; // Vehicle photos
  registrationDocument: string; // STNK photo
  insuranceDocument: string; // Insurance certificate
  isActive: boolean;
}

export interface CompanyService {
  id: string;
  name: string;
  description: string;
  isOffered: boolean;
  pricing?: {
    basePrice: number;
    pricePerKm: number;
    minimumCharge: number;
  };
}

export interface CompanyBankInfo {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  branchName?: string;
  swiftCode?: string;
}

export interface CompanyPricing {
  model: 'per_km' | 'per_trip' | 'hourly' | 'custom';
  baseRate: number;
  perKmRate?: number;
  minimumFee: number;
  emergencyMultiplier: number; // e.g., 1.5 for 50% extra
  nightTimeMultiplier: number; // e.g., 1.2 for 20% extra
  holidayMultiplier: number;
  insurancePartnerDiscount: number; // percentage discount
}

export interface CompanyOperations {
  serviceAreas: string[]; // Cities/regions covered
  operatingHours: {
    is24x7: boolean;
    weekdayStart?: string; // "08:00"
    weekdayEnd?: string; // "18:00"
    weekendStart?: string;
    weekendEnd?: string;
  };
  emergencyHotline: string;
  responseTime: {
    urban: number; // minutes
    suburban: number;
    rural: number;
  };
  hasGPSTracking: boolean;
  hasFleetManagement: boolean;
  fleetManagementSoftware?: string;
}

export interface CompanyRegistration {
  // Step 1: Company Information
  companyInfo: {
    name: string;
    businessRegistrationNumber: string; // NIB/SIUP number
    taxId: string; // NPWP
    email: string;
    phone: string;
    address: {
      street: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
    website?: string;
    establishedYear: string;
    employeeCount: string; // "1-10", "11-50", "51-100", "100+"
  };
  
  // Step 2: Contact Person
  contactPerson: {
    fullName: string;
    position: string; // "Owner", "Manager", "Director", etc.
    phone: string;
    email: string;
    idNumber: string; // KTP number
  };
  
  // Step 3: Legal Documents
  documents: {
    businessLicense: string; // SIUP/NIB document
    companyRegistration: string; // Akta Pendirian
    taxCertificate: string; // NPWP document
    insuranceCertificate?: string; // Company insurance
    operatingPermit?: string; // Izin Operasional Transportasi
    contactPersonId: string; // KTP of contact person
  };
  
  // Step 4: Fleet Information
  fleet: {
    totalVehicles: number;
    vehicles: VehicleFleet[];
    maintenanceSchedule: 'weekly' | 'monthly' | 'quarterly';
    hasInsurance: boolean;
    insuranceProvider?: string;
  };
  
  // Step 5: Driver Information
  drivers: {
    totalDrivers: number;
    fullTimeDrivers: number;
    partTimeDrivers: number;
    freelanceDrivers: number;
    driverTrainingProgram: boolean;
    driverCertificationRequired: boolean;
  };
  
  // Step 6: Services Offered
  services: CompanyService[];
  
  // Step 7: Pricing & Payment
  pricing: CompanyPricing;
  paymentMethods: {
    acceptsCash: boolean;
    acceptsCard: boolean;
    acceptsEWallet: boolean;
    acceptsBankTransfer: boolean;
    preferredEWallets: string[]; // ["gopay", "ovo", "dana"]
  };
  
  // Step 8: Operations
  operations: CompanyOperations;
  
  // Step 9: Banking Information
  bankInfo: CompanyBankInfo;
  
  // Step 10: Technology Integration
  technology: {
    hasDriverApp: boolean;
    driverAppName?: string;
    hasCustomerApp: boolean;
    customerAppName?: string;
    integratesWithTowingOnline: boolean;
    apiIntegrationCapable: boolean;
    gpsTrackingProvider?: string;
  };
  
  // Step 11: Business References
  references: {
    insurancePartners: string[]; // Insurance company names
    corporateClients: string[]; // Major corporate clients
    governmentContracts: boolean;
    previousExperience: string; // Years of experience
  };
  
  // Step 12: Agreement & Submission
  agreements: {
    agreedToTerms: boolean;
    agreedToDataProcessing: boolean;
    agreedToQualityStandards: boolean;
    agreedToCommissionStructure: boolean;
    signedMOU: boolean;
  };
  
  // Metadata
  submittedAt: number;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'requires_revision';
  rejectionReason?: string;
  revisionNotes?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  approvedAt?: number;
  ownerId: string;
}

export interface CompanyDriver {
  id: string;
  driverId: string;
  companyId: string;
  joinedAt: number;
  isActive: boolean;
  permissions: {
    canAcceptRequests: boolean;
    canViewEarnings: boolean;
  };
  payoutSettings: {
    percentage: number; // Driver's percentage of earnings
    payoutSchedule: 'weekly' | 'monthly';
  };
}

export interface CompanyReport {
  id: string;
  companyId: string;
  period: {
    start: number;
    end: number;
    type: 'daily' | 'weekly' | 'monthly';
  };
  metrics: {
    totalJobs: number;
    completedJobs: number;
    totalRevenue: number;
    driverPayouts: number;
    companyProfit: number;
    averageJobValue: number;
  };
  driverBreakdown: {
    driverId: string;
    driverName: string;
    jobsCompleted: number;
    revenue: number;
    payout: number;
  }[];
  generatedAt: number;
}

// Xendit Payment Integration Types
export interface XenditAccount {
  id: string;
  created: string;
  updated: string;
  email: string;
  type: 'OWNED' | 'MANAGED';
  public_profile: {
    business_name: string;
  };
  country: string;
  status: 'INVITED' | 'REGISTERED' | 'LIVE' | 'UNDER_REVIEW';
}

export interface XenditSplitRule {
  id: string;
  created: string;
  updated: string;
  split_rule_items: {
    account_id: string;
    amount?: number;
    percentage?: number;
    flat_amount?: number;
  }[];
  status: 'ACTIVE' | 'INACTIVE';
}

export interface XenditPayment {
  id: string;
  external_id: string;
  user_id: string;
  payment_method: string;
  status: 'PENDING' | 'PAID' | 'SETTLED' | 'EXPIRED' | 'FAILED';
  merchant_name: string;
  amount: number;
  paid_amount?: number;
  bank_code?: string;
  paid_at?: string;
  payer_email?: string;
  description?: string;
  adjusted_received_amount?: number;
  fees_paid_amount?: number;
  updated: string;
  created: string;
  currency: string;
  payment_channel: string;
  payment_destination?: string;
  split_rule_id?: string;
}

export interface PaymentSplit {
  companyId: string;
  companyAccountId: string;
  platformAccountId: string;
  splitRuleId: string;
  companyPercentage: number;
  platformPercentage: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentTransaction {
  id: string;
  towRequestId: string;
  customerId: string;
  companyId: string;
  driverId?: string;
  amount: number;
  currency: 'IDR';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  paymentMethod: 'bank_transfer' | 'e_wallet' | 'credit_card' | 'qr_code';
  xenditPaymentId?: string;
  splitRuleId?: string;
  splits: {
    companyAmount: number;
    platformAmount: number;
    driverAmount?: number;
  };
  fees: {
    xenditFee: number;
    platformFee: number;
  };
  distributionDetails?: {
    distributedAt: number;
    driverPaid: number;
    platformPaid: number;
    xenditFeeDeducted: number;
  };
  createdAt: number;
  completedAt?: number;
  failureReason?: string;
}

// Payout System Types
export type PayoutAccountType = 'bank' | 'e_wallet';

export type BankProvider = 
  | 'BCA' | 'BNI' | 'BRI' | 'MANDIRI' | 'CIMB' | 'DANAMON' | 'PERMATA' 
  | 'MAYBANK' | 'OCBC' | 'PANIN' | 'BTN' | 'BSI' | 'MUAMALAT' | 'OTHER';

export type EWalletProvider = 
  | 'GOPAY' | 'OVO' | 'DANA' | 'LINKAJA' | 'SHOPEEPAY' | 'JENIUS' | 'OTHER';

export interface PayoutDetails {
  id: string;
  userId: string;
  userType: 'driver' | 'company';
  accountType: PayoutAccountType;
  
  // Bank account details
  bankProvider?: BankProvider;
  bankAccountNumber?: string;
  bankAccountHolderName?: string;
  bankBranchName?: string;
  
  // E-wallet details
  ewalletProvider?: EWalletProvider;
  ewalletAccountNumber?: string; // Phone number or account ID
  ewalletAccountHolderName?: string;
  
  // Common fields
  email: string; // For payout confirmation
  isVerified: boolean;
  isActive: boolean;
  
  // Verification details
  verificationStatus: 'pending' | 'verified' | 'failed' | 'requires_update';
  verificationFailureReason?: string;
  lastVerificationAttempt?: number;
  
  // Xendit disbursement details
  xenditRecipientId?: string; // Xendit recipient ID for disbursements
  
  createdAt: number;
  updatedAt: number;
}

export interface PayoutValidationResult {
  isValid: boolean;
  errors: {
    field: string;
    message: string;
  }[];
}

export interface DisbursementRequest {
  id: string;
  userId: string;
  userType: 'driver' | 'company';
  amount: number;
  currency: 'IDR';
  payoutDetailsId: string;
  
  // Xendit disbursement details
  xenditDisbursementId?: string;
  externalId: string;
  
  status: 'pending' | 'processing' | 'completed' | 'failed';
  description: string;
  
  // Related transaction info
  relatedTransactionId?: string;
  towRequestId?: string;
  
  createdAt: number;
  completedAt?: number;
  failureReason?: string;
}

export interface PayoutHistory {
  id: string;
  userId: string;
  disbursements: DisbursementRequest[];
  totalDisbursed: number;
  pendingAmount: number;
  lastPayoutAt?: number;
  createdAt: number;
  updatedAt: number;
}

// Rating & Tip System Types
export interface DriverRating {
  id: string;
  towRequestId: string;
  customerId: string;
  driverId: string;
  rating: number; // 1-5 stars
  feedback?: string;
  categories?: {
    punctuality: number; // 1-5
    professionalism: number; // 1-5
    vehicleCondition: number; // 1-5
    communication: number; // 1-5
  };
  createdAt: number;
}

export interface TipTransaction {
  id: string;
  towRequestId: string;
  customerId: string;
  driverId: string;
  amount: number; // in IDR
  currency: 'IDR';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paymentMethod: 'same_as_service' | 'separate_payment';
  xenditPaymentId?: string;
  createdAt: number;
  completedAt?: number;
  failureReason?: string;
}

export interface DriverStats {
  driverId: string;
  totalRatings: number;
  averageRating: number;
  ratingBreakdown: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  totalTips: number;
  averageTip: number;
  totalEarnings: number;
  completedJobs: number;
  categoryAverages: {
    punctuality: number;
    professionalism: number;
    vehicleCondition: number;
    communication: number;
  };
  updatedAt: number;
}

export interface TipOption {
  id: string;
  amount: number;
  label: string;
  isPopular?: boolean;
}

// Document Management & Verification System Types
export interface DocumentType {
  id: string;
  name: string;
  description: string;
  required_for: ('driver' | 'company')[];
  file_types: string[];
  max_size_mb: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentUpload {
  id: string;
  user_id: string;
  document_type_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  uploaded_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  admin_notes?: string;
  document_type?: DocumentType;
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  account_type: 'driver' | 'company';
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  rejection_reason?: string;
  admin_notes?: string;
  documents: DocumentUpload[];
  user: User;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'super_admin';
  permissions: {
    can_verify_drivers: boolean;
    can_verify_companies: boolean;
    can_manage_documents: boolean;
    can_view_reports: boolean;
    can_manage_users: boolean;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentVerificationStats {
  total_pending: number;
  total_approved: number;
  total_rejected: number;
  pending_drivers: number;
  pending_companies: number;
  avg_review_time_hours: number;
  recent_activity: {
    date: string;
    approved: number;
    rejected: number;
  }[];
}