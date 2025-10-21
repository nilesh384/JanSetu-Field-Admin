import axios from 'axios';
import { storage } from '../utils/storage';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'https://melba-ahistorical-alexa.ngrok-free.dev/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add admin ID if available
api.interceptors.request.use(
  async (config) => {
    console.log('API Request:', config.method?.toUpperCase(), `${config.baseURL || ''}${config.url || ''}`);
    const admin = await storage.getAdmin();
    if (admin) {
      config.headers['X-Admin-Id'] = admin.id.toString();
    }
    return config;
  },
  (error) => {
    console.error('Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    console.error('API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    if (error.response?.status === 401) {
      // Unauthorized - clear admin data
      await storage.removeAdmin();
    }
    return Promise.reject(error);
  }
);

export default api;
