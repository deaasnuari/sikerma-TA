import { addAdminNotification, getUnreadNotificationCount } from '@/services/adminService';
import { jenisBerkasKeApi, labelJenisBerkas } from '@/lib/jenisBerkas';
import { removeMonitoringByPengajuanId, upsertMonitoringFromPengajuan } from '@/services/adminMonitoringService';
import { bulanOptions, removeRekapByPengajuanId, semuaBulanLabel, upsertRekapFromPengajuan } from '@/services/adminRekapDataService';
import { hideStoryByPengajuanId, initAktivitasOnApproval } from '@/services/adminStoryAktivitasService';
import { apiRequest } from '@/lib/api';

export type PengajuanStatus =
  | 'Menunggu'
  | 'Menunggu Review'
  | 'Diproses'
  | 'Revisi'
  | 'Disetujui Internal'
  | 'Disetujui Mitra'
  | 'Final Approved'
  | 'Disetujui'
  | 'Ditolak';

export type PengajuanFileAttachment = {
  name: string;
  url: string;
  pathFile?: string;
  type?: string;
  size?: number;
  isAcc?: boolean;
  // Jenis berkas (mis. berkas final MoU vs MoA) bila pengajuannya memuat beberapa jenis; kosong = tidak dibedakan.
  jenisDokumen?: string;
};

// Tipe utama untuk satu data pengajuan kerjasama (Struktur Baru).
export interface PengajuanItem {
  id: number;
  nomorPengajuan: string;
  judulPengajuan: string;
  deskripsiPengajuan?: string;
  // Manfaat bagi Polibatam/Prodi (opsional, bisa kosong).
  manfaat?: string;
  luaranKerjaSama?: string;
  namaPengusul: string;
  // Nama akun SIKERMA yang benar-benar login & submit (bisa beda dari namaPengusul yang diketik manual).
  akunPengaju?: string;
  jabatanPengusul?: string;
  diajukanPada: string;
  mitraId?: number;
  namaMitra: string;
  // Jenis UTAMA (jenis pertama yang dipilih) — dipakai semua logika lama (template, filter, penomoran).
  jenisDokumen: string;
  // Semua jenis bila satu pengajuan memuat beberapa jenis sekaligus (mis. ['MoU', 'MoA']); kosong = hanya jenisDokumen.
  jenisDokumenList?: string[];
  mitraKategori?: string;
  mitraBidangUsaha?: string;
  mitraTingkatPerusahaan?: string;
  mitraNegara?: string;
  mitraAlamat?: string;
  mitraEmail?: string;
  mitraTelepon?: string;
  // No. Telepon mitra (terpisah dari WhatsApp di atas) — field tambahan di "Informasi Mitra".
  mitraNoTelepon?: string;
  // Kontak PIC mitra (dari bagian "Kontak Person Mitra" di form) — disinkronkan server-side
  // ke master_mitra.nama_kontak_utama dkk saat submit, supaya PIC muncul di Rekap Data
  // tanpa perlu izin admin (endpoint /master/mitra sendiri admin-only).
  mitraPicNama?: string;
  mitraPicJabatan?: string;
  mitraPicEmail?: string;
  mitraPicTelepon?: string;
  // PIC dari pihak Polibatam (bukan mitra).
  picPolibatamNama?: string;
  picPolibatamJabatan?: string;
  picPolibatamEmail?: string;
  picPolibatamTelepon?: string;
  unitProdiId?: number;
  // Pilihan majemuk: unitProdiId di atas = yang utama (pertama). jurusanIds hanya dikirim saat
  // submit supaya backend bisa memvalidasi tiap prodi memang anak dari salah satu jurusan itu.
  unitProdiIds?: number[];
  jurusanIds?: number[];
  namaUnitProdi: string;
  kategoriPengajuan?: 'Internal' | 'Eksternal';
  tanggalMulai?: string;
  tanggalBerakhir?: string;
  emailPengusul?: string;
  whatsappPengusul?: string;
  emailTerverifikasiPada?: string;
  ruangLingkupIds: number[];
  ruangLingkup: string[]; // For display fallback
  statusPengajuan: PengajuanStatus;
  fileName?: string;
  fileAttachments?: PengajuanFileAttachment[];
  // Berkas Word dari admin saat meminta revisi (peran_berkas 'dokumen_revisi'); sengaja dipisah dari
  // fileAttachments supaya tidak tercampur dengan lampiran pengusul.
  revisiFiles?: { name: string; url: string }[];
  // Dokumen perpanjangan milik kerja sama dari pengajuan ini (peran_berkas 'dokumen_perpanjangan').
  perpanjanganFiles?: { name: string; url: string }[];
  reviewComment?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  catatan?: string | null;
  keputusan?: string | null;
  catatanRevisi?: string | null;
  accInternalAt?: string | null;
  accMitraAt?: string | null;
  finalApprovedAt?: string | null;
  finalFileName?: string | null;
  finalFilePath?: string | null;
  tahapanStage?: string | null;
  tahapanGroup?: string | null;
  tahapanRiwayat?: { stage: string; group: string; changedAt: string; changedBy?: string }[];
  // Diisi backend saat pengusul mengirim ulang pengajuan yang diminta Revisi.
  direvisiPengusulPada?: string | null;
  isFromAdmin?: boolean;
  // Token optimistic locking: waktu terakhir pengajuan diubah di server saat data ini dimuat.
  // Dikirim balik saat menyimpan supaya backend bisa menolak (409) bila sudah diubah orang lain.
  updatedAt?: string;
  // Id user internal yang di-"distribusi"/CC-kan admin saat ACC, supaya mereka tahu ikut melihat dokumen final ini.
  distribusiUserIds?: number[];
}

// Key localStorage untuk menyimpan seluruh data pengajuan di sisi frontend.
const STORAGE_KEY = 'pengajuanKerjasamaData';
const ATTACHMENT_CACHE_KEY = 'pengajuanAttachmentCache';

type AttachmentCacheEntry = {
  fileName?: string;
  fileAttachments?: PengajuanFileAttachment[];
};

function pickOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function getAttachmentCache(): Record<string, AttachmentCacheEntry> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(ATTACHMENT_CACHE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, AttachmentCacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAttachmentCacheEntry(id: number, entry: AttachmentCacheEntry): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedAttachments = (entry.fileAttachments || [])
    .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 0)
    .map((item) => ({
      name: item.name,
      // Data URI base64 (bisa beberapa MB per file) sengaja tidak ikut disimpan — cache ini
      // dipakai berulang tiap kali ada pengajuan baru dan gampang bikin quota localStorage
      // penuh. URL asli didapat lagi dari respons API (pengajuan_file) saat data di-refetch.
      url: item.url && item.url.startsWith('data:') ? '' : (item.url || ''),
      type: item.type,
      size: item.size,
      isAcc: item.isAcc,
      jenisDokumen: item.jenisDokumen,
    }));

  const nextEntry: AttachmentCacheEntry = {
    fileName: entry.fileName,
    fileAttachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
  };

  const cache = getAttachmentCache();
  cache[String(id)] = nextEntry;

  try {
    window.localStorage.setItem(ATTACHMENT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore quota/storage errors for best-effort cache.
  }
}

function getAttachmentCacheEntry(id: number): AttachmentCacheEntry | undefined {
  const cache = getAttachmentCache();
  return cache[String(id)];
}

// Mapping warna badge berdasarkan jenis dokumen.
export const pengajuanDokumenBadge: Record<string, string> = {
  MoA: 'bg-[#1E376C] text-white',
  MoU: 'bg-purple-700 text-white',
  PKS: 'bg-teal-700 text-white',
};

export interface PengajuanFilterOptions {
  filterStatus: string;
  filterJurusan: string;
  filterTahun: string;
  search: string;
}

export const pengajuanJurusanOptions = [
  'Manajemen dan Bisnis',
  'Teknik Elektro',
  'Teknik Informatika',
  'Teknik Mesin',
];

export const pengajuanUnitOptions = [
  'SHILAU (Satuan Hilirisasi Inovasi dan Layanan Usaha)',
  'P4M (Pusat Penjaminan Mutu dan Pengembangan Pembelajaran)',
  'P3M (Pusat Penelitian dan Pengabdian Kepada Masyarakat)',
  'SPI (Satuan Pengawas Internal)',
  'Akademik (Subag Akademik)',
  'SBUM (Sub Bagian Umum)',
  'UPA PKK (Pengembangan Karier dan Kewirausahaan)',
  'UPA Perpustakaan',
  'UPA PP (Perbaikan dan Perawatan)',
  'UPA TIK (Teknologi Informasi dan Komunikasi)',
  'Pokja OSDM (Organisasi dan SDM)',
  'Pokja Perencanaan',
  'Pokja Kemahasiswaan',
  'Pokja BMN & Pengadaan',
  'Pokja Keuangan',
  'Pokja Humas dan Kerjasama',
];

export const pengajuanJurusanUnitOptions = [...pengajuanJurusanOptions, ...pengajuanUnitOptions];

type ApiListResponse<T> = {
  success: boolean;
  message: string;
  data: T[] | { data: T[] };
};

type ApiSingleResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

type ApiPengajuanRow = {
  id: number;
  updated_at?: string | null;
  // New schema keys
  nomor_pengajuan: string;
  nama_pengusul: string;
  jabatan_pengusul?: string | null;
  email_pengusul?: string | null;
  whatsapp_pengusul?: string | null;
  pic_polibatam_nama?: string | null;
  pic_polibatam_jabatan?: string | null;
  pic_polibatam_email?: string | null;
  pic_polibatam_whatsapp?: string | null;
  unit_prodi_id?: number | null;
  mitra_id?: number | null;
  jenis_mitra?: string | null;
  bidang_usaha?: string | null;
  tingkat_perusahaan?: string | null;
  judul_pengajuan: string;
  deskripsi_pengajuan?: string | null;
  manfaat?: string | null;
  luaran_kerja_sama?: string | null;
  jenis_dokumen: string;
  jenis_dokumen_list?: string[] | null;
  kategori_pengajuan?: 'internal' | 'eksternal' | null;
  ruang_lingkup_ids?: number[] | null;
  tanggal_mulai?: string | null;
  tanggal_berakhir?: string | null;
  status_pengajuan:
    | 'menunggu'
    | 'diproses'
    | 'disetujui'
    | 'ditolak'
    | 'revisi'
    | 'disetujui_internal'
    | 'disetujui_mitra'
    | 'final_approved';
  diajukan_pada?: string | null;
  unit_prodi?: { id: number; nama: string } | null;
  unit_prodi_items?: { id: number; nama: string; jenis_node?: string | null; parent_id?: number | null }[] | null;
  user_pengusul?: { id: number; name: string; username?: string | null } | null;
  mitra?: { id: number; nama_mitra: string; kategori_mitra?: string | null; bidang_usaha?: string | null; tingkat_perusahaan?: string | null; negara?: string | null; alamat?: string | null; email_mitra?: string | null; whatsapp_mitra?: string | null; no_telepon_mitra?: string | null; nama_kontak_utama?: string | null; jabatan_kontak_utama?: string | null; email_kontak_utama?: string | null; telepon_kontak_utama?: string | null; } | string | null;
  // Legacy schema keys (from recent pulled backend)
  judul?: string;
  deskripsi?: string | null;
  pengusul?: string;
  tanggal?: string | null;
  mitra_nama?: string | null;
  nama_mitra?: string | null;
  jurusan?: string | null;
  kategori?: 'Internal' | 'Eksternal' | null;
  ruang_lingkup?: string[] | null;
  status?: 'menunggu' | 'diproses' | 'disetujui' | 'ditolak';
  catatan?: string | null;
  keputusan?: string | null;
  catatan_revisi?: string | null;
  acc_internal_at?: string | null;
  acc_mitra_at?: string | null;
  final_approved_at?: string | null;
  final_file_name?: string | null;
  final_file_path?: string | null;
  tahapan_stage?: string | null;
  tahapan_group?: string | null;
  tahapan_riwayat?: { stage: string; group: string; changed_at: string; changed_by?: string }[] | null;
  direvisi_pengusul_pada?: string | null;
  distribusi_user_ids?: number[] | null;
  file_name?: string | null;
  file_attachments?: {
    name?: string;
    url?: string;
    type?: string;
    size?: number;
    isAcc?: boolean;
  }[] | null;
  dokumen_files?: {
    id: number;
    nama_file: string;
    path_file: string;
    peran_berkas?: string;
    jenis_dokumen?: string | null;
  }[];
  pengajuan_files?: {
    id: number;
    nama_file: string;
    path_file: string;
    peran_berkas?: string;
    jenis_dokumen?: string | null;
  }[];
  dokumen_kerjasama?: {
    id: number;
    nomor_dokumen?: string | null;
    file?: string | null;
    dokumen_files?: {
      id: number;
      nama_file: string;
      path_file: string;
      peran_berkas?: string | null;
      jenis_dokumen?: string | null;
      mime_type?: string | null;
      ukuran_file_bytes?: number | null;
    }[] | null;
  } | null;
};

function getBackendOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured && /^https?:\/\//i.test(configured)) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to default
    }
  }

  return 'http://127.0.0.1:8000';
}

function buildAttachmentUrl(pathFile: string): string {
  if (/^https?:\/\//i.test(pathFile)) {
    return pathFile;
  }

  if (/^data:/i.test(pathFile)) {
    return pathFile;
  }

  const origin = getBackendOrigin();
  let normalized = pathFile.replace(/\\/g, '/').replace(/^\/+/, '');
  normalized = normalized.replace(/^storage\//, '');

  return `${origin}/storage/${normalized}`;
}

function extractApiRows(response: ApiListResponse<ApiPengajuanRow>): ApiPengajuanRow[] {
  if (Array.isArray(response.data)) {
    return response.data;
  }

  return response.data?.data ?? [];
}

// Semua jenis dokumen sebuah pengajuan: satu jenis biasanya, beberapa bila MoU + MoA dikirim sekaligus.
export function daftarJenisDokumen(item: Pick<PengajuanItem, 'jenisDokumen' | 'jenisDokumenList'>): string[] {
  return item.jenisDokumenList && item.jenisDokumenList.length > 1 ? item.jenisDokumenList : [item.jenisDokumen];
}

// Label tampilan, mis. "MoU + MoA".
export function labelJenisDokumen(item: Pick<PengajuanItem, 'jenisDokumen' | 'jenisDokumenList'>): string {
  return daftarJenisDokumen(item).join(' + ');
}

function mapJenisDokumenFromApi(value: string): string {
  const upper = value.toUpperCase();
  if (upper === 'MOA') return 'MoA';
  if (upper === 'IA') return 'IA';
  if (upper === 'LAINNYA') return 'Lainnya';
  return 'MoU';
}

function mapJenisDokumenToApi(value: string): 'MOU' | 'MOA' | 'IA' | 'LAINNYA' {
  const upper = value.toUpperCase();
  if (upper === 'MOA') return 'MOA';
  if (upper === 'IA') return 'IA';
  if (upper === 'LAINNYA') return 'LAINNYA';
  return 'MOU';
}

function mapStatusFromApi(value: ApiPengajuanRow['status_pengajuan']): PengajuanStatus {
  const valStr = (value as string) || 'menunggu';
  if (valStr === 'diproses') return 'Diproses';
  if (valStr === 'revisi') return 'Revisi';
  if (valStr === 'disetujui_internal') return 'Disetujui Internal';
  if (valStr === 'disetujui_mitra') return 'Disetujui Mitra';
  if (valStr === 'final_approved') return 'Final Approved';
  if (valStr === 'disetujui') return 'Disetujui';
  if (valStr === 'selesai') return 'Disetujui';
  if (valStr === 'verifikasi') return 'Diproses';
  if (valStr === 'ditolak') return 'Ditolak';
  return 'Menunggu Review';
}

function mapStatusToApi(
  value: PengajuanStatus
): 'menunggu' | 'diproses' | 'disetujui' | 'ditolak' | 'revisi' | 'disetujui_internal' | 'disetujui_mitra' | 'final_approved' {
  if (value === 'Diproses') return 'diproses';
  if (value === 'Revisi') return 'revisi';
  if (value === 'Disetujui Internal') return 'disetujui_internal';
  if (value === 'Disetujui Mitra') return 'disetujui_mitra';
  if (value === 'Final Approved') return 'final_approved';
  if (value === 'Disetujui') return 'disetujui';
  if (value === 'Ditolak') return 'ditolak';
  return 'menunggu';
}

function mapApiPengajuanToItem(row: ApiPengajuanRow): PengajuanItem {
  const tanggalRaw = row.diajukan_pada || row.tanggal;
  const diajukanPada = tanggalRaw ? tanggalRaw.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const statusApi = row.status_pengajuan || row.status || 'menunggu';

  const mitraNama =
    row.nama_mitra ||
    (typeof row.mitra === 'object' && row.mitra !== null ? row.mitra.nama_mitra : null) ||
    row.mitra_nama ||
    '-';

  let resolvedRuangLingkup: string[] = [];
  if (Array.isArray(row.ruang_lingkup) && row.ruang_lingkup.length > 0) {
    resolvedRuangLingkup = row.ruang_lingkup;
  } else if (Array.isArray(row.ruang_lingkup_ids) && row.ruang_lingkup_ids.length > 0) {
    let cachedMaster: { id: number; nama_ruang_lingkup: string }[] = [];
    try {
      const module = require('@/services/masterRuangLingkupService');
      cachedMaster = module.getCachedMasterRuangLingkup() || [];
    } catch {
      // ignored
    }
    resolvedRuangLingkup = row.ruang_lingkup_ids.map((id) => {
      const found = cachedMaster.find((m) => m.id === id);
      return found ? found.nama_ruang_lingkup : `RL-${id}`;
    });
  }

  // Resolve file attachments: prefer pengajuan_file relation, then file_attachments JSON, then cache
  const allAttachmentRows = row.pengajuan_files ?? row.dokumen_files;
  const attachmentRows = allAttachmentRows?.filter((file) => file.peran_berkas !== 'dokumen_revisi');
  const revisiFiles = (allAttachmentRows ?? [])
    .filter((file) => file.peran_berkas === 'dokumen_revisi')
    .map((file) => ({ name: file.nama_file, url: buildAttachmentUrl(file.path_file) }));
  const cachedAttachment = getAttachmentCacheEntry(row.id);

  const fallbackAttachments: PengajuanFileAttachment[] = Array.isArray(row.file_attachments)
    ? row.file_attachments
        .filter((file) => typeof file?.name === 'string' && file.name.trim().length > 0)
        .map((file) => ({
          name: String(file.name),
          url: typeof file.url === 'string' && file.url.trim() !== '' ? buildAttachmentUrl(file.url) : '',
          type: typeof file.type === 'string' ? file.type : undefined,
          size: typeof file.size === 'number' ? file.size : undefined,
          isAcc: file.isAcc === true,
        }))
    : [];

  const resolvedFileName = row.file_name || cachedAttachment?.fileName || undefined;

  // Use attachmentRows only when it has actual entries — an empty array means no records in the
  // pengajuan_file table, so fall through to the file_attachments JSON column or cache.
  let resolvedAttachments: PengajuanFileAttachment[] | undefined = attachmentRows?.length
    ? attachmentRows.map((file) => ({
        name: file.nama_file,
        url: buildAttachmentUrl(file.path_file),
        pathFile: file.path_file,
        isAcc: file.peran_berkas === 'dokumen_final',
        jenisDokumen: labelJenisBerkas(file.jenis_dokumen),
      }))
    : (fallbackAttachments.length > 0 ? fallbackAttachments : cachedAttachment?.fileAttachments);

  // Fallback untuk data lama: gunakan file dari dokumen_kerjasama yang terhubung
  if (!resolvedAttachments?.length && !resolvedFileName) {
    const dk = row.dokumen_kerjasama;
    if (dk?.dokumen_files?.length) {
      resolvedAttachments = dk.dokumen_files.map((f) => ({
        name: f.nama_file,
        url: buildAttachmentUrl(f.path_file),
        pathFile: f.path_file,
        isAcc: f.peran_berkas === 'dokumen_final',
        jenisDokumen: labelJenisBerkas(f.jenis_dokumen),
      }));
    } else if (dk?.file) {
      const legacyPath = dk.file.startsWith('http') || dk.file.startsWith('storage/')
        ? dk.file
        : `uploads/${dk.file}`;
      resolvedAttachments = [{
        name: dk.file.split('/').pop() || dk.file,
        url: buildAttachmentUrl(legacyPath),
        isAcc: true,
      }];
    }
  }

  if (resolvedFileName || (resolvedAttachments && resolvedAttachments.length > 0)) {
    saveAttachmentCacheEntry(row.id, {
      fileName: resolvedFileName,
      fileAttachments: resolvedAttachments,
    });
  }

  return {
    id: row.id,
    nomorPengajuan: row.nomor_pengajuan || `PGJ-LEGACY-${row.id}`,
    judulPengajuan: row.judul_pengajuan || row.judul || '-',
    deskripsiPengajuan: (row.deskripsi_pengajuan ?? row.deskripsi) || undefined,
    manfaat: row.manfaat || undefined,
    luaranKerjaSama: row.luaran_kerja_sama || undefined,
    namaPengusul: row.nama_pengusul || row.pengusul || '-',
    akunPengaju: row.user_pengusul?.name || undefined,
    jabatanPengusul: row.jabatan_pengusul || undefined,
    diajukanPada,
    mitraId: row.mitra_id ?? undefined,
    namaMitra: mitraNama,
    mitraKategori: row.jenis_mitra || (typeof row.mitra === 'object' && row.mitra !== null && 'kategori_mitra' in row.mitra ? row.mitra.kategori_mitra || undefined : undefined),
    mitraBidangUsaha: row.bidang_usaha || (typeof row.mitra === 'object' && row.mitra !== null && 'bidang_usaha' in row.mitra ? (row.mitra as { bidang_usaha?: string | null }).bidang_usaha || undefined : undefined),
    mitraTingkatPerusahaan: row.tingkat_perusahaan || (typeof row.mitra === 'object' && row.mitra !== null && 'tingkat_perusahaan' in row.mitra ? (row.mitra as { tingkat_perusahaan?: string | null }).tingkat_perusahaan || undefined : undefined),
    mitraNegara: typeof row.mitra === 'object' && row.mitra !== null && 'negara' in row.mitra ? row.mitra.negara || pickOptionalString((row as Record<string, unknown>).negara) : pickOptionalString((row as Record<string, unknown>).negara),
    mitraAlamat: typeof row.mitra === 'object' && row.mitra !== null && 'alamat' in row.mitra ? row.mitra.alamat || pickOptionalString((row as Record<string, unknown>).alamat_mitra) : pickOptionalString((row as Record<string, unknown>).alamat_mitra),
    mitraEmail: typeof row.mitra === 'object' && row.mitra !== null && 'email_mitra' in row.mitra ? row.mitra.email_mitra || pickOptionalString((row as Record<string, unknown>).email_mitra) : pickOptionalString((row as Record<string, unknown>).email_mitra),
    mitraTelepon: typeof row.mitra === 'object' && row.mitra !== null && 'whatsapp_mitra' in row.mitra ? row.mitra.whatsapp_mitra || pickOptionalString((row as Record<string, unknown>).whatsapp_mitra) : pickOptionalString((row as Record<string, unknown>).whatsapp_mitra),
    mitraNoTelepon: typeof row.mitra === 'object' && row.mitra !== null && 'no_telepon_mitra' in row.mitra ? row.mitra.no_telepon_mitra || pickOptionalString((row as Record<string, unknown>).no_telepon_mitra) : pickOptionalString((row as Record<string, unknown>).no_telepon_mitra),
    mitraPicNama: typeof row.mitra === 'object' && row.mitra !== null ? pickOptionalString(row.mitra.nama_kontak_utama) : undefined,
    mitraPicJabatan: typeof row.mitra === 'object' && row.mitra !== null ? pickOptionalString(row.mitra.jabatan_kontak_utama) : undefined,
    mitraPicEmail: typeof row.mitra === 'object' && row.mitra !== null ? pickOptionalString(row.mitra.email_kontak_utama) : undefined,
    mitraPicTelepon: typeof row.mitra === 'object' && row.mitra !== null ? pickOptionalString(row.mitra.telepon_kontak_utama) : undefined,
    jenisDokumen: mapJenisDokumenFromApi(row.jenis_dokumen),
    jenisDokumenList: Array.isArray(row.jenis_dokumen_list) && row.jenis_dokumen_list.length > 1
      ? row.jenis_dokumen_list.map(mapJenisDokumenFromApi)
      : undefined,
    picPolibatamNama: pickOptionalString(row.pic_polibatam_nama),
    picPolibatamJabatan: pickOptionalString(row.pic_polibatam_jabatan),
    picPolibatamEmail: pickOptionalString(row.pic_polibatam_email),
    picPolibatamTelepon: pickOptionalString(row.pic_polibatam_whatsapp),
    unitProdiId: row.unit_prodi_id ?? undefined,
    unitProdiIds: row.unit_prodi_items?.length ? row.unit_prodi_items.map((item) => item.id) : row.unit_prodi_id ? [row.unit_prodi_id] : undefined,
    namaUnitProdi: row.unit_prodi_items?.length ? row.unit_prodi_items.map((item) => item.nama).join(', ') : row.unit_prodi?.nama || row.jurusan || '-',
    kategoriPengajuan:
      row.kategori_pengajuan === 'internal' || row.kategori === 'Internal'
        ? 'Internal'
        : 'Eksternal',
    tanggalMulai: row.tanggal_mulai ? new Date(row.tanggal_mulai).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : undefined,
    tanggalBerakhir: row.tanggal_berakhir ? new Date(row.tanggal_berakhir).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : undefined,
    emailPengusul: row.email_pengusul ?? undefined,
    whatsappPengusul: row.whatsapp_pengusul ?? undefined,
    ruangLingkupIds: row.ruang_lingkup_ids ?? [],
    ruangLingkup: resolvedRuangLingkup,
    statusPengajuan: mapStatusFromApi(statusApi),
    fileName: resolvedFileName,
    fileAttachments: resolvedAttachments,
    revisiFiles: revisiFiles.length > 0 ? revisiFiles : undefined,
    perpanjanganFiles: (() => {
      const seen = new Set<string>();
      const hasil: { name: string; url: string }[] = [];
      for (const f of row.dokumen_kerjasama?.dokumen_files ?? []) {
        if (f.peran_berkas !== 'dokumen_perpanjangan' || seen.has(f.path_file)) continue;
        seen.add(f.path_file);
        hasil.push({ name: f.nama_file, url: buildAttachmentUrl(f.path_file) });
      }
      return hasil.length > 0 ? hasil : undefined;
    })(),
    reviewComment: row.catatan || row.catatan_revisi || undefined,
    catatan: row.catatan || undefined,
    keputusan: row.keputusan || undefined,
    catatanRevisi: row.catatan_revisi || undefined,
    accInternalAt: row.acc_internal_at || undefined,
    accMitraAt: row.acc_mitra_at || undefined,
    finalApprovedAt: row.final_approved_at || undefined,
    finalFileName: row.final_file_name || undefined,
    finalFilePath: row.final_file_path || undefined,
    tahapanStage: row.tahapan_stage ?? null,
    direvisiPengusulPada: row.direvisi_pengusul_pada ?? null,
    tahapanGroup: row.tahapan_group ?? null,
    tahapanRiwayat: Array.isArray(row.tahapan_riwayat)
      ? row.tahapan_riwayat.map((r) => ({
          stage: r.stage,
          group: r.group,
          changedAt: r.changed_at,
          changedBy: r.changed_by,
        }))
      : [],
    distribusiUserIds: Array.isArray(row.distribusi_user_ids) ? row.distribusi_user_ids : [],
    updatedAt: row.updated_at || undefined,
  };
}

export async function fetchPengajuanDataFromApi(filters?: {
  search?: string;
  status?: string;
  jenisDokumen?: string;
  perPage?: number;
}): Promise<PengajuanItem[]> {
  const params = new URLSearchParams();
  params.set('per_page', String(filters?.perPage ?? 2000));
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status && filters.status !== 'Semua Status') {
    const mappedStatus = mapStatusToApi(filters.status as PengajuanStatus);
    params.set('status', mappedStatus);
    params.set('status_pengajuan', mappedStatus);
  }
  if (filters?.jenisDokumen && filters.jenisDokumen !== 'Semua Jenis') {
    params.set('jenis_dokumen', mapJenisDokumenToApi(filters.jenisDokumen));
  }

  const endpoint = `/pengajuan?${params.toString()}`;
  const response = await apiRequest<ApiListResponse<ApiPengajuanRow>>(endpoint);
  const mapped = extractApiRows(response).map(mapApiPengajuanToItem);
  savePengajuanData(mapped);
  return mapped;
}

