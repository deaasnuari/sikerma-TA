'use client';

import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileText,
  TrendingUp,
} from 'lucide-react';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchPengajuanDataFromApi,
  type PengajuanItem,
  type PengajuanStatus,
} from '@/services/adminPengajuanService';
import { getInternalPengajuanDisetujui } from '@/services/internalPengajuanService';

const APPROVED_STATUSES = new Set<PengajuanStatus>([
  'Disetujui',
  'Disetujui Internal',
  'Disetujui Mitra',
  'Final Approved',
]);

function getKerjasamaStatus(tanggalBerakhir?: string): 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa' {
  if (!tanggalBerakhir) return 'Aktif';
  const end = new Date(tanggalBerakhir);
  if (Number.isNaN(end.getTime())) return 'Aktif';
  const diffDays = Math.ceil((end.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return 'Kadaluarsa';
  if (diffDays <= 120) return 'Akan Berakhir';
  return 'Aktif';
}

export default function InternalDashboardPage() {
  const [pengajuanDisetujui, setPengajuanDisetujui] = useState<PengajuanItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (!isMounted) return;
      try {
        const allItems = await fetchPengajuanDataFromApi({ perPage: 500 });
        if (!isMounted) return;
        const approved = allItems.filter(
          (item) =>
            APPROVED_STATUSES.has(item.statusPengajuan) &&
            item.kategoriPengajuan !== 'Eksternal',
        );
        setPengajuanDisetujui(approved);
      } catch {
        const fallback = getInternalPengajuanDisetujui();
        if (isMounted) setPengajuanDisetujui(fallback);
      }
    };

    const syncHandler = () => { void loadData(); };
    void loadData();
    window.addEventListener('pengajuan-data-updated', syncHandler);

    return () => {
      isMounted = false;
      window.removeEventListener('pengajuan-data-updated', syncHandler);
    };
  }, []);

  const total = pengajuanDisetujui.length;
  const totalAktif = pengajuanDisetujui.filter(
    (i) => getKerjasamaStatus(i.tanggalBerakhir) === 'Aktif',
  ).length;
  const totalAkanBerakhir = pengajuanDisetujui.filter(
    (i) => getKerjasamaStatus(i.tanggalBerakhir) === 'Akan Berakhir',
  ).length;
  const totalKadaluarsa = pengajuanDisetujui.filter(
    (i) => getKerjasamaStatus(i.tanggalBerakhir) === 'Kadaluarsa',
  ).length;

  const summaryCards = useMemo(
    () => [
      {
        title: 'Total Dokumen Kerjasama',
        value: String(total),
        icon: FileText,
        accent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      },
      {
        title: 'Kerjasama Aktif',
        value: String(totalAktif),
        icon: CheckCircle2,
        accent: 'bg-cyan-50 text-cyan-700 border-cyan-100',
      },
      {
        title: 'Akan Berakhir',
        value: String(totalAkanBerakhir),
        icon: TrendingUp,
        accent: 'bg-amber-50 text-amber-700 border-amber-100',
      },
      {
        title: 'Kadaluarsa',
        value: String(totalKadaluarsa),
        icon: AlertCircle,
        accent: 'bg-rose-50 text-rose-700 border-rose-100',
      },
    ],
    [total, totalAktif, totalAkanBerakhir, totalKadaluarsa],
  );

  const kerjasamaItems = useMemo(
    () =>
      pengajuanDisetujui.slice(0, 3).map((it) => ({
        name: it.namaMitra,
        type: it.jenisDokumen,
        status: getKerjasamaStatus(it.tanggalBerakhir),
      })),
    [pengajuanDisetujui],
  );

  const unitStats = useMemo(() => {
    const aktifPct = total > 0 ? Math.round((totalAktif / total) * 100) : 0;
    const berakhirPct = total > 0 ? Math.round((totalAkanBerakhir / total) * 100) : 0;
    const kadaluarsaPct = total > 0 ? Math.round((totalKadaluarsa / total) * 100) : 0;
    return [
      { label: 'Aktif', value: `${aktifPct}%`, pct: aktifPct, color: '#10b981' },
      { label: 'Akan Berakhir', value: `${berakhirPct}%`, pct: berakhirPct, color: '#f59e0b' },
      { label: 'Kadaluarsa', value: `${kadaluarsaPct}%`, pct: kadaluarsaPct, color: '#ef4444' },
    ];
  }, [total, totalAktif, totalAkanBerakhir, totalKadaluarsa]);

  const jenisKerjasama = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of pengajuanDisetujui) {
      const key = row.jenisDokumen || '—';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, total: count }))
      .slice(0, 3);
  }, [pengajuanDisetujui]);

  const totalMitra = useMemo(
    () => new Set(pengajuanDisetujui.map((i) => i.namaMitra)).size,
    [pengajuanDisetujui],
  );
  const totalUnit = useMemo(
    () => new Set(pengajuanDisetujui.map((i) => i.namaUnitProdi).filter(Boolean)).size,
    [pengajuanDisetujui],
  );
  const totalRuangLingkup = useMemo(
    () => new Set(pengajuanDisetujui.flatMap((i) => i.ruangLingkup ?? [])).size,
    [pengajuanDisetujui],
  );

  const statusBadge: Record<'Aktif' | 'Akan Berakhir' | 'Kadaluarsa', string> = {
    Aktif: 'bg-emerald-100 text-emerald-700',
    'Akan Berakhir': 'bg-amber-100 text-amber-700',
    Kadaluarsa: 'bg-rose-100 text-rose-700',
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className={`rounded-lg border p-3.5 shadow-sm ${item.accent}`}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide">{item.title}</p>
                <Icon size={16} />
              </div>
              <p className="text-[17px] font-bold">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[13.5px] font-bold text-slate-900">Kerjasama Terbaru</h2>
              <p className="text-[12px] text-slate-500">Daftar kerja sama aktif di unit internal.</p>
            </div>
            <Link href="/internal/rekap_data" className="text-[12px] font-semibold text-teal-700 hover:text-teal-800">
              Lihat Semua
            </Link>
          </div>

          <div className="space-y-3">
            {kerjasamaItems.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-slate-400">Belum ada kerjasama yang disetujui.</p>
            ) : (
              kerjasamaItems.map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="text-[10px] text-slate-500">Jenis: {item.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusBadge[item.status]}`}>
                      {item.status}
                    </span>
                    <Link
                      href="/internal/rekap_data"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Detail
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-[13.5px] font-bold text-slate-900">Aksi Cepat</h2>
            <div className="mt-3 space-y-3">
              <Link
                href="/internal/data_pengajuan?mode=ajukan"
                className="flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-[12px] font-semibold text-white hover:bg-slate-800"
              >
                Ajukan Kerjasama Baru
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/internal/data_pengajuan"
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Lihat Pengajuan
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-teal-900 p-4 text-white shadow-sm">
            <p className="text-[12px] font-semibold">Ringkasan Kerjasama</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[15px] font-bold">{totalMitra}</p>
                <p className="text-[10.5px] text-slate-300">Total Mitra</p>
              </div>
              <div>
                <p className="text-[15px] font-bold">{totalUnit}</p>
                <p className="text-[10.5px] text-slate-300">Unit Terlibat</p>
              </div>
              <div>
                <p className="text-[15px] font-bold">{totalRuangLingkup}</p>
                <p className="text-[10.5px] text-slate-300">Ruang Lingkup</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-[13.5px] font-bold text-slate-900">Statistik Status Kerjasama</h2>
          <p className="mb-4 text-[12px] text-slate-500">Distribusi berdasarkan masa berlaku dokumen.</p>

          <div className="space-y-4">
            {unitStats.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-slate-700">{item.label}</span>
                  <span className="text-slate-500">{item.value}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-[13.5px] font-bold text-slate-900">Jenis Kerjasama</h2>
          <p className="mb-4 text-[12px] text-slate-500">Distribusi berdasarkan jenis dokumen.</p>

          <div className="space-y-3">
            {jenisKerjasama.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-slate-400">Belum ada data.</p>
            ) : (
              jenisKerjasama.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-slate-700">{item.label}</span>
                    <span className="text-slate-500">{item.total}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-slate-700 to-teal-500 transition-all duration-500"
                      style={{ width: `${Math.min(total > 0 ? Math.round((item.total / total) * 100) : 0, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
