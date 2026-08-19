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
  // Semua file diunggah lewat Storage::disk('public') dan disimpan langsung di bawah
  // storage/app/public/<folder>/... (mis. "pengajuan/2026/08/berkas.doc"), diakses lewat
  // symlink public/storage. Path TIDAK pernah punya prefix "uploads/" di disk sebenarnya —
  // dulu ada fallback yang nambahin "uploads/" di sini dan itu yang bikin link jadi 403
  // (folder storage/app/public/uploads memang tidak pernah ada).
  const clean = filePath.replace(/^\/+/, '').replace(/^storage\//, '');
  return `${origin}/storage/${clean}`;
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
    bidang_usaha?: string | null;
    tingkat_perusahaan?: string | null;
    alamat?: string | null;
    negara?: string | null;
    nama_kontak_utama?: string | null;
    jabatan_kontak_utama?: string | null;
    telepon_kontak_utama?: string | null;
  } | null;
  unit_prodi?: {
    id: number;
    nama: string;
    kategori_unit?: string | null;
    jenis_node?: string | null;
    parent?: { id: number; nama: string; jenis_node?: string | null; kategori_unit?: string | null } | null;
  } | null;
  file?: string | null;
  alasan_arsip?: string | null;
  follow_up?: string | null;
  judul_dokumen?: string | null;
  manfaat?: string | null;
  luaran_kerja_sama?: string | null;
  // Snapshot data pengajuan (tersimpan saat disetujui, aman dari penghapusan pengajuan)
  snap_nama_mitra?: string | null;
  snap_whatsapp_pengusul?: string | null;
  snap_nama_pengusul?: string | null;
  snap_email_pengusul?: string | null;
  snap_jenis_mitra?: string | null;
  snap_bidang_usaha?: string | null;
  snap_tingkat_perusahaan?: string | null;
  laporan_pelaksanaan?: Array<{
    id: number;
    tahun?: number | null;
    triwulan?: number | null;
    file_path?: string | null;
    file_nama?: string | null;
  }> | null;
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

