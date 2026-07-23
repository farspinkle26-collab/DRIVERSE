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
  country?: string;

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