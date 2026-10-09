'use client';

import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
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
import { parseTanggal } from '@/lib/parseTanggal';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const APPROVED_STATUSES = new Set<PengajuanStatus>([
  'Disetujui',
  'Disetujui Internal',
  'Disetujui Mitra',
  'Final Approved',
]);

type StatusKerjasama = 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';

function getKerjasamaStatus(tanggalBerakhir?: string): StatusKerjasama {
  if (!tanggalBerakhir) return 'Aktif';
  const end = new Date(tanggalBerakhir);
  if (Number.isNaN(end.getTime())) return 'Aktif';
  const diffDays = Math.ceil((end.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return 'Kadaluarsa';
  if (diffDays <= 120) return 'Akan Berakhir';
  return 'Aktif';
}

function formatTanggal(value?: string): string {
  const date = parseTanggal(value);
  if (!date) return '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function sisaHari(value?: string): number | null {
  const date = parseTanggal(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

const statusBadge: Record<StatusKerjasama, string> = {
  Aktif: 'bg-emerald-100 text-emerald-700',
  'Akan Berakhir': 'bg-amber-100 text-amber-700',
  Kadaluarsa: 'bg-rose-100 text-rose-700',
};

const jenisBadge: Record<string, string> = {
  mou: 'bg-purple-50 text-purple-700',
  moa: 'bg-blue-50 text-blue-700',
  ia: 'bg-orange-50 text-orange-700',
};

const jenisWarna: Record<string, string> = {
  mou: '#8b5cf6',
  moa: '#2563eb',
  ia: '#f59e0b',
};

function jenisKey(value?: string): string {
  return (value || '').trim().toLowerCase();
}

export default function InternalDashboardPage() {
  const [pengajuanDisetujui, setPengajuanDisetujui] = useState<PengajuanItem[]>([]);
  const [loading, setLoading] = useState(true);

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
      } finally {
        if (isMounted) setLoading(false);
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

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const summaryCards = useMemo(
    () => [
      {
        title: 'Total Dokumen Kerjasama',
        value: total,
        note: 'Semua dokumen yang disetujui',
        icon: FileText,
        iconBox: 'bg-slate-100 text-slate-700',
        bar: 'bg-slate-400',
      },
      {
        title: 'Kerjasama Aktif',
        value: totalAktif,
        note: `${pct(totalAktif)}% dari total`,
        icon: CheckCircle2,
        iconBox: 'bg-emerald-100 text-emerald-700',
        bar: 'bg-emerald-500',
      },
      {
        title: 'Akan Berakhir',
        value: totalAkanBerakhir,
        note: 'Berakhir dalam 4 bulan',
        icon: TrendingUp,
        iconBox: 'bg-amber-100 text-amber-700',
        bar: 'bg-amber-500',
      },
      {
        title: 'Kadaluarsa',
        value: totalKadaluarsa,
        note: `${pct(totalKadaluarsa)}% dari total`,
        icon: AlertCircle,
        iconBox: 'bg-rose-100 text-rose-700',
        bar: 'bg-rose-500',
      },
    ],
    [total, totalAktif, totalAkanBerakhir, totalKadaluarsa],
  );

  const kerjasamaItems = useMemo(
    () =>
      pengajuanDisetujui.slice(0, 5).map((it) => ({
        id: it.id,
        name: it.namaMitra,
        type: it.jenisDokumen,
        status: getKerjasamaStatus(it.tanggalBerakhir),
        berakhir: formatTanggal(it.tanggalBerakhir),
        sisa: sisaHari(it.tanggalBerakhir),
      })),
    [pengajuanDisetujui],
  );

  const statusSegments = useMemo(
    () => [
      { label: 'Aktif', count: totalAktif, color: '#10b981' },
      { label: 'Akan Berakhir', count: totalAkanBerakhir, color: '#f59e0b' },
      { label: 'Kadaluarsa', count: totalKadaluarsa, color: '#ef4444' },
    ],
    [totalAktif, totalAkanBerakhir, totalKadaluarsa],
  );

  const jenisKerjasama = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of pengajuanDisetujui) {
      const key = row.jenisDokumen || '—';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, total: count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
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

  const hariIni = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-slate-900">Dashboard Internal</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <CalendarDays size={12} />
            {hariIni}
          </p>
        </div>
      </div>

      {/* Perlu perhatian */}
      {!loading && (totalAkanBerakhir > 0 || totalKadaluarsa > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-[12px] font-bold text-amber-900">Perlu perhatian</p>
              <p className="text-[11px] text-amber-800">
                {totalAkanBerakhir > 0 && <>{totalAkanBerakhir} kerja sama akan segera berakhir. </>}
                {totalKadaluarsa > 0 && <>{totalKadaluarsa} kerja sama sudah melewati masa berlaku. </>}
                Hubungi mitra untuk tindak lanjut atau ajukan perpanjangan.
              </p>
            </div>
          </div>
          <Link
            href="/internal/rekap_data"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-900 underline hover:text-amber-950"
          >
            Lihat di Rekap Data
            <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Kartu ringkasan */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className={`absolute inset-y-0 left-0 w-1 ${item.bar}`} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.title}</p>
                  {loading ? (
                    <div className="mt-2 h-7 w-14 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <p className="mt-1 text-[24px] font-bold leading-tight text-slate-900">{item.value}</p>
                  )}
                  <p className="mt-0.5 text-[10.5px] text-slate-400">{item.note}</p>
                </div>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.iconBox}`}>
                  <Icon size={17} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Kerjasama terbaru */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[13.5px] font-bold text-slate-900">Kerjasama Terbaru</h2>
              <p className="text-[12px] text-slate-500">Daftar kerja sama yang sudah disetujui di unit internal.</p>
            </div>
            <Link href="/internal/rekap_data" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#173B82] hover:underline">
              Lihat Semua
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="space-y-2.5">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[60px] animate-pulse rounded-xl bg-slate-100" />
              ))
            ) : kerjasamaItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-8 text-center">
                <FileText size={22} className="text-slate-300" />
                <p className="text-[12px] text-slate-400">Belum ada kerjasama yang disetujui.</p>
              </div>
            ) : (
              kerjasamaItems.map((item) => (
                <Link
                  key={item.id}
                  href="/internal/rekap_data"
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-[#173B82]/40 hover:bg-slate-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#173B82]/10 text-[14px] font-bold text-[#173B82]">
                    {(item.name || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-slate-800">{item.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-500">
                      <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${jenisBadge[jenisKey(item.type)] || 'bg-slate-100 text-slate-700'}`}>
                        {item.type}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={11} />
                        Berakhir {item.berakhir}
                        {item.sisa !== null && item.sisa >= 0 && item.sisa <= 120 && <> ({item.sisa} hari lagi)</>}
                      </span>
                    </p>
                  </div>
                  <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold sm:inline-flex ${statusBadge[item.status]}`}>
                    {item.status}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:text-[#173B82]" />
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Ringkasan */}
          <div className="rounded-2xl bg-gradient-to-br from-[#091222] to-[#173B82] p-4 text-white shadow-sm">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-slate-300" />
              <p className="text-[12px] font-semibold">Ringkasan Kerjasama</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { value: totalMitra, label: 'Total Mitra' },
                { value: totalUnit, label: 'Unit Terlibat' },
                { value: totalRuangLingkup, label: 'Ruang Lingkup' },
              ].map((tile) => (
                <div key={tile.label} className="rounded-xl bg-white/10 px-2 py-3">
                  <p className="text-[18px] font-bold leading-none">{loading ? '–' : tile.value}</p>
                  <p className="mt-1.5 text-[10.5px] text-slate-300">{tile.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Aksi cepat */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-[13.5px] font-bold text-slate-900">Aksi Cepat</h2>
            <div className="mt-3 space-y-2.5">
              <Link
                href="/internal/data_pengajuan?mode=ajukan"
                className="flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-[12px] font-semibold text-white transition hover:bg-slate-800"
              >
                Ajukan Kerjasama Baru
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/internal/data_pengajuan"
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Lihat Pengajuan
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/internal/rekap_data"
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Rekap Data Kerjasama
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Statistik Kerjasama: satu kartu, dua grafik berdampingan (seperti dashboard admin) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
        <div className="mb-3">
          <h2 className="text-[13px] font-bold text-slate-900">Statistik Kerjasama</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Status masa berlaku dan jenis dokumen dari kerja sama yang disetujui.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* Status masa berlaku: donat */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-slate-50 p-3">
            <h3 className="text-[12px] font-bold text-slate-800">Status Kerjasama</h3>
            <p className="mt-0.5 text-[10px] text-slate-400">Berdasarkan masa berlaku dokumen</p>

            {total === 0 ? (
              <p className="py-8 text-center text-[12px] text-slate-400">{loading ? 'Memuat data…' : 'Belum ada data.'}</p>
            ) : (
              <>
                <div className="relative mx-auto mt-1 h-[130px] w-full max-w-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusSegments}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="62%"
                        outerRadius="92%"
                        paddingAngle={statusSegments.filter((seg) => seg.count > 0).length > 1 ? 3 : 0}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {statusSegments.map((seg) => (
                          <Cell key={seg.label} fill={seg.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} dokumen (${pct(Number(value))}%)`, String(name)]}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[18px] font-bold leading-none text-slate-900">{total}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">dokumen</p>
                  </div>
                </div>

                <div className="mt-2 space-y-1.5">
                  {statusSegments.map((seg) => (
                    <div key={seg.label}>
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                          {seg.label}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {seg.count} <span className="font-normal text-slate-400">({pct(seg.count)}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct(seg.count)}%`, backgroundColor: seg.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Jenis dokumen: lingkaran */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-slate-50 p-3">
            <h3 className="text-[12px] font-bold text-slate-800">Jenis Kerjasama</h3>
            <p className="mt-0.5 text-[10px] text-slate-400">Berdasarkan jenis dokumen</p>

            {jenisKerjasama.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-slate-400">{loading ? 'Memuat data…' : 'Belum ada data.'}</p>
            ) : (
              <>
                <div className="mx-auto mt-1 h-[130px] w-full max-w-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={jenisKerjasama}
                        dataKey="total"
                        nameKey="label"
                        outerRadius="92%"
                        paddingAngle={jenisKerjasama.length > 1 ? 2 : 0}
                        stroke="#ffffff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {jenisKerjasama.map((item) => (
                          <Cell key={item.label} fill={jenisWarna[jenisKey(item.label)] || '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} dokumen (${pct(Number(value))}%)`, String(name)]}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 space-y-1.5">
                  {jenisKerjasama.map((item) => {
                    const warna = jenisWarna[jenisKey(item.label)] || '#64748b';
                    return (
                      <div key={item.label}>
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: warna }} />
                            {item.label}
                          </span>
                          <span className="font-semibold text-slate-800">
                            {item.total} <span className="font-normal text-slate-400">({pct(item.total)}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct(item.total)}%`, backgroundColor: warna }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
