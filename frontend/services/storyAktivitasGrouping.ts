import { getAktivitasByKerjasamaId, type AktivitasItem } from './adminStoryAktivitasService';
import type { PengajuanItem, PengajuanStatus } from './adminPengajuanService';
import type { RekapDokumen } from './adminRekapDataService';

export interface StoryAktivitasTimelineItem extends AktivitasItem {
  sourcePengajuanId: number;
  sourcePengajuanKey: string;
  sourceNomorPengajuan: string;
  sourceJudulPengajuan: string;
  sourceJenisDokumen: string;
}

export interface StoryAktivitasGroup {
  key: string;
  mitraId?: number;
  namaMitra: string;
  nomorDokumen: string;
  jenis: 'MoA' | 'MoU' | 'IA';
  // Semua jenis dokumen yang ada di grup ini (satu mitra bisa punya beberapa dokumen kerja
  // sama dengan jenis berbeda-beda, mis. MoU dan MoA sekaligus) — dipakai untuk filter
  // "Jenis" di halaman daftar Story & Aktivitas, supaya mitra tidak lolos dari filter
  // cuma karena dokumen "primary"-nya kebetulan bukan jenis yang dicari.
  jenisTerlibat: string[];
  status: 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';
  berakhir: string;
  masaBerlaku: string;
  tahun: number;
  aktivitas: StoryAktivitasTimelineItem[];
  totalAktivitas: number;
  totalPengajuan: number;
  pengajuan: PengajuanItem[];
  ruangLingkup: string[];
  jurusanTerlibat: string[];
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mitra';
}

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/').map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(value?: string): string {
  const parsed = parseDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
}

function formatMasaBerlaku(value?: string): string {
  const endDate = parseDate(value);
  if (!endDate) {
    return '-';
  }

  const diffDays = Math.ceil((endDate.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) {
    return 'Kadaluarsa';
  }

  if (diffDays === 0) {
    return 'Hari ini';
  }

  const months = Math.floor(diffDays / 30);
  const days = diffDays % 30;

  if (months > 0) {
    return days > 0 ? `${months} Bulan ${days} Hari` : `${months} Bulan`;
  }

  return `${diffDays} Hari`;
}

function compareDesc(left?: string, right?: string): number {
  const leftTime = parseDate(left)?.getTime() ?? 0;
  const rightTime = parseDate(right)?.getTime() ?? 0;
  return rightTime - leftTime;
}

function compareAsc(left?: string, right?: string): number {
  return -compareDesc(left, right);
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (value || '').trim())
        .filter((value) => value.length > 0)
    )
  );
}

