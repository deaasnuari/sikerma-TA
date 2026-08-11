import { PengajuanItem, PengajuanStatus, getPengajuanData, submitPengajuanApi } from './adminPengajuanService';

// Key localStorage khusus internal, benar-benar terpisah dari admin
const STORAGE_KEY = 'pengajuanKerjasamaDataInternal';

// Ambil seluruh data pengajuan, hanya data internal (bukan admin)
export function getInternalPengajuanData(options?: { filterAdmin?: boolean }): PengajuanItem[] {
  if (typeof window === 'undefined') return [];
  const storedRaw = window.localStorage.getItem(STORAGE_KEY);
  if (!storedRaw) return [];
  try {
    const stored = JSON.parse(storedRaw) as PengajuanItem[];
    if (!Array.isArray(stored)) return [];
    // Data internal hanya dari storage internal
    return stored;
  } catch {
    return [];
  }
}

// Submit pengajuan internal
export function submitInternalPengajuan(
  data: Omit<PengajuanItem, 'id' | 'diajukanPada' | 'nomorPengajuan' | 'statusPengajuan' | 'isFromAdmin'> & {
    unitProdiId?: number | null;
    nomorPengajuan?: string;
  }
): Promise<PengajuanItem> {
  return submitPengajuanApi(data, false, 'internal');
}

// Fungsi lain (statistik, update status, dsb) dapat di-copy sesuai kebutuhan

const APPROVED_STATUSES = new Set<PengajuanStatus>([
  'Disetujui',
  'Disetujui Internal',
  'Disetujui Mitra',
  'Final Approved',
]);

/**
 * Ambil pengajuan internal yang sudah di-ACC admin.
 * Membaca dari shared storage (pengajuanKerjasamaData) karena admin approval
 * hanya memperbarui storage tersebut, bukan internal-only storage.
 */
export function getInternalPengajuanDisetujui(): PengajuanItem[] {
  if (typeof window === 'undefined') return [];

  // Shared storage diperbarui saat admin ACC, sehingga status terbaru ada di sini.
  const sharedData = getPengajuanData();
  const fromShared = sharedData.filter(
    (item) => APPROVED_STATUSES.has(item.statusPengajuan) && item.kategoriPengajuan !== 'Eksternal',
  );

  // Merge dengan internal-only storage (yang mungkin belum sinkron ke API).
  const internalData = getInternalPengajuanData();
  const fromInternal = internalData.filter((item) => APPROVED_STATUSES.has(item.statusPengajuan));

  // Gabungkan, deduplikasi berdasarkan id — preferensi ke shared (status lebih update).
  const seen = new Set<number | string>();
  const merged: PengajuanItem[] = [];
  for (const item of [...fromShared, ...fromInternal]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

