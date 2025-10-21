import api from './api';
import { Report, WorkLog, DashboardStats } from '../types';

export const reportService = {
  // Get reports assigned to admin
  async getAssignedReports(adminId: string, filters?: {
    status?: string;
    priority?: string;
    category?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.category) params.append('category', filters.category);
    
    const response = await api.get<{ success: boolean; data: Report[] }>(
      `/field-admin/reports/${adminId}?${params.toString()}`
    );
    return response.data;
  },

  // Get single report details
  async getReportById(reportId: string) {
    const response = await api.get<{ success: boolean; data: Report }>(`/field-admin/reports/${reportId}/details`);
    return response.data;
  },

  // Mark report as in progress
  async startWork(reportId: string, data: {
    adminId: string;
    notes?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const response = await api.post(`/field-admin/reports/${reportId}/start`, data);
    return response.data;
  },

  // Add progress update
  async addProgressUpdate(reportId: string, data: {
    adminId: string;
    notes: string;
    photos?: string[];
    latitude?: number;
    longitude?: number;
  }) {
    const response = await api.post(`/field-admin/reports/${reportId}/update`, data);
    return response.data;
  },

  // Complete report
  async completeReport(reportId: string, data: {
    adminId: string;
    resolvedNotes: string;
    resolvedPhotos: string[];
    timeSpentMinutes?: number;
    materialsUsed?: any;
  }) {
    const response = await api.post(`/field-admin/reports/${reportId}/complete`, data);
    return response.data;
  },

  // Get nearby reports
  async getNearbyReports(latitude: number, longitude: number, radius: number = 1000) {
    const response = await api.get<{ success: boolean; data: Report[] }>(
      `/reports/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`
    );
    return response.data;
  },

  // Get dashboard stats
  async getDashboardStats(adminId: string) {
    const response = await api.get<{ success: boolean; data: DashboardStats }>(
      `/field-admin/dashboard/${adminId}`
    );
    return response.data;
  },

  // Get today's reports
  async getTodayReports(adminId: string) {
    const response = await api.get<{ success: boolean; data: Report[] }>(
      `/field-admin/reports/${adminId}/today`
    );
    return response.data;
  },

  // Upload work photo
  async uploadWorkPhoto(file: any) {
    const formData = new FormData();
    formData.append('mediaFile', file);
    
    const response = await api.post('/field-admin/upload-work-photo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get team locations (if available)
  async getTeamLocations() {
    const response = await api.get<{ success: boolean; data: any[] }>(
      `/field-admin/team-locations`
    );
    return response.data;
  },
};
