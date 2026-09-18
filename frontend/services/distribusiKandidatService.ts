import { apiRequest } from '@/lib/api';

export type DistribusiJabatan = 'ketua_jurusan' | 'ketua_prodi' | 'kepala_unit';

export interface DistribusiKandidat {
  id: number | null;
  nama: string;
  nik: string | null;
  jabatan: DistribusiJabatan;
  unitNama: string | null;
  sudahTerdaftar: boolean;
}

interface ApiDistribusiKandidat {
  id: number | null;
  nama: string;
  nik: string | null;
  jabatan: DistribusiJabatan;
  unit_nama: string | null;
  sudah_terdaftar: boolean;
}

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  message: string;
}

interface ApiProvisionResponse {
  success: boolean;
  data: { id: number; nama: string };
  message: string;
}

/**
 * Kandidat "Distribusi (CC)" untuk modal review pengajuan — gabungan Ketua Jurusan/
 * Ketua Prodi/Kepala Unit yang sudah pernah login ke SIKERMA DAN yang belum pernah login
 * sama sekali tapi jabatannya sudah terverifikasi lewat data Civitas (lihat
 * PengajuanController::distribusiKandidat()). Kandidat yang belum pernah login punya
 * `id: null` — wajib panggil provisionDistribusiUser() dulu sebelum bisa dipakai di
 * distribusi_user_ids.
 */
export async function getDistribusiKandidat(): Promise<DistribusiKandidat[]> {
  const response = await apiRequest<ApiListResponse<ApiDistribusiKandidat>>('/distribusi-kandidat');

  return (response.data ?? []).map((item) => ({
    id: item.id,
    nama: item.nama,
    nik: item.nik,
    jabatan: item.jabatan,
    unitNama: item.unit_nama,
    sudahTerdaftar: item.sudah_terdaftar,
  }));
}

/**
 * Bikin baris user untuk Ketua Jurusan/Ketua Prodi yang dipilih dari
 * getDistribusiKandidat() tapi belum pernah login (id: null). NIK-nya sama persis dengan
 * data Civitas — begitu orangnya beneran login lewat "Login dengan Akun Kampus", akun ini
 * otomatis dipakai (matched by NIK), bukan bikin akun dobel.
 */
export async function provisionDistribusiUser(payload: {
  nik: string;
  nama: string;
  jabatan: DistribusiJabatan;
}): Promise<{ id: number; nama: string }> {
  const response = await apiRequest<ApiProvisionResponse>('/distribusi-kandidat/provision', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response.data;
}
