import { Linking, Platform } from 'react-native';
import { Location, VehicleInfo, BreakdownInfo } from '@/types';
import { SERVICE_TYPES } from '@/constants/mockData';

interface WhatsAppOrderData {
  serviceType: string;
  pickupLocation: Location;
  dropoffLocation: Location;
  distance: number;
  totalPrice: number;
  customerName: string;
  customerPhone: string;
  vehicleInfo: VehicleInfo;
  breakdownInfo: BreakdownInfo;
  isInsuranceMember?: boolean;
  insuranceProvider?: string;
}

const WHATSAPP_PHONE = '+6281380680009';
const ATPM_WHATSAPP_PHONE = '+6285688056778';

const insuranceProviderNames: { [key: string]: string } = {
  sompo: 'Sompo Indonesia',
  chubb: 'Chubb',
  allianz: 'Allianz',
  rojai: 'Rojai',
  bintang: 'Bintang',
  indomobil: 'Indomobil Group',
};

export const formatWhatsAppMessage = (orderData: WhatsAppOrderData): string => {
  const serviceConfig = SERVICE_TYPES[orderData.serviceType as keyof typeof SERVICE_TYPES];
  const serviceName = serviceConfig?.name || 'Layanan Derek';
  
  const breakdownLabels: { [key: string]: string } = {
    engine_wont_start: 'Mesin Tidak Mau Hidup',
    accident: 'Kecelakaan',
    flat_tire: 'Ban Kempes',
    stuck: 'Kendaraan Terjebak',
    battery_dead: 'Aki Soak',
    overheating: 'Overheat',
    other: 'Lainnya',
  };
  
  const breakdownType = breakdownLabels[orderData.breakdownInfo.type] || 'Tidak Diketahui';
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price);
  };
  
  const insuranceProviderName = orderData.insuranceProvider ? 
    insuranceProviderNames[orderData.insuranceProvider] || orderData.insuranceProvider : '';
  
  let message = `🚛 *PERMINTAAN LAYANAN DEREK*\n\n` +
    `📋 *Detail Pesanan:*\n` +
    `• Jenis Layanan: ${serviceName}\n` +
    `• Estimasi Jarak: ${orderData.distance} km\n` +
    `• Total Biaya: ${formatPrice(orderData.totalPrice)}\n\n` +
    
    `📍 *Lokasi Penjemputan:*\n` +
    `${orderData.pickupLocation.address}\n` +
    `Koordinat: ${orderData.pickupLocation.latitude.toFixed(6)}, ${orderData.pickupLocation.longitude.toFixed(6)}\n\n` +
    
    `🎯 *Lokasi Tujuan:*\n` +
    `${orderData.dropoffLocation.address}\n` +
    `Koordinat: ${orderData.dropoffLocation.latitude.toFixed(6)}, ${orderData.dropoffLocation.longitude.toFixed(6)}\n\n` +
    
    `🚗 *Informasi Kendaraan:*\n` +
    `• Merek: ${orderData.vehicleInfo.make}\n` +
    `• Model: ${orderData.vehicleInfo.model}\n` +
    `• Warna: ${orderData.vehicleInfo.color}\n` +
    `• Nomor Plat: ${orderData.vehicleInfo.licensePlate}\n` +
    `• Masalah: ${breakdownType}\n` +
    `${orderData.breakdownInfo.notes ? `• Catatan: ${orderData.breakdownInfo.notes}\n` : ''}\n` +
    
    `👤 *Data Pemesan:*\n` +
    `• Nama: ${orderData.customerName}\n` +
    `• Nomor Telepon: ${orderData.customerPhone}\n\n`;
  
  if (orderData.isInsuranceMember && insuranceProviderName) {
    message += `🛡️ *Saya adalah member asuransi ${insuranceProviderName}, mohon konfirmasi bonus diskon.*\n\n`;
  }
  
  message += `⏰ Waktu Pemesanan: ${new Date().toLocaleString('id-ID')}\n\n` +
    `Mohon konfirmasi ketersediaan driver dan estimasi waktu kedatangan. Terima kasih! 🙏`;
  
  return message;
};

export const formatInsuranceVerificationMessage = (data: {
  customerName: string;
  customerPhone: string;
  insuranceProviderId: string;
  policyNumber: string;
}): string => {
  const providerName = insuranceProviderNames[data.insuranceProviderId] || data.insuranceProviderId;
  const lines = [
    `• Tanggal Request : ${new Date().toISOString().split('T')[0]}`,
    `• Nama Customer : ${data.customerName || '-'}`,
    `• Nomor Hp 1 : ${data.customerPhone || '-'}`,
    `• Jenis Permintaan : Towing`,
    `• Call Center Penerima : ${providerName}`,
    `• Nomor Polis Asuransi : ${data.policyNumber.toUpperCase()}`,
  ];
  return `${lines.join('\n')}\n\nSaya adalah member asuransi ${providerName}, mohon konfirmasi bonus diskon.`;
};

const openWhatsAppUrl = async (encodedMessage: string, phoneNumber?: string): Promise<boolean> => {
  try {
    const targetPhone = phoneNumber || WHATSAPP_PHONE;
    const cleanPhoneNumber = targetPhone.replace('+', '');
    let whatsappUrl: string;

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      whatsappUrl = `whatsapp://send?phone=${cleanPhoneNumber}&text=${encodedMessage}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (!canOpen) {
        whatsappUrl = `https://wa.me/${cleanPhoneNumber}?text=${encodedMessage}`;
      }
    } else {
      whatsappUrl = `https://wa.me/${cleanPhoneNumber}?text=${encodedMessage}`;
    }

    console.log('Opening WhatsApp with URL:', whatsappUrl);
    await Linking.openURL(whatsappUrl);
    return true;
  } catch (error) {
    console.error('Error opening WhatsApp:', error);
    return false;
  }
};

export const openWhatsApp = async (orderData: WhatsAppOrderData): Promise<boolean> => {
  const message = formatWhatsAppMessage(orderData);
  const encodedMessage = encodeURIComponent(message);
  return openWhatsAppUrl(encodedMessage);
};

export const openWhatsAppWithText = async (message: string, phoneNumber?: string): Promise<boolean> => {
  const encodedMessage = encodeURIComponent(message);
  return openWhatsAppUrl(encodedMessage, phoneNumber);
};

export const openAtpmWhatsApp = async (message: string): Promise<boolean> => {
  const encodedMessage = encodeURIComponent(message);
  return openWhatsAppUrl(encodedMessage, ATPM_WHATSAPP_PHONE);
};

export const testWhatsAppAvailability = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'web') {
      return true;
    }
    const whatsappUrl = 'whatsapp://send';
    return await Linking.canOpenURL(whatsappUrl);
  } catch (error) {
    console.error('Error testing WhatsApp availability:', error);
    return false;
  }
};