import { apiRequest } from '@/lib/api';

export interface MasterMitra {
  id: number;
  kode_mitra: string | null;
  nama_mitra: string;
  kategori_mitra: string | null;
  tingkat_perusahaan: string | null;
  negara: string | null;
  website: string | null;
  alamat: string | null;
  email_mitra: string | null;
  telepon_mitra: string | null;
  nama_kontak_utama: string | null;
  jabatan_kontak_utama: string | null;
  email_kontak_utama: string | null;
  telepon_kontak_utama: string | null;
  aktif: boolean;
  created_at: string;
  updated_at: string;
}

export interface MasterMitraPayload {
  kode_mitra?: string | null;
  nama_mitra: string;
  kategori_mitra?: string | null;
  tingkat_perusahaan?: string | null;
  negara?: string | null;
  website?: string | null;
  alamat?: string | null;
  email_mitra?: string | null;
  telepon_mitra?: string | null;
  nama_kontak_utama?: string | null;
  jabatan_kontak_utama?: string | null;
  email_kontak_utama?: string | null;
  telepon_kontak_utama?: string | null;
  aktif?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export async function getMasterMitra(filters?: {
  kategori_mitra?: string;
  negara?: string;
  aktif?: boolean;
  search?: string;
}): Promise<MasterMitra[]> {
  const params = new URLSearchParams();

  if (filters?.kategori_mitra) params.append('kategori_mitra', filters.kategori_mitra);
  if (filters?.negara) params.append('negara', filters.negara);
  if (filters?.aktif !== undefined) params.append('aktif', String(filters.aktif));
  if (filters?.search) params.append('search', filters.search);

  const queryString = params.toString();
  const url = queryString ? `/master/mitra?${queryString}` : '/master/mitra';

  const response = await apiRequest<ApiResponse<MasterMitra[]>>(url);
  return response.data || [];
}

export async function getMasterMitraById(id: number): Promise<MasterMitra> {
  const response = await apiRequest<ApiResponse<MasterMitra>>(`/master/mitra/${id}`);
  if (!response.data) {
    throw new Error('Master mitra tidak ditemukan');
  }
  return response.data;
}

export async function createMasterMitra(payload: MasterMitraPayload): Promise<MasterMitra> {
  const response = await apiRequest<ApiResponse<MasterMitra>>('/master/mitra', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal membuat master mitra');
  }

  return response.data;
}

export async function updateMasterMitra(id: number, payload: Partial<MasterMitraPayload>): Promise<MasterMitra> {
  const response = await apiRequest<ApiResponse<MasterMitra>>(`/master/mitra/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal mengubah master mitra');
  }

  return response.data;
}

/**
 * Temukan mitra berdasarkan nama (exact, case-insensitive).
 * Jika ada → update kategori & tingkat.
 * Jika tidak ada → buat baru.
 * Mengembalikan MasterMitra yang dipakai beserta id-nya.
 */
export async function upsertMasterMitraByName(
  namaMitra: string,
  fields: { kategoriMitra?: string | null; tingkatPerusahaan?: string | null; extra?: Partial<MasterMitraPayload> }
): Promise<MasterMitra> {
  const trimmed = namaMitra.trim();
  const list = await getMasterMitra({ search: trimmed });
  const exact = list.find((m) => m.nama_mitra.trim().toLowerCase() === trimmed.toLowerCase());

  if (exact) {
    return updateMasterMitra(exact.id, {
      kategori_mitra: fields.kategoriMitra !== undefined ? fields.kategoriMitra : exact.kategori_mitra,
      tingkat_perusahaan: fields.tingkatPerusahaan !== undefined ? fields.tingkatPerusahaan : exact.tingkat_perusahaan,
      ...fields.extra,
    });
  }

  return createMasterMitra({
    nama_mitra: trimmed,
    kategori_mitra: fields.kategoriMitra || null,
    tingkat_perusahaan: fields.tingkatPerusahaan || null,
    aktif: true,
    ...fields.extra,
  });
}

export async function deleteMasterMitra(id: number): Promise<boolean> {
  const response = await apiRequest<ApiResponse<null>>(`/master/mitra/${id}`, {
    method: 'DELETE',
  });

  if (response.success !== true) {
    throw new Error(response.message || 'Gagal menghapus master mitra');
  }

  return true;
}