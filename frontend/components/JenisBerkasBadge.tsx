import type { JenisBerkas } from '@/services/adminRekapDataService';

const GAYA: Record<JenisBerkas, { label: string; className: string }> = {
  final: { label: 'Dokumen Final', className: 'bg-emerald-100 text-emerald-700' },
  pengajuan: { label: 'Dokumen Pengajuan', className: 'bg-blue-100 text-blue-700' },
  perpanjangan: { label: 'Perpanjangan', className: 'bg-amber-100 text-amber-800' },
  pendukung: { label: 'Dokumen Pendukung', className: 'bg-slate-200 text-slate-700' },
};

// Warna jenis dokumen (MoU/MoA/IA) — sama dengan lencana jenis di Rekap Data.
const GAYA_JENIS_DOKUMEN: Record<string, string> = {
  MoU: 'bg-violet-600 text-white',
  MoA: 'bg-sky-600 text-white',
  IA: 'bg-orange-500 text-white',
};

export default function JenisBerkasBadge({ jenis, jenisDokumen }: { jenis?: JenisBerkas; jenisDokumen?: string }) {
  const gaya = GAYA[jenis ?? 'final'];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${gaya.className}`}>
        {gaya.label}
      </span>
      {/* Bila dokumennya memuat MoU + MoA, tiap berkas diberi tahu untuk jenis yang mana. */}
      {jenisDokumen && (
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9.5px] font-bold ${GAYA_JENIS_DOKUMEN[jenisDokumen] ?? 'bg-slate-500 text-white'}`}>
          {jenisDokumen}
        </span>
      )}
    </span>
  );
}
