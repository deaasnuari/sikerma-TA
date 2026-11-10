import { apiRequest } from '@/lib/api';

// Notifikasi lonceng yang tersimpan di server, per pengguna yang login.
export type NotifikasiServer = {
  id: number;
  judul: string;
  pesan: string;
  dari: string;
  href: string | null;
  kategori: 'approval' | 'comment' | 'reminder' | 'info' | string;
  dibaca: boolean;
  pengajuan_id?: number | null;
  nama_pelaku?: string | null;
  dibuat_pada: string | null;
};

type NotifikasiResponse = { data: NotifikasiServer[]; belum_dibaca: number };

export async function fetchNotifikasi(): Promise<NotifikasiResponse> {
  return apiRequest<NotifikasiResponse>('/notifikasi', { skipAuthRedirect: true });
}

export async function bacaNotifikasi(id: number): Promise<void> {
  await apiRequest(`/notifikasi/${id}/baca`, { method: 'PATCH', skipAuthRedirect: true });
}

export async function bacaSemuaNotifikasi(): Promise<void> {
  await apiRequest('/notifikasi/baca-semua', { method: 'POST', skipAuthRedirect: true });
}

// Tandai dibaca notifikasi server yang tujuannya diawali prefix (dipanggil saat halaman tujuan dibuka).
export async function bacaNotifikasiByHref(prefix: string): Promise<void> {
  await apiRequest('/notifikasi/baca-href', { method: 'POST', body: JSON.stringify({ prefix }), skipAuthRedirect: true });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('notifikasi-server-updated'));
}

export async function hapusNotifikasi(id: number): Promise<void> {
  await apiRequest(`/notifikasi/${id}`, { method: 'DELETE', skipAuthRedirect: true });
}

export async function hapusSemuaNotifikasi(): Promise<void> {
  await apiRequest('/notifikasi', { method: 'DELETE', skipAuthRedirect: true });
}