function getStatus(tanggalBerakhir?: string): StoryAktivitasGroup['status'] {
  const endDate = parseDate(tanggalBerakhir);
  if (!endDate) {
    return 'Aktif';
  }

  // Ambang 90 hari — SAMA dengan Rekap Data (adminRekapDataService) & Monitoring
  // (adminMonitoringService), supaya hitungan Aktif/Akan Berakhir/Kadaluarsa konsisten
  // di semua halaman. Jangan diubah ke angka lain tanpa menyamakan ketiga tempat itu.
  const diffDays = Math.ceil((endDate.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) {
    return 'Kadaluarsa';
  }

  if (diffDays <= 90) {
    return 'Akan Berakhir';
  }

  return 'Aktif';
}

export function buildStoryAktivitasKey(item: Pick<PengajuanItem, 'id' | 'mitraId' | 'namaMitra'>): string {
  if (typeof item.mitraId === 'number') {
    return `mitra-${item.mitraId}`;
  }

  const normalized = normalizeKey(item.namaMitra);

  // Nama mitra kosong/tidak dikenali (mis. "-" atau string kosong) semuanya ternormalisasi
  // jadi "mitra" — kalau dipakai sebagai key, semua pengajuan tanpa mitra_id/namaMitra yang
  // valid akan tergabung jadi satu grup yang sama sekali tidak berhubungan. Jadikan grup
  // tersendiri per pengajuan supaya tidak salah gabung.
  if (!item.namaMitra?.trim() || normalized === 'mitra') {
    return `pengajuan-${item.id}`;
  }

  return `mitra-${normalized}`;
}

function toDocJenis(value?: string): 'MoA' | 'MoU' | 'IA' {
  if (value === 'MoA' || value === 'MoU' || value === 'IA') {
    return value;
  }

  return 'MoU';
}

function buildGroup(items: PengajuanItem[], key: string): StoryAktivitasGroup {
  // Pengajuan "primary" (sumber nomor dokumen, jenis, status & tanggal berakhir yang tampil di
  // kartu ringkasan) dipilih dari yang tanggal_berakhirnya PALING JAUH ke depan, bukan dari yang
  // paling baru diajukan. Kalau perpanjangan kerjasama disetujui, backend meng-update
  // tanggal_berakhir pengajuan sumbernya (lihat DokumenKerjasamaController::decideRenewalRequest)
  // — tapi kalau primary masih dipilih berdasarkan tanggal pengajuan, mitra yang punya lebih dari
  // satu pengajuan bisa saja hasil perpanjangannya "kepakai" pada pengajuan yang tidak ditampilkan
  // sebagai primary, jadi kartu di Story & Aktivitas terlihat seperti belum ter-update meski
  // datanya sudah benar di database.
  const pengajuan = [...items].sort((left, right) => {
    const byBerakhir = compareDesc(left.tanggalBerakhir, right.tanggalBerakhir);
    if (byBerakhir !== 0) {
      return byBerakhir;
    }
    return compareDesc(left.diajukanPada, right.diajukanPada);
  });
  const primary = pengajuan[0];

  const aktivitas = pengajuan
    .flatMap((pengajuanItem) =>
      getAktivitasByKerjasamaId(pengajuanItem.id).map((aktivitasItem) => ({
        ...aktivitasItem,
        sourcePengajuanId: pengajuanItem.id,
        sourcePengajuanKey: buildStoryAktivitasKey(pengajuanItem),
        sourceNomorPengajuan: pengajuanItem.nomorPengajuan,
        sourceJudulPengajuan: pengajuanItem.judulPengajuan,
        sourceJenisDokumen: pengajuanItem.jenisDokumen,
      }))
    )
    .sort((left, right) => compareAsc(left.tanggal, right.tanggal));

  return {
    key,
    mitraId: primary?.mitraId,
    namaMitra: primary?.namaMitra ?? '-',
    nomorDokumen: primary?.nomorPengajuan ?? '-',
    jenis: toDocJenis(primary?.jenisDokumen),
    jenisTerlibat: uniqueStrings(pengajuan.map((item) => toDocJenis(item.jenisDokumen))),
    // Pakai status dari kolom (kalau ada, jalur Rekap Data) supaya konsisten dengan
    // halaman lain; fallback hitung-dari-tanggal untuk jalur pengajuan (internal/eksternal).
    status: (primary as { statusKerjasama?: StoryAktivitasGroup['status'] } | undefined)?.statusKerjasama
      ?? getStatus(primary?.tanggalBerakhir),
    berakhir: formatDisplayDate(primary?.tanggalBerakhir),
    masaBerlaku: formatMasaBerlaku(primary?.tanggalBerakhir),
    tahun: Number(primary?.diajukanPada?.slice(0, 4)) || new Date().getFullYear(),
    aktivitas,
    totalAktivitas: aktivitas.length,
    totalPengajuan: pengajuan.length,
    pengajuan,
    ruangLingkup: uniqueStrings(pengajuan.flatMap((item) => item.ruangLingkup)),
    jurusanTerlibat: uniqueStrings(pengajuan.map((item) => item.namaUnitProdi)),
  };
}

export function groupStoryAktivitasByMitra(items: PengajuanItem[], hiddenStoryIds: number[] = []): StoryAktivitasGroup[] {
  const grouped = new Map<string, PengajuanItem[]>();

  for (const item of items) {
    if (hiddenStoryIds.includes(item.id)) {
      continue;
    }

    const key = buildStoryAktivitasKey(item);
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([key, value]) => buildGroup(value, key))
    .sort((left, right) => compareDesc(left.pengajuan[0]?.diajukanPada, right.pengajuan[0]?.diajukanPada));
}

// ── Sumber data: Rekap Data (dokumen_kerjasama) ─────────────────────────────
// Story & Aktivitas (admin) mengambil dari dokumen kerja sama, bukan pengajuan.
// Tiap dokumen dipetakan ke bentuk PengajuanItem supaya seluruh logika grouping
// per-mitra + halaman detail bisa dipakai ulang tanpa perubahan. `id` di sini =
// dokumen_kerjasama.id — aktivitasnya menempel ke dokumen (lihat
// adminStoryAktivitasService: refreshAktivitasDataFromApi meng-index by dokumen id).
function mapRekapDokumenToPengajuanItem(dok: RekapDokumen): PengajuanItem {
  return {
    id: dok.id ?? 0,
    nomorPengajuan: dok.noDokumen,
    judulPengajuan: dok.noDokumen,
    namaPengusul: dok.picMitra ?? '-',
    diajukanPada: dok.tanggalMulaiRaw ?? dok.tanggalMulai ?? '',
    mitraId: dok.mitraId,
    namaMitra: dok.namaMitra,
    jenisDokumen: dok.jenis,
    unitProdiId: dok.unitProdiId,
    namaUnitProdi: dok.unit,
    tanggalMulai: dok.tanggalMulaiRaw ?? dok.tanggalMulai,
    tanggalBerakhir: dok.berlakuHinggaRaw ?? dok.berlakuHingga,
    ruangLingkupIds: dok.ruangLingkupIds ?? [],
    ruangLingkup: dok.ruangLingkup ?? [],
    statusPengajuan: 'disetujui' as PengajuanStatus,
    // Status kategori (Aktif/Akan Berakhir/Kadaluarsa) diambil dari dok.status yang
    // sudah dipetakan dari kolom status_siklus di dokumenKerjasamaApiService — SAMA
    // dengan Rekap Data/Arsip/Monitoring. Field ekstra, cast di bawah membolehkannya.
    statusKerjasama: dok.status,
    // Field PengajuanItem lain tidak dipakai jalur Story — cast aman.
  } as unknown as PengajuanItem;
}

export function groupStoryAktivitasFromRekap(
  rows: RekapDokumen[],
  hiddenStoryIds: number[] = []
): StoryAktivitasGroup[] {
  return groupStoryAktivitasByMitra(
    rows.filter((row) => typeof row.id === 'number').map(mapRekapDokumenToPengajuanItem),
    hiddenStoryIds
  );
}

export function findStoryAktivitasGroupFromRekapByRouteParam(
  rows: RekapDokumen[],
  routeParam: string,
  hiddenStoryIds: number[] = []
): StoryAktivitasGroup | null {
  return findStoryAktivitasGroupByRouteParam(
    rows.filter((row) => typeof row.id === 'number').map(mapRekapDokumenToPengajuanItem),
    routeParam,
    hiddenStoryIds
  );
}

export function findStoryAktivitasGroupByRouteParam(
  items: PengajuanItem[],
  routeParam: string,
  hiddenStoryIds: number[] = []
): StoryAktivitasGroup | null {
  const groups = groupStoryAktivitasByMitra(items, hiddenStoryIds);
  const normalizedParam = routeParam.trim();
  const numericParam = Number(normalizedParam);

  return (
    groups.find((group) => group.key === normalizedParam) ||
    groups.find((group) => Number.isFinite(numericParam) && group.mitraId === numericParam) ||
    groups.find((group) => group.pengajuan.some((item) => item.id === numericParam)) ||
    groups.find((group) => normalizeKey(group.namaMitra) === normalizeKey(normalizedParam)) ||
    null
  );
}
