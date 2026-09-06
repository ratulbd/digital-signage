export type UserRole = 'CENTRAL_ADMIN' | 'COMPANY_ADMIN' | 'CIRCLE_ADMIN' | 'SUBCENTER_ADMIN';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  companyId?: string | null;
  circleId?: string | null;
  subcenterId?: string | null;
  company?: Company | null;
  circle?: Circle | null;
  subcenter?: Subcenter | null;
  mustChangePassword?: boolean;
  emailVerified?: boolean;
}

export interface Company {
  id: string;
  name: string;
  createdAt: string;
  _count?: { circles: number; users: number };
}

export interface Circle {
  id: string;
  name: string;
  companyId: string;
  company?: Company;
  createdAt: string;
  _count?: { subcenters: number; users: number };
}

export interface Subcenter {
  id: string;
  name: string;
  circleId?: string | null;
  circle?: Circle & { company?: Company };
  createdAt?: string;
  _count?: { users: number; devices: number };
}

export interface Device {
  id: string;
  name: string;
  subcenterId: string;
  subcenter?: Subcenter;
  lastHeartbeat: string;
  isOnline: boolean;
  pairedAt?: string | null;
  createdAt: string;
}

export interface MediaCategory {
  id: string;
  name: string;
  companyId?: string | null;
  types?: MediaContentType[];
  _count?: { media: number; types: number };
  createdAt: string;
}

export interface MediaContentType {
  id: string;
  name: string;
  categoryId: string;
  category?: MediaCategory;
  companyId?: string | null;
  _count?: { media: number };
  createdAt: string;
}

export interface MediaItem {
  id: string;
  filename: string;
  url: string;
  type: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT';
  size: number;
  isPublic?: boolean;
  publishedBy?: string;
  companyId?: string | null;
  circleId?: string | null;
  categoryId?: string | null;
  category?: MediaCategory | null;
  contentTypeId?: string | null;
  contentType?: MediaContentType | null;
  contentName?: string | null;
  uploader?: { id: string; email: string; name?: string; role: string };
  createdAt: string;
}

export type ScheduleTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

export interface Schedule {
  id: string;
  mediaId: string;
  media?: MediaItem;
  tier: ScheduleTier;
  deviceIds: string[];
  devices?: Device[];
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isRecurring: boolean;
  isActive: boolean;
  createdBy: string;
  companyId?: string | null;
  circleId?: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  totalPlays: number;
  totalScreenTimeHrs: number;
  todayScreenTimeHrs: number;
  networkQuality: number;
  syncStatus: number;
  contentDelivery: number;
  recentActivity?: Array<{
    id: string;
    message: string;
    timestamp: string;
  }>;
}

export interface AnalyticsData {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  totalPlays: number;
  totalScreenTimeHrs: number;
  todayScreenTimeHrs: number;
  topMedia: Array<{
    id: string;
    filename: string;
    url: string;
    type: string;
    playCount: number;
  }>;
  playsOverTime: Array<{
    date: string;
    count: number;
  }>;
  deviceUptime: Array<{
    deviceId: string;
    deviceName: string;
    uptime: number;
  }>;
}

export interface ReportLog {
  id: string;
  date: string;
  deviceName: string;
  subcenterName: string;
  mediaName: string;
  durationHrs: number;
  status: string;
}

export interface ReportData {
  totalHours: number;
  logs: ReportLog[];
}

export interface PlaybackLog {
  id: string;
  deviceId: string;
  mediaId: string;
  media?: MediaItem;
  tier: string;
  startedAt: string;
  endedAt: string | null;
  completed: boolean;
}

// Role power levels for frontend checks
export const ROLE_POWER: Record<UserRole, number> = {
  CENTRAL_ADMIN: 4,
  COMPANY_ADMIN: 3,
  CIRCLE_ADMIN: 2,
  SUBCENTER_ADMIN: 1,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  CENTRAL_ADMIN: 'Central Admin',
  COMPANY_ADMIN: 'Company Admin',
  CIRCLE_ADMIN: 'Circle Admin',
  SUBCENTER_ADMIN: 'Subcenter Admin',
};
