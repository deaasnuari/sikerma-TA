import { apiRequest } from '@/lib/api';

const MASTER_RUANG_LINGKUP_CACHE_KEY = 'sikerma.master-ruang-lingkup-cache-v1';

let masterRuangLingkupCache: MasterRuangLingkup[] | null = null;

function readMasterRuangLingkupCache(): MasterRuangLingkup[] {
  if (masterRuangLingkupCache) {
    return masterRuangLingkupCache;
  }

  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(MASTER_RUANG_LINGKUP_CACHE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as MasterRuangLingkup[];
    masterRuangLingkupCache = Array.isArray(parsed) ? parsed : [];
    return masterRuangLingkupCache;
  } catch {
    return [];
  }
}

function writeMasterRuangLingkupCache(rows: MasterRuangLingkup[]) {
  masterRuangLingkupCache = rows;

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(MASTER_RUANG_LINGKUP_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // Ignore storage quota / serialization issues.
  }
}

export function getCachedMasterRuangLingkup(): MasterRuangLingkup[] {
  return readMasterRuangLingkupCache();
}

export interface MasterRuangLingkup {
  id: number;
  nama_ruang_lingkup: string;
  aktif: boolean;
  created_at: string;
  updated_at: string;
}

export interface MasterRuangLingkupPayload {
  nama_ruang_lingkup: string;
  aktif?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export async function getMasterRuangLingkup(filters?: {
  aktif?: boolean;
  search?: string;
}): Promise<MasterRuangLingkup[]> {
  const params = new URLSearchParams();

  if (filters?.aktif !== undefined) params.append('aktif', String(filters.aktif));
  if (filters?.search) params.append('search', filters.search);

  const queryString = params.toString();
  const url = queryString ? `/master/ruang-lingkup?${queryString}` : '/master/ruang-lingkup';

  const response = await apiRequest<ApiResponse<MasterRuangLingkup[]>>(url);
  const rows = response.data || [];
  writeMasterRuangLingkupCache(rows);
  return rows;
}

export async function createMasterRuangLingkup(payload: MasterRuangLingkupPayload): Promise<MasterRuangLingkup> {
  const response = await apiRequest<ApiResponse<MasterRuangLingkup>>('/master/ruang-lingkup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal membuat master ruang lingkup');
  }

  return response.data;
}

export async function updateMasterRuangLingkup(id: number, payload: Partial<MasterRuangLingkupPayload>): Promise<MasterRuangLingkup> {
  const response = await apiRequest<ApiResponse<MasterRuangLingkup>>(`/master/ruang-lingkup/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal mengubah master ruang lingkup');
  }

  return response.data;
}

export async function deleteMasterRuangLingkup(id: number): Promise<boolean> {
  const response = await apiRequest<ApiResponse<null>>(`/master/ruang-lingkup/${id}`, {
    method: 'DELETE',
  });

  if (response.success !== true) {
    throw new Error(response.message || 'Gagal menghapus master ruang lingkup');
  }

  return true;
}