// Backward-compatible wrapper used by several pages after recent pull.
export async function refreshPengajuanDataFromApi(_force = false): Promise<PengajuanItem[]> {
  try {
    return await fetchPengajuanDataFromApi({ perPage: 500 });
  } catch {
    return getPengajuanData();
  }
}

export async function savePengajuanReviewApi(
  id: number,
  status: PengajuanStatus,
  comment?: string,
  distribusiUserIds?: number[],
  // Token optimistic locking (PengajuanItem.updatedAt) — lihat updatePengajuanItemApi.
  updatedAt?: string
): Promise<PengajuanItem> {
  const response = await apiRequest<ApiSingleResponse<ApiPengajuanRow>>(`/pengajuan/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(updatedAt ? { updated_at: updatedAt } : {}),
      status_pengajuan: mapStatusToApi(status),
      status: mapStatusToApi(status),
      catatan: comment?.trim() || null,
      keputusan: status,
      review_comment: comment?.trim() || null,
      ...(distribusiUserIds !== undefined ? { distribusi_user_ids: distribusiUserIds } : {}),
    }),
  });

  const mapped = mapApiPengajuanToItem(response.data);
  mapped.reviewComment = comment?.trim() || undefined;
  mapped.reviewedAt = new Date().toISOString().slice(0, 10);
  mapped.reviewedBy = 'Admin SIKERMA';
  return mapped;
}

export async function savePengajuanRevisionApi(
  id: number,
  catatanRevisi: string,
  comment?: string,
  updatedAt?: string,
  // Berkas Word opsional yang dilampirkan admin untuk dikerjakan ulang oleh pengusul.
  revisiFile?: { name: string; url: string; type?: string; size?: number }
): Promise<PengajuanItem> {
  const response = await apiRequest<ApiSingleResponse<ApiPengajuanRow>>(`/pengajuan/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(updatedAt ? { updated_at: updatedAt } : {}),
      ...(revisiFile
        ? { revisi_file_attachments: [{ name: revisiFile.name, url: revisiFile.url, type: revisiFile.type, size: revisiFile.size }] }
        : {}),
      status_pengajuan: mapStatusToApi('Revisi'),
      status: mapStatusToApi('Revisi'),
      catatan: comment?.trim() || null,
      catatan_revisi: catatanRevisi.trim() || null,
      keputusan: 'Revisi',
      review_comment: comment?.trim() || null,
    }),
  });

  const mapped = mapApiPengajuanToItem(response.data);
  mapped.catatanRevisi = catatanRevisi.trim() || undefined;
  mapped.reviewComment = comment?.trim() || undefined;
  mapped.reviewedAt = new Date().toISOString().slice(0, 10);
  mapped.reviewedBy = 'Admin SIKERMA';
  return mapped;
}

