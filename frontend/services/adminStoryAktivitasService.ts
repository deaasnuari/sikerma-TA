import { apiRequest } from '@/lib/api';

const HIDDEN_STORY_IDS_KEY = 'adminStoryAktivitasHiddenIds';
const AKTIVITAS_KEY = 'sikerma_aktivitas';

export interface AktivitasItem {
  id: number;
  judul: string;
  jenisAktivitas: string;
  tanggal: string;
  peserta: number;
  deskripsi: string;
  picPolibatam: string;
  picMitra: string;
  status: 'direncanakan' | 'berlangsung' | 'selesai';
}

type ApiListResponse<T> = {
  success: boolean;
  message: string;
  data: T[];
};

type ApiSingleResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

type ApiAktivitasRow = {
  id: number;
  pengajuan_id: number;
  judul: string;
  jenis_aktivitas: string;
  tanggal: string;
  jumlah_peserta?: number;
  deskripsi?: string | null;
  pic_polibatam?: string | null;
  pic_mitra?: string | null;
  status: AktivitasItem['status'];
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

function emitStoryUpdate() {
  if (canUseStorage()) {
    window.dispatchEvent(new Event('story-data-updated'));
  }
}

function saveAllAktivitasData(data: Record<string, AktivitasItem[]>): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(AKTIVITAS_KEY, JSON.stringify(data));
}

function normalizeStatus(value?: string): AktivitasItem['status'] {
  if (value === 'berlangsung' || value === 'selesai') {
    return value;
  }

  return 'direncanakan';
}

function mapApiAktivitasToItem(row: ApiAktivitasRow): AktivitasItem {
  return {
    id: row.id,
    judul: row.judul,
    jenisAktivitas: row.jenis_aktivitas,
    tanggal: row.tanggal,
    peserta: Number(row.jumlah_peserta ?? 0),
    deskripsi: row.deskripsi ?? '',
    picPolibatam: row.pic_polibatam ?? '',
    picMitra: row.pic_mitra ?? '',
    status: normalizeStatus(row.status),
  };
}

function mapItemToApiPayload(kerjasamaId: number, item: Omit<AktivitasItem, 'id'>) {
  return {
    pengajuan_id: kerjasamaId,
    judul: item.judul,
    jenis_aktivitas: item.jenisAktivitas,
    tanggal: item.tanggal,
    jumlah_peserta: Number(item.peserta || 0),
    deskripsi: item.deskripsi || '',
    pic_polibatam: item.picPolibatam || '',
    pic_mitra: item.picMitra || '',
    status: normalizeStatus(item.status),
  };
}

export function getHiddenStoryIds(): number[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(HIDDEN_STORY_IDS_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hideStoryByPengajuanId(pengajuanId: number): number[] {
  const current = getHiddenStoryIds();

  if (current.includes(pengajuanId)) {
    return current;
  }

  const updated = [...current, pengajuanId];

  if (canUseStorage()) {
    window.localStorage.setItem(HIDDEN_STORY_IDS_KEY, JSON.stringify(updated));
  }

  emitStoryUpdate();
  return updated;
}

export function showStoryByPengajuanId(pengajuanId: number): number[] {
  const updated = getHiddenStoryIds().filter((id) => id !== pengajuanId);

  if (canUseStorage()) {
    window.localStorage.setItem(HIDDEN_STORY_IDS_KEY, JSON.stringify(updated));
  }

  emitStoryUpdate();
  return updated;
}

// ── Aktivitas per kerjasama ──────────────────────────────────────────────────

function getAllAktivitasData(): Record<string, AktivitasItem[]> {
  if (!canUseStorage()) return {};
  const raw = window.localStorage.getItem(AKTIVITAS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, AktivitasItem[]>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function getAktivitasByKerjasamaId(kerjasamaId: number): AktivitasItem[] {
  return getAllAktivitasData()[String(kerjasamaId)] ?? [];
}

export function saveAktivitasByKerjasamaId(kerjasamaId: number, items: AktivitasItem[]): void {
  if (!canUseStorage()) return;
  const all = getAllAktivitasData();
  all[String(kerjasamaId)] = items;
  saveAllAktivitasData(all);
}

export async function refreshAktivitasDataFromApi(): Promise<Record<string, AktivitasItem[]>> {
  const response = await apiRequest<ApiListResponse<ApiAktivitasRow>>('/pengajuan-aktivitas');
  const grouped: Record<string, AktivitasItem[]> = {};

  for (const row of response.data || []) {
    const key = String(row.pengajuan_id);
    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(mapApiAktivitasToItem(row));
  }

  saveAllAktivitasData(grouped);
  emitStoryUpdate();

  return grouped;
}

export async function createAktivitasApi(
  kerjasamaId: number,
  item: Omit<AktivitasItem, 'id'>
): Promise<AktivitasItem> {
  const response = await apiRequest<ApiSingleResponse<ApiAktivitasRow>>('/pengajuan-aktivitas', {
    method: 'POST',
    body: JSON.stringify(mapItemToApiPayload(kerjasamaId, item)),
  });

  await refreshAktivitasDataFromApi();
  return mapApiAktivitasToItem(response.data);
}

export async function updateAktivitasApi(
  aktivitasId: number,
  kerjasamaId: number,
  item: Omit<AktivitasItem, 'id'>
): Promise<AktivitasItem> {
  const response = await apiRequest<ApiSingleResponse<ApiAktivitasRow>>(`/pengajuan-aktivitas/${aktivitasId}`, {
    method: 'PUT',
    body: JSON.stringify(mapItemToApiPayload(kerjasamaId, item)),
  });

  await refreshAktivitasDataFromApi();
  return mapApiAktivitasToItem(response.data);
}

export async function deleteAktivitasApi(aktivitasId: number): Promise<void> {
  await apiRequest<ApiSingleResponse<null>>(`/pengajuan-aktivitas/${aktivitasId}`, {
    method: 'DELETE',
  });

  await refreshAktivitasDataFromApi();
}

/**
 * Dipanggil saat pengajuan disetujui.
 * Menambahkan aktivitas awal "Penandatanganan Dokumen Kerjasama" jika belum ada data.
 */
export function initAktivitasOnApproval(
  kerjasamaId: number,
  mitraName: string,
  tanggalDisetujui: string
): void {
  const existing = getAktivitasByKerjasamaId(kerjasamaId);
  if (existing.length > 0) return; // sudah punya data, jangan timpa

  const initial: AktivitasItem = {
    id: 1,
    judul: 'Penandatanganan Dokumen Kerjasama',
    jenisAktivitas: 'Lainnya',
    tanggal: tanggalDisetujui,
    peserta: 0,
    deskripsi: `Dokumen kerjasama dengan ${mitraName} telah resmi ditandatangani dan pengajuan disetujui oleh Admin SIKERMA.`,
    picPolibatam: 'Admin SIKERMA',
    picMitra: mitraName,
    status: 'selesai',
  };

  saveAktivitasByKerjasamaId(kerjasamaId, [initial]);
}
