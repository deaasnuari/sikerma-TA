'use client';

import { Clock3, FileText, RefreshCw } from 'lucide-react';
import type { RenewalRequestItem } from '@/services/adminRenewalRequestService';
import { formatTanggalPerpanjangan } from '@/hooks/usePerpanjanganDisetujui';

export type StatusKerjasama = 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';

export const statusKerjasamaBadge: Record<StatusKerjasama, string> = {
  Aktif: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Akan Berakhir': 'border-amber-200 bg-amber-50 text-amber-700',
  Kadaluarsa: 'border-red-200 bg-red-50 text-red-700',
};

/**
 * Kartu perpanjangan yang ditampilkan di bawah kartu kerja sama awal di Story & Aktivitas
 * (bentuknya sama di admin/internal/eksternal). Status masa berlaku (live) hanya tampil di
 * perpanjangan terakhir karena itulah periode yang sedang berjalan.
 */
export default function RiwayatPerpanjangan({
  items,
  statusTerkini,
  tautanDokumen = false,
}: {
  items: RenewalRequestItem[];
  statusTerkini: StatusKerjasama;
  /** Jadikan nama dokumen perpanjangan sebagai tautan (hanya admin yang bisa membukanya). */
  tautanDokumen?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-4 space-y-2 border-l-2 border-blue-300 pl-3">
      {items.map((item, index) => (
        <div key={item.id} className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[9.5px] font-semibold text-white">
              <RefreshCw size={10} />
              Perpanjangan ke-{index + 1}
            </span>
            {index === items.length - 1 && (
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusKerjasamaBadge[statusTerkini]}`}>
                {statusTerkini}
              </span>
            )}
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-slate-600">
            <Clock3 size={12} className="text-slate-400" />
            Berlaku: {formatTanggalPerpanjangan(item.tanggalMulaiBaru)} - {formatTanggalPerpanjangan(item.tanggalBerakhirBaru)}
          </p>
          {item.decidedAt && (
            <p className="mt-1 text-[10px] text-slate-500">
              Disetujui {item.decidedAt}
              {item.decidedBy ? ` oleh ${item.decidedBy}` : ''}
            </p>
          )}
          {item.catatan && item.catatan !== '-' && (
            <p className="mt-1 text-[10.5px] text-slate-600">{item.catatan}</p>
          )}
          {item.buktiPerpanjanganUrl &&
            (tautanDokumen ? (
              <a
                href={item.buktiPerpanjanganUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 underline hover:text-blue-900"
              >
                <FileText size={11} />
                {item.buktiPerpanjanganNama || 'Dokumen perpanjangan'}
              </a>
            ) : (
              <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-blue-700">
                <FileText size={11} />
                {item.buktiPerpanjanganNama || 'Dokumen perpanjangan'}
              </p>
            ))}
        </div>
      ))}
    </div>
  );
}
