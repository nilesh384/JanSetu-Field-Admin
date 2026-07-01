import axios from 'axios';
import { Platform } from 'react-native';

// Helper to determine the OpenWA API endpoint based on environment or running platform.
// Android Emulators resolve the host's localhost via 10.0.2.2.
// iOS Simulators and other platforms can resolve it via localhost directly.
// For physical devices, set EXPO_PUBLIC_OPENWA_API_URL to the computer's actual local IP address.
const getOpenWaBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_OPENWA_API_URL) {
    return process.env.EXPO_PUBLIC_OPENWA_API_URL;
  }
  return Platform.select({
    android: 'http://10.0.2.2:2785/api',
    ios: 'http://localhost:2785/api',
    default: 'http://localhost:2785/api',
  });
};

const OPENWA_API_URL = getOpenWaBaseUrl();
const OPENWA_API_KEY = process.env.EXPO_PUBLIC_OPENWA_API_KEY || 'dgaebaa_dajAYckcalcaeu';
const OPENWA_SESSION_ID = process.env.EXPO_PUBLIC_OPENWA_SESSION_ID || 'default';

console.log(`🔌 [OpenWA] Base URL configured to: ${OPENWA_API_URL}`);

const openWaApi = axios.create({
  baseURL: OPENWA_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': OPENWA_API_KEY,
  },
});

export const whatsAppService = {
  /**
   * Sends a text message to a specific phone number via OpenWA
   * @param phoneNumber Citizen's phone number
   * @param text Message text to send
   */
  sendTextMessage: async (phoneNumber: string, text: string) => {
    try {
      if (!phoneNumber) {
        console.error('❌ [OpenWA] Cannot send WhatsApp message: Phone number is empty');
        return { success: false, error: 'Phone number is empty' };
      }

      // Clean phone number (keep digits only)
      let cleanPhone = phoneNumber.replace(/\D/g, '');
      
      // If it is 10 digits (standard for India), prefix with country code '91'
      if (cleanPhone.length === 10) {
        cleanPhone = '91' + cleanPhone;
      }
      
      const chatId = `${cleanPhone}@c.us`;

      console.log(`📱 [OpenWA] Attempting to send message to ${chatId}...`);

      const response = await openWaApi.post(
        `/sessions/${OPENWA_SESSION_ID}/messages/send-text`,
        {
          chatId: chatId,
          text: text,
        }
      );

      console.log('✅ [OpenWA] Message sent successfully:', response.data);
      return { success: true, data: response.data };
    } catch (error: any) {
      const errorMessage = error.response?.data || error.message;
      console.error('❌ [OpenWA] Error sending WhatsApp message:', errorMessage);
      return { success: false, error: errorMessage };
    }
  },
};
