import { apiRequest } from '@/lib/api';

const MASTER_NEGARA_CACHE_KEY = 'sikerma.master-negara-cache-v1';

let masterNegaraCache: MasterNegara[] | null = null;

function readMasterNegaraCache(): MasterNegara[] {
  if (masterNegaraCache) {
    return masterNegaraCache;
  }

  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(MASTER_NEGARA_CACHE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as MasterNegara[];
    masterNegaraCache = Array.isArray(parsed) ? parsed : [];
    return masterNegaraCache;
  } catch {
    return [];
  }
}

function writeMasterNegaraCache(rows: MasterNegara[]) {
  masterNegaraCache = rows;

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(MASTER_NEGARA_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // Ignore storage quota / serialization issues.
  }
}

export function getCachedMasterNegara(): MasterNegara[] {
  return readMasterNegaraCache();
}

export interface MasterNegara {
  id: number;
  nama_negara: string;
  aktif: boolean;
  created_at: string;
  updated_at: string;
}

export interface MasterNegaraPayload {
  nama_negara: string;
  aktif?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export async function getMasterNegara(filters?: { aktif?: boolean; search?: string }): Promise<MasterNegara[]> {
  const params = new URLSearchParams();

  if (filters?.aktif !== undefined) params.append('aktif', String(filters.aktif));
  if (filters?.search) params.append('search', filters.search);

  const queryString = params.toString();
  const url = queryString ? `/master/negara?${queryString}` : '/master/negara';

  const response = await apiRequest<ApiResponse<MasterNegara[]>>(url);
  const rows = response.data || [];
  writeMasterNegaraCache(rows);
  return rows;
}

function notifyMasterNegaraUpdated() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('master-negara-updated'));
}

export async function createMasterNegara(payload: MasterNegaraPayload): Promise<MasterNegara> {
  const response = await apiRequest<ApiResponse<MasterNegara>>('/master/negara', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal membuat master negara');
  }

  writeMasterNegaraCache([...(readMasterNegaraCache().filter((item) => item.id !== response.data.id)), response.data]);
  notifyMasterNegaraUpdated();
  return response.data;
}

export async function updateMasterNegara(id: number, payload: Partial<MasterNegaraPayload>): Promise<MasterNegara> {
  const response = await apiRequest<ApiResponse<MasterNegara>>(`/master/negara/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal mengubah master negara');
  }

  return response.data;
}

export async function deleteMasterNegara(id: number): Promise<boolean> {
  const response = await apiRequest<ApiResponse<null>>(`/master/negara/${id}`, {
    method: 'DELETE',
  });

  if (response.success !== true) {
    throw new Error(response.message || 'Gagal menghapus master negara');
  }

  writeMasterNegaraCache(readMasterNegaraCache().filter((item) => item.id !== id));
  notifyMasterNegaraUpdated();
  return true;
}
