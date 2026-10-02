// Judul aktivitas yang dibuat otomatis backend saat perpanjangan disetujui
// (DokumenKerjasamaController::decideRenewalRequest). Dipakai untuk memberi tanda khusus di
// Story & Aktivitas internal/eksternal, yang datanya tidak membawa jenis aktivitas.
export const JUDUL_AKTIVITAS_PERPANJANGAN = 'Perpanjangan Kerja Sama';

export function isAktivitasPerpanjangan(judul: string): boolean {
  return judul === JUDUL_AKTIVITAS_PERPANJANGAN;
}
