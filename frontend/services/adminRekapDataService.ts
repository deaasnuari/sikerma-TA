import { addAdminNotification } from '@/services/adminService';

// Status dokumen kerjasama yang ditampilkan di rekap data.
export type RekapStatus = 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';
export type RekapJenis = 'MoA' | 'MoU' | 'IA' | 'Lainnya';

// Tipe data utama untuk satu baris dokumen pada tabel rekap.
export interface DokumenTerkait {
  nama: string;
  url: string;
  // Path API buat unduh dengan nama ASLI berkasnya (lewat downloadFileWithAuth) — kalau
  // kosong, berarti berkas ini tidak/belum bisa diunduh lewat jalur ini (fallback ke `url`).
  downloadUrl?: string;
  ukuran: string;
  tanggal: string;
}

export interface RekapDokumen {
  id?: number;
  sourcePengajuanId?: number;
  mitraId?: number;
  noDokumen: string;
  namaMitra: string;
  jenis: RekapJenis;
  unit: string;
  kategoriUnit?: 'Jurusan' | 'Unit';
  tanggalMulai: string;
  berlakuHingga: string;
  tanggalMulaiRaw?: string;
  berlakuHinggaRaw?: string;
  // Kapan dokumen kerja sama ini dibuat di sistem (bukan tanggal_mulai kontraktualnya) —
  // dipakai untuk mengurutkan Story & Aktivitas dari yang PALING BARU DIAJUKAN.
  dibuatPada?: string;
  tahun: string;
  status: RekapStatus;
  whatsappNumber?: string;
  emailMitra?: string;
  // No. Telepon mitra — terpisah dari WhatsApp di atas (master_mitra.no_telepon_mitra).
  noTeleponMitra?: string;
  buktiPdfDownloadUrl?: string | null;
  buktiPdfNama?: string | null;
  buktiTidakDiperpanjang?: string | null;
  buktiTidakDiperpanjangDownloadUrl?: string | null;
  buktiTidakDiperpanjangNama?: string | null;
  ruangLingkup?: string[];
  ruangLingkupIds?: number[];
  mitraNegara?: string;
  // unitProdiId: node yang benar-benar tersimpan di dokumen_kerjasama.unit_prodi_id (Jurusan/Unit
  // ATAU Prodi). jurusanUnitProdiId cuma terisi kalau unitProdiId itu Prodi — dipakai form edit
  // untuk prefill dropdown Jurusan → Prodi bertingkat.
  unitProdiId?: number;
  jurusanUnitProdiId?: number;
  dokumenTerkait?: DokumenTerkait[];
  dokumenPendukungTerkait?: DokumenTerkait[];
  manfaatKerjasama?: string;
  kodePerusahaan?: string;
  jenisMitra?: string;
  tingkatPerusahaan?: string;
  followUp?: string;
  // Role user yang membuat pengajuan sumber dokumen ini ('admin'/'internal'/'external'), null jika belum tercatat.
  dibuatOlehRole?: string | null;

  // --- Field tambahan untuk melengkapi kolom rekap Excel dosen (lihat handleExportExcel) ---
  bidangUsaha?: string;
  alamatMitra?: string;
  picMitra?: string;
  jabatanPicMitra?: string;
  emailPicMitra?: string;
  picJurusanUnit?: string;
  tingkatInternasional?: boolean;
  tingkatNasional?: boolean;
  tingkatLokal?: boolean;
  judulKegiatan?: string;
  luaranKerjaSama?: string;
  // Manfaat yang sesungguhnya (kolom `manfaat`), beda dari `manfaatKerjasama` di atas yang selama ini
  // masih bersumber dari `keterangan` untuk menjaga tampilan lama tetap jalan.
  manfaatSebenarnya?: string;
  keteranganAsli?: string;
  durasiTahun?: number;
  jurusanNama?: string;
  prodiNama?: string;
  unitKerjaNama?: string;
  triwulan1?: boolean;
  triwulan2?: boolean;
  triwulan3?: boolean;
  triwulan4?: boolean;
  buktiMou?: string | null;
  buktiMoaPks?: string | null;
  buktiIa?: string | null;
  laporanKegiatanLinks?: string[];
}

// Data mentah dari modal tambah dokumen sebelum dikonversi ke format rekap.
export interface DokumenData {
  nomorDokumen: string;
  jenisDokumen: string;
  namaPIC: string;
  kategoriMitra: string;
  bidangUsaha?: string;
  tingkatPerusahaan?: string;
  namaMitra: string;
  // Terisi otomatis saat Nama Mitra dipilih dari Data Kemitraan (master_mitra). Jangan diisi manual.
  mitraId?: number;
  kodePerusahaan?: string;
  status: string;
  jabatanMitra: string;
  emailMitra: string;
  tanggalMulai: string;
  tanggalBerakhir: string;
  alamatMitra: string;
  whatsappMitra: string;
  // No. Telepon mitra — terpisah dari WhatsApp di atas (master_mitra.no_telepon_mitra).
  noTeleponMitra?: string;
  asalKategori: 'Jurusan' | 'Unit';
  unitKerja: string;
  // Terisi kalau asalKategori === 'Jurusan' dan Prodi-nya sudah dipilih — dikirim sebagai
  // unit_prodi_id ke backend supaya dokumen tersimpan di level Prodi, bukan cuma Jurusan.
  prodiId?: number | null;
  negara?: string;
  ruangLingkup?: string[];
  ruangLingkupIds?: number[];
  dokumenTerkait?: DokumenTerkait[];
  dokumenPendukung?: DokumenTerkait[];
  judulKegiatan?: string;
  manfaatKerjasama?: string;
  luaranKerjaSama?: string;
  keterangan?: string;
}

export interface RekapFilterOptions {
  filterJenis: string;
  filterUnit: string;
  filterStatus: string;
  filterTahun: string | null;
  filterJenisMitra: string;
  filterTingkatPerusahaan: string;
  filterRuangLingkup: string;
  search: string;
}

// Key localStorage untuk menyimpan data rekap dokumen di browser.
const STORAGE_KEY = 'adminRekapDokumenData';
const PENGAJUAN_STORAGE_KEY = 'pengajuanKerjasamaData';

type StoredPengajuanItem = {
  id: number;
  namaMitra?: string;
  jenisDokumen?: string;
  namaUnitProdi?: string;
  tanggalMulai?: string;
  tanggalBerakhir?: string;
  whatsappPengusul?: string;
  finalFileName?: string | null;
};

// Daftar jurusan dan unit mengikuti opsi detail pada form Data Pengajuan.
export const rekapJurusanOptions = [
  'Manajemen dan Bisnis',
  'Teknik Elektro',
  'Teknik Informatika',
  'Teknik Mesin',
];

export const rekapUnitOptions = [
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

export const rekapJurusanUnitOptions = [...rekapJurusanOptions, ...rekapUnitOptions];
export const rekapJenisOptions = ['MoA', 'MoU', 'IA'] as const;

// Mengikuti daftar kategori/tingkat mitra yang sama dengan halaman Data Kemitraan.
export const rekapJenisMitraOptions = [
  'Perguruan Tinggi',
  'Sekolah/Institusi Pendidikan Lain',
  'Pemerintahan',
  'Swasta/Dunia Usaha dan Dunia Industri (DUDI)',
  'Organisasi Non-Profit / LSM',
];
export const rekapTingkatPerusahaanOptions = ['Lokal', 'Nasional', 'Internasional', 'Multinasional'];

// Data default awal yang ditampilkan jika belum ada data tersimpan.
const defaultRekapData: RekapDokumen[] = [
  {
    noDokumen: 'MoA/001/2026',
    namaMitra: 'PT. Teknologi Maju Indonesia',
    jenis: 'MoA',
    unit: 'Teknik Informatika',
    tanggalMulai: '28 Feb 2026',
    berlakuHingga: '28 Feb 2029',
    tahun: '2026',
    status: 'Akan Berakhir',
    whatsappNumber: '6283333333333',
  },
  {
    noDokumen: 'MoU/002/2026',
    namaMitra: 'Universitas Negeri Jakarta',
    jenis: 'MoU',
    unit: 'Teknik Informatika',
    tanggalMulai: '28 Feb 2026',
    berlakuHingga: '28 Feb 2029',
    tahun: '2026',
    status: 'Aktif',
    whatsappNumber: '6282222222222',
  },
  {
    noDokumen: 'IA/002/2026',
    namaMitra: 'PT. Digita Solutions',
    jenis: 'IA',
    unit: 'Teknik Informatika',
    tanggalMulai: '28 Feb 2026',
    berlakuHingga: '28 Feb 2029',
    tahun: '2026',
    status: 'Kadaluarsa',
    whatsappNumber: '6284444444444',
  },
];

// Warna badge berdasarkan jenis dokumen.
export const rekapJenisBadgeMap: Record<RekapJenis, string> = {
  MoA: 'bg-cyan-100 text-cyan-700',
  MoU: 'bg-violet-100 text-violet-700',
  IA: 'bg-orange-100 text-orange-700',
  Lainnya: 'bg-slate-100 text-slate-700',
};

// Warna badge berdasarkan status masa berlaku dokumen.
export const rekapStatusBadgeMap: Record<RekapStatus, string> = {
  Aktif: 'bg-green-500 text-white',
  'Akan Berakhir': 'bg-orange-500 text-white',
  Kadaluarsa: 'bg-red-500 text-white',
};

export const rekapStatusOptions = ['Semua Status', 'Aktif', 'Akan Berakhir', 'Kadaluarsa'];

// Pastikan localStorage hanya diakses saat kode berjalan di browser.
function canUseStorage() {
  return typeof window !== 'undefined';
}

// Kirim event agar halaman rekap bisa refresh otomatis setelah data berubah.
function emitRekapUpdate() {
  if (canUseStorage()) {
    window.dispatchEvent(new Event('rekap-data-updated'));
  }
}

// Simpan data rekap terbaru ke localStorage dan broadcast update ke UI.
function saveRekapData(items: RekapDokumen[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emitRekapUpdate();
}

function formatDisplayDate(dateValue: string): string {
  if (!dateValue) {
    return '';
  }

  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return parsedDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function toDateInputValue(dateValue: string): string {
  if (!dateValue) {
    return '';
  }

  const normalized = dateValue.trim();
  const dayFirstMatch = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dayFirstMatch) {
    return `${dayFirstMatch[3]}-${dayFirstMatch[2].padStart(2, '0')}-${dayFirstMatch[1].padStart(2, '0')}`;
  }

  const parsedDate = new Date(normalized);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return parsedDate.toISOString().slice(0, 10);
}

function mapDokumenDataToRekap(data: DokumenData): RekapDokumen {
  const tahun = new Date(data.tanggalMulai).getFullYear().toString();

  return {
    noDokumen: data.nomorDokumen,
    mitraId: data.mitraId,
    namaMitra: data.namaMitra,
    jenis: data.jenisDokumen as RekapJenis,
    unit: data.unitKerja || (data.asalKategori === 'Jurusan' ? 'Teknik Informatika' : 'UPA TIK (Teknologi Informasi dan Komunikasi)'),
    kategoriUnit: data.asalKategori,
    tanggalMulai: formatDisplayDate(data.tanggalMulai),
    berlakuHingga: formatDisplayDate(data.tanggalBerakhir),
    tahun,
    status: (data.status as RekapStatus) || 'Aktif',
    whatsappNumber: data.whatsappMitra,
    noTeleponMitra: data.noTeleponMitra,
    dokumenTerkait: data.dokumenTerkait,
    manfaatKerjasama: data.manfaatKerjasama || undefined,
    kodePerusahaan: data.kodePerusahaan,
  };
}

type PengajuanSyncPayload = {
  id: number;
  namaMitra: string;
  jenisDokumen: string;
  namaUnitProdi: string;
  tanggalMulai?: string;
  tanggalBerakhir?: string;
  whatsappPengusul?: string;
  finalFileName?: string | null;
};

function resolveRekapStatusFromTanggalBerakhir(tanggalBerakhir?: string): RekapStatus {
  if (!tanggalBerakhir) {
    return 'Aktif';
  }

  const endDate = new Date(tanggalBerakhir);

  if (Number.isNaN(endDate.getTime())) {
    return 'Aktif';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysDiff = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    return 'Kadaluarsa';
  }

  if (daysDiff <= 90) {
    return 'Akan Berakhir';
  }

  return 'Aktif';
}

function normalizeJenisDokumen(jenisDokumen?: string): RekapJenis {
  if (jenisDokumen === 'MoA' || jenisDokumen === 'MoU' || jenisDokumen === 'IA') {
    return jenisDokumen;
  }

  return 'MoU';
}

function mergeMissingPengajuanIntoRekap(current: RekapDokumen[]): RekapDokumen[] {
  if (!canUseStorage()) {
    return current;
  }

  const pengajuanRaw = window.localStorage.getItem(PENGAJUAN_STORAGE_KEY);

  if (!pengajuanRaw) {
    return current;
  }

  try {
    const parsed = JSON.parse(pengajuanRaw) as StoredPengajuanItem[];

    if (!Array.isArray(parsed)) {
      return current;
    }

    const sortedPengajuan = [...parsed]
      .filter((item) => Number.isFinite(item.id))
      .sort((a, b) => a.id - b.id);

    let merged = [...current];

    for (const item of sortedPengajuan) {
      // Hanya masukkan pengajuan yang sudah memiliki Dokumen Final ke rekap
      if (!item.finalFileName) {
        continue;
      }

      const exists = merged.some((rekap) => rekap.sourcePengajuanId === item.id);

      if (exists) {
        continue;
      }

      const jenis = normalizeJenisDokumen(item.jenisDokumen);
      const tahun = (item.tanggalMulai || new Date().toISOString().slice(0, 10)).slice(0, 4);
      const seqCount = merged.filter((rekap) => rekap.sourcePengajuanId != null).length + 1;

      const nextItem: RekapDokumen = {
        sourcePengajuanId: item.id,
        noDokumen: `${jenis}/${tahun}/P${String(seqCount).padStart(3, '0')}`,
        namaMitra: item.namaMitra || '-',
        jenis,
        unit: item.namaUnitProdi || '-',
        tanggalMulai: formatDisplayDate(item.tanggalMulai || ''),
        berlakuHingga: formatDisplayDate(item.tanggalBerakhir || ''),
        tahun,
        status: resolveRekapStatusFromTanggalBerakhir(item.tanggalBerakhir),
        whatsappNumber: item.whatsappPengusul,
      };

      merged = [nextItem, ...merged];
    }

    return merged;
  } catch {
    return current;
  }
}

// Ambil seluruh data rekap dan gabungkan dengan data default jika perlu.
export function getRekapData(): RekapDokumen[] {
  if (!canUseStorage()) {
    return defaultRekapData;
  }

  const storedRaw = window.localStorage.getItem(STORAGE_KEY);

  if (!storedRaw) {
    const seeded = mergeMissingPengajuanIntoRekap(defaultRekapData);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const stored = JSON.parse(storedRaw) as RekapDokumen[];

    if (!Array.isArray(stored)) {
      const seeded = mergeMissingPengajuanIntoRekap(defaultRekapData);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    const merged = mergeMissingPengajuanIntoRekap(stored);

    if (merged.length !== stored.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    }

    return merged;
  } catch {
    const seeded = mergeMissingPengajuanIntoRekap(defaultRekapData);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

// Ambil daftar jenis dokumen unik untuk dropdown filter.
export function getRekapJenisOptions(items: RekapDokumen[]): string[] {
  return ['Semua Jenis', ...Array.from(new Set([...rekapJenisOptions, ...items.map((item) => item.jenis)]))];
}

// Ambil daftar jurusan/unit unik untuk dropdown filter — dari data dokumen yang ter-load
// (jaga-jaga ada unit lama/nonaktif yang masih dipakai dokumen tapi sudah tidak ada di master
// aktif). SENGAJA tidak lagi include rekapJurusanUnitOptions (daftar hardcode) di sini — nama
// jurusan/unit aktif harus selalu ikut Data Master (lihat masterUnitOptions di rekap_data/page.tsx),
// supaya kalau nama di Data Master diubah/disinkron ulang, dropdown ini tidak nyisain nama lama.
export function getRekapUnitOptions(items: RekapDokumen[]): string[] {
  return ['Semua Jurusan/unit', ...Array.from(new Set(items.map((item) => item.unit).filter(Boolean)))];
}

// Ambil daftar jenis mitra (kategori mitra) unik untuk dropdown filter.
export function getRekapJenisMitraOptions(items: RekapDokumen[]): string[] {
  return [
    'Semua Jenis Mitra',
    ...Array.from(new Set([...rekapJenisMitraOptions, ...items.map((item) => item.jenisMitra).filter((v): v is string => Boolean(v))])),
  ];
}

// Ambil daftar tingkat perusahaan unik untuk dropdown filter.
export function getRekapTingkatPerusahaanOptions(items: RekapDokumen[]): string[] {
  return [
    'Semua Tingkat Perusahaan',
    ...Array.from(new Set([...rekapTingkatPerusahaanOptions, ...items.map((item) => item.tingkatPerusahaan).filter((v): v is string => Boolean(v))])),
  ];
}

// Ambil daftar ruang lingkup unik untuk dropdown filter — dari data dokumen yang ter-load,
// sama seperti getRekapUnitOptions (bukan daftar hardcode) supaya nama yang tidak lagi
// dipakai dokumen manapun tidak nyampah di dropdown.
export function getRekapRuangLingkupOptions(items: RekapDokumen[]): string[] {
  const semua = items.flatMap((item) => item.ruangLingkup || []);
  return ['Semua Ruang Lingkup', ...Array.from(new Set(semua)).sort((a, b) => a.localeCompare(b))];
}

// Ambil daftar tahun unik yang tersedia untuk filter tahun.
export function getAvailableYears(items: RekapDokumen[]): number[] {
  return Array.from(new Set(items.map((item) => Number(item.tahun)))).sort((a, b) => a - b);
}

// Filter rekap data berdasarkan jenis, unit, status, tahun, dan pencarian nama/nomor dokumen.
export function filterRekapData(items: RekapDokumen[], filters: RekapFilterOptions): RekapDokumen[] {
  return items.filter((item) => {
    const matchesJenis = filters.filterJenis === 'Semua Jenis' || item.jenis === filters.filterJenis;
    const matchesUnit = filters.filterUnit === 'Semua Jurusan/unit' || item.unit === filters.filterUnit;
    const matchesStatus = filters.filterStatus === 'Semua Status' || item.status === filters.filterStatus;
    const matchesTahun = filters.filterTahun === null || item.tahun === filters.filterTahun;
    const matchesJenisMitra = filters.filterJenisMitra === 'Semua Jenis Mitra' || item.jenisMitra === filters.filterJenisMitra;
    const matchesTingkatPerusahaan =
      filters.filterTingkatPerusahaan === 'Semua Tingkat Perusahaan' || item.tingkatPerusahaan === filters.filterTingkatPerusahaan;
    const matchesRuangLingkup =
      filters.filterRuangLingkup === 'Semua Ruang Lingkup' || (item.ruangLingkup || []).includes(filters.filterRuangLingkup);
    const keyword = filters.search.toLowerCase().trim();
    // Pencarian mencakup semua kolom yang tampil di tabel Rekap Data — bukan cuma nama
    // mitra/no dokumen — supaya admin bisa cari lewat bidang usaha, PIC, judul kegiatan,
    // ruang lingkup, jurusan/unit, status, dst.
    const searchableText = [
      item.noDokumen,
      item.namaMitra,
      item.bidangUsaha,
      item.alamatMitra,
      item.picMitra,
      item.kodePerusahaan,
      item.tingkatPerusahaan,
      item.judulKegiatan,
      ...(item.ruangLingkup || []),
      item.manfaatSebenarnya,
      item.manfaatKerjasama,
      item.luaranKerjaSama,
      item.tanggalMulai,
      item.berlakuHingga,
      item.durasiTahun !== undefined ? String(item.durasiTahun) : '',
      item.jurusanNama,
      item.prodiNama,
      item.unitKerjaNama,
      item.unit,
      item.status,
      item.jenis,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesSearch = keyword === '' || searchableText.includes(keyword);

    return (
      matchesJenis &&
      matchesUnit &&
      matchesStatus &&
      matchesTahun &&
      matchesJenisMitra &&
      matchesTingkatPerusahaan &&
      matchesRuangLingkup &&
      matchesSearch
    );
  });
}

// Hitung ringkasan total dokumen berdasarkan status untuk stat card.
export function getRekapStats(items: RekapDokumen[]) {
  return {
    totalKerjasama: items.length,
    totalAktif: items.filter((item) => item.status === 'Aktif').length,
    totalAkanBerakhir: items.filter((item) => item.status === 'Akan Berakhir').length,
    totalKadaluarsa: items.filter((item) => item.status === 'Kadaluarsa').length,
  };
}

// Ambil data pengajuan dari localStorage berdasarkan ID.
function getPengajuanById(pengajuanId: number) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem('pengajuanKerjasamaData');
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.find((item: { id: number }) => item.id === pengajuanId) || null;
  } catch {
    return null;
  }
}

// Ubah data rekap menjadi format awal untuk modal edit.
// Jika item memiliki sourcePengajuanId, ambil juga data dari pengajuan terkait untuk prefill.
export function createDokumenFormData(item: RekapDokumen): DokumenData {
  const isProdi = Boolean(item.jurusanUnitProdiId);
  const asalKategori = isProdi ? 'Jurusan' : (item.kategoriUnit || (rekapJurusanOptions.includes(item.unit) ? 'Jurusan' : 'Unit'));

  // Ambil data pengajuan jika sourcePengajuanId ada
  let pengajuanData: {
    namaPengusul?: string;
    jabatanPengusul?: string;
    emailPengusul?: string;
    whatsappPengusul?: string;
    mitraAlamat?: string;
    mitraEmail?: string;
    mitraTelepon?: string;
    mitraNoTelepon?: string;
    mitraKategori?: string;
    mitraPicNama?: string;
    mitraPicJabatan?: string;
    mitraPicEmail?: string;
    mitraPicTelepon?: string;
    manfaat?: string;
    luaranKerjaSama?: string;
  } | null = null;

if (item.sourcePengajuanId) {
    pengajuanData = getPengajuanById(item.sourcePengajuanId);
  }

  return {
    nomorDokumen: item.noDokumen,
    jenisDokumen: item.jenis,
    namaPIC: item.picMitra || pengajuanData?.mitraPicNama || pengajuanData?.namaPengusul || '',
    kategoriMitra: item.jenisMitra || pengajuanData?.mitraKategori || '',
    bidangUsaha: item.bidangUsaha || '',
    tingkatPerusahaan: item.tingkatPerusahaan || '',
    namaMitra: item.namaMitra,
    mitraId: item.mitraId,
    kodePerusahaan: item.kodePerusahaan,
    status: item.status,
    jabatanMitra: item.jabatanPicMitra || pengajuanData?.mitraPicJabatan || '',
    emailMitra: item.emailPicMitra || item.emailMitra || pengajuanData?.mitraPicEmail || pengajuanData?.mitraEmail || pengajuanData?.emailPengusul || '',
    // Pakai versi ISO mentah (bukan item.tanggalMulai/berlakuHingga yang sudah diformat
    // DD/MM/YYYY untuk tampilan tabel) supaya tidak salah tafsir jadi tanggal lain.
    tanggalMulai: toDateInputValue(item.tanggalMulaiRaw || item.tanggalMulai),
    tanggalBerakhir: toDateInputValue(item.berlakuHinggaRaw || item.berlakuHingga),
    alamatMitra: item.alamatMitra || pengajuanData?.mitraAlamat || '',
    whatsappMitra: item.whatsappNumber || pengajuanData?.mitraTelepon || '',
    noTeleponMitra: item.noTeleponMitra || pengajuanData?.mitraNoTelepon || '',
    negara: item.mitraNegara || 'Indonesia',
    asalKategori,
    unitKerja: isProdi ? (item.jurusanNama || item.unit) : item.unit,
    // prodiId cuma terisi kalau unitProdiId dokumen ini memang menunjuk ke Prodi (bukan Jurusan/Unit).
    prodiId: item.jurusanUnitProdiId ? item.unitProdiId ?? null : null,
    ruangLingkup: item.ruangLingkup || [],
    ruangLingkupIds: item.ruangLingkupIds || [],
    dokumenTerkait: item.dokumenTerkait,
    dokumenPendukung: item.dokumenPendukungTerkait,
    judulKegiatan: item.judulKegiatan || '',
    manfaatKerjasama: item.manfaatSebenarnya || item.manfaatKerjasama || pengajuanData?.manfaat || '',
    luaranKerjaSama: item.luaranKerjaSama || pengajuanData?.luaranKerjaSama || '',
    keterangan: item.keteranganAsli || '',
  };
}

// Tambah dokumen baru dari modal input lalu kirim notifikasi ke admin.
export function addRekapDokumen(data: DokumenData): RekapDokumen[] {
  const newDokumen = mapDokumenDataToRekap(data);
  const updated = [newDokumen, ...getRekapData()];
  saveRekapData(updated);

  addAdminNotification({
    title: 'Dokumen Rekap Ditambahkan',
    message: `Dokumen ${newDokumen.noDokumen} untuk mitra ${newDokumen.namaMitra} berhasil ditambahkan ke rekap data.`,
    from: data.namaPIC || 'Admin SIKERMA',
    href: '/admin/rekap_data',
    category: 'info',
    targetRole: 'admin',
  });

  return updated;
}

// Update dokumen yang sudah ada dari modal edit.
export function updateRekapDokumen(originalNoDokumen: string, data: DokumenData): RekapDokumen[] {
  const updated = getRekapData().map((item) =>
    item.noDokumen === originalNoDokumen ? mapDokumenDataToRekap(data) : item
  );

  saveRekapData(updated);

  addAdminNotification({
    title: 'Dokumen Rekap Diperbarui',
    message: `Dokumen ${data.nomorDokumen} untuk mitra ${data.namaMitra} berhasil diperbarui.`,
    from: data.namaPIC || 'Admin SIKERMA',
    href: '/admin/rekap_data',
    category: 'approval',
    targetRole: 'admin',
  });

  return updated;
}

// Hapus dokumen dari daftar rekap data.
export function deleteRekapDokumen(noDokumen: string): RekapDokumen[] {
  const updated = getRekapData().filter((item) => item.noDokumen !== noDokumen);
  saveRekapData(updated);

  addAdminNotification({
    title: 'Dokumen Rekap Dihapus',
    message: `Dokumen ${noDokumen} dihapus dari daftar rekap data.`,
    from: 'Admin SIKERMA',
    href: '/admin/rekap_data',
    category: 'reminder',
    targetRole: 'admin',
  });

  return updated;
}

// Sinkronisasi satu data pengajuan menjadi baris rekap data.
// Hanya pengajuan yang sudah memiliki Dokumen Final yang masuk ke rekap.
export function upsertRekapFromPengajuan(payload: PengajuanSyncPayload): RekapDokumen[] {
  if (!payload.finalFileName) {
    return getRekapData();
  }

  const jenis = normalizeJenisDokumen(payload.jenisDokumen);

  const tahun = (payload.tanggalMulai || new Date().toISOString().slice(0, 10)).slice(0, 4);

  const current = getRekapData();
  const existingItem = current.find((item) => item.sourcePengajuanId === payload.id);

  // Preserve existing noDokumen on update; generate a human-readable one for new items
  let noDokumen: string;
  if (existingItem) {
    noDokumen = existingItem.noDokumen;
  } else {
    const seqCount = current.filter((item) => item.sourcePengajuanId != null).length + 1;
    noDokumen = `${jenis}/${tahun}/P${String(seqCount).padStart(3, '0')}`;
  }

  const nextItem: RekapDokumen = {
    sourcePengajuanId: payload.id,
    noDokumen,
    namaMitra: payload.namaMitra,
    jenis,
    unit: payload.namaUnitProdi,
    tanggalMulai: formatDisplayDate(payload.tanggalMulai || ''),
    berlakuHingga: formatDisplayDate(payload.tanggalBerakhir || ''),
    tahun,
    status: resolveRekapStatusFromTanggalBerakhir(payload.tanggalBerakhir),
    whatsappNumber: payload.whatsappPengusul,
  };

  const updated = existingItem
    ? current.map((item) => (item.sourcePengajuanId === payload.id ? nextItem : item))
    : [nextItem, ...current];

  saveRekapData(updated);
  return updated;
}

// Hapus data rekap yang berasal dari satu pengajuan.
export function removeRekapByPengajuanId(pengajuanId: number): RekapDokumen[] {
  const updated = getRekapData().filter((item) => item.sourcePengajuanId !== pengajuanId);
  saveRekapData(updated);
  return updated;
}

// Terapkan tanggal perpanjangan yang telah disetujui ke dokumen rekap terkait.
export function applyApprovedRenewalToRekap(
  noDokumen: string,
  tanggalMulaiBaru: string,
  tanggalBerakhirBaru: string
): RekapDokumen[] {
  const updated = getRekapData().map((item) => {
    if (item.noDokumen !== noDokumen) {
      return item;
    }

    const nextTahun = new Date(tanggalMulaiBaru).getFullYear();

    return {
      ...item,
      tanggalMulai: formatDisplayDate(tanggalMulaiBaru),
      berlakuHingga: formatDisplayDate(tanggalBerakhirBaru),
      tahun: Number.isNaN(nextTahun) ? item.tahun : String(nextTahun),
      status: resolveRekapStatusFromTanggalBerakhir(tanggalBerakhirBaru),
    };
  });

  saveRekapData(updated);
  return updated;
}
