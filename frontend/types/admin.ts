export interface AdminNotification {
  id: number;
  title: string;
  message: string;
  from: string;
  read: boolean;
  createdAt: string;
  href?: string;
  category?: 'approval' | 'comment' | 'reminder' | 'info';
  targetRole?: 'admin' | 'internal' | 'eksternal' | 'external' | 'pimpinan';
}

export interface DashboardStat {
  label: string;
  value: string;
  color: string;
  textColor: string;
  iconKey: 'handshake' | 'building' | 'globe' | 'chart' | 'zap' | 'file' | 'users';
}

export interface ChartItem {
  name: string;
  value: number;
  fill?: string;
}

export interface PopularSchemeItem {
  name: string;
  value: number;
}

export interface QuickAction {
  label: string;
  description: string;
  href: string;
  color: string;
  iconKey: 'handshake' | 'users' | 'trending';
}
