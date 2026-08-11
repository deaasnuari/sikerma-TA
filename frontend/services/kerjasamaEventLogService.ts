// Service untuk mencatat semua event/aktivitas kerjasama
// Setiap perubahan pada mitra atau perpanjangan dicatat di sini

export type EventType = 
  | 'kerjasama-dibuat'
  | 'kerjasama-diperbarui'
  | 'perpanjangan-diajukan'
  | 'perpanjangan-disetujui'
  | 'perpanjangan-ditolak'
  | 'aktivitas-ditambah'
  | 'aktivitas-diubah'
  | 'aktivitas-dihapus'
  | 'dokumen-diupload'
  | 'notifikasi-dikirim'
  | 'status-berubah';

export interface EventLog {
  id: string;
  kerjasamaId: number;
  namaMitra: string;
  noDokumen: string;
  eventType: EventType;
  title: string;
  description: string;
  details?: Record<string, any>;
  createdAt: string;
  createdBy: string;
  timestamp: number;
}

const STORAGE_KEY = 'sikerma_event_logs';
const MAX_LOGS = 10000; // Limit untuk performance

function canUseStorage(): boolean {
  return typeof window !== 'undefined';
}

function getAllEventLogs(): EventLog[] {
  if (!canUseStorage()) return [];
  
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  
  try {
    const parsed = JSON.parse(raw) as EventLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEventLogs(logs: EventLog[]): void {
  if (!canUseStorage()) return;
  
  // Keep only latest MAX_LOGS entries
  const trimmed = logs.slice(0, MAX_LOGS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function emitEventLogUpdate(): void {
  if (canUseStorage()) {
    window.dispatchEvent(new Event('event-logs-updated'));
  }
}

/**
 * Tambahkan event log baru
 */
export function addEventLog(payload: {
  kerjasamaId: number;
  namaMitra: string;
  noDokumen: string;
  eventType: EventType;
  title: string;
  description: string;
  details?: Record<string, any>;
  createdBy?: string;
}): EventLog {
  const log: EventLog = {
    id: `event-${payload.kerjasamaId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    kerjasamaId: payload.kerjasamaId,
    namaMitra: payload.namaMitra,
    noDokumen: payload.noDokumen,
    eventType: payload.eventType,
    title: payload.title,
    description: payload.description,
    details: payload.details,
    createdAt: new Date().toLocaleString('id-ID'),
    createdBy: payload.createdBy || 'Admin SIKERMA',
    timestamp: Date.now(),
  };

  const all = [log, ...getAllEventLogs()];
  saveEventLogs(all);
  emitEventLogUpdate();

  return log;
}

/**
 * Ambil semua event logs untuk satu kerjasama
 */
export function getEventLogsByKerjasamaId(kerjasamaId: number): EventLog[] {
  return getAllEventLogs().filter((log) => log.kerjasamaId === kerjasamaId);
}

/**
 * Ambil semua event logs (tanpa filter)
 */
export function getAllEventLogs2(): EventLog[] {
  return getAllEventLogs();
}

/**
 * Ambil event logs dengan filter type
 */
export function getEventLogsByType(eventType: EventType): EventLog[] {
  return getAllEventLogs().filter((log) => log.eventType === eventType);
}

/**
 * Ambil event logs dengan range tanggal
 */
export function getEventLogsByDateRange(startDate: Date, endDate: Date): EventLog[] {
  const start = startDate.getTime();
  const end = endDate.getTime();
  return getAllEventLogs().filter((log) => log.timestamp >= start && log.timestamp <= end);
}

/**
 * Hapus semua event logs (untuk reset)
 */
export function clearAllEventLogs(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  emitEventLogUpdate();
}

/**
 * Export event logs ke CSV
 */
export function exportEventLogsToCSV(kerjasamaId?: number): string {
  const logs = kerjasamaId ? getEventLogsByKerjasamaId(kerjasamaId) : getAllEventLogs();
  
  const headers = [
    'ID Event',
    'Kerjasama ID',
    'Nama Mitra',
    'No Dokumen',
    'Tipe Event',
    'Judul',
    'Deskripsi',
    'Dibuat Oleh',
    'Tanggal & Waktu',
  ];

  const rows = logs.map((log) => [
    log.id,
    log.kerjasamaId,
    log.namaMitra,
    log.noDokumen,
    log.eventType,
    log.title,
    log.description,
    log.createdBy,
    log.createdAt,
  ]);

  const csvContent = [
    headers.map((h) => `"${h}"`).join(','),
    ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Fungsi helper untuk log perpanjangan kerjasama
 */
export function logPerpanjanganDiajukan(
  kerjasamaId: number,
  namaMitra: string,
  noDokumen: string,
  tanggalMulaiBaru: string,
  tanggalBerakhirBaru: string,
  catatan: string
): EventLog {
  return addEventLog({
    kerjasamaId,
    namaMitra,
    noDokumen,
    eventType: 'perpanjangan-diajukan',
    title: '📝 Permintaan Perpanjangan Kerjasama',
    description: `Perpanjangan kerjasama telah diajukan untuk periode ${tanggalMulaiBaru} s/d ${tanggalBerakhirBaru}`,
    details: {
      tanggalMulaiBaru,
      tanggalBerakhirBaru,
      catatan,
    },
    createdBy: 'Admin SIKERMA',
  });
}

/**
 * Fungsi helper untuk log aktivitas ditambah
 */
export function logAktivitasDitambah(
  kerjasamaId: number,
  namaMitra: string,
  noDokumen: string,
  judulAktivitas: string,
  jenisAktivitas: string
): EventLog {
  return addEventLog({
    kerjasamaId,
    namaMitra,
    noDokumen,
    eventType: 'aktivitas-ditambah',
    title: '✏️ Aktivitas Ditambah',
    description: `Aktivitas baru "${judulAktivitas}" (${jenisAktivitas}) telah ditambahkan ke kerjasama`,
    details: {
      judulAktivitas,
      jenisAktivitas,
    },
    createdBy: 'Admin SIKERMA',
  });
}

/**
 * Fungsi helper untuk log dokumen diupload
 */
export function logDokumenDiupload(
  kerjasamaId: number,
  namaMitra: string,
  noDokumen: string,
  namaFile: string,
  ukuran: string
): EventLog {
  return addEventLog({
    kerjasamaId,
    namaMitra,
    noDokumen,
    eventType: 'dokumen-diupload',
    title: '📄 Dokumen Diupload',
    description: `Dokumen "${namaFile}" (${ukuran}) telah diupload untuk kerjasama`,
    details: {
      namaFile,
      ukuran,
    },
    createdBy: 'Admin SIKERMA',
  });
}

/**
 * Fungsi helper untuk log notifikasi dikirim
 */
export function logNotifikasiDikirim(
  kerjasamaId: number,
  namaMitra: string,
  noDokumen: string,
  jenis: string,
  emailMitra: string
): EventLog {
  return addEventLog({
    kerjasamaId,
    namaMitra,
    noDokumen,
    eventType: 'notifikasi-dikirim',
    title: '📧 Notifikasi Email Dikirim',
    description: `Notifikasi email (${jenis}) telah dikirim ke ${emailMitra}`,
    details: {
      jenis,
      emailMitra,
    },
    createdBy: 'Admin SIKERMA',
  });
}

/**
 * Fungsi helper untuk log kerjasama dibuat
 */
export function logKerjasamaDibuat(
  kerjasamaId: number,
  namaMitra: string,
  noDokumen: string,
  jenisDokumen: string,
  tanggalMulai: string,
  tanggalBerakhir: string
): EventLog {
  return addEventLog({
    kerjasamaId,
    namaMitra,
    noDokumen,
    eventType: 'kerjasama-dibuat',
    title: '✅ Kerjasama Dibuat',
    description: `Kerjasama ${jenisDokumen} dengan ${namaMitra} telah dibuat (${tanggalMulai} s/d ${tanggalBerakhir})`,
    details: {
      jenisDokumen,
      tanggalMulai,
      tanggalBerakhir,
    },
    createdBy: 'Admin SIKERMA',
  });
}
