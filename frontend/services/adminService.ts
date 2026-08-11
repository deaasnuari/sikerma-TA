// Hapus notifikasi berdasarkan id
export function deleteNotification(id: number): AdminNotification[] {
  const updatedNotifications = readNotifications().filter((notification) => notification.id !== id);
  saveNotifications(updatedNotifications);
  return updatedNotifications;
}

// Hapus semua notifikasi
export function deleteAllNotifications(): AdminNotification[] {
  saveNotifications([]);
  return [];
}
//DASHBOARD ADMIN
import type {
  AdminNotification,
  ChartItem,
  DashboardStat,
  PopularSchemeItem,
  QuickAction,
} from '@/types/admin';

const STORAGE_KEY = 'sikerma-admin-notifications';

const defaultNotifications: AdminNotification[] = [
  {
    id: 1,
    title: 'Pengajuan Disetujui',
    message: "Pengajuan 'Kerja Sama Magang dengan PT Solusi Digital' telah disetujui.",
    from: 'Admin SIKERMA',
    read: false,
    createdAt: 'Baru saja',
    href: '/admin/data_pengajuan',
    category: 'approval',
    targetRole: 'admin',
  },
  {
    id: 2,
    title: 'Komentar Baru pada Pengajuan',
    message: "Pengajuan 'Kerja Sama Magang dengan PT Solusi Digital' mendapat komentar baru dari reviewer.",
    from: 'Reviewer Kerjasama',
    read: false,
    createdAt: '10 menit lalu',
    href: '/admin/data_pengajuan',
    category: 'comment',
    targetRole: 'admin',
  },
  {
    id: 3,
    title: 'Dokumen Segera Berakhir',
    message: 'Dokumen MoU dengan Mitra Industri A akan berakhir bulan depan.',
    from: 'Sistem',
    read: true,
    createdAt: '1 jam lalu',
    href: '/admin/arsip_dokumen',
    category: 'reminder',
    targetRole: 'admin',
  },
];

const dashboardStats: DashboardStat[] = [
  { label: 'Total Kerjasama Aktif', value: '5', color: 'bg-green-100', textColor: 'text-green-700', iconKey: 'handshake' },
  { label: 'Total Kerjasama Tidak Aktif', value: '5', color: 'bg-red-100', textColor: 'text-red-700', iconKey: 'file' },
  { label: 'Dalam Negeri', value: '8', color: 'bg-blue-100', textColor: 'text-blue-700', iconKey: 'building' },
  { label: 'Luar Negeri', value: '2', color: 'bg-purple-100', textColor: 'text-purple-700', iconKey: 'globe' },
  { label: 'Total Mitra', value: '10', color: 'bg-orange-100', textColor: 'text-orange-700', iconKey: 'users' },
];

const quickActions: QuickAction[] = [
  {
    label: 'Buat Kerjasama Baru',
    description: 'Ajukan dokumen kerjasama baru dengan cepat.',
    href: '/admin/data_pengajuan?view=ajukan',
    iconKey: 'handshake',
    color: 'bg-[#091222] border-[#091222] text-white',
  },
  {
    label: 'Lihat User',
    description: 'Kelola akun dan hak akses pengguna.',
    href: '/admin/manajemen_users',
    iconKey: 'users',
    color: 'bg-green-50 border-green-200 text-gray-900',
  },
  {
    label: 'Status dan Progres Kerja Sama',
    description: 'Pantau status dan progres kerjasama.',
    href: '/admin/monitoring',
    iconKey: 'trending',
    color: 'bg-purple-50 border-purple-200 text-gray-900',
  },
];

const regionalDistribution: ChartItem[] = [
  { name: 'Dalam Negeri', value: 8, fill: '#3B82F6' },
  { name: 'Luar Negeri', value: 2, fill: '#A78BFA' },
];

const documentTypeDistribution: ChartItem[] = [
  { name: 'MoU', value: 4, fill: '#10B981' },
  { name: 'MoA', value: 5, fill: '#F59E0B' },
  { name: 'IA', value: 1, fill: '#EF4444' },
];

