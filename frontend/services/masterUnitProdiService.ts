import { apiRequest } from '@/lib/api';

const MASTER_UNIT_PRODI_CACHE_KEY = 'sikerma.master-unit-prodi-cache-v2';

let masterUnitProdiCache: MasterUnitProdi[] | null = null;

function readMasterUnitProdiCache(): MasterUnitProdi[] {
  if (masterUnitProdiCache) {
    return masterUnitProdiCache;
  }

  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(MASTER_UNIT_PRODI_CACHE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as MasterUnitProdi[];
    masterUnitProdiCache = Array.isArray(parsed) ? parsed : [];
    return masterUnitProdiCache;
  } catch {
    return [];
  }
}

function writeMasterUnitProdiCache(rows: MasterUnitProdi[]) {
  masterUnitProdiCache = rows;

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(MASTER_UNIT_PRODI_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // Ignore storage quota / serialization issues.
  }
}

export function getCachedMasterUnitProdiTree(): MasterUnitProdi[] {
  return readMasterUnitProdiCache();
}

export function getCachedJurusans(): MasterUnitProdi[] {
  return readMasterUnitProdiCache().filter((item) => item.jenis_node === 'unit' && item.kategori_unit === 'jurusan' && item.aktif);
}

export function getCachedUnits(): MasterUnitProdi[] {
  return readMasterUnitProdiCache().filter((item) => item.jenis_node === 'unit' && item.kategori_unit === 'unit_kerja' && item.aktif);
}

export function getCachedProdiByUnit(unitId: number): MasterUnitProdi[] {
  return readMasterUnitProdiCache().filter((item) => item.jenis_node === 'prodi' && item.parent_id === unitId && item.aktif);
}

export interface MasterUnitProdi {
  id: number;
  parent_id: number | null;
  jenis_node: 'unit' | 'prodi';
  kategori_unit: 'jurusan' | 'unit_kerja' | null;
  kode: string | null;
  nama: string;
  aktif: boolean;
  created_at: string;
  updated_at: string;
  parent?: MasterUnitProdi;
  children?: MasterUnitProdi[];
}

export interface MasterUnitProdiPayload {
  parent_id?: number | null;
  jenis_node: 'unit' | 'prodi';
  kategori_unit?: 'jurusan' | 'unit_kerja' | null;
  kode?: string;
  nama: string;
  aktif?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

/**
 * Get all master unit/prodi with optional filters
 */
export async function getMasterUnitProdi(
  filters?: {
    jenis_node?: 'unit' | 'prodi';
    kategori_unit?: 'jurusan' | 'unit_kerja';
    parent_id?: number;
    aktif?: boolean;
  }
): Promise<MasterUnitProdi[]> {
  const params = new URLSearchParams();

  if (filters?.jenis_node) {
    params.append('jenis_node', filters.jenis_node);
  }
  if (filters?.kategori_unit) {
    params.append('kategori_unit', filters.kategori_unit);
  }
  if (filters?.parent_id) {
    params.append('parent_id', String(filters.parent_id));
  }
  if (filters?.aktif !== undefined) {
    params.append('aktif', String(filters.aktif));
  }

  const queryString = params.toString();
  const url = queryString ? `/master/unit-prodi?${queryString}` : '/master/unit-prodi';

  const response = await apiRequest<ApiResponse<MasterUnitProdi[]>>(url);
  const rows = response.data || [];
  writeMasterUnitProdiCache(rows);
  return rows;
}

/**
 * Get master unit/prodi in hierarchical tree structure
 */
export async function getMasterUnitProdiTree(): Promise<MasterUnitProdi[]> {
  const response = await apiRequest<ApiResponse<MasterUnitProdi[]>>('/master/unit-prodi/tree');
  const rows = response.data || [];
  writeMasterUnitProdiCache(rows);
  return rows;
}

/**
 * Get single master unit/prodi by id
 */
export async function getMasterUnitProdiById(id: number): Promise<MasterUnitProdi> {
  const response = await apiRequest<ApiResponse<MasterUnitProdi>>(`/master/unit-prodi/${id}`);
  if (!response.data) {
    throw new Error('Master Unit/Prodi not found');
  }
  return response.data;
}

/**
 * Create new master unit/prodi
 */
export async function createMasterUnitProdi(payload: MasterUnitProdiPayload): Promise<MasterUnitProdi> {
  const response = await apiRequest<ApiResponse<MasterUnitProdi>>('/master/unit-prodi', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal membuat Master Unit/Prodi');
  }
  return response.data;
}

/**
 * Update master unit/prodi
 */
export async function updateMasterUnitProdi(id: number, payload: Partial<MasterUnitProdiPayload>): Promise<MasterUnitProdi> {
  const response = await apiRequest<ApiResponse<MasterUnitProdi>>(`/master/unit-prodi/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal mengupdate Master Unit/Prodi');
  }
  return response.data;
}

/**
 * Delete master unit/prodi
 */
export async function deleteMasterUnitProdi(id: number): Promise<boolean> {
  const response = await apiRequest<ApiResponse<null>>(`/master/unit-prodi/${id}`, {
    method: 'DELETE',
  });

  if (response.success !== true) {
    throw new Error(response.message || 'Gagal menghapus Master Unit/Prodi');
  }

  return true;
}

/**
 * Get all units only
 */
export async function getUnits(): Promise<MasterUnitProdi[]> {
  return getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'unit_kerja', aktif: true });
}

/**
 * Get all jurusan only
 */
export async function getJurusans(): Promise<MasterUnitProdi[]> {
  return getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'jurusan', aktif: true });
}

/**
 * Get all prodi for a specific unit
 */
export async function getProdiByUnit(unitId: number): Promise<MasterUnitProdi[]> {
  return getMasterUnitProdi({ parent_id: unitId, jenis_node: 'prodi', aktif: true });
}
