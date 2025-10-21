import api from './api';
import { Admin } from '../types';

export const authService = {
  async sendOTP(email: string) {
    const response = await api.post('/admin/send-otp', { email });
    return response.data;
  },

  async verifyOTP(email: string, otp: string) {
    const response = await api.post<{ success: boolean; message: string; data: Admin }>('/admin/verify-otp', {
      email,
      otp,
    });
    return response.data;
  },

  async getProfile(adminId: string) {
    const response = await api.get<{ success: boolean; data: Admin }>(`/admin/profile/${adminId}`);
    return response.data;
  },
};
