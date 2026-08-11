import { getStoredUser } from '@/services/authService';
import { getPengajuanData, submitPengajuanApi, type PengajuanItem } from '@/services/adminPengajuanService';

const STORAGE_PREFIX = 'pengajuanKerjasamaDataEksternal';
const UPDATE_EVENT = 'external-pengajuan-data-updated';

type SubmitExternalPayload = Omit<
  PengajuanItem,
  'id' | 'diajukanPada' | 'statusPengajuan' | 'isFromAdmin' | 'nomorPengajuan'
>;

function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

function normalizeScope(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function getExternalStorageKey(): string {
  const user = getStoredUser();
  const fallbackScope = 'guest';

  if (!user || user.role !== 'external') {
    return `${STORAGE_PREFIX}:${fallbackScope}`;
  }

  const scope = user.id || user.email || user.username || fallbackScope;
  return `${STORAGE_PREFIX}:${normalizeScope(String(scope))}`;
}

function emitUpdate(): void {
  if (!canUseStorage()) {
    return;
  }

  window.dispatchEvent(new Event(UPDATE_EVENT));
}

function saveExternalPengajuanData(items: PengajuanItem[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(getExternalStorageKey(), JSON.stringify(items));
  emitUpdate();
}

export function getExternalPengajuanData(): PengajuanItem[] {
  if (!canUseStorage()) {
    return [];
  }

  const storedRaw = window.localStorage.getItem(getExternalStorageKey());
  if (!storedRaw) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedRaw) as PengajuanItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

export function getExternalPengajuanUpdateEventName(): string {
  return UPDATE_EVENT;
}

export function syncExternalPengajuanWithAdminData(): PengajuanItem[] {
  const externalItems = getExternalPengajuanData();
  if (externalItems.length === 0) {
    return externalItems;
  }

  const liveExternalItems = getPengajuanData().filter((item) => item.kategoriPengajuan === 'Eksternal');
  const adminExternalById = new Map(liveExternalItems.map((item) => [item.id, item]));

  // Kalau data admin gagal dimuat (mis. sedang offline), jangan buang cache lokal —
  // hanya buang entri basi/orphan saat kita yakin datanya benar-benar segar dari server.
  const canPruneStale = liveExternalItems.length > 0;

  let hasChanges = false;
  const synced: PengajuanItem[] = [];

  for (const item of externalItems) {
    const fromAdmin = adminExternalById.get(item.id);

    if (!fromAdmin) {
      if (canPruneStale) {
        // Pengajuan ini sudah tidak ketemu lagi di server (id berubah/record lama sudah
        // tidak ada) — buang dari cache lokal supaya tidak dipakai untuk aksi seperti
        // Laporan Pelaksanaan yang pasti gagal dengan "The selected pengajuan id is invalid".
        hasChanges = true;
        continue;
      }

      synced.push(item);
      continue;
    }

    const nextItem: PengajuanItem = {
      ...item,
      statusPengajuan: fromAdmin.statusPengajuan,
      reviewComment: fromAdmin.reviewComment,
      reviewedAt: fromAdmin.reviewedAt,
      reviewedBy: fromAdmin.reviewedBy,
      tanggalMulai: fromAdmin.tanggalMulai ?? item.tanggalMulai,
      tanggalBerakhir: fromAdmin.tanggalBerakhir ?? item.tanggalBerakhir,
      tahapanStage: fromAdmin.tahapanStage ?? item.tahapanStage,
      tahapanGroup: fromAdmin.tahapanGroup ?? item.tahapanGroup,
      finalFileName: fromAdmin.finalFileName ?? item.finalFileName,
      finalFilePath: fromAdmin.finalFilePath ?? item.finalFilePath,
      fileAttachments: fromAdmin.fileAttachments?.length ? fromAdmin.fileAttachments : item.fileAttachments,
      namaUnitProdi: fromAdmin.namaUnitProdi && fromAdmin.namaUnitProdi !== '-' ? fromAdmin.namaUnitProdi : item.namaUnitProdi,
      namaMitra: fromAdmin.namaMitra ?? item.namaMitra,
      mitraKategori: fromAdmin.mitraKategori ?? item.mitraKategori,
      mitraTingkatPerusahaan: fromAdmin.mitraTingkatPerusahaan ?? item.mitraTingkatPerusahaan,
      mitraTelepon: fromAdmin.mitraTelepon ?? item.mitraTelepon,
    };

    const changed =
      nextItem.statusPengajuan !== item.statusPengajuan ||
      nextItem.reviewComment !== item.reviewComment ||
      nextItem.reviewedAt !== item.reviewedAt ||
      nextItem.reviewedBy !== item.reviewedBy ||
      nextItem.tanggalMulai !== item.tanggalMulai ||
      nextItem.tanggalBerakhir !== item.tanggalBerakhir ||
      nextItem.tahapanStage !== item.tahapanStage ||
      nextItem.tahapanGroup !== item.tahapanGroup ||
      nextItem.finalFileName !== item.finalFileName ||
      nextItem.finalFilePath !== item.finalFilePath ||
      nextItem.namaUnitProdi !== item.namaUnitProdi ||
      nextItem.namaMitra !== item.namaMitra ||
      nextItem.mitraKategori !== item.mitraKategori ||
      nextItem.mitraTingkatPerusahaan !== item.mitraTingkatPerusahaan ||
      nextItem.mitraTelepon !== item.mitraTelepon;

    if (changed) {
      hasChanges = true;
    }

    synced.push(nextItem);
  }

  if (hasChanges) {
    saveExternalPengajuanData(synced);
  }

  return synced;
}

export async function submitExternalPengajuan(data: SubmitExternalPayload): Promise<PengajuanItem> {
  const submitted = await submitPengajuanApi(data, false, 'eksternal');

  const current = getExternalPengajuanData();
  const next = [submitted, ...current.filter((item) => item.id !== submitted.id)];
  saveExternalPengajuanData(next);
  return submitted;
}
