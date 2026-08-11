import { type PengajuanItem } from './adminPengajuanService';

const INTERNAL_REKAP_KEY = 'internalRekapData';

function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

function emitRekapUpdate() {
  if (canUseStorage()) {
    window.dispatchEvent(new Event('internal-rekap-data-updated'));
  }
}

function getStoredRekap(): PengajuanItem[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(INTERNAL_REKAP_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as PengajuanItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRekapData(item: PengajuanItem): void {
  if (!canUseStorage()) {
    return;
  }

  const current = getStoredRekap();
  const next = [item, ...current.filter((existing) => existing.id !== item.id)];
  window.localStorage.setItem(INTERNAL_REKAP_KEY, JSON.stringify(next));
  emitRekapUpdate();
}

export function getInternalRekapData(): PengajuanItem[] {
  return getStoredRekap();
}
