import { apiRequest, API_BASE_URL } from '@/lib/api';
import { getCachedMasterRuangLingkup, getMasterRuangLingkup } from '@/services/masterRuangLingkupService';

function getBackendOrigin(): string {
  try {
    const configured = process.env.NEXT_PUBLIC_API_URL;
    if (configured && /^https?:\/\//i.test(configured)) {
      return new URL(configured).origin;
    }
  } catch {
    // fall through
  }
  return API_BASE_URL.startsWith('http') ? new URL(API_BASE_URL).origin : 'http://127.0.0.1:8000';
}

function buildLegacyFileUrl(filePath: string): string {
  if (filePath.startsWith('http')) return filePath;
  const origin = getBackendOrigin();
  const clean = filePath.replace(/^\/+/, '');
  if (clean.startsWith('storage/') || clean.startsWith('uploads/')) {
    return `${origin}/storage/${clean.replace(/^storage\//, '')}`;
  }
  return `${origin}/storage/uploads/${clean}`;
}
import type { RekapDokumen } from '@/services/adminRekapDataService';

const REKAP_CACHE_TTL_MS = 60 * 1000;
let rekapDokumenCache: { data: RekapDokumen[]; expiresAt: number } | null = null;
let rekapDokumenInFlight: Promise<RekapDokumen[]> | null = null;

export function invalidateRekapCache(): void {
  rekapDokumenCache = null;
}

type ApiPaginatedResponse<T> = {
  success: boolean;
  message: string;
  data: {
    data: T[];
  };
};

type ApiDokumenRow = {
  id: number;
  nomor_dokumen?: string | null;
  nama_dokumen?: string | null;
  jenis_dokumen: string;
  tanggal_mulai?: string | null;
  tanggal_berakhir?: string | null;
  status_siklus?: 'active' | 'expiring' | 'archived' | null;
  ruang_lingkup_ids?: any[] | null;
  mitra?: {
    id: number;
    nama_mitra: string;
    kode_mitra?: string | null;
    kategori_mitra?: string | null;
    tingkat_perusahaan?: string | null;
  } | null;
  unit_prodi?: { id: number; nama: string; kategori_unit?: string | null; jenis_node?: string | null } | null;
  file?: string | null;
  alasan_arsip?: string | null;
  follow_up?: string | null;
  // Snapshot data pengajuan (tersimpan saat disetujui, aman dari penghapusan pengajuan)
  snap_nama_mitra?: string | null;
  snap_whatsapp_pengusul?: string | null;
  snap_nama_pengusul?: string | null;
  snap_email_pengusul?: string | null;
  snap_jenis_mitra?: string | null;
  snap_tingkat_perusahaan?: string | null;
  pengajuan?: {
    id: number;
    nomor_pengajuan: string;
    nama_pengusul: string;
    whatsapp_pengusul?: string;
    nama_mitra?: string | null;
    user_pengusul_id?: number | null;
    user_pengusul?: { id: number; role: string } | null;
  } | null;
  dokumen_files?: Array<{
    id: number;
    nama_file: string;
    path_file: string;
    peran_berkas?: string | null;
    mime_type?: string | null;
    ukuran_file_bytes?: number | null;
  }> | null;
};

function mapJenis(value?: string | null): 'MoA' | 'MoU' | 'IA' {
  const upper = (value || '').toUpperCase();
  if (upper === 'MOA') return 'MoA';
  if (upper === 'IA') return 'IA';
  return 'MoU';
}

function mapStatus(value: ApiDokumenRow['status_siklus']): RekapDokumen['status'] {
  if (value === 'archived') return 'Kadaluarsa';
  if (value === 'expiring') return 'Akan Berakhir';
  return 'Aktif';
}

function toDisplayDate(value?: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
}