type AccFileInput = { name: string; url: string; type?: string; size?: number; jenisDokumen?: string };

// Berkas final bisa lebih dari satu (mis. MoU dan MoA sekaligus). Server mengganti SELURUH berkas final
// lama dengan daftar yang dikirim, jadi semuanya harus dikirim dalam satu permintaan.
export async function uploadAccFileApi(
  id: number,
  files: AccFileInput | AccFileInput[],
  updatedAt?: string
): Promise<PengajuanItem> {
  const list = Array.isArray(files) ? files : [files];
  const response = await apiRequest<ApiSingleResponse<ApiPengajuanRow>>(`/pengajuan/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(updatedAt ? { updated_at: updatedAt } : {}),
      acc_file_attachments: list.map((file) => ({
        name: file.name,
        url: file.url,
        type: file.type,
        size: file.size,
        ...(file.jenisDokumen ? { jenis_dokumen: jenisBerkasKeApi(file.jenisDokumen) } : {}),
      })),
    }),
  });
  return mapApiPengajuanToItem(response.data);
}

export async function accFinalBerkasApi(id: number, updatedAt?: string): Promise<PengajuanItem> {
  const response = await apiRequest<ApiSingleResponse<ApiPengajuanRow>>(`/pengajuan/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(updatedAt ? { updated_at: updatedAt } : {}),
      status_pengajuan: mapStatusToApi('Disetujui'),
      status: mapStatusToApi('Disetujui'),
      keputusan: 'Disetujui',
      acc_actor: 'internal',
    }),
  });

  const mapped = mapApiPengajuanToItem(response.data);
  mapped.reviewedAt = new Date().toISOString().slice(0, 10);
  mapped.reviewedBy = 'Admin SIKERMA';
  return mapped;
}