const popularSchemes: PopularSchemeItem[] = [
  { name: 'Magang', value: 18 },
  { name: 'Penelitian', value: 16 },
  { name: 'Pengabdian Masyarakat', value: 13 },
  { name: 'Pelatihan', value: 11 },
  { name: 'Pertukaran Mahasiswa', value: 9 },
];

function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

function emitNotificationUpdate() {
  if (canUseStorage()) {
    window.dispatchEvent(new Event('admin-notifications-updated'));
  }
}

function saveNotifications(items: AdminNotification[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emitNotificationUpdate();
}

function normalizeNotifications(items: AdminNotification[]): AdminNotification[] {
  const seen = new Set<number>();
  return items
    .map((notification) => ({ ...notification, targetRole: notification.targetRole ?? 'admin' }))
    .filter((notification) => {
      if (seen.has(notification.id)) return false;
      seen.add(notification.id);
      return true;
    });
}

function readNotifications(): AdminNotification[] {
  if (!canUseStorage()) {
    return normalizeNotifications(defaultNotifications);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const normalizedDefaults = normalizeNotifications(defaultNotifications);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedDefaults));
    return normalizedDefaults;
  }

  try {
    const parsed = JSON.parse(raw) as AdminNotification[];
    if (Array.isArray(parsed)) {
      const normalizedNotifications = normalizeNotifications(parsed);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedNotifications));
      return normalizedNotifications;
    }
  } catch {
    // fallback to default notifications below
  }

  const normalizedDefaults = normalizeNotifications(defaultNotifications);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedDefaults));
  return normalizedDefaults;
}

export function getAdminNotifications(): AdminNotification[] {
  return readNotifications();
}

export function getUnreadNotificationCount(): number {
  return readNotifications().filter((notification) => !notification.read).length;
}

export function markNotificationAsRead(id: number): AdminNotification[] {
  const updatedNotifications = readNotifications().map((notification) =>
    notification.id === id ? { ...notification, read: true } : notification
  );

  saveNotifications(updatedNotifications);
  return updatedNotifications;
}

export function markAllNotificationsAsRead(): AdminNotification[] {
  const updatedNotifications = readNotifications().map((notification) => ({
    ...notification,
    read: true,
  }));

  saveNotifications(updatedNotifications);
  return updatedNotifications;
}

export function markNotificationsByHrefAsRead(href: string): AdminNotification[] {
  const updatedNotifications = readNotifications().map((notification) =>
    notification.href === href ? { ...notification, read: true } : notification
  );
  saveNotifications(updatedNotifications);
  return updatedNotifications;
}

export function markNotificationsByHrefPrefixAsRead(prefix: string): AdminNotification[] {
  const updatedNotifications = readNotifications().map((notification) =>
    notification.href?.startsWith(prefix) ? { ...notification, read: true } : notification
  );
  saveNotifications(updatedNotifications);
  return updatedNotifications;
}

export function getUnreadCountByHref(href: string): number {
  return readNotifications().filter((n) => !n.read && n.href === href).length;
}

export function getUnreadCountByHrefPrefix(prefix: string): number {
  return readNotifications().filter((n) => !n.read && !!n.href && n.href.startsWith(prefix)).length;
}

export function addAdminNotification(
  notification: Omit<AdminNotification, 'id' | 'createdAt' | 'read'> &
    Partial<Pick<AdminNotification, 'createdAt' | 'read'>>
): AdminNotification[] {
  const existing = readNotifications();
  const newId = existing.reduce((max, n) => Math.max(max, n.id), 0) + 1;
  const updatedNotifications = [
    {
      ...notification,
      targetRole: notification.targetRole ?? 'admin',
      id: newId,
      read: notification.read ?? false,
      createdAt: notification.createdAt ?? 'Baru saja',
    },
    ...existing,
  ];

  saveNotifications(updatedNotifications);
  return updatedNotifications;
}

export function getDashboardStats(): DashboardStat[] {
  return dashboardStats;
}

export function getQuickActions(): QuickAction[] {
  return quickActions;
}

export function getRegionalDistribution(): ChartItem[] {
  return regionalDistribution;
}

export function getDocumentTypeDistribution(): ChartItem[] {
  return documentTypeDistribution;
}

export function getPopularSchemes(): PopularSchemeItem[] {
  return popularSchemes;
}
