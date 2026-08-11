import { apiRequest } from '@/lib/api';

export type RenewalRequestStatus = 'menunggu' | 'disetujui' | 'ditolak';

export interface RenewalRequestItem {
  id: number;
  kerjasamaId: number;
  namaMitra: string;
  noDokumen: string;
  tanggalMulaiBaru: string;
  tanggalBerakhirBaru: string;
  catatan: string;
  buktiPerpanjangan?: string | null;
  buktiPerpanjanganUrl?: string | null;
  ruangLingkup?: string[];
  status: RenewalRequestStatus;
  requestedAt: string;
  requesterRole: 'admin' | 'internal' | 'eksternal' | 'pimpinan';
  notificationHref: string;
  decidedAt?: string;
  decidedBy?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

function canUseStorage() {
  return typeof window !== 'undefined';
}

function emitRenewalUpdate() {
  if (canUseStorage()) {
    window.dispatchEvent(new Event('renewal-requests-updated'));
  }
}

function normalizeRenewalItem(item: RenewalRequestItem): RenewalRequestItem {
  const requestedAt = item.requestedAt
    ? new Date(item.requestedAt).toLocaleString('id-ID')
    : '-';
  const decidedAt = item.decidedAt
    ? new Date(item.decidedAt).toLocaleString('id-ID')
    : undefined;

  return {
    ...item,
    requestedAt,
    decidedAt,
  };
}

export async function getRenewalRequests(): Promise<RenewalRequestItem[]> {
  const response = await apiRequest<ApiResponse<RenewalRequestItem[]>>('/dokumen-kerjasama/perpanjangan/requests');
  const items = Array.isArray(response.data) ? response.data : [];
  return items.map(normalizeRenewalItem);
}

export async function addRenewalRequest(payload: {
  kerjasamaId: number;
  namaMitra: string;
  noDokumen: string;
  tanggalMulaiBaru: string;
  tanggalBerakhirBaru: string;
  catatan?: string;
  buktiPerpanjangan?: string | null;
  ruangLingkup?: string[];
  requesterRole?: 'admin' | 'internal' | 'eksternal' | 'pimpinan';
  notificationHref?: string;
}): Promise<RenewalRequestItem[]> {
  await apiRequest<ApiResponse<RenewalRequestItem>>(`/dokumen-kerjasama/${payload.kerjasamaId}/perpanjangan`, {
    method: 'POST',
    body: JSON.stringify({
      tanggal_mulai_baru: payload.tanggalMulaiBaru,
      tanggal_berakhir_baru: payload.tanggalBerakhirBaru,
      catatan_perpanjangan: payload.catatan || '-',
      bukti_perpanjangan: payload.buktiPerpanjangan || null,
      ruang_lingkup: payload.ruangLingkup ?? [],
      requester_role: payload.requesterRole ?? 'admin',
      notification_href: payload.notificationHref ?? '/admin/monitoring/perpanjangan',
    }),
  });

  emitRenewalUpdate();
  return getRenewalRequests();
}

export async function updateRenewalRequestStatus(
  id: number,
  status: Exclude<RenewalRequestStatus, 'menunggu'>,
  decidedBy = 'Admin SIKERMA'
): Promise<RenewalRequestItem[]> {
  await apiRequest<ApiResponse<RenewalRequestItem>>(`/dokumen-kerjasama/perpanjangan/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      diputuskan_oleh: decidedBy,
    }),
  });

  emitRenewalUpdate();
  return getRenewalRequests();
}