export async function updatePengajuanItemApi(
  id: number,
  updates: Partial<Omit<PengajuanItem, 'id' | 'diajukanPada'>>,
  // Field API mentah tambahan (mis. mitra_alamat / mitra_*_kontak_utama) yang tidak punya
  // padanan langsung di PengajuanItem.
  extraPayload: Record<string, unknown> = {}
): Promise<PengajuanItem> {
  const payload: Record<string, unknown> = { ...extraPayload };
  if (typeof updates.updatedAt === 'string' && updates.updatedAt) payload.updated_at = updates.updatedAt;
  if (typeof updates.judulPengajuan === 'string') payload.judul_pengajuan = updates.judulPengajuan;
  if (typeof updates.deskripsiPengajuan === 'string') payload.deskripsi_pengajuan = updates.deskripsiPengajuan;
  if (typeof updates.manfaat === 'string') payload.manfaat = updates.manfaat;
  if (typeof updates.namaPengusul === 'string') payload.nama_pengusul = updates.namaPengusul;
  if (typeof updates.jabatanPengusul === 'string') payload.jabatan_pengusul = updates.jabatanPengusul;
  if (typeof updates.emailPengusul === 'string') payload.email_pengusul = updates.emailPengusul;
  if (typeof updates.whatsappPengusul === 'string') payload.whatsapp_pengusul = updates.whatsappPengusul;
  if (typeof updates.picPolibatamNama === 'string') payload.pic_polibatam_nama = updates.picPolibatamNama || null;
  if (typeof updates.picPolibatamJabatan === 'string') payload.pic_polibatam_jabatan = updates.picPolibatamJabatan || null;
  if (typeof updates.picPolibatamEmail === 'string') payload.pic_polibatam_email = updates.picPolibatamEmail || null;
  if (typeof updates.picPolibatamTelepon === 'string') payload.pic_polibatam_whatsapp = updates.picPolibatamTelepon || null;
  if (updates.unitProdiId !== undefined) payload.unit_prodi_id = updates.unitProdiId;
  if (updates.unitProdiIds && updates.unitProdiIds.length > 0) {
    payload.unit_prodi_ids = updates.unitProdiIds;
    if (updates.jurusanIds && updates.jurusanIds.length > 0) payload.jurusan_ids = updates.jurusanIds;
  }
  if (updates.mitraId !== undefined) payload.mitra_id = updates.mitraId;
  if (typeof updates.namaMitra === 'string') payload.nama_mitra = updates.namaMitra;
  if (updates.mitraKategori !== undefined) payload.jenis_mitra = updates.mitraKategori || null;
  if (updates.mitraBidangUsaha !== undefined) payload.bidang_usaha = updates.mitraBidangUsaha || null;
  if (updates.mitraTingkatPerusahaan !== undefined) payload.tingkat_perusahaan = updates.mitraTingkatPerusahaan || null;
  if (typeof updates.mitraTelepon === 'string') payload.whatsapp_mitra = updates.mitraTelepon;
  if (typeof updates.mitraNoTelepon === 'string') payload.no_telepon_mitra = updates.mitraNoTelepon;
  if (typeof updates.jenisDokumen === 'string') payload.jenis_dokumen = mapJenisDokumenToApi(updates.jenisDokumen);
  if (updates.jenisDokumenList && updates.jenisDokumenList.length > 1) {
    payload.jenis_dokumen_list = updates.jenisDokumenList.map(mapJenisDokumenToApi);
  }
  if (typeof updates.tanggalMulai === 'string') payload.tanggal_mulai = updates.tanggalMulai;
  if (typeof updates.tanggalBerakhir === 'string') payload.tanggal_berakhir = updates.tanggalBerakhir;
  if (typeof updates.statusPengajuan === 'string') payload.status_pengajuan = mapStatusToApi(updates.statusPengajuan as PengajuanStatus);
  if (updates.ruangLingkupIds !== undefined) payload.ruang_lingkup_ids = updates.ruangLingkupIds;
  if (typeof updates.fileName === 'string') payload.file_name = updates.fileName;
  if (updates.fileAttachments !== undefined) {
    payload.file_attachments = updates.fileAttachments.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      url: file.url || '',
      path_file: file.pathFile || '',
      isAcc: file.isAcc,
    }));
  }

  const response = await apiRequest<ApiSingleResponse<ApiPengajuanRow>>(`/pengajuan/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  const mapped = mapApiPengajuanToItem(response.data);

  saveAttachmentCacheEntry(mapped.id, {
    fileName: mapped.fileName || updates.fileName,
    fileAttachments: mapped.fileAttachments || updates.fileAttachments,
  });

  return mapped;
}

export async function deletePengajuanItemApi(id: number): Promise<void> {
  await apiRequest<ApiSingleResponse<null>>(`/pengajuan/${id}`, {
    method: 'DELETE',
  });
}

export function buildNomorPengajuanPreview(
  source: 'admin' | 'internal' | 'eksternal',
  unitName?: string,
  existingNomorPengajuan?: string
): string {
  if (existingNomorPengajuan && existingNomorPengajuan.trim() !== '') {
    return existingNomorPengajuan.trim();
  }

  const prefix: 'ADM' | 'INT' | 'EXT' = source === 'admin' ? 'ADM' : source === 'eksternal' ? 'EXT' : 'INT';
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const normalizedUnit = (unitName || '').trim().replace(/\s+/g, '-').toUpperCase();
  const unitPreview = normalizedUnit ? normalizedUnit.slice(0, 12) : 'UNIT';
  return `PGJ-${prefix}-${stamp}-${unitPreview}-XXXX`;
}

export async function submitPengajuanApi(
  data: Omit<PengajuanItem, 'id' | 'diajukanPada' | 'statusPengajuan' | 'isFromAdmin' | 'nomorPengajuan'>,
  isFromAdmin?: boolean,
  source: 'admin' | 'internal' | 'eksternal' = 'internal'
): Promise<PengajuanItem> {
  const prefix: 'ADM' | 'INT' | 'EXT' = source === 'admin' ? 'ADM' : source === 'eksternal' ? 'EXT' : 'INT';

  const payload = {
    nama_pengusul: data.namaPengusul || (source === 'eksternal' ? 'Mitra Eksternal' : 'Internal Polibatam'),
    email_pengusul: data.emailPengusul || null,
    whatsapp_pengusul: data.whatsappPengusul || null,
    judul_pengajuan: data.judulPengajuan,
    deskripsi_pengajuan: data.deskripsiPengajuan || null,
    manfaat: data.manfaat || null,
    luaran_kerja_sama: data.luaranKerjaSama || null,
    jenis_dokumen: mapJenisDokumenToApi(data.jenisDokumen),
    // Beberapa jenis dalam SATU pengajuan (mis. MoU + MoA): server mengambil jenis pertama sebagai jenis utama.
    ...(data.jenisDokumenList && data.jenisDokumenList.length > 1
      ? { jenis_dokumen_list: data.jenisDokumenList.map(mapJenisDokumenToApi) }
      : {}),
    mitra_id: data.mitraId ?? null,
    nama_mitra: data.namaMitra,
    jenis_mitra: data.mitraKategori || null,
    bidang_usaha: data.mitraBidangUsaha || null,
    tingkat_perusahaan: data.mitraTingkatPerusahaan || null,
    whatsapp_mitra: data.mitraTelepon || null,
    no_telepon_mitra: data.mitraNoTelepon || null,
    // Field transien buat backend sinkron ke master_mitra (lihat PengajuanController) —
    // tidak tersimpan di pengajuan_v2, cukup dikirim di request ini.
    mitra_alamat: data.mitraAlamat || null,
    mitra_nama_kontak_utama: data.mitraPicNama || null,
    mitra_jabatan_kontak_utama: data.mitraPicJabatan || null,
    mitra_email_kontak_utama: data.mitraPicEmail || null,
    mitra_telepon_kontak_utama: data.mitraPicTelepon || null,
    pic_polibatam_nama: data.picPolibatamNama || null,
    pic_polibatam_jabatan: data.picPolibatamJabatan || null,
    pic_polibatam_email: data.picPolibatamEmail || null,
    pic_polibatam_whatsapp: data.picPolibatamTelepon || null,
    unit_prodi_id: data.unitProdiId ?? null,
    ...(data.unitProdiIds && data.unitProdiIds.length > 0
      ? { unit_prodi_ids: data.unitProdiIds, ...(data.jurusanIds && data.jurusanIds.length > 0 ? { jurusan_ids: data.jurusanIds } : {}) }
      : {}),
    kategori_pengajuan: (data.kategoriPengajuan || (source === 'eksternal' ? 'Eksternal' : 'Internal')).toLowerCase(),
    tanggal_mulai: data.tanggalMulai || null,
    tanggal_berakhir: data.tanggalBerakhir || null,
    ruang_lingkup_ids: data.ruangLingkupIds ?? [],
    status_pengajuan: 'menunggu',
    file_name: data.fileName || null,
    file_attachments: (data.fileAttachments || []).map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      url: file.url || '',
    })),
  };

  const response = await apiRequest<ApiSingleResponse<ApiPengajuanRow>>('/pengajuan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const mapped = mapApiPengajuanToItem(response.data);
  mapped.isFromAdmin = Boolean(isFromAdmin);
  mapped.fileName = data.fileName;
  mapped.fileAttachments = data.fileAttachments;

  saveAttachmentCacheEntry(mapped.id, {
    fileName: mapped.fileName,
    fileAttachments: mapped.fileAttachments,
  });

  return mapped;
}

// Data awal dummy yang dipakai saat belum ada data tersimpan.
const defaultPengajuanData: PengajuanItem[] = [
  {
    id: 1,
    nomorPengajuan: 'PGJ-DUMMY-1',
    judulPengajuan: 'Kerja Sama Magang dengan PT Solusi Digital',
    namaPengusul: 'Dr. Ahmad Wijaya',
    diajukanPada: '2026-02-25',
    namaMitra: 'PT Solusi Digital Indonesia',
    jenisDokumen: 'MoA',
    namaUnitProdi: 'Teknik Informatika',
    kategoriPengajuan: 'Eksternal',
    tanggalMulai: '2026-03-01',
    tanggalBerakhir: '2027-03-01',
    ruangLingkupIds: [1, 2],
    ruangLingkup: ['Penelitian', 'Pengabdian Masyarakat'],
    statusPengajuan: 'Menunggu',
  },
  {
    id: 2,
    nomorPengajuan: 'PGJ-DUMMY-2',
    judulPengajuan: 'Penelitian Bersama Universitas Malaysia',
    namaPengusul: 'Dr. Ahmad Wijaya',
    diajukanPada: '2026-02-25',
    namaMitra: 'Universitas Teknologi Malaysia',
    jenisDokumen: 'MoU',
    namaUnitProdi: 'Teknik Informatika',
    kategoriPengajuan: 'Eksternal',
    tanggalMulai: '2026-04-01',
    tanggalBerakhir: '2028-04-01',
    ruangLingkupIds: [1, 3],
    ruangLingkup: ['Penelitian', 'Publikasi Bersama'],
    statusPengajuan: 'Diproses',
  },
  {
    id: 3,
    nomorPengajuan: 'PGJ-DUMMY-3',
    judulPengajuan: 'Pelatihan Kewirausahaan Internal',
    namaPengusul: 'Dr. Ahmad Wijaya',
    diajukanPada: '2026-02-25',
    namaMitra: 'UPT Kerjasama Polibatam',
    jenisDokumen: 'MoU',
    namaUnitProdi: 'Teknik Informatika',
    kategoriPengajuan: 'Internal',
    tanggalMulai: '2026-05-10',
    tanggalBerakhir: '2026-12-10',
    ruangLingkupIds: [4, 5],
    ruangLingkup: ['Pelatihan', 'Pengembangan SDM'],
    statusPengajuan: 'Disetujui',
    reviewComment: 'Dokumen sudah lengkap dan disetujui untuk tindak lanjut.',
    reviewedAt: '2026-03-02',
    reviewedBy: 'Admin SIKERMA',
  },
  {
    id: 4,
    nomorPengajuan: 'PGJ-DUMMY-4',
    judulPengajuan: 'Kolaborasi Riset AI Jurusan TI',
    namaPengusul: 'Siti Rahma',
    diajukanPada: '2026-03-11',
    namaMitra: 'PT Cerdas Data Nusantara',
    jenisDokumen: 'MoA',
    namaUnitProdi: 'Teknik Informatika',
    kategoriPengajuan: 'Internal',
    tanggalMulai: '2026-04-15',
    tanggalBerakhir: '2027-04-15',
    ruangLingkupIds: [1, 3],
    ruangLingkup: ['Penelitian', 'Publikasi Bersama'],
    statusPengajuan: 'Diproses',
    reviewComment: 'Admin sedang memvalidasi dokumen pendukung dan ruang lingkup kerja sama.',
    reviewedAt: '2026-03-14',
    reviewedBy: 'Admin SIKERMA',
  },
  {
    id: 5,
    nomorPengajuan: 'PGJ-DUMMY-5',
    judulPengajuan: 'Program Magang Industri untuk Mahasiswa',
    namaPengusul: 'Andi Saputra',
    diajukanPada: '2026-03-19',
    namaMitra: 'PT Inovasi Batam',
    jenisDokumen: 'IA',
    namaUnitProdi: 'Teknik Elektro',
    kategoriPengajuan: 'Internal',
    tanggalMulai: '2026-06-01',
    tanggalBerakhir: '2026-12-31',
    ruangLingkupIds: [6, 4],
    ruangLingkup: ['Magang', 'Pelatihan'],
    statusPengajuan: 'Menunggu',
  },
  {
    id: 6,
    nomorPengajuan: 'PGJ-DUMMY-6',
    judulPengajuan: 'Pengabdian Masyarakat Bersama Komunitas Digital',
    namaPengusul: 'Nabila Putri',
    diajukanPada: '2026-03-25',
    namaMitra: 'Komunitas Digital Batam',
    jenisDokumen: 'MoU',
    namaUnitProdi: 'Manajemen Bisnis',
    kategoriPengajuan: 'Internal',
    tanggalMulai: '2026-07-01',
    tanggalBerakhir: '2027-01-01',
    ruangLingkupIds: [2, 4],
    ruangLingkup: ['Pengabdian Masyarakat', 'Pelatihan'],
    statusPengajuan: 'Ditolak',
    reviewComment: 'Mohon lengkapi dokumen legal mitra sebelum diajukan ulang.',
    reviewedAt: '2026-03-28',
    reviewedBy: 'Admin SIKERMA',
  },
];

// Cek agar akses localStorage hanya berjalan di browser.
function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

// Mengirim event agar halaman lain bisa ikut refresh saat data berubah.
function emitPengajuanUpdate() {
  if (canUseStorage()) {
    window.dispatchEvent(new Event('pengajuan-data-updated'));
  }
}

// Simpan list pengajuan terbaru ke localStorage lalu broadcast update.
function savePengajuanData(items: PengajuanItem[]) {
  if (!canUseStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    emitPengajuanUpdate();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Hapus data lama, lalu coba simpan lagi
      window.localStorage.removeItem(STORAGE_KEY);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        emitPengajuanUpdate();
      } catch {
        alert('Data terlalu besar untuk disimpan. Silakan hubungi admin.');
      }
    } else {
      throw e;
    }
  }
}

// Ambil seluruh data pengajuan, lalu gabungkan dengan data default bila perlu.
export function getPengajuanData(options?: { excludeAdmin?: boolean }): PengajuanItem[] {
  if (!canUseStorage()) {
    return defaultPengajuanData;
  }

  const storedRaw = window.localStorage.getItem(STORAGE_KEY);

  if (!storedRaw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultPengajuanData));
    return defaultPengajuanData;
  }

  try {
    const stored = JSON.parse(storedRaw) as PengajuanItem[];

    if (!Array.isArray(stored)) {
      return defaultPengajuanData;
    }

    // Jika diminta excludeAdmin, filter data admin
    if (options?.excludeAdmin) {
      return stored.filter((item) => !item.isFromAdmin);
    }
    return stored;
  } catch {
    return defaultPengajuanData;
  }
}

// Menandai bahwa email pengusul sudah diverifikasi.
export function markPengajuanEmailVerified(id: number): PengajuanItem | null {
  let verifiedItem: PengajuanItem | null = null;

  const updated = getPengajuanData().map((item) => {
    if (item.id !== id) {
      return item;
    }

    verifiedItem = { ...item, emailTerverifikasiPada: new Date().toISOString() };
    return verifiedItem;
  });

  savePengajuanData(updated);

  if (verifiedItem) {
    addAdminNotification({
      title: 'Email Pengusul Terverifikasi',
      message: `Email untuk pengajuan '${verifiedItem.judulPengajuan}' sudah dikonfirmasi aktif.`,
      from: 'Sistem Verifikasi',
      href: '/admin/data_pengajuan',
      category: 'approval',
    });
  }

  return verifiedItem;
}

// Update status hasil review pengajuan dan kirim notifikasi otomatis.
export function updatePengajuanStatus(
  id: number,
  status: PengajuanStatus,
  comment?: string
): PengajuanItem[] {
  let updatedItem: PengajuanItem | undefined;

  const updated = getPengajuanData().map((item) => {
    if (item.id !== id) {
      return item;
    }

    updatedItem = {
      ...item,
      statusPengajuan: status,
      reviewComment: comment?.trim() || undefined,
      reviewedAt: new Date().toISOString().slice(0, 10),
      reviewedBy: 'Admin SIKERMA',
    };
    return updatedItem;
  });

  savePengajuanData(updated);

  if (updatedItem && status === 'Disetujui') {
    initAktivitasOnApproval(
      updatedItem.id,
      updatedItem.namaMitra,
      updatedItem.reviewedAt ?? new Date().toISOString().slice(0, 10)
    );
  }

  if (updatedItem) {
    addAdminNotification({
      title: status === 'Disetujui' ? 'Pengajuan Disetujui' : status === 'Ditolak' ? 'Pengajuan Ditolak' : 'Status Pengajuan Diperbarui',
      message: comment?.trim()
        ? `${updatedItem.judulPengajuan} diperbarui menjadi ${status}. Catatan: ${comment}`
        : `${updatedItem.judulPengajuan} diperbarui menjadi ${status}.`,
      from: 'Admin SIKERMA',
      href: '/admin/data_pengajuan',
      category: status === 'Ditolak' ? 'reminder' : 'approval',
    });
  }

  return updated;
}

// Hitung ringkasan jumlah pengajuan berdasarkan status.
export function getPengajuanStats(items: PengajuanItem[]) {
  return {
    totalPengajuan: items.length,
    menunggu: items.filter((item) => item.statusPengajuan === 'Menunggu' || item.statusPengajuan === 'Menunggu Review').length,
    diproses: items.filter((item) => item.statusPengajuan === 'Diproses').length,
    disetujui: items.filter((item) => item.statusPengajuan === 'Disetujui').length,
  };
}

// Ambil daftar tahun unik dari data pengajuan untuk isi dropdown filter.
export function getPengajuanYearOptions(items: PengajuanItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.diajukanPada.slice(0, 4))))
    .filter(Boolean)
    .sort((a, b) => Number(b) - Number(a));
}

const APPROVED_STATUSES_FOR_BARU = new Set<PengajuanStatus>([
  'Disetujui',
  'Final Approved',
  'Disetujui Internal',
  'Disetujui Mitra',
]);

// tanggalMulai datang dalam format 'DD/MM/YYYY' (lihat mapRowToItem di atas), BUKAN ISO — kalau
// langsung di-`new Date()` akan salah dibaca sebagai MM/DD/YYYY. diajukanPada dipakai sebagai
// fallback dan sudah dalam format ISO 'YYYY-MM-DD'.
function parseTanggalUntukBaru(tanggal?: string): { year: number; month: number } | null {
  if (!tanggal) return null;

  if (tanggal.includes('/')) {
    const [, mm, yyyy] = tanggal.split('/');
    const year = parseInt(yyyy, 10);
    const month = parseInt(mm, 10);
    return year && month ? { year, month } : null;
  }

  const year = parseInt(tanggal.slice(0, 4), 10);
  const month = parseInt(tanggal.slice(5, 7), 10);
  return year && month ? { year, month } : null;
}

/** Jumlah kerjasama baru (pengajuan yang sudah disetujui) pada tahun tertentu, opsional
 *  difilter per bulan (label dari bulanOptions, atau semuaBulanLabel untuk semua bulan).
 *  Dipakai di dashboard Admin & Pimpinan supaya angkanya konsisten. */
export function countKerjasamaBaru(items: PengajuanItem[], tahun: number, bulan: string = semuaBulanLabel): number {
  return items.filter((item) => {
    if (!APPROVED_STATUSES_FOR_BARU.has(item.statusPengajuan)) return false;
    const parsed = parseTanggalUntukBaru(item.tanggalMulai) ?? parseTanggalUntukBaru(item.diajukanPada);
    if (!parsed || parsed.year !== tahun) return false;
    return bulan === semuaBulanLabel || bulanOptions[parsed.month - 1] === bulan;
  }).length;
}

// Shortcut untuk proses review dari halaman admin.
export function savePengajuanReview(id: number, status: PengajuanStatus, comment = ''): PengajuanItem[] {
  return updatePengajuanStatus(id, status, comment);
}

// Mengubah data pengajuan tertentu dari halaman admin.
export function updatePengajuanItem(
  id: number,
  updates: Partial<Omit<PengajuanItem, 'id' | 'diajukanPada'>>
): PengajuanItem[] {
  let updatedItem: PengajuanItem | null = null;

  const updated = getPengajuanData().map((item) => {
    if (item.id !== id) {
      return item;
    }

    updatedItem = {
      ...item,
      ...updates,
      id: item.id,
      diajukanPada: item.diajukanPada,
    };

    return updatedItem;
  });

  savePengajuanData(updated);

  if (updatedItem) {
    upsertRekapFromPengajuan({
      id: updatedItem.id,
      namaMitra: updatedItem.namaMitra,
      jenisDokumen: updatedItem.jenisDokumen,
      namaUnitProdi: updatedItem.namaUnitProdi,
      tanggalMulai: updatedItem.tanggalMulai,
      tanggalBerakhir: updatedItem.tanggalBerakhir,
      whatsappPengusul: updatedItem.whatsappPengusul,
      finalFileName: updatedItem.finalFileName,
    });

    upsertMonitoringFromPengajuan({
      id: updatedItem.id,
      namaMitra: updatedItem.namaMitra,
      jenisDokumen: updatedItem.jenisDokumen,
      tanggalMulai: updatedItem.tanggalMulai,
      tanggalBerakhir: updatedItem.tanggalBerakhir,
      ruangLingkup: updatedItem.ruangLingkup,
      whatsappPengusul: updatedItem.whatsappPengusul,
      emailPengusul: updatedItem.emailPengusul,
    });
  }

  return updated;
}

// Terapkan tanggal perpanjangan yang telah disetujui ke item pengajuan terkait.
// Fungsi ini hanya update localStorage pengajuan tanpa cascade ke monitoring/rekap
// karena keduanya sudah ditangani secara terpisah di halaman perpanjangan.
export function applyApprovedRenewalToPengajuan(
  kerjasamaId: number,
  tanggalMulaiBaru: string,
  tanggalBerakhirBaru: string
): PengajuanItem[] {
  const updated = getPengajuanData().map((item) => {
    if (item.id !== kerjasamaId) {
      return item;
    }

    return {
      ...item,
      tanggalMulai: tanggalMulaiBaru,
      tanggalBerakhir: tanggalBerakhirBaru,
    };
  });

  savePengajuanData(updated);
  return updated;
}

// Menghapus satu data pengajuan dari daftar.
export function deletePengajuanItem(id: number): PengajuanItem[] {
  const current = getPengajuanData();
  const removed = current.find((item) => item.id === id);
  const updated = current.filter((item) => item.id !== id);

  savePengajuanData(updated);
  removeRekapByPengajuanId(id);
  removeMonitoringByPengajuanId(id);
  hideStoryByPengajuanId(id);

  if (removed) {
    addAdminNotification({
      title: 'Pengajuan Dihapus',
      message: `Pengajuan '${removed.judulPengajuan}' telah dihapus dari daftar admin.`,
      from: 'Admin SIKERMA',
      href: '/admin/data_pengajuan',
      category: 'reminder',
    });
  }

  return updated;
}

function getKategoriPengajuan(item: PengajuanItem): 'Internal' | 'Eksternal' {
  if (item.kategoriPengajuan) {
    return item.kategoriPengajuan;
  }

  const source = `${item.namaMitra} ${item.namaUnitProdi}`.toLowerCase();
  return source.includes('polibatam') || source.includes('upt') ? 'Internal' : 'Eksternal';
}

// Filter data berdasarkan status, kategori/jurusan, dan kata kunci pencarian.
export function filterPengajuanData(
  items: PengajuanItem[],
  filterStatus: string,
  filterJurusan: string,
  search: string,
  options?: { excludeAdmin?: boolean }
) {
  return items.filter((item) => {
    // Selalu exclude data admin jika diminta
    if (options?.excludeAdmin && item.isFromAdmin) {
      return false;
    }

    // HANYA filter data admin jika memang untuk view internal (excludeAdmin true)
    // Di halaman admin, data admin harus tetap muncul

    const matchStatus = filterStatus === 'Semua Status' || item.statusPengajuan === filterStatus;
    const matchJurusan =
      filterJurusan === 'Semua Jurusan/Prodi/Unit' ||
      filterJurusan === 'Semua Ruang Kerjasama' ||
      filterJurusan === 'Semua Kategori Kerjasama' ||
      item.namaUnitProdi === filterJurusan ||
      getKategoriPengajuan(item) === filterJurusan;
    const keyword = search.toLowerCase().trim();
    const kategori = getKategoriPengajuan(item).toLowerCase();
    const ruangLingkupText = item.ruangLingkup.join(' ').toLowerCase();
    const matchSearch =
      keyword === '' ||
      item.namaMitra.toLowerCase().includes(keyword) ||
      item.judulPengajuan.toLowerCase().includes(keyword) ||
      item.namaPengusul.toLowerCase().includes(keyword) ||
      item.namaUnitProdi.toLowerCase().includes(keyword) ||
      item.jenisDokumen.toLowerCase().includes(keyword) ||
      kategori.includes(keyword) ||
      ruangLingkupText.includes(keyword);

    return matchStatus && matchJurusan && matchSearch;
  });
}

// Filter lanjutan yang juga memperhitungkan pilihan tahun.
export function getFilteredPengajuanData(items: PengajuanItem[], filters: PengajuanFilterOptions, options?: { excludeAdmin?: boolean }) {
  const filtered = filterPengajuanData(items, filters.filterStatus, filters.filterJurusan, filters.search, options);

  if (filters.filterTahun === 'Semua Tahun') {
    return filtered;
  }

  return filtered.filter((item) => item.diajukanPada.startsWith(filters.filterTahun));
}
