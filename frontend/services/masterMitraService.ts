import { apiRequest } from '@/lib/api';

export interface MasterMitra {
  id: number;
  kode_mitra: string | null;
  nama_mitra: string;
  kategori_mitra: string | null;
  bidang_usaha: string | null;
  tingkat_perusahaan: string | null;
  negara: string | null;
  website: string | null;
  alamat: string | null;
  email_mitra: string | null;
  whatsapp_mitra: string | null;
  no_telepon_mitra: string | null;
  nama_kontak_utama: string | null;
  jabatan_kontak_utama: string | null;
  email_kontak_utama: string | null;
  telepon_kontak_utama: string | null;
  aktif: boolean;
  created_at: string;
  updated_at: string;
  // Kontak tambahan: akun lain yang mendaftar atas nama instansi yang sama.
  kontak?: KontakMitra[];
}

export interface KontakMitra {
  id: number;
  nama: string;
  jabatan: string | null;
  email: string | null;
  telepon: string | null;
}

export interface MasterMitraPayload {
  kode_mitra?: string | null;
  nama_mitra: string;
  kategori_mitra?: string | null;
  bidang_usaha?: string | null;
  tingkat_perusahaan?: string | null;
  negara?: string | null;
  website?: string | null;
  alamat?: string | null;
  email_mitra?: string | null;
  whatsapp_mitra?: string | null;
  no_telepon_mitra?: string | null;
  nama_kontak_utama?: string | null;
  jabatan_kontak_utama?: string | null;
  email_kontak_utama?: string | null;
  telepon_kontak_utama?: string | null;
  aktif?: boolean;
  // Dikirim = daftar lengkap kontak tambahan (yang tidak ada di daftar dihapus).
  kontak?: Array<{ id?: number; nama: string; jabatan: string | null; email: string | null; telepon: string | null }>;
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


export async function upsertMasterMitraByName(
  namaMitra: string,
  fields: { kategoriMitra?: string | null; bidangUsaha?: string | null; tingkatPerusahaan?: string | null; extra?: Partial<MasterMitraPayload> }
): Promise<MasterMitra> {
  // Pencocokan nama dilakukan di backend (MasterMitraResolver) dengan aturan yang sama
  // seperti registrasi & pengajuan: abaikan huruf besar/kecil, spasi, dan tanda baca.
  // Field yang undefined tidak dikirim, jadi nilai lama di Data Kemitraan dipertahankan.
  const payload: Record<string, unknown> = { nama_mitra: namaMitra.trim(), ...fields.extra };
  if (fields.kategoriMitra !== undefined) payload.kategori_mitra = fields.kategoriMitra;
  if (fields.bidangUsaha !== undefined) payload.bidang_usaha = fields.bidangUsaha;
  if (fields.tingkatPerusahaan !== undefined) payload.tingkat_perusahaan = fields.tingkatPerusahaan;

  const response = await apiRequest<ApiResponse<MasterMitra>>('/master/mitra/upsert-by-name', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.data) {
    throw new Error('Gagal menyimpan master mitra');
  }
  return response.data;
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