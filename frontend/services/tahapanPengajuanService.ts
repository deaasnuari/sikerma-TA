import { apiRequest } from '@/lib/api';

const STORAGE_KEY = 'sikerma_tahapan_v3';

export type StageGroup = 'todo' | 'in_progress' | 'complete';

export interface TahapanStage {
  name: string;
  group: StageGroup;
  dot: string;
}

export const ALL_STAGES: TahapanStage[] = [
  { name: 'Pengajuan Awal',                          group: 'todo',        dot: 'bg-gray-400'   },
  { name: 'Penyusunan Dokumen',                       group: 'in_progress', dot: 'bg-blue-500'   },
  { name: 'Koordinasi & Review Internal',             group: 'in_progress', dot: 'bg-orange-400' },
  { name: 'Review & Negosiasi Mitra',                 group: 'in_progress', dot: 'bg-yellow-500' },
  { name: 'Finalisasi & Penandatanganan Dokumen',     group: 'in_progress', dot: 'bg-pink-500'   },
  { name: 'Dibatalkan / Dihentikan',                  group: 'complete',    dot: 'bg-red-500'    },
  { name: 'Selesai',                                  group: 'complete',    dot: 'bg-green-500'  },
];

export const GROUP_CONFIG: Record<StageGroup, { label: string; dot: string; badge: string }> = {
  todo:        { label: 'Belum Dimulai',   dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-600 border-gray-200'    },
  in_progress: { label: 'Sedang Berjalan', dot: 'bg-blue-500',  badge: 'bg-blue-50 text-blue-700 border-blue-200'     },
  complete:    { label: 'Selesai',         dot: 'bg-green-500', badge: 'bg-green-50 text-green-700 border-green-200'  },
};

export const STAGE_DIBATALKAN = 'Dibatalkan / Dihentikan';
export const STAGE_SELESAI    = 'Selesai';
export const STAGE_AWAL       = 'Pengajuan Awal';

export interface RiwayatEntry {
  stage: string;
  group: StageGroup;
  changed_at: string;
  changed_by?: string;
}

export interface CatatanEntry {
  teks: string;
  savedAt: string;
}

export interface PengajuanTahapan {
  pengajuanId: number;
  stage: string | null;
  group: StageGroup | null;
  updatedAt: string | null;
  riwayat: RiwayatEntry[];
  catatan: CatatanEntry[];
}

// ── LocalStorage helpers ────────────────────────────────────────────────────

function readAll(): Record<string, PengajuanTahapan> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAll(data: Record<string, PengajuanTahapan>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event('tahapan-pengajuan-updated'));
}

/** Baca dari localStorage. Jika tidak ada, kembalikan default dengan stage null. */
export function getTahapan(pengajuanId: number): PengajuanTahapan {
  const all = readAll();
  const stored = all[String(pengajuanId)];
  if (stored) return stored;
  return {
    pengajuanId,
    stage: null,
    group: null,
    updatedAt: null,
    riwayat: [],
    catatan: [],
  };
}

/** Sync data dari API ke localStorage cache. */
export function syncFromApi(
  pengajuanId: number,
  apiStage: string | null | undefined,
  apiGroup: string | null | undefined,
  apiRiwayat: RiwayatEntry[] | null | undefined,
): PengajuanTahapan {
  const all = readAll();
  const existing = all[String(pengajuanId)];

  const record: PengajuanTahapan = {
    pengajuanId,
    stage:     apiStage  ?? existing?.stage  ?? null,
    group:     (apiGroup as StageGroup | null) ?? existing?.group  ?? null,
    updatedAt: existing?.updatedAt ?? null,
    riwayat:   apiRiwayat ?? existing?.riwayat ?? [],
    catatan:   existing?.catatan ?? [],
  };

  all[String(pengajuanId)] = record;
  saveAll(all);
  return record;
}

// ── API calls ───────────────────────────────────────────────────────────────

interface UpdateTahapanResponse {
  success: boolean;
  data: {
    id: number;
    tahapan_stage: string;
    tahapan_group: string;
    tahapan_riwayat: RiwayatEntry[];
  };
  message: string;
}

export async function updateTahapanViaApi(
  pengajuanId: number,
  stage: TahapanStage,
): Promise<PengajuanTahapan> {
  const res = await apiRequest<UpdateTahapanResponse>(`/pengajuan/${pengajuanId}/tahapan`, {
    method: 'PATCH',
    body: JSON.stringify({ stage: stage.name, group: stage.group }),
  });

  const all = readAll();
  const existing = all[String(pengajuanId)];
  const record: PengajuanTahapan = {
    pengajuanId,
    stage:     res.data.tahapan_stage,
    group:     res.data.tahapan_group as StageGroup,
    updatedAt: new Date().toISOString(),
    riwayat:   res.data.tahapan_riwayat ?? [],
    catatan:   existing?.catatan ?? [],
  };
  all[String(pengajuanId)] = record;
  saveAll(all);
  return record;
}

export async function clearTahapanViaApi(pengajuanId: number): Promise<PengajuanTahapan> {
  const awalStage = ALL_STAGES.find((s) => s.name === STAGE_AWAL)!;
  return updateTahapanViaApi(pengajuanId, awalStage);
}

// ── LocalStorage-only mutations (untuk backward compat / offline) ───────────

export function setStage(pengajuanId: number, stage: TahapanStage): PengajuanTahapan {
  const all = readAll();
  const existing = all[String(pengajuanId)];
  const riwayatEntry: RiwayatEntry = {
    stage:      stage.name,
    group:      stage.group,
    changed_at: new Date().toISOString(),
  };
  const record: PengajuanTahapan = {
    pengajuanId,
    stage:     stage.name,
    group:     stage.group,
    updatedAt: new Date().toISOString(),
    riwayat:   [...(existing?.riwayat ?? []), riwayatEntry],
    catatan:   existing?.catatan ?? [],
  };
  all[String(pengajuanId)] = record;
  saveAll(all);
  return record;
}

export function clearStage(pengajuanId: number): PengajuanTahapan {
  const awal = ALL_STAGES.find((s) => s.name === STAGE_AWAL) ?? ALL_STAGES[0];
  return setStage(pengajuanId, awal);
}
