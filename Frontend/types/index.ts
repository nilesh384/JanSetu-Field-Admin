export interface Admin {
  id: string; // UUID
  email: string;
  fullName: string;
  department: string;
  role: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface Report {
  id: string; // UUID
  userId: string; // UUID
  title: string;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'rejected';
  displayStatus?: string; // Optional display status for field admin mapping
  mediaUrls?: string[];
  audioUrl?: string;
  latitude: number;
  longitude: number;
  address?: string;
  department?: string;
  assignedAdminId?: string; // UUID
  isResolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string; // UUID
  resolvedPhotos?: string[];
  resolvedNotes?: string;
  createdAt: string;
  updatedAt: string;
  upvotes: number;
  downvotes: number;
  viewCount: number;
  shareCount: number;
  user?: {
    id: string; // UUID
    fullName: string;
    phoneNumber: string;
    email?: string;
  };
  inProgressAt?: string;
  inProgressPhotos?: string[];
  workStartedAt?: string;
  workCompletedAt?: string;
  timeSpentMinutes?: number;
}

export interface WorkLog {
  id: string; // UUID
  reportId: string; // UUID
  adminId: string; // UUID
  action: 'started' | 'in_progress_update' | 'completed';
  notes?: string;
  photos?: string[];
  locationLat?: number;
  locationLng?: number;
  createdAt: string;
}

export interface DashboardStats {
  totalAssigned: number;
  pending: number;
  inProgress: number;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
  avgTimeSpent: number;
  categoryBreakdown: {
    category: string;
    count: number;
  }[];
}
