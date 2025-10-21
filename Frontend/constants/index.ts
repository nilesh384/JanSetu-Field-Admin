export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

export const COLORS = {
  primary: '#2563eb',
  primaryDark: '#1e40af',
  secondary: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  success: '#10b981',
  background: '#f9fafb',
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  priority: {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#f59e0b',
    low: '#10b981',
  },
  status: {
    pending: '#f59e0b',
    in_progress: '#3b82f6',
    resolved: '#10b981',
    rejected: '#ef4444',
  }
};

export const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical', color: COLORS.priority.critical },
  { value: 'high', label: 'High', color: COLORS.priority.high },
  { value: 'medium', label: 'Medium', color: COLORS.priority.medium },
  { value: 'low', label: 'Low', color: COLORS.priority.low },
];

export const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: COLORS.status.pending },
  { value: 'in_progress', label: 'In Progress', color: COLORS.status.in_progress },
  { value: 'resolved', label: 'Resolved', color: COLORS.status.resolved },
  { value: 'rejected', label: 'Rejected', color: COLORS.status.rejected },
];

export const CATEGORIES = [
  'Public Safety & Emergency',
  'Water Supply & Sewerage',
  'Traffic & Transport',
  'Municipal Urban Planning & Encroachment Removal',
  'Street Lighting & Electrical',
  'Roads & Infrastructure',
  'Public Health & Hygiene',
  'Others'
];
