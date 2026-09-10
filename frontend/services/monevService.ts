import { apiRequest } from '@/lib/api';

// Monev (Monitoring dan Evaluasi) Triwulan untuk satu kerjasama — dipakai di
// Rekap Data -> Detail Kerjasama -> Monev.
//
// Menggabungkan dua sumber data yang sudah ada (bukan menyalinnya):
// - Aktivitas dari Story (pengajuan_aktivitas), read-only di sini — triwulannya
//   dihitung otomatis dari tanggal aktivitas di backend, jadi tidak perlu diketik
//   ulang dan otomatis ikut berubah/hilang saat aktivitasnya diedit/dihapus di Story.
// - Entri Monev manual (laporan_pelaksanaan) yang user isi langsung di sini.

export interface MonevAktivitasItem {
  id: number;
  judul: string;
  jenisAktivitas: string;
  tanggal: string;
  jumlahPeserta: number;
  deskripsi?: string;
  picPolibatam?: string;
  picMitra?: string;
  status: 'direncanakan' | 'berlangsung' | 'selesai';
}

export interface MonevManualEntry {
  id: number;
  // 'laporan' = Laporan Pelaksanaan formal (dikirim dari Story & Aktivitas -> Buat
  // Laporan, SELALU disertai file upload) — kolom kegiatan/hasil di sini berisi
  // "Ruang Lingkup"/"Output-Outcome" dari form IA, BUKAN catatan monitoring biasa.
  // 'catatan' = catatan Monev manual cepat (ditambah langsung dari Rekap Data ->
  // Detail Kerjasama -> Monev, tidak pernah punya file) — kegiatan/hasil di sini
  // memang diisi sebagai Catatan Monitoring/Hasil Evaluasi.
  // Dibedakan dari ada-tidaknya file karena laporan formal mewajibkan upload file
  // sebelum bisa dikirim, sedangkan catatan cepat tidak pernah punya opsi upload.
  jenis: 'laporan' | 'catatan';
  nomorDokumen?: string;
  judulKerjasama?: string;
  referensiKerjasama?: string;
  unitPengaju?: string;
  namaPenanggungJawab?: string;
  catatanMonitoring?: string; // kolom backend: kegiatan
  hasilEvaluasi?: string; // kolom backend: hasil
  kendala?: string;
  tindakLanjut?: string;
  tautanDokumentasi?: string;
  fileUrl?: string;
  fileNama?: string;
  dikirimOlehNama?: string;
  createdAt: string;
}

