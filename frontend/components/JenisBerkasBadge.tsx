import type { JenisBerkas } from '@/services/adminRekapDataService';

const GAYA: Record<JenisBerkas, { label: string; className: string }> = {
  final: { label: 'Dokumen Final', className: 'bg-emerald-100 text-emerald-700' },
  pengajuan: { label: 'Dokumen Pengajuan', className: 'bg-blue-100 text-blue-700' },
  perpanjangan: { label: 'Perpanjangan', className: 'bg-amber-100 text-amber-800' },
  pendukung: { label: 'Dokumen Pendukung', className: 'bg-slate-200 text-slate-700' },
};

export default function JenisBerkasBadge({ jenis }: { jenis?: JenisBerkas }) {
  const gaya = GAYA[jenis ?? 'final'];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${gaya.className}`}>
      {gaya.label}
    </span>
  );
}