export async function fetchRekapDokumenFromApi(options?: { forceRefresh?: boolean }): Promise<RekapDokumen[]> {
  const shouldUseCache = !options?.forceRefresh;
  const now = Date.now();

  if (shouldUseCache && rekapDokumenCache && rekapDokumenCache.expiresAt > now) {
    return rekapDokumenCache.data;
  }

  if (rekapDokumenInFlight) {
    return rekapDokumenInFlight;
  }

  rekapDokumenInFlight = (async () => {
    const [response] = await Promise.all([
      apiRequest<ApiPaginatedResponse<ApiDokumenRow & { sumber_pengajuan_id?: number | null; keterangan?: string | null }>>('/dokumen-kerjasama?per_page=2000'),
      getCachedMasterRuangLingkup().length === 0 ? getMasterRuangLingkup({ aktif: true }).catch(() => []) : Promise.resolve([]),
    ]);
    const rlLookup = getCachedMasterRuangLingkup();
    const mapped = (response.data?.data ?? []).map((row) => {
    const nomor = row.nomor_dokumen || row.pengajuan?.nomor_pengajuan || `DOK-${row.id}`;
    const tanggalMulaiRaw = row.tanggal_mulai || '';
    
    // Priority: mitra relation → pengajuan.nama_mitra → snap_nama_mitra → keterangan → legacy file name
    let namaMitra = row.mitra?.nama_mitra;

    if (!namaMitra && row.pengajuan?.nama_mitra) {
      namaMitra = row.pengajuan.nama_mitra;
    }

    // Snapshot tersimpan saat pengajuan disetujui — tetap ada meski pengajuan dihapus
    if (!namaMitra && row.snap_nama_mitra) {
      namaMitra = row.snap_nama_mitra;
    }

    if (!namaMitra && row.keterangan && row.keterangan.includes('Mitra:')) {
      const match = row.keterangan.match(/Mitra:\s*(.*?)(?:\s*\|\s*Bidang:|$)/i);
      if (match?.[1]) {
        namaMitra = match[1].trim();
      }
    }

    if (!namaMitra && row.file && !row.file.includes('/')) {
      // Only parse legacy filenames (e.g. "49 MOU Solustar Pte Ltd 2017.pdf"), skip storage paths
      const cleanedFile = row.file.replace(/^\d+\s*(MOU|MOA|IA)\s*/i, '').replace(/\.pdf.*$/i, '').trim();
      if (cleanedFile && cleanedFile.length > 2) {
        namaMitra = cleanedFile;
      }
    }

    // Gunakan dokumen_files (sudah difilter ke peran_berkas='dokumen_final' oleh controller).
    // Fallback ke kolom 'file' hanya untuk record lama yang belum punya dokumen_files.
    let dokumenTerkait: any[] = [];
    const finalFiles = row.dokumen_files ?? [];
    if (finalFiles.length > 0) {
      const seenPaths = new Set<string>();
      dokumenTerkait = finalFiles
        .filter((f) => {
          const key = f.path_file || f.nama_file;
          if (seenPaths.has(key)) return false;
          seenPaths.add(key);
          return true;
        })
        .map((f) => {
        const rawPath = f.path_file || '';
        const fileUrl = buildLegacyFileUrl(rawPath);
        const sizeLabel = f.ukuran_file_bytes
          ? `${Math.round(f.ukuran_file_bytes / 1024)} KB`
          : 'Dokumen Final';
        return {
          nama: f.nama_file,
          url: fileUrl,
          tipe: f.mime_type || (f.nama_file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
          ukuran: sizeLabel,
          tanggal: toDisplayDate(tanggalMulaiRaw),
        };
      });
    } else if (row.file) {
      // Legacy: record lama yang hanya punya kolom 'file'
      dokumenTerkait.push({
        nama: row.file.split('/').pop() || row.file,
        url: buildLegacyFileUrl(row.file),
        tipe: row.file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
        ukuran: 'File System',
        tanggal: toDisplayDate(tanggalMulaiRaw),
      });
    }

      const ruangLingkup = Array.isArray(row.ruang_lingkup_ids)
        ? (row.ruang_lingkup_ids as any[]).map((id) => {
            const numId = Number(id);
            const found = rlLookup.find((item) => item.id === numId);
            return found ? found.nama_ruang_lingkup : String(id);
          }).filter(Boolean)
        : [];

      const kategoriUnitRaw = row.unit_prodi?.kategori_unit?.toLowerCase() ?? '';
      const kategoriUnit: 'Jurusan' | 'Unit' | undefined =
        kategoriUnitRaw === 'jurusan' ? 'Jurusan' :
        kategoriUnitRaw ? 'Unit' : undefined;

      return {
      id: row.id,
      sourcePengajuanId: row.sumber_pengajuan_id || undefined,
      noDokumen: nomor,
      namaMitra: namaMitra || '-',
      jenis: mapJenis(row.jenis_dokumen),
      unit: row.unit_prodi?.nama || '-',
      kategoriUnit,
      tanggalMulai: toDisplayDate(tanggalMulaiRaw),
      berlakuHingga: toDisplayDate(row.tanggal_berakhir),
      tahun: (tanggalMulaiRaw || new Date().toISOString()).slice(0, 4),
      status: mapStatus(row.status_siklus),
      whatsappNumber: row.pengajuan?.whatsapp_pengusul || row.snap_whatsapp_pengusul || undefined,
      dokumenTerkait,
      ruangLingkup,
      alasanArsip: row.alasan_arsip || null,
      buktiPdf: dokumenTerkait.length > 0 ? dokumenTerkait[0].url : null,
      manfaatKerjasama: (row.keterangan && !row.keterangan.includes('Mitra:')) ? row.keterangan : undefined,
      mitraId: row.mitra?.id ?? undefined,
      kodePerusahaan: row.mitra?.kode_mitra || undefined,
      jenisMitra: row.mitra?.kategori_mitra || row.snap_jenis_mitra || undefined,
      tingkatPerusahaan: row.mitra?.tingkat_perusahaan || row.snap_tingkat_perusahaan || undefined,
      followUp: row.follow_up || undefined,
      dibuatOlehRole: row.pengajuan?.user_pengusul?.role || null,
    };
  });

    rekapDokumenCache = {
      data: mapped,
      expiresAt: Date.now() + REKAP_CACHE_TTL_MS,
    };

    return mapped;
  })();

  try {
    return await rekapDokumenInFlight;
  } finally {
    rekapDokumenInFlight = null;
  }
}

function mapStatusToApi(status: string): 'active' | 'expiring' | 'archived' {
  if (status === 'Akan Berakhir') return 'expiring';
  if (status === 'Kadaluarsa') return 'archived';
  return 'active';
}

function mapJenisToApi(jenis: string): 'MOU' | 'MOA' | 'IA' {
  const upper = jenis.toUpperCase();
  if (upper === 'MOA') return 'MOA';
  if (upper === 'IA') return 'IA';
  return 'MOU';
}

export async function updateDokumenKerjasamaById(
  id: number,
  payload: {
    nomor_dokumen?: string;
    nama_dokumen?: string;
    jenis_dokumen?: string;
    tanggal_mulai?: string | null;
    tanggal_berakhir?: string | null;
    status_siklus?: 'active' | 'expiring' | 'archived';
    keterangan?: string | null;
    follow_up?: string | null;
    mitra_id?: number | null;
  }
): Promise<void> {
  await apiRequest<unknown>(`/dokumen-kerjasama/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  rekapDokumenCache = null;
}

export async function createDokumenKerjasama(payload: {
  nomor_dokumen: string;
  nama_dokumen: string;
  jenis_dokumen: string;
  unit_prodi_id: number;
  mitra_id?: number | null;
  tanggal_mulai?: string | null;
  tanggal_berakhir?: string | null;
  status_siklus?: 'active' | 'expiring' | 'archived';
  keterangan?: string | null;
}): Promise<{ id: number }> {
  const response = await apiRequest<{ success: boolean; data: { id: number }; message: string }>('/dokumen-kerjasama/manual', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  rekapDokumenCache = null;
  return response.data;
}

export async function updatePengajuanNamaMitra(
  pengajuanId: number,
  namaMitra: string
): Promise<void> {
  await apiRequest<unknown>(`/pengajuan/${pengajuanId}`, {
    method: 'PATCH',
    body: JSON.stringify({ nama_mitra: namaMitra }),
  });
}

export async function uploadDokumenFile(
  id: number,
  blob: Blob,
  fileName: string
): Promise<void> {
  const formData = new FormData();
  formData.append('file', blob, fileName);
  await apiRequest<unknown>(`/dokumen-kerjasama/${id}/upload-file`, {
    method: 'POST',
    body: formData,
  });
  rekapDokumenCache = null;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const byteChars = atob(data);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  return new Blob([byteArray], { type: mime });
}

export { mapStatusToApi, mapJenisToApi, dataUrlToBlob };

export async function deleteDokumenKerjasamaById(id: number): Promise<void> {
  await apiRequest(`/dokumen-kerjasama/${id}`, {
    method: 'DELETE',
  });

  rekapDokumenCache = null;
}

export type ArsipDokumenApiItem = {
  id: number;
  noDokumen: string;
  namaMitra: string;
  jenis: 'MoA' | 'MoU' | 'IA';
  tanggalMulai: string;
  berlakuHingga: string;
  alasanArsip: string | null;
  buktiPdf: string | null;
};

export async function fetchArsipDokumenFromApi(): Promise<ArsipDokumenApiItem[]> {
  const items = await fetchRekapDokumenFromApi();
  return items
    .filter((item) => item.status === 'Akan Berakhir' || item.status === 'Kadaluarsa')
    .map((item, index) => ({
      id: index + 1,
      noDokumen: item.noDokumen,
      namaMitra: item.namaMitra,
      jenis: item.jenis,
      tanggalMulai: item.tanggalMulai,
      berlakuHingga: item.berlakuHingga,
      alasanArsip: (item as any).alasanArsip || null,
      buktiPdf: (item as any).buktiPdf || null,
    }));
}
