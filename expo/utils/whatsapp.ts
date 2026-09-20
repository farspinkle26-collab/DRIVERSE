import { Linking, Platform } from 'react-native';

const WHATSAPP_PHONE = '+6281380680009';
const ATPM_WHATSAPP_PHONE = '+6285688056778';
const EMERGENCY_TOWING_PHONE = '+628568805678';

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

export const openWhatsAppWithText = async (message: string, phoneNumber?: string): Promise<boolean> => {
  const encodedMessage = encodeURIComponent(message);
  return openWhatsAppUrl(encodedMessage, phoneNumber);
};

export const openAtpmWhatsApp = async (message: string): Promise<boolean> => {
  const encodedMessage = encodeURIComponent(message);
  return openWhatsAppUrl(encodedMessage, ATPM_WHATSAPP_PHONE);
};

export const openEmergencyTowingWhatsApp = async (message: string): Promise<boolean> => {
  const encodedMessage = encodeURIComponent(message);
  return openWhatsAppUrl(encodedMessage, EMERGENCY_TOWING_PHONE);
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