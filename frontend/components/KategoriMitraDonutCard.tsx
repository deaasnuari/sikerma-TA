'use client';

import DonutChart from '@/components/DonutChart';

export type KategoriMitraStat = { label: string; value: number };

const PALETTE = [
  '#173B82',
  '#3B82F6',
  '#93C5FD',
  '#0EA5E9',
  '#14B8A6',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#64748B',
  '#CBD5E1',
];

/**
 * Donut "Kategori Mitra" — tiap potongan = satu pilihan di filter Kategori pada Data Kemitraan
 * (admin/master_mitra), jumlahnya sama dengan hasil filter itu. Dipakai di dashboard admin,
 * dashboard pimpinan, dan landing page supaya ketiganya konsisten.
 */
export default function KategoriMitraDonutCard({
  total,
  kategori,
}: {
  total: number;
  kategori: KategoriMitraStat[];
}) {
  const items = kategori.map((item, index) => ({ ...item, color: PALETTE[index % PALETTE.length] }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-slate-50 p-4 md:p-5">
      <h3 className="text-[12px] font-bold text-slate-800">Kategori Mitra</h3>
      <div className="mt-4 flex items-center justify-center">
        <DonutChart
          size={180}
          centerLabel={String(total)}
          segments={items.map((item) => ({ value: item.value, color: item.color }))}
        />
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-[11px]">
            <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate" title={item.label}>{item.label}</span>
            </span>
            <span className="font-semibold text-slate-800">{item.value.toLocaleString('id-ID')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
