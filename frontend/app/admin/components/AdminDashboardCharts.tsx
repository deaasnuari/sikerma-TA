'use client';

import DonutChart from '@/components/DonutChart';
import KategoriMitraDonutCard, { type KategoriMitraStat } from '@/components/KategoriMitraDonutCard';

type PublicStats = {
  total: number;
  kategori: KategoriMitraStat[];
  dalam_negeri: number;
  luar_negeri: number;
  dudi_nasional: number;
  dudi_internasional: number;
  instansi_nasional: number;
  instansi_internasional: number;
};

type JenisDistribution = { MoU: number; MoA: number; IA: number };

type Props = {
  stats: PublicStats;
  jenisDistribution: JenisDistribution;
  topRuangLingkup: [string, number][];
};

export default function AdminDashboardCharts({ stats, jenisDistribution, topRuangLingkup }: Props) {
  const handleExportRegionalDistribution = () => {
    const header = ['Wilayah', 'Jumlah Kerjasama'];
    const rows = [
      ['Dalam Negeri', String(stats.dalam_negeri)],
      ['Luar Negeri', String(stats.luar_negeri)],
    ];

    const content = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join('\t'))
      .join('\n');

    const blob = new Blob(['﻿', content], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `distribusi-kerjasama-wilayah-${dateStamp}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const jenisTotal = jenisDistribution.MoU + jenisDistribution.MoA + jenisDistribution.IA;

  return (
    <div className="card p-3 md:p-5">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm md:text-base font-bold text-gray-900">Statistik Kerjasama</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">Sama dengan yang ditampilkan di landing page.</p>
        </div>
        <button
          type="button"
          onClick={handleExportRegionalDistribution}
          className="inline-flex items-center justify-center rounded-lg bg-[#173B82] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#091222]"
        >
          Export Dalam/Luar Negeri
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Card 1: Kategori Mitra (sama dengan filter Kategori di Data Kemitraan) */}
        <KategoriMitraDonutCard total={stats.total} kategori={stats.kategori} />

        {/* Card 2: Komposisi Dokumen */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-slate-50 p-4 md:p-5">
          <h3 className="text-[12px] font-bold text-slate-800">Komposisi Dokumen</h3>
          <div className="mt-4 flex items-center justify-center">
            <DonutChart
              size={180}
              centerLabel={String(jenisTotal)}
              segments={[
                { value: jenisDistribution.MoU, color: '#1D4ED8' },
                { value: jenisDistribution.MoA, color: '#7C3AED' },
                { value: jenisDistribution.IA, color: '#A78BFA' },
              ]}
            />
          </div>
          <div className="mt-4 space-y-2">
            {[
              { label: 'MoU', value: jenisDistribution.MoU, color: '#1D4ED8' },
              { label: 'MoA', value: jenisDistribution.MoA, color: '#7C3AED' },
              { label: 'IA', value: jenisDistribution.IA, color: '#A78BFA' },
            ].map((item) => {
              const pct = jenisTotal > 0 ? Math.round((item.value / jenisTotal) * 100) : 0;
              return (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.label}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {item.value} <span className="font-normal text-slate-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 3: Top 5 Ruang Lingkup */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-cyan-50 to-slate-50 p-4 md:p-5">
          <h3 className="text-[12px] font-bold text-slate-800">Top 5 Ruang Lingkup</h3>
          <p className="mt-0.5 text-[10px] text-slate-400">Bidang paling sering diajukan</p>
          <div className="mt-5 space-y-3">
            {topRuangLingkup.length === 0 ? (
              <p className="text-center text-[11px] text-slate-400">Memuat data...</p>
            ) : (
              topRuangLingkup.map(([nama, jumlah], idx) => {
                const max = topRuangLingkup[0][1];
                const pct = max > 0 ? Math.round((jumlah / max) * 100) : 0;
                const colors = ['#173B82', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA'];
                return (
                  <div key={nama}>
                    <div className="mb-1 flex items-start justify-between gap-2 text-[10.5px]">
                      <span className="flex items-center gap-1.5 leading-tight text-slate-700">
                        <span
                          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{ backgroundColor: colors[idx] }}
                        >
                          {idx + 1}
                        </span>
                        {nama}
                      </span>
                      <span className="flex-shrink-0 font-semibold text-slate-800">{jumlah}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: colors[idx] }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