function mapJenis(value?: string | null): 'MoA' | 'MoU' | 'IA' | 'Lainnya' {
  const upper = (value || '').toUpperCase();
  if (upper === 'MOA') return 'MoA';
  if (upper === 'IA') return 'IA';
  if (upper === 'LAINNYA') return 'Lainnya';
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

    // dokumen_files dari controller sudah dibatasi ke peran_berkas 'dokumen_final',
    // 'dokumen_perpanjangan', atau 'dokumen_pendukung' — pisahkan lagi di sini supaya dokumen
    // pendukung (TOR/KAK/Proposal) tidak ikut nyampur ke kartu dokumen utama.
    // Fallback ke kolom 'file' hanya untuk record lama yang belum punya dokumen_files.
    let dokumenTerkait: any[] = [];
    const allFiles = row.dokumen_files ?? [];
    const finalFiles = allFiles.filter((f) => f.peran_berkas !== 'dokumen_pendukung');
    const dokumenPendukungTerkait = allFiles
      .filter((f) => f.peran_berkas === 'dokumen_pendukung')
      .map((f) => ({
        nama: f.nama_file,
        url: buildLegacyFileUrl(f.path_file || ''),
        tipe: f.mime_type || (f.nama_file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
        ukuran: f.ukuran_file_bytes ? `${Math.round(f.ukuran_file_bytes / 1024)} KB` : 'Dokumen Pendukung',
        tanggal: toDisplayDate(tanggalMulaiRaw),
      }));
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

      //jurusanNama, prodiNama, unitKerjaNama diambil dari unit_prodi (jika ada) sesuai jenis_node dan kategori_unit  
      const jenisNode = row.unit_prodi?.jenis_node?.toLowerCase();
      let jurusanNama: string | undefined;
      let prodiNama: string | undefined;
      let unitKerjaNama: string | undefined;
      if (jenisNode === 'prodi') {
        prodiNama = row.unit_prodi?.nama || undefined;
        jurusanNama = row.unit_prodi?.parent?.nama || undefined;
      } else if (jenisNode === 'unit' && kategoriUnitRaw === 'jurusan') {
        jurusanNama = row.unit_prodi?.nama || undefined;
      } else if (row.unit_prodi?.nama) {
        unitKerjaNama = row.unit_prodi.nama;
      }

      // Durasi kerja sama dalam tahun (desimal 1 angka di belakang koma), dihitung dari selisih tanggal.
      let durasiTahun: number | undefined;
      if (row.tanggal_mulai && row.tanggal_berakhir) {
        const startMs = new Date(row.tanggal_mulai).getTime();
        const endMs = new Date(row.tanggal_berakhir).getTime();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
          const years = (endMs - startMs) / (1000 * 60 * 60 * 24 * 365.25);
          durasiTahun = Math.round(years * 10) / 10;
        }
      }

      // Tingkat perusahaan dipecah jadi 3 kolom Ya/Tidak sesuai struktur rekap Excel.
      // "Multinasional" dianggap masuk kelompok Internasional.
      const tingkatRaw = (row.mitra?.tingkat_perusahaan || row.snap_tingkat_perusahaan || '').toLowerCase();
      const tingkatInternasional = tingkatRaw === 'internasional' || tingkatRaw === 'multinasional';
      const tingkatNasional = tingkatRaw === 'nasional';
      const tingkatLokal = tingkatRaw === 'lokal';

      // Hasil Monitoring Triwulan 1-4: ditandai terisi kalau pernah ada laporan pelaksanaan
      // dengan nomor triwulan tsb (lintas tahun — belum discope ke tahun tertentu).
      const laporanList = row.laporan_pelaksanaan ?? [];
      const triwulanSet = new Set(
        laporanList.map((l) => l.triwulan).filter((t): t is number => typeof t === 'number'),
      );
      const laporanKegiatanLinks = laporanList
        .filter((l) => !!l.file_path)
        .map((l) => buildLegacyFileUrl(l.file_path as string));
      // Prioritas bukti dokumen: dokumen_final (dokumen_files) → file (legacy) → laporan pelaksanaan (PDF)
      const jenisUpper = (row.jenis_dokumen || '').toUpperCase();
      const primaryLink = dokumenTerkait.length > 0 ? dokumenTerkait[0].url : null;
      const buktiMou = jenisUpper === 'MOU' ? primaryLink : null;
      const buktiMoaPks = jenisUpper === 'MOA' ? primaryLink : null;
      const buktiIa = jenisUpper === 'IA' ? primaryLink : null;

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
      tanggalMulaiRaw: tanggalMulaiRaw || undefined,
      berlakuHinggaRaw: row.tanggal_berakhir || undefined,
      tahun: (tanggalMulaiRaw || new Date().toISOString()).slice(0, 4),
      status: mapStatus(row.status_siklus),
      whatsappNumber: row.pengajuan?.whatsapp_pengusul || row.snap_whatsapp_pengusul || undefined,
      dokumenTerkait,
      dokumenPendukungTerkait: dokumenPendukungTerkait.length > 0 ? dokumenPendukungTerkait : undefined,
      ruangLingkup,
      ruangLingkupIds: Array.isArray(row.ruang_lingkup_ids) ? (row.ruang_lingkup_ids as number[]) : undefined,
      mitraNegara: row.mitra?.negara || undefined,
      // unitProdiId menunjuk ke node yang benar-benar tersimpan di dokumen_kerjasama.unit_prodi_id
      // (bisa Jurusan/Unit ATAU Prodi). jurusanUnitProdiId cuma terisi kalau node itu Prodi (anak
      // dari Jurusan) — dipakai form edit untuk prefill dropdown Jurusan → Prodi bertingkat.
      unitProdiId: row.unit_prodi?.id ?? undefined,
      jurusanUnitProdiId: row.unit_prodi?.jenis_node === 'prodi' ? (row.unit_prodi?.parent?.id ?? undefined) : undefined,
      alasanArsip: row.alasan_arsip || null,
      buktiPdf: dokumenTerkait.length > 0 ? dokumenTerkait[0].url : null,
      manfaatKerjasama: (row.keterangan && !row.keterangan.includes('Mitra:')) ? row.keterangan : undefined,
      mitraId: row.mitra?.id ?? undefined,
      kodePerusahaan: row.mitra?.kode_mitra || undefined,
      jenisMitra: row.mitra?.kategori_mitra || row.snap_jenis_mitra || undefined,
      tingkatPerusahaan: row.mitra?.tingkat_perusahaan || row.snap_tingkat_perusahaan || undefined,
      followUp: row.follow_up || undefined,
      dibuatOlehRole: row.pengajuan?.user_pengusul?.role || null,

      bidangUsaha: row.mitra?.bidang_usaha || row.snap_bidang_usaha || undefined,
      alamatMitra: row.mitra?.alamat || undefined,
      picMitra: row.mitra?.nama_kontak_utama || undefined,
      jabatanPicMitra: row.mitra?.jabatan_kontak_utama || undefined,
      picJurusanUnit: row.pengajuan?.nama_pengusul || row.snap_nama_pengusul || undefined,
      tingkatInternasional,
      tingkatNasional,
      tingkatLokal,
      judulKegiatan: row.judul_dokumen || row.nama_dokumen || undefined,
      luaranKerjaSama: row.luaran_kerja_sama || undefined,
      manfaatSebenarnya: row.manfaat || undefined,
      keteranganAsli: row.keterangan || undefined,
      durasiTahun,
      jurusanNama,
      prodiNama,
      unitKerjaNama,
      triwulan1: triwulanSet.has(1),
      triwulan2: triwulanSet.has(2),
      triwulan3: triwulanSet.has(3),
      triwulan4: triwulanSet.has(4),
      buktiMou,
      buktiMoaPks,
      buktiIa,
      laporanKegiatanLinks,
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

function mapJenisToApi(jenis: string): 'MOU' | 'MOA' | 'IA' | 'LAINNYA' {
  const upper = jenis.toUpperCase();
  if (upper === 'MOA') return 'MOA';
  if (upper === 'IA') return 'IA';
  if (upper === 'LAINNYA') return 'LAINNYA';
  return 'MOU';
}

export async function updateDokumenKerjasamaById(
  id: number,
  payload: {
    nomor_dokumen?: string;
    nama_dokumen?: string;
    judul_dokumen?: string | null;
    jenis_dokumen?: string;
    unit_prodi_id?: number;
    tanggal_mulai?: string | null;
    tanggal_berakhir?: string | null;
    status_siklus?: 'active' | 'expiring' | 'archived';
    keterangan?: string | null;
    follow_up?: string | null;
    manfaat?: string | null;
    luaran_kerja_sama?: string | null;
    ruang_lingkup_ids?: number[] | null;
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
  judul_dokumen?: string | null;
  jenis_dokumen: string;
  unit_prodi_id: number;
  mitra_id?: number | null;
  tanggal_mulai?: string | null;
  tanggal_berakhir?: string | null;
  status_siklus?: 'active' | 'expiring' | 'archived';
  keterangan?: string | null;
  manfaat?: string | null;
  luaran_kerja_sama?: string | null;
  ruang_lingkup_ids?: number[] | null;
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
  fileName: string,
  peranBerkas?: 'dokumen_final' | 'dokumen_pendukung'
): Promise<void> {
  const formData = new FormData();
  formData.append('file', blob, fileName);
  if (peranBerkas) {
    formData.append('peran_berkas', peranBerkas);
  }
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
  jenis: 'MoA' | 'MoU' | 'IA' | 'Lainnya';
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
