// Utility untuk generate nomor dokumen sesuai format:
// no-urut/JENIS.KODE-DIREKTUR/BULAN-ROMAWI/TAHUN
export function generateNoDokumen({
  urutan,
  jenis,
  tanggal,
  unitName,
}: {
  urutan: number;
  jenis: 'MoU' | 'MoA' | 'IA';
  tanggal: string; // format: 'dd/mm/yyyy' atau ISO string
  unitName?: string;
}): string {
  const resolveDirekturCode = (name?: string) => {
    const normalized = (name || '').trim().toLowerCase();
    if (!normalized) return 'PL29';

    const patterns: Array<{ code: string; keys: string[] }> = [
      { code: 'PL29.5', keys: ['spi', 'satuan pengawas internal'] },
      { code: 'PL29.6', keys: ['p4m', 'penjaminan mutu'] },
      { code: 'PL29.7', keys: ['p3m', 'penelitian dan pengabdian'] },
      { code: 'PL29.8', keys: ['akademik', 'subag akademik'] },
      { code: 'PL29.9', keys: ['sbum', 'sub bagian umum'] },
      { code: 'PL29.10', keys: ['teknik elektro'] },
      { code: 'PL29.11', keys: ['teknik informatika'] },
      { code: 'PL29.12', keys: ['teknik mesin'] },
      { code: 'PL29.13', keys: ['manajemen dan bisnis'] },
      { code: 'PL29.14', keys: ['shilau'] },
      { code: 'PL29.15', keys: ['upa perpustakaan'] },
      { code: 'PL29.16', keys: ['upa tik'] },
      { code: 'PL29.17', keys: ['upa pp', 'perawatan dan perbaikan'] },
      { code: 'PL29.18', keys: ['upa pkk', 'pengembangan karier'] },
      { code: 'PL29.19', keys: ['osdm', 'organisasi dan sdm'] },
      { code: 'PL29.20', keys: ['pokja keuangan'] },
      { code: 'PL29.21', keys: ['pokja perencanaan'] },
      { code: 'PL29.22', keys: ['pokja bmn', 'pengadaan'] },
      { code: 'PL29.23', keys: ['pokja kemahasiswaan'] },
      { code: 'PL29.24', keys: ['pokja humas', 'kerja sama'] },
    ];

    for (const pattern of patterns) {
      if (pattern.keys.some((key) => normalized.includes(key))) {
        return pattern.code;
      }
    }

    return 'PL29';
  };

  // Nomor urut dokumen mengikuti nilai urutan asli.
  const urutanDokumen = Math.max(1, Math.trunc(typeof urutan === 'number' && !isNaN(urutan) ? urutan : 1));
  // Jenis kapital
  const jenisUpper = jenis.toUpperCase();
  // Ambil bulan dan tahun
  let bulan = 0;
  let tahun = '';
  if (!tanggal || typeof tanggal !== 'string') {
    tanggal = new Date().toISOString();
  }
  if (tanggal.includes('/')) {
    // format dd/mm/yyyy
    const parts = tanggal.split('/');
    bulan = parseInt(parts[1], 10);
    tahun = parts[2];
  } else {
    // ISO string
    const dateObj = new Date(tanggal);
    bulan = dateObj.getMonth() + 1;
    tahun = dateObj.getFullYear().toString();
  }
  // Bulan romawi
  const bulanRomawiArr = [
    '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  ];
  const bulanRomawi = bulanRomawiArr[bulan] || '';
  const kodeDirektur = resolveDirekturCode(unitName);
  return `${urutanDokumen}/${jenisUpper}.${kodeDirektur}/${bulanRomawi}/${tahun}`;
}
// Service monitoring kerjasama untuk halaman admin.
// File ini dipakai agar data, tipe, dan helper bisnis tidak bercampur dengan komponen UI Next.js.

import { apiRequest } from '@/lib/api';
import { buildLegacyFileUrl } from '@/services/dokumenKerjasamaApiService';
import { getCachedMasterRuangLingkup, getMasterRuangLingkup } from '@/services/masterRuangLingkupService';
import { matchesBulan, rekapJenisMitraOptions, rekapTingkatPerusahaanOptions } from '@/services/adminRekapDataService';
import { formatSisaMasaBerlaku } from '@/lib/sisaMasaBerlaku';

const MONITORING_CACHE_TTL_MS = 60 * 1000;
let monitoringCache: { data: Kerjasama[]; expiresAt: number } | null = null;
let monitoringInFlight: Promise<Kerjasama[]> | null = null;

export function invalidateMonitoringCache(): void {
  monitoringCache = null;
}

export interface RenewalRecord {
  id: string;
  tanggalPermintaan: string;
  statusResponse: 'menunggu' | 'disetujui' | 'ditolak';
  catatan: string;
  tanggalMulaiBaru: string;
  tanggalBerakhirBaru: string;
  tanggalResponse?: string;
}

export interface MonitoringNotification {
  id: string;
  tanggalKirim: string;
  jenis: 'reminder-3bulan' | 'reminder-1bulan' | 'urgent';
  status: 'terkirim' | 'dibaca' | 'ditindaklanjuti' | 'tidak-direspons' | 'gagal' | 'dilewati';
  pesan: string;
  emailMitra: string;
}

export type StatusKerjasama = 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';
export type TabKey = 'Semua' | 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';

export interface Kerjasama {
  id: number;
  sourcePengajuanId?: number;
  judul?: string;
  namaMitra: string;
  noDokumen: string;
  jenis: 'MoU' | 'MoA' | 'IA';
  // Semua jenis bila dokumen memuat beberapa jenis (mis. MoU + MoA); kosong = hanya `jenis`.
  jenisList?: Array<'MoU' | 'MoA' | 'IA'>;
  status: StatusKerjasama;
  tanggalMulai: string;
  tanggalBerakhir: string;
  // Tanggal mulai mentah dari API (YYYY-MM-DD) — dipakai filter bulan.
  tanggalMulaiRaw?: string;
  tahun?: string;
  unit?: string;
  jenisMitra?: string;
  tingkatPerusahaan?: string;
  sisaMasaBerlaku: string | null;
  ruangLingkup: string[];
  whatsappNumber: string;
  emailMitra: string;
  // Catatan & bukti kalau kerja sama ini pernah ditandai TIDAK diperpanjang — sama dengan
  // yang tampil di kolom "Catatan/Bukti Tidak Diperpanjang" pada tabel Arsip Dokumen.
  alasanArsip?: string | null;
  buktiTidakDiperpanjang?: string | null;
  buktiTidakDiperpanjangDownloadUrl?: string | null;
  buktiTidakDiperpanjangNama?: string | null;
}

const STORAGE_KEY = 'adminMonitoringKerjasamaData';

// Data awal monitoring yang ditampilkan ketika halaman dibuka.
const defaultMonitoringData: Kerjasama[] = [
  {
    id: 1,
    namaMitra: 'BADAN PENGUSAHAAN BATAM',
    noDokumen: '00',
    jenis: 'MoU',
    status: 'Aktif',
    tanggalMulai: '01/01/2025',
    tanggalBerakhir: '01/01/2028',
    sisaMasaBerlaku: '20 Bulan',
    ruangLingkup: ['Penelitian', 'Pengabdian Masyarakat'],
    whatsappNumber: '6281234567890',
    emailMitra: 'contact@bpb.go.id',
  },
  {
    id: 2,
    namaMitra: 'PT Feen Marine',
    noDokumen: '00',
    jenis: 'MoA',
    status: 'Akan Berakhir',
    tanggalMulai: '01/01/2025',
    tanggalBerakhir: '01/01/2028',
    sisaMasaBerlaku: null,
    ruangLingkup: ['Magang', 'Kerja Praktek'],
    whatsappNumber: '6289876543210',
    emailMitra: 'admin@feenmarine.com',
  },
  {
    id: 3,
    namaMitra: 'PT. Riseal Propulsion Indonesia',
    noDokumen: '00',
    jenis: 'IA',
    status: 'Kadaluarsa',
    tanggalMulai: '01/01/2025',
    tanggalBerakhir: '01/01/2028',
    sisaMasaBerlaku: '1 Bulan',
    ruangLingkup: ['Magang', 'Kerja Praktek'],
    whatsappNumber: '6281111111111',
    emailMitra: 'contact@riseal.co.id',
  },
  {
    id: 4,
    namaMitra: 'Universitas Negeri Jakarta',
    noDokumen: '01',
    jenis: 'MoU',
    status: 'Aktif',
    tanggalMulai: '15/03/2024',
    tanggalBerakhir: '15/03/2027',
    sisaMasaBerlaku: '11 Bulan',
    ruangLingkup: ['Penelitian', 'Publikasi Bersama'],
    whatsappNumber: '6282222222222',
    emailMitra: 'kerjasama@unj.ac.id',
  },
  {
    id: 5,
    namaMitra: 'PT. Teknologi Maju Indonesia',
    noDokumen: '02',
    jenis: 'MoA',
    status: 'Akan Berakhir',
    tanggalMulai: '10/02/2023',
    tanggalBerakhir: '10/05/2026',
    sisaMasaBerlaku: '1 Bulan',
    ruangLingkup: ['Magang', 'Penelitian'],
    whatsappNumber: '6283333333333',
    emailMitra: 'marketing@teknologimaju.id',
  },
  {
    id: 6,
    namaMitra: 'PT. Digital Solutions',
    noDokumen: '03',
    jenis: 'IA',
    status: 'Kadaluarsa',
    tanggalMulai: '01/06/2022',
    tanggalBerakhir: '01/06/2025',
    sisaMasaBerlaku: null,
    ruangLingkup: ['Kerja Praktek'],
    whatsappNumber: '6284444444444',
    emailMitra: 'hr@digitalsolutions.co.id',
  },
  {
    id: 7,
    namaMitra: 'Politeknik Negeri Semarang',
    noDokumen: '04',
    jenis: 'MoU',
    status: 'Akan Berakhir',
    tanggalMulai: '20/07/2023',
    tanggalBerakhir: '20/07/2026',
    sisaMasaBerlaku: '3 Bulan',
    ruangLingkup: ['Penelitian', 'Pengabdian Masyarakat'],
    whatsappNumber: '6285555555555',
    emailMitra: 'kerjasama@polines.ac.id',
  },
  {
    id: 8,
    namaMitra: 'PT Batam Aero Technic',
    noDokumen: '05',
    jenis: 'IA',
    status: 'Aktif',
    tanggalMulai: '05/01/2025',
    tanggalBerakhir: '05/01/2029',
    sisaMasaBerlaku: '33 Bulan',
    ruangLingkup: ['Magang', 'Kerja Praktek', 'Penelitian'],
    whatsappNumber: '6286666666666',
    emailMitra: 'partnerships@batamtech.com',
  },
  {
    id: 9,
    namaMitra: 'Dinas Pendidikan Kepri',
    noDokumen: '06',
    jenis: 'MoU',
    status: 'Kadaluarsa',
    tanggalMulai: '01/04/2021',
    tanggalBerakhir: '01/04/2024',
    sisaMasaBerlaku: null,
    ruangLingkup: ['Pengabdian Masyarakat'],
    whatsappNumber: '6287777777777',
    emailMitra: 'dinaspendidikan@kepriprov.go.id',
  },
  {
    id: 10,
    namaMitra: 'PT. Samator Gas Industri',
    noDokumen: '07',
    jenis: 'MoA',
    status: 'Aktif',
    tanggalMulai: '12/09/2024',
    tanggalBerakhir: '12/09/2027',
    sisaMasaBerlaku: '17 Bulan',
    ruangLingkup: ['Kerja Praktek'],
    whatsappNumber: '6288888888888',
    emailMitra: 'corporate@samatorgas.com',
  },
];

// Badge jenis dokumen untuk dipakai langsung di komponen UI.
export const monitoringJenisBadgeMap: Record<Kerjasama['jenis'], string> = {
  MoU: 'bg-violet-100 text-violet-700',
  MoA: 'bg-cyan-100 text-cyan-700',
  IA: 'bg-orange-100 text-orange-700',
};

// Konfigurasi warna status agar tampilan kartu konsisten di halaman monitoring.
export const monitoringStatusConfig: Record<StatusKerjasama, { dot: string; label: string; border: string; bg: string; labelColor: string }> = {
  Aktif: {
    dot: 'bg-green-500',
    label: 'Aktif',
    border: 'border-l-green-500',
    bg: 'bg-green-50',
    labelColor: 'text-green-600',
  },
  'Akan Berakhir': {
    dot: 'bg-orange-400',
    label: 'akan berakhir',
    border: 'border-l-orange-400',
    bg: 'bg-orange-50',
    labelColor: 'text-orange-500',
  },
  Kadaluarsa: {
    dot: 'bg-red-500',
    label: 'kadaluarsa',
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    labelColor: 'text-red-500',
  },
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

function emitMonitoringUpdate() {
  if (canUseStorage()) {
    window.dispatchEvent(new Event('monitoring-data-updated'));
  }
}

function saveMonitoringData(items: Kerjasama[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emitMonitoringUpdate();
}

function normalizeMonitoringData(items: Kerjasama[]): Kerjasama[] {
  const byId = new Map<number, Kerjasama>();

  for (const item of items) {
    const existing = byId.get(item.id);

    if (!existing) {
      byId.set(item.id, item);
      continue;
    }

    // Prefer synced rows from pengajuan when duplicate IDs exist.
    const chooseIncoming = Boolean(item.sourcePengajuanId) && !existing.sourcePengajuanId;
    if (chooseIncoming) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values());
}

function formatDisplayDate(dateValue?: string): string {
  if (!dateValue) {
    return '-';
  }

  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return parsedDate.toLocaleDateString('id-ID');
}

// Status SELALU diambil dari status_efektif yang dihitung backend (DokumenKerjasama,
// lihat App\Support\KerjasamaStatus), BUKAN dihitung ulang di sini dari tanggal_berakhir.
// Sebelumnya fungsi ini punya aturan sendiri yang independen dari status_siklus/Rekap
// Data, sehingga jumlah "Kadaluarsa" di Monitoring & dashboard Pimpinan bisa beda dari
// Rekap Data dan Arsip Dokumen — sekarang keempatnya baca sumber yang sama persis.
// sisaMasaBerlaku tetap dihitung dari tanggal di sini karena itu cuma teks tampilan
// ("N Bulan lagi"), bukan bagian dari perhitungan status/jumlah Kadaluarsa.
function resolveStatusAndSisa(
  statusEfektif: 'active' | 'expiring' | 'archived' | undefined,
  tanggalBerakhir?: string
): { status: StatusKerjasama; sisaMasaBerlaku: string | null } {
  const status: StatusKerjasama =
    statusEfektif === 'archived' ? 'Kadaluarsa' : statusEfektif === 'expiring' ? 'Akan Berakhir' : 'Aktif';

  if (status === 'Kadaluarsa' || !tanggalBerakhir) {
    return { status, sisaMasaBerlaku: null };
  }

  const endDate = new Date(tanggalBerakhir);
  if (Number.isNaN(endDate.getTime())) {
    return { status, sisaMasaBerlaku: null };
  }

  return { status, sisaMasaBerlaku: formatSisaMasaBerlaku(endDate) };
}

// Dipakai HANYA oleh dua fungsi cache optimis di bawah (upsertMonitoringFromPengajuan,
// applyApprovedRenewalToMonitoring) yang menyusun record Kerjasama dari payload
// pengajuan/perpanjangan mentah sebelum sempat di-refresh dari API — jadi belum ada
// status_efektif dari backend untuk dipakai. Aturan jendelanya SENGAJA disamakan persis
// dengan KerjasamaStatus (90 hari tetap) supaya begitu data asli datang dari
// fetchMonitoringDataFromApi(), angkanya tidak "lompat" karena beda aturan.
function estimateStatusAndSisaFromTanggal(tanggalBerakhir?: string): { status: StatusKerjasama; sisaMasaBerlaku: string | null } {
  if (!tanggalBerakhir) {
    return { status: 'Aktif', sisaMasaBerlaku: null };
  }

  const endDate = new Date(tanggalBerakhir);
  if (Number.isNaN(endDate.getTime())) {
    return { status: 'Aktif', sisaMasaBerlaku: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: 'Kadaluarsa', sisaMasaBerlaku: null };
  }

  const sisaMasaBerlaku = formatSisaMasaBerlaku(endDate);

  return { status: diffDays <= 90 ? 'Akan Berakhir' : 'Aktif', sisaMasaBerlaku };
}

// Ambil seluruh data kerjasama untuk monitoring.
export function getMonitoringData(): Kerjasama[] {
  if (!canUseStorage()) {
    return normalizeMonitoringData(defaultMonitoringData);
  }

  const storedRaw = window.localStorage.getItem(STORAGE_KEY);

  if (!storedRaw) {
    const normalizedDefaults = normalizeMonitoringData(defaultMonitoringData);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedDefaults));
    return normalizedDefaults;
  }

  try {
    const stored = JSON.parse(storedRaw) as Kerjasama[];

    if (!Array.isArray(stored)) {
      return normalizeMonitoringData(defaultMonitoringData);
    }

    const normalized = normalizeMonitoringData(stored);

    if (normalized.length !== stored.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }

    return normalized;
  } catch {
    return normalizeMonitoringData(defaultMonitoringData);
  }
}

export async function fetchMonitoringDataFromApi(options?: { forceRefresh?: boolean }): Promise<Kerjasama[]> {
  const now = Date.now();

  if (!options?.forceRefresh && monitoringCache && monitoringCache.expiresAt > now) {
    return monitoringCache.data;
  }

  if (monitoringInFlight) {
    return monitoringInFlight;
  }

  monitoringInFlight = (async () => {
    try {
    const [response] = await Promise.all([
      apiRequest<any>('/dokumen-kerjasama?per_page=2000'),
      getCachedMasterRuangLingkup().length === 0 ? getMasterRuangLingkup({ aktif: true }).catch(() => []) : Promise.resolve([]),
    ]);
    const items = response.data?.data || [];
    const rlLookup = getCachedMasterRuangLingkup();

    const mapped = items.map((row: any) => {
      const { status, sisaMasaBerlaku } = resolveStatusAndSisa(row.status_efektif, row.tanggal_berakhir);
      
      // Priority: mitra relation → pengajuan.nama_mitra → snap_nama_mitra → keterangan → legacy file name
      let namaMitra = row.mitra?.nama_mitra;

      if (!namaMitra && row.pengajuan?.nama_mitra) {
        namaMitra = row.pengajuan.nama_mitra;
      }

      // Snapshot tersimpan saat pengajuan disetujui (atau dibackfill untuk dokumen migrasi lama) —
      // tetap ada meski pengajuan dihapus, dan sudah bersih (bukan hasil parsing nama file mentah).
      if (!namaMitra && row.snap_nama_mitra) {
        namaMitra = row.snap_nama_mitra;
      }

      if (!namaMitra && row.keterangan && row.keterangan.includes('Mitra:')) {
        const match = row.keterangan.match(/Mitra:\s*(.*?)(?:\s*\|\s*Bidang:|$)/i);
        if (match && match[1]) {
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
      
      const ruangLingkup = Array.isArray(row.ruang_lingkup_ids)
        ? (row.ruang_lingkup_ids as any[]).map((id) => {
            const numId = Number(id);
            const found = rlLookup.find((item) => item.id === numId);
            return found ? found.nama_ruang_lingkup : String(id);
          }).filter(Boolean)
        : [];

      return {
        id: row.id,
        sourcePengajuanId: row.sumber_pengajuan_id || undefined,
        judul: row.judul_dokumen || undefined,
        namaMitra: namaMitra || '-',
        noDokumen: row.nomor_dokumen || row.pengajuan?.nomor_pengajuan || `DOK-${row.id}`,
        jenis: (row.jenis_dokumen?.toUpperCase() === 'MOA' ? 'MoA' : row.jenis_dokumen?.toUpperCase() === 'IA' ? 'IA' : 'MoU'),
        jenisList: Array.isArray(row.jenis_dokumen_list) && row.jenis_dokumen_list.length > 1
          ? Array.from(new Set(row.jenis_dokumen_list.map((j: string) => (j.toUpperCase() === 'MOA' ? 'MoA' : j.toUpperCase() === 'IA' ? 'IA' : 'MoU')))) as Array<'MoU' | 'MoA' | 'IA'>
          : undefined,
        status: status,
        tanggalMulai: formatDisplayDate(row.tanggal_mulai),
        tanggalBerakhir: formatDisplayDate(row.tanggal_berakhir),
        tanggalMulaiRaw: row.tanggal_mulai || undefined,
        tahun: (row.tanggal_mulai || '').slice(0, 4) || undefined,
        unit: row.unit_prodi?.nama || undefined,
        jenisMitra: row.mitra?.kategori_mitra || undefined,
        tingkatPerusahaan: row.mitra?.tingkat_perusahaan || undefined,
        sisaMasaBerlaku: sisaMasaBerlaku,
        ruangLingkup,
        whatsappNumber:
          row.pengajuan?.whatsapp_pengusul ||
          row.snap_whatsapp_pengusul ||
          row.mitra?.whatsapp_mitra ||
          row.mitra?.telepon_kontak_utama ||
          row.mitra?.no_telepon_mitra ||
          '-',
        emailMitra:
          row.mitra?.email_mitra ||
          row.mitra?.email_kontak_utama ||
          row.pengajuan?.email_pengusul ||
          row.snap_email_pengusul ||
          '-',
        alasanArsip: row.alasan_arsip || null,
        buktiTidakDiperpanjang: (() => {
          const file = (row.dokumen_files || []).find((f: any) => f.peran_berkas === 'bukti_tidak_diperpanjang');
          return file ? buildLegacyFileUrl(file.path_file || '') : null;
        })(),
        buktiTidakDiperpanjangDownloadUrl: (() => {
          const file = (row.dokumen_files || []).find((f: any) => f.peran_berkas === 'bukti_tidak_diperpanjang');
          return file ? `/dokumen-kerjasama/${row.id}/documents/${file.id}/download` : null;
        })(),
        buktiTidakDiperpanjangNama: (() => {
          const file = (row.dokumen_files || []).find((f: any) => f.peran_berkas === 'bukti_tidak_diperpanjang');
          return file?.nama_file || null;
        })(),
      } as Kerjasama;
    });
    
    if (canUseStorage()) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
    }

    monitoringCache = { data: mapped, expiresAt: Date.now() + MONITORING_CACHE_TTL_MS };
    return mapped;
  } catch (error) {
    console.error('Failed to fetch monitoring data:', error);
    return getMonitoringData();
  } finally {
    monitoringInFlight = null;
  }
  })();

  return monitoringInFlight;
}

// Hitung ringkasan statistik berdasarkan status kerjasama.
export function getMonitoringStats(items: Kerjasama[]) {
  return {
    totalAktif: items.filter((item) => item.status === 'Aktif').length,
    totalAkanBerakhir: items.filter((item) => item.status === 'Akan Berakhir').length,
    totalKadaluarsa: items.filter((item) => item.status === 'Kadaluarsa').length,
  };
}

// Filter data berdasarkan tab aktif di halaman monitoring.
export function getFilteredMonitoringData(items: Kerjasama[], activeTab: TabKey): Kerjasama[] {
  return activeTab === 'Semua' ? items : items.filter((item) => item.status === activeTab);
}

export interface MonitoringFilterOptions {
  filterJenis: string;
  filterUnit: string;
  filterJenisMitra: string;
  filterTingkatPerusahaan: string;
  filterTahun: string | null;
  filterBulan: string;
}

// Ambil daftar jenis dokumen unik untuk dropdown filter (sama pola dengan Rekap Data).
export function getMonitoringJenisOptions(items: Kerjasama[]): string[] {
  return ['Semua Jenis', ...Array.from(new Set(['MoU', 'MoA', 'IA', ...items.map((item) => item.jenis)]))];
}

// Ambil daftar jurusan/unit (termasuk prodi bila ada di data) unik untuk dropdown filter.
export function getMonitoringUnitOptions(items: Kerjasama[]): string[] {
  return [
    'Semua Jurusan/Prodi/Unit',
    ...Array.from(new Set(items.map((item) => item.unit).filter((v): v is string => Boolean(v)))),
  ];
}

// Ambil daftar jenis mitra unik untuk dropdown filter.
export function getMonitoringJenisMitraOptions(items: Kerjasama[]): string[] {
  return [
    'Semua Jenis Mitra',
    ...Array.from(new Set([...rekapJenisMitraOptions, ...items.map((item) => item.jenisMitra).filter((v): v is string => Boolean(v))])),
  ];
}

// Ambil daftar tingkat perusahaan unik untuk dropdown filter.
export function getMonitoringTingkatOptions(items: Kerjasama[]): string[] {
  return [
    'Semua Tingkat Perusahaan',
    ...Array.from(new Set([...rekapTingkatPerusahaanOptions, ...items.map((item) => item.tingkatPerusahaan).filter((v): v is string => Boolean(v))])),
  ];
}

// Ambil daftar tahun unik yang tersedia untuk filter tahun.
export function getMonitoringYearOptions(items: Kerjasama[]): number[] {
  return Array.from(new Set(items.map((item) => Number(item.tahun)).filter((year) => !Number.isNaN(year)))).sort((a, b) => a - b);
}

// Filter tambahan (jenis, unit/prodi, jenis mitra, tingkat perusahaan, tahun) di atas filter tab status.
export function filterMonitoringData(items: Kerjasama[], filters: MonitoringFilterOptions): Kerjasama[] {
  return items.filter((item) => {
    // Dokumen gabungan (MoU + MoA) ikut tampil di filter kedua jenisnya.
    const matchesJenis = filters.filterJenis === 'Semua Jenis' || (item.jenisList ?? [item.jenis]).some((j) => j === filters.filterJenis);
    const matchesUnit = filters.filterUnit === 'Semua Jurusan/Prodi/Unit' || item.unit === filters.filterUnit;
    const matchesJenisMitra = filters.filterJenisMitra === 'Semua Jenis Mitra' || item.jenisMitra === filters.filterJenisMitra;
    const matchesTingkat =
      filters.filterTingkatPerusahaan === 'Semua Tingkat Perusahaan' || item.tingkatPerusahaan === filters.filterTingkatPerusahaan;
    const matchesTahun = filters.filterTahun === null || item.tahun === filters.filterTahun;
    const matchesBulanMulai = matchesBulan(item.tanggalMulaiRaw, filters.filterBulan);

    return matchesJenis && matchesUnit && matchesJenisMitra && matchesTingkat && matchesTahun && matchesBulanMulai;
  });
}

// Siapkan daftar tab beserta jumlah datanya untuk komponen UI.
export function getMonitoringTabs(items: Kerjasama[]) {
  const { totalAktif, totalAkanBerakhir, totalKadaluarsa } = getMonitoringStats(items);

  return [
    { key: 'Semua' as const, label: 'Semua Status', count: items.length },
    { key: 'Aktif' as const, label: 'Kerjasama Aktif', count: totalAktif },
    { key: 'Akan Berakhir' as const, label: 'Akan Berakhir', count: totalAkanBerakhir },
    { key: 'Kadaluarsa' as const, label: 'Kadaluarsa', count: totalKadaluarsa },
  ];
}

// Cari satu data kerjasama berdasarkan id.
export function findKerjasamaById(items: Kerjasama[], id: number | null): Kerjasama | null {
  if (!id) {
    return null;
  }

  return items.find((item) => item.id === id) || null;
}

export function hasWhatsAppNumber(item: Kerjasama): boolean {
  return String(item.whatsappNumber || '').replace(/[^0-9]/g, '').length >= 8;
}

export function hasEmailMitra(item: Kerjasama): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(item.emailMitra || '').trim());
}

// Buka halaman tulis email Gmail di tab baru (mailto: tidak jalan kalau PC tidak punya
// aplikasi email default).
export function createEmailLink(item: Kerjasama): string {
  const judul = item.judul || item.noDokumen || '';
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: String(item.emailMitra).trim(),
    su: `Kerja Sama ${judul}`.trim(),
    body: `Halo ${item.namaMitra},\n\nsaya ingin membahas tentang kerjasama ${judul}.\n`,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

// Buat tautan WhatsApp otomatis untuk menghubungi mitra.
export function createWhatsAppLink(item: Kerjasama): string {
  let nomor = String(item.whatsappNumber).replace(/[^0-9]/g, '');
  if (nomor.startsWith('0')) {
    nomor = '62' + nomor.slice(1);
  }
  const judul = item.judul || item.noDokumen || '';
  const pesan = `Halo ${item.namaMitra}, saya ingin membahas tentang kerjasama ${judul}`;
  return `https://wa.me/${nomor}?text=${encodeURIComponent(pesan)}`;
}

// Helper untuk membuat record perpanjangan baru.
export function createRenewalRecord(
  kerjasamaId: number,
  catatan: string,
  tanggalMulaiBaru: string,
  tanggalBerakhirBaru: string
): RenewalRecord {
  return {
    id: `renewal-${kerjasamaId}-${Date.now()}`,
    tanggalPermintaan: new Date().toLocaleDateString('id-ID'),
    statusResponse: 'menunggu',
    catatan,
    tanggalMulaiBaru,
    tanggalBerakhirBaru,
  };
}


type PengajuanSyncPayload = {
  id: number;
  judulPengajuan?: string;
  namaMitra: string;
  jenisDokumen: string;
  tanggalMulai?: string;
  tanggalBerakhir?: string;
  ruangLingkup: string[];
  whatsappPengusul?: string;
  emailPengusul?: string;
};

// Sinkronisasi pengajuan ke daftar monitoring.
export function upsertMonitoringFromPengajuan(payload: PengajuanSyncPayload): Kerjasama[] {
  const jenis = (payload.jenisDokumen === 'MoA' || payload.jenisDokumen === 'MoU' || payload.jenisDokumen === 'IA')
    ? payload.jenisDokumen
    : 'MoU';

  const { status, sisaMasaBerlaku } = estimateStatusAndSisaFromTanggal(payload.tanggalBerakhir);

  const nextItem: Kerjasama = {
    id: payload.id,
    sourcePengajuanId: payload.id,
    judul: payload.judulPengajuan,
    namaMitra: payload.namaMitra,
    noDokumen: `PGJ/${payload.id}`,
    jenis,
    status,
    tanggalMulai: formatDisplayDate(payload.tanggalMulai),
    tanggalBerakhir: formatDisplayDate(payload.tanggalBerakhir),
    sisaMasaBerlaku,
    ruangLingkup: payload.ruangLingkup.length ? payload.ruangLingkup : ['Lainnya'],
    whatsappNumber: payload.whatsappPengusul || '-',
    emailMitra: payload.emailPengusul || '-',
  };

  const current = getMonitoringData();
  const hasExisting = current.some((item) => item.sourcePengajuanId === payload.id || item.id === payload.id);
  const updated = hasExisting
    ? current.map((item) => (
      item.sourcePengajuanId === payload.id || item.id === payload.id ? nextItem : item
    ))
    : [nextItem, ...current];

  const normalized = normalizeMonitoringData(updated);
  saveMonitoringData(normalized);
  return normalized;
}

// Hapus data monitoring yang berasal dari pengajuan tertentu.
export function removeMonitoringByPengajuanId(pengajuanId: number): Kerjasama[] {
  const updated = getMonitoringData().filter(
    (item) => item.sourcePengajuanId !== pengajuanId && item.id !== pengajuanId
  );
  saveMonitoringData(updated);
  return updated;
}

// Hapus satu data monitoring berdasarkan id item.
export function deleteMonitoringItem(id: number): Kerjasama[] {
  const updated = getMonitoringData().filter((item) => item.id !== id);
  saveMonitoringData(updated);
  return updated;
}

// Terapkan tanggal perpanjangan yang sudah disetujui ke data monitoring.
export function applyApprovedRenewalToMonitoring(
  kerjasamaId: number,
  tanggalMulaiBaru: string,
  tanggalBerakhirBaru: string
): Kerjasama[] {
  const { status, sisaMasaBerlaku } = estimateStatusAndSisaFromTanggal(tanggalBerakhirBaru);

  const updated = getMonitoringData().map((item) => {
    if (item.id !== kerjasamaId) {
      return item;
    }

    return {
      ...item,
      tanggalMulai: formatDisplayDate(tanggalMulaiBaru),
      tanggalBerakhir: formatDisplayDate(tanggalBerakhirBaru),
      status,
      sisaMasaBerlaku,
    };
  });

  saveMonitoringData(updated);
  return updated;
}

// Riwayat notifikasi (otomatis + manual) untuk satu dokumen kerja sama, dari tabel
// notifikasi_kerjasama di backend (bukan lagi contoh/localStorage).
export async function fetchNotifikasiKerjasama(dokumenId: number): Promise<MonitoringNotification[]> {
  if (!dokumenId) return [];
  try {
    const res = await apiRequest<{ success: boolean; data: Array<{
      id: number;
      jenis: MonitoringNotification['jenis'];
      status: string;
      email: string | null;
      keterangan: string | null;
      dikirim_pada: string | null;
      dibuat_pada: string | null;
    }> }>(`/dokumen-kerjasama/${dokumenId}/notifikasi`);

    return (res.data || []).map((row) => {
      const waktu = row.dikirim_pada || row.dibuat_pada;
      const statusMap: Record<string, MonitoringNotification['status']> = {
        terkirim: 'terkirim',
        gagal: 'gagal',
        dilewati: 'dilewati',
      };
      const pesanDefault: Record<MonitoringNotification['jenis'], string> = {
        'reminder-3bulan': 'Pengingat: kerja sama akan berakhir dalam ±3 bulan',
        'reminder-1bulan': 'Pengingat: kerja sama akan berakhir dalam ±1 bulan',
        urgent: 'URGENT: kerja sama segera berakhir',
      };
      return {
        id: String(row.id),
        tanggalKirim: waktu ? new Date(waktu).toLocaleString('id-ID') : '-',
        jenis: row.jenis,
        status: statusMap[row.status] ?? 'terkirim',
        pesan: row.keterangan || pesanDefault[row.jenis] || 'Notifikasi terkirim',
        emailMitra: row.email || '-',
      };
    });
  } catch {
    return [];
  }
}

export async function sendNotificationEmail(
  emailMitra: string,
  jenis: 'reminder-3bulan' | 'reminder-1bulan' | 'urgent',
  noDokumen: string,
  namaMitra: string,
  dokumenId?: number
): Promise<{ success: boolean; message: string }> {
  const subjects: Record<typeof jenis, string> = {
    'reminder-3bulan': '[SIKERMA] Pengingat: Kerjasama Akan Berakhir dalam 3 Bulan',
    'reminder-1bulan': '[SIKERMA] Pengingat: Kerjasama Akan Berakhir dalam 1 Bulan',
    urgent: '[SIKERMA] URGENT: Kerjasama Segera Berakhir',
  };

  const bodies: Record<typeof jenis, string> = {
    'reminder-3bulan': `Kepada Yth. ${namaMitra},\n\nBersama ini kami informasikan bahwa dokumen kerjasama No. ${noDokumen} antara pihak Anda dengan Politeknik Negeri Batam akan berakhir masa berlakunya dalam 3 (tiga) bulan ke depan.\n\nMohon untuk mempersiapkan proses perpanjangan atau menghubungi kami segera untuk tindak lanjut.\n\nHormat kami,\nAdmin SIKERMA\nPoliteknik Negeri Batam`,
    'reminder-1bulan': `Kepada Yth. ${namaMitra},\n\nBersama ini kami informasikan bahwa dokumen kerjasama No. ${noDokumen} antara pihak Anda dengan Politeknik Negeri Batam akan berakhir masa berlakunya dalam 1 (satu) bulan ke depan.\n\nSegera hubungi kami untuk memproses perpanjangan kerjasama.\n\nHormat kami,\nAdmin SIKERMA\nPoliteknik Negeri Batam`,
    urgent: `Kepada Yth. ${namaMitra},\n\nPERHATIAN: Dokumen kerjasama No. ${noDokumen} antara pihak Anda dengan Politeknik Negeri Batam akan BERAKHIR dalam waktu kurang dari 1 (satu) minggu!\n\nSegera lakukan perpanjangan atau hubungi kami SEKARANG untuk menghindari berakhirnya kerjasama.\n\nHormat kami,\nAdmin SIKERMA\nPoliteknik Negeri Batam`,
  };

  try {
    const result = await apiRequest<{ success: boolean; message: string }>(
      '/notifications/send-email',
      {
        method: 'POST',
        body: JSON.stringify({
          email: emailMitra,
          subject: subjects[jenis],
          body: bodies[jenis],
          jenis,
          noDokumen,
          namaMitra,
          ...(dokumenId ? { dokumenId } : {}),
        }),
      }
    );
    return result;
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Gagal mengirim email notifikasi.',
    };
  }
}