export interface MonevQuarter {
  tahun: number;
  triwulan: number;
  label: string;
  aktivitas: MonevAktivitasItem[];
  monev: MonevManualEntry[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

type ApiAktivitasRow = {
  id: number;
  judul: string;
  jenis_aktivitas: string;
  tanggal: string;
  jumlah_peserta?: number | null;
  deskripsi?: string | null;
  pic_polibatam?: string | null;
  pic_mitra?: string | null;
  status: MonevAktivitasItem['status'];
};

type ApiMonevRow = {
  id: number;
  nomor_dokumen?: string | null;
  judul_kerjasama?: string | null;
  referensi_kerjasama?: string | null;
  unit_pengaju?: string | null;
  nama_penanggung_jawab?: string | null;
  kegiatan?: string | null;
  hasil?: string | null;
  kendala?: string | null;
  tindak_lanjut?: string | null;
  tautan_dokumentasi?: string | null;
  file_path?: string | null;
  file_nama?: string | null;
  dikirim_oleh?: { id: number; name: string; role: string } | null;
  created_at: string;
};

type ApiQuarterRow = {
  tahun: number;
  triwulan: number;
  label: string;
  aktivitas: ApiAktivitasRow[];
  monev: ApiMonevRow[];
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

function mapAktivitas(row: ApiAktivitasRow): MonevAktivitasItem {
  return {
    id: row.id,
    judul: row.judul,
    jenisAktivitas: row.jenis_aktivitas,
    tanggal: row.tanggal,
    jumlahPeserta: Number(row.jumlah_peserta ?? 0),
    deskripsi: row.deskripsi ?? undefined,
    picPolibatam: row.pic_polibatam ?? undefined,
    picMitra: row.pic_mitra ?? undefined,
    status: row.status,
  };
}

function mapMonev(row: ApiMonevRow): MonevManualEntry {
  // Laporan Pelaksanaan formal SELALU punya file (wajib diupload sebelum bisa dikirim
  // lewat Story & Aktivitas -> Buat Laporan) — catatan Monev cepat tidak pernah punya
  // opsi upload sama sekali, jadi ada/tidaknya file adalah pembeda yang bisa diandalkan.
  const jenis: MonevManualEntry['jenis'] = row.file_path ? 'laporan' : 'catatan';

  return {
    id: row.id,
    jenis,
    nomorDokumen: row.nomor_dokumen ?? undefined,
    judulKerjasama: row.judul_kerjasama ?? undefined,
    referensiKerjasama: row.referensi_kerjasama ?? undefined,
    unitPengaju: row.unit_pengaju ?? undefined,
    namaPenanggungJawab: row.nama_penanggung_jawab ?? undefined,
    catatanMonitoring: row.kegiatan ?? undefined,
    hasilEvaluasi: row.hasil ?? undefined,
    kendala: row.kendala ?? undefined,
    tindakLanjut: row.tindak_lanjut ?? undefined,
    tautanDokumentasi: row.tautan_dokumentasi ?? undefined,
    fileUrl: row.file_path ? `${getBackendOrigin()}/storage/${row.file_path.replace(/^\/+/, '')}` : undefined,
    fileNama: row.file_nama ?? undefined,
    dikirimOlehNama: row.dikirim_oleh?.name,
    createdAt: row.created_at,
  };
}

// dokumenKerjasamaId dipakai sebagai kunci utama karena SELALU tersedia untuk setiap
// baris di Rekap Data -> Detail Kerjasama (banyak dokumen, terutama data lama/import,
// tidak punya pengajuan sumber) — beda dari versi sebelumnya yang salah mengunci ke
// pengajuan_id sehingga Monev manual jadi tidak bisa diisi untuk sebagian besar dokumen.
export async function getMonevByDokumenKerjasamaId(dokumenKerjasamaId: number): Promise<MonevQuarter[]> {
  const response = await apiRequest<ApiResponse<{ dokumen_kerjasama_id: number; pengajuan_id: number | null; quarters: ApiQuarterRow[] }>>(
    `/dokumen-kerjasama/${dokumenKerjasamaId}/monev`
  );

  return (response.data?.quarters ?? []).map((row) => ({
    tahun: row.tahun,
    triwulan: row.triwulan,
    label: row.label,
    aktivitas: (row.aktivitas ?? []).map(mapAktivitas),
    monev: (row.monev ?? []).map(mapMonev),
  }));
}

export interface AddMonevManualPayload {
  dokumenKerjasamaId: number;
  tahun: number;
  triwulan: number;
  catatanMonitoring?: string;
  hasilEvaluasi?: string;
  kendala?: string;
  tindakLanjut?: string;
  tautanDokumentasi?: string;
}

// Kirim entri Monev manual baru — lewat endpoint laporan-pelaksanaan yang sudah ada
// (bukan endpoint terpisah), supaya tetap satu sumber data dengan Laporan Pelaksanaan/IA.
export async function addMonevManual(payload: AddMonevManualPayload): Promise<void> {
  const formData = new FormData();
  formData.append('dokumen_kerjasama_id', String(payload.dokumenKerjasamaId));
  formData.append('tahun', String(payload.tahun));
  formData.append('triwulan', String(payload.triwulan));
  if (payload.catatanMonitoring) formData.append('kegiatan', payload.catatanMonitoring);
  if (payload.hasilEvaluasi) formData.append('hasil', payload.hasilEvaluasi);
  if (payload.kendala) formData.append('kendala', payload.kendala);
  if (payload.tindakLanjut) formData.append('tindak_lanjut', payload.tindakLanjut);
  if (payload.tautanDokumentasi) formData.append('tautan_dokumentasi', payload.tautanDokumentasi);

  await apiRequest<ApiResponse<unknown>>('/laporan-pelaksanaan', {
    method: 'POST',
    body: formData,
  });
}

export async function deleteMonevManual(id: number): Promise<void> {
  await apiRequest<ApiResponse<null>>(`/laporan-pelaksanaan/${id}`, { method: 'DELETE' });
}
