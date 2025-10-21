import AsyncStorage from '@react-native-async-storage/async-storage';
import { Admin } from '../types';

const ADMIN_KEY = '@admin_data';

export const storage = {
  // Admin data
  async saveAdmin(admin: Admin): Promise<void> {
    await AsyncStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  },

  async getAdmin(): Promise<Admin | null> {
    const data = await AsyncStorage.getItem(ADMIN_KEY);
    return data ? JSON.parse(data) : null;
  },

  async removeAdmin(): Promise<void> {
    await AsyncStorage.removeItem(ADMIN_KEY);
  },

  // Generic storage
  async setItem(key: string, value: any): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async getItem<T>(key: string): Promise<T | null> {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    await AsyncStorage.clear();
  },
};
