import { apiRequest } from '@/lib/api';

export interface LaporanPelaksanaanRecord {
  id: number;
  pengajuanId?: number;
  dokumenKerjasamaId?: number;
  nomorDokumen?: string;
  namaMitra?: string;
  jenisDokumen?: string;
  judulKerjasama?: string;
  referensiKerjasama?: string;
  unitPengaju?: string;
  kegiatan?: string;
  capaian?: string;
  hasil?: string;
  tautanDokumentasi?: string;
  namaPenanggungJawab?: string;
  nipPenanggungJawab?: string;
  jabatanMengetahui?: string;
  namaMengetahui?: string;
  nipMengetahui?: string;
  fileUrl?: string;
  fileNama?: string;
  fileUkuranBytes?: number;
  status: string;
  dikirimOlehNama?: string;
  dikirimOlehRole?: string;
  dikirimPada: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

type ApiLaporanRow = {
  id: number;
  pengajuan_id?: number | null;
  dokumen_kerjasama_id?: number | null;
  nomor_dokumen?: string | null;
  nama_mitra?: string | null;
  jenis_dokumen?: string | null;
  judul_kerjasama?: string | null;
  referensi_kerjasama?: string | null;
  unit_pengaju?: string | null;
  kegiatan?: string | null;
  capaian?: string | null;
  hasil?: string | null;
  tautan_dokumentasi?: string | null;
  nama_penanggung_jawab?: string | null;
  nip_penanggung_jawab?: string | null;
  jabatan_mengetahui?: string | null;
  nama_mengetahui?: string | null;
  nip_mengetahui?: string | null;
  file_path?: string | null;
  file_nama?: string | null;
  file_ukuran_bytes?: number | null;
  status: string;
  created_at: string;
  dikirim_oleh?: { id: number; name: string; role: string } | null;
};

function getBackendOrigin(): string {
  try {
    const configured = process.env.NEXT_PUBLIC_API_URL;
    if (configured && /^https?:\/\//i.test(configured)) {
      return new URL(configured).origin;
    }
  } catch {
    // fall through
  }
  return 'http://127.0.0.1:8000';
}

function mapRow(row: ApiLaporanRow): LaporanPelaksanaanRecord {
  return {
    id: row.id,
    pengajuanId: row.pengajuan_id ?? undefined,
    dokumenKerjasamaId: row.dokumen_kerjasama_id ?? undefined,
    nomorDokumen: row.nomor_dokumen ?? undefined,
    namaMitra: row.nama_mitra ?? undefined,
    jenisDokumen: row.jenis_dokumen ?? undefined,
    judulKerjasama: row.judul_kerjasama ?? undefined,
    referensiKerjasama: row.referensi_kerjasama ?? undefined,
    unitPengaju: row.unit_pengaju ?? undefined,
    kegiatan: row.kegiatan ?? undefined,
    capaian: row.capaian ?? undefined,
    hasil: row.hasil ?? undefined,
    tautanDokumentasi: row.tautan_dokumentasi ?? undefined,
    namaPenanggungJawab: row.nama_penanggung_jawab ?? undefined,
    nipPenanggungJawab: row.nip_penanggung_jawab ?? undefined,
    jabatanMengetahui: row.jabatan_mengetahui ?? undefined,
    namaMengetahui: row.nama_mengetahui ?? undefined,
    nipMengetahui: row.nip_mengetahui ?? undefined,
    fileUrl: row.file_path ? `${getBackendOrigin()}/storage/${row.file_path.replace(/^\/+/, '')}` : undefined,
    fileNama: row.file_nama ?? undefined,
    fileUkuranBytes: row.file_ukuran_bytes ?? undefined,
    status: row.status,
    dikirimOlehNama: row.dikirim_oleh?.name,
    dikirimOlehRole: row.dikirim_oleh?.role,
    dikirimPada: row.created_at,
  };
}

export interface SubmitLaporanPelaksanaanPayload {
  pengajuanId?: number;
  dokumenKerjasamaId?: number;
  nomorDokumen?: string;
  namaMitra?: string;
  jenisDokumen?: string;
  judulKerjasama?: string;
  referensiKerjasama?: string;
  unitPengaju?: string;
  kegiatan?: string;
  capaian?: string;
  hasil?: string;
  tautanDokumentasi?: string;
  namaPenanggungJawab?: string;
  nipPenanggungJawab?: string;
  jabatanMengetahui?: string;
  namaMengetahui?: string;
  nipMengetahui?: string;
  file?: File | Blob | null;
  fileName?: string;
}

export async function submitLaporanPelaksanaan(payload: SubmitLaporanPelaksanaanPayload): Promise<LaporanPelaksanaanRecord> {
  const formData = new FormData();

  if (payload.pengajuanId) formData.append('pengajuan_id', String(payload.pengajuanId));
  if (payload.dokumenKerjasamaId) formData.append('dokumen_kerjasama_id', String(payload.dokumenKerjasamaId));
  if (payload.nomorDokumen) formData.append('nomor_dokumen', payload.nomorDokumen);
  if (payload.namaMitra) formData.append('nama_mitra', payload.namaMitra);
  if (payload.jenisDokumen) formData.append('jenis_dokumen', payload.jenisDokumen);
  if (payload.judulKerjasama) formData.append('judul_kerjasama', payload.judulKerjasama);
  if (payload.referensiKerjasama) formData.append('referensi_kerjasama', payload.referensiKerjasama);
  if (payload.unitPengaju) formData.append('unit_pengaju', payload.unitPengaju);
  if (payload.kegiatan) formData.append('kegiatan', payload.kegiatan);
  if (payload.capaian) formData.append('capaian', payload.capaian);
  if (payload.hasil) formData.append('hasil', payload.hasil);
  if (payload.tautanDokumentasi) formData.append('tautan_dokumentasi', payload.tautanDokumentasi);
  if (payload.namaPenanggungJawab) formData.append('nama_penanggung_jawab', payload.namaPenanggungJawab);
  if (payload.nipPenanggungJawab) formData.append('nip_penanggung_jawab', payload.nipPenanggungJawab);
  if (payload.jabatanMengetahui) formData.append('jabatan_mengetahui', payload.jabatanMengetahui);
  if (payload.namaMengetahui) formData.append('nama_mengetahui', payload.namaMengetahui);
  if (payload.nipMengetahui) formData.append('nip_mengetahui', payload.nipMengetahui);
  if (payload.file) formData.append('file', payload.file, payload.fileName);

  const response = await apiRequest<ApiResponse<ApiLaporanRow>>('/laporan-pelaksanaan', {
    method: 'POST',
    body: formData,
  });

  return mapRow(response.data);
}

export async function getLaporanPelaksanaanByPengajuanIds(pengajuanIds: number[]): Promise<LaporanPelaksanaanRecord[]> {
  if (pengajuanIds.length === 0) {
    return [];
  }

  const response = await apiRequest<ApiResponse<ApiLaporanRow[]>>(
    `/laporan-pelaksanaan?pengajuan_ids=${pengajuanIds.join(',')}`
  );

  return (response.data || []).map(mapRow);
}

export async function getLaporanPelaksanaanByDokumenKerjasamaIds(dokumenIds: number[]): Promise<LaporanPelaksanaanRecord[]> {
  if (dokumenIds.length === 0) {
    return [];
  }

  const response = await apiRequest<ApiResponse<ApiLaporanRow[]>>(
    `/laporan-pelaksanaan?dokumen_kerjasama_ids=${dokumenIds.join(',')}`
  );

  return (response.data || []).map(mapRow);
}

export async function deleteLaporanPelaksanaan(id: number): Promise<void> {
  await apiRequest<unknown>(`/laporan-pelaksanaan/${id}`, { method: 'DELETE' });
}
