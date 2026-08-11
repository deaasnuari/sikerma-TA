'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCheck,
  FileText,
  Globe,
  Landmark,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  fetchMonitoringDataFromApi,
  getMonitoringData,
  getMonitoringStats,
} from '@/services/adminMonitoringService';
import { getMasterMitra } from '@/services/masterMitraService';
import {
  refreshPengajuanDataFromApi,
  getPengajuanData,
  type PengajuanItem,
} from '@/services/adminPengajuanService';

/* ───────── helpers ───────── */

function formatDate() {
  const d = new Date();
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getItemYear(tanggal: string): number {
  if (!tanggal) return 0;
  if (tanggal.includes('/')) {
    const parts = tanggal.split('/');
    return parseInt(parts[2] ?? '0', 10);
  }
  const d = new Date(tanggal);
  return isNaN(d.getTime()) ? 0 : d.getFullYear();
}

/* ───────── charts ───────── */

interface TrendChartData {
  years: number[];
  total: number[];
  aktif: number[];
  tidakAktif: number[];
}

function TrendChart({ data }: { data: TrendChartData }) {
  const { years, total, aktif, tidakAktif } = data;
  const maxY = Math.max(...total, 10);
  const w = 600;
  const h = 220;
  const px = 50;
  const py = 20;
  const cw = w - px * 2;
  const ch = h - py * 2;

  function pts(series: number[]) {
    return series
      .map((v, i) => {
        const x = px + (i / (series.length - 1)) * cw;
        const y = h - py - (v / maxY) * ch;
        return `${x},${y}`;
      })
      .join(' ');
  }

  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) =>
    Math.round((maxY / gridCount) * i)
  );

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {gridLines.map((v) => {
        const y = h - py - (v / maxY) * ch;
        return (
          <g key={v}>
            <line x1={px} y1={y} x2={w - px} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={px - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
              {v}
            </text>
          </g>
        );
      })}
      {years.map((yr, i) => {
        const x = px + (i / (years.length - 1)) * cw;
        return (
          <text key={yr} x={x} y={h - 4} textAnchor="middle" className="fill-slate-500 text-[10px]">
            {yr}
          </text>
        );
      })}
      <polyline points={pts(total)} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={pts(aktif)} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={pts(tidakAktif)} fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinejoin="round" />
      {[total, aktif, tidakAktif].map((series, si) => {
        const colors = ['#3B82F6', '#10B981', '#EF4444'];
        return series.map((v, i) => {
          const x = px + (i / (series.length - 1)) * cw;
          const y = h - py - (v / maxY) * ch;
          return (
            <circle
              key={`${si}-${i}`}
              cx={x}
              cy={y}
              r="4"
              fill="white"
              stroke={colors[si]}
              strokeWidth="2"
            />
          );
        });
      })}
    </svg>
  );
}

function DonutChart({ dalam, luar }: { dalam: number; luar: number }) {
  const total = dalam + luar || 1;
  const dalamPct = dalam / total;
  const r = 60;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex items-center justify-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#E0F2FE" strokeWidth="20" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#0F2A44"
          strokeWidth="20"
          strokeDasharray={`${dalamPct * circ} ${circ}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
      </svg>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#0F2A44]" />
          <span className="text-slate-700">Dalam Negeri: {dalam}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#BAE6FD]" />
          <span className="text-slate-700">Luar Negeri: {luar}</span>
        </div>
      </div>
    </div>
  );
}

/* ───────── page ───────── */

export default function PimpinanPage() {
  const { user } = useAuth();

  const [kerjasamaAktif, setKerjasamaAktif] = useState(0);
  const [kerjasamaTidakAktif, setKerjasamaTidakAktif] = useState(0);
  const [dalamNegeri, setDalamNegeri] = useState(0);
  const [luarNegeri, setLuarNegeri] = useState(0);
  const [totalMitra, setTotalMitra] = useState(0);
  const [mitraAktif, setMitraAktif] = useState(0);

  const [pendingApprovals, setPendingApprovals] = useState<PengajuanItem[]>([]);
  const [akanBerakhirCount, setAkanBerakhirCount] = useState(0);
  const [kadaluarsaCount, setKadaluarsaCount] = useState(0);
  const [kerjasamaBaru, setKerjasamaBaru] = useState(0);

  const currentYear = new Date().getFullYear();
  const defaultYears = [
    currentYear - 4,
    currentYear - 3,
    currentYear - 2,
    currentYear - 1,
    currentYear,
  ];

  const [trendData, setTrendData] = useState<TrendChartData>({
    years: defaultYears,
    total: [0, 0, 0, 0, 0],
    aktif: [0, 0, 0, 0, 0],
    tidakAktif: [0, 0, 0, 0, 0],
  });

  // Fetch monitoring data → kerjasama stats + trend
  useEffect(() => {
    let mounted = true;

    fetchMonitoringDataFromApi()
      .then((items) => {
        if (!mounted) return;

        const stats = getMonitoringStats(items);
        setKerjasamaAktif(stats.totalAktif + stats.totalAkanBerakhir);
        setKerjasamaTidakAktif(stats.totalKadaluarsa);
        setAkanBerakhirCount(stats.totalAkanBerakhir);
        setKadaluarsaCount(stats.totalKadaluarsa);

        // Compute cumulative trend per year
        const years = defaultYears;
        const yearTotal = years.map((yr) =>
          items.filter((item) => getItemYear(item.tanggalMulai) <= yr && getItemYear(item.tanggalMulai) > 0).length
        );
        const yearAktif = years.map((yr) =>
          items.filter((item) => getItemYear(item.tanggalMulai) <= yr && item.status === 'Aktif').length
        );
        const yearTidakAktif = years.map((yr) =>
          items.filter((item) => getItemYear(item.tanggalMulai) <= yr && item.status === 'Kadaluarsa').length
        );

        if (yearTotal.some((v) => v > 0)) {
          setTrendData({ years, total: yearTotal, aktif: yearAktif, tidakAktif: yearTidakAktif });
        }
      })
      .catch(() => {
        // fallback: use cached local data
        const cached = getMonitoringData();
        const stats = getMonitoringStats(cached);
        setKerjasamaAktif(stats.totalAktif + stats.totalAkanBerakhir);
        setKerjasamaTidakAktif(stats.totalKadaluarsa);
        setAkanBerakhirCount(stats.totalAkanBerakhir);
        setKadaluarsaCount(stats.totalKadaluarsa);
      });

    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch mitra data → dalam/luar negeri counts
  useEffect(() => {
    let mounted = true;

    getMasterMitra()
      .then((items) => {
        if (!mounted) return;
        const domestic = items.filter(
          (m) => (m.negara || '').toLowerCase().trim() === 'indonesia'
        ).length;
        const foreign = Math.max(items.length - domestic, 0);
        setDalamNegeri(domestic);
        setLuarNegeri(foreign);
        setTotalMitra(items.length);
        setMitraAktif(items.filter((m) => m.aktif).length);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch pengajuan data → pending approvals + kerjasama baru
  useEffect(() => {
    let mounted = true;

    refreshPengajuanDataFromApi()
      .then((items) => {
        if (!mounted) return;

        // Items waiting for pimpinan's final approval
        const pending = items.filter(
          (item) =>
            item.statusPengajuan === 'Disetujui Internal' ||
            item.statusPengajuan === 'Disetujui Mitra'
        );
        setPendingApprovals(pending.slice(0, 5));

        // Approved kerjasama in current year
        const approvedStatuses = new Set([
          'Disetujui',
          'Final Approved',
          'Disetujui Internal',
          'Disetujui Mitra',
        ]);
        const baru = items.filter((item) => {
          if (!approvedStatuses.has(item.statusPengajuan)) return false;
          const yr = item.tanggalMulai
            ? new Date(item.tanggalMulai).getFullYear()
            : (item.diajukanPada
                ? new Date(item.diajukanPada).getFullYear()
                : 0);
          return yr === currentYear;
        });
        setKerjasamaBaru(baru.length);
      })
      .catch(() => {
        // fallback to local cache
        const cached = getPengajuanData();
        const pending = cached.filter(
          (item) =>
            item.statusPengajuan === 'Disetujui Internal' ||
            item.statusPengajuan === 'Disetujui Mitra'
        );
        setPendingApprovals(pending.slice(0, 5));
      });

    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statCards = [
    { label: 'Total Kerjasama Aktif', value: kerjasamaAktif, icon: FileCheck, bg: 'bg-[#0F2A44]' },
    { label: 'Kerjasama Tidak Aktif', value: kerjasamaTidakAktif, icon: FileText, bg: 'bg-[#0F2A44]' },
    { label: 'Dalam Negeri', value: dalamNegeri, icon: Globe, bg: 'bg-[#0F2A44]' },
    { label: 'Luar Negeri', value: luarNegeri, icon: Landmark, bg: 'bg-[#0F2A44]' },
    { label: 'Total Mitra', value: totalMitra, icon: Users, bg: 'bg-[#0F2A44]' },
  ];

  const kpiCards = [
    { label: 'Kerjasama Aktif', value: kerjasamaAktif, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: `Kerjasama Baru (${currentYear})`, value: kerjasamaBaru, icon: FileText, color: 'text-blue-500' },
    { label: 'Total Mitra Aktif', value: mitraAktif, icon: Users, color: 'text-amber-500' },
    { label: 'Mitra Internasional', value: luarNegeri, icon: Globe, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-5">
      {/* ── Welcome Banner ── */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0B1D34] to-[#163B6E] px-5 py-5 text-white">
        <div className="relative z-10">
          <h1 className="text-xl font-bold">Dashboard Eksekutif</h1>
          <p className="mt-1 text-sm text-blue-200">
            Selamat datang, {user?.name || 'Pimpinan'}
          </p>
          <p className="text-xs text-blue-300">Direktur — Politeknik Negeri Batam</p>
        </div>
        <div className="absolute top-4 right-6 text-right text-xs text-blue-300">
          <p className="font-semibold text-white text-sm">{formatDate()}</p>
        </div>
        <div className="pointer-events-none absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -right-4 -top-8 h-28 w-28 rounded-full bg-white/5" />
      </div>

      {/* ── Alerts ── */}
      <div className="space-y-3">
        {pendingApprovals.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-bold text-amber-800">Menunggu Persetujuan Anda</p>
              <p className="text-xs text-amber-700">
                Ada{' '}
                <span className="font-bold">
                  {pendingApprovals.length} pengajuan kerjasama
                </span>{' '}
                yang menunggu approval.{' '}
                <Link href="/pimpinan/daftar_kerjasama" className="font-semibold underline">
                  Review sekarang →
                </Link>
              </p>
            </div>
          </div>
        )}
        {(akanBerakhirCount > 0 || kadaluarsaCount > 0) && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <Clock3 size={18} className="mt-0.5 flex-shrink-0 text-blue-500" />
            <div>
              <p className="text-sm font-bold text-blue-800">Monitoring Masa Berlaku</p>
              <p className="text-xs text-blue-700">
                {akanBerakhirCount > 0 && (
                  <>
                    <span className="font-bold">{akanBerakhirCount} dokumen</span> akan berakhir dalam 3 bulan
                    {kadaluarsaCount > 0 ? ' dan ' : '. '}
                  </>
                )}
                {kadaluarsaCount > 0 && (
                  <>
                    <span className="font-bold">{kadaluarsaCount} dokumen</span> sudah kadaluarsa.{' '}
                  </>
                )}
                <Link href="/pimpinan/daftar_kerjasama" className="font-semibold underline">
                  Lihat detail →
                </Link>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className={`${c.bg} flex items-center gap-3 rounded-xl px-3.5 py-3.5 text-white`}
            >
              <div>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-[11px] leading-tight text-blue-200">{c.label}</p>
              </div>
              <div className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                <Icon size={16} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Trend Chart ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-slate-900">✦ Trend Kerjasama 5 Tahun Terakhir</h2>
        <TrendChart data={trendData} />
        <div className="mt-3 flex items-center justify-center gap-5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> Total Kerjasama
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Aktif
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Tidak Aktif
          </span>
        </div>
      </div>

      {/* ── Distribution + Approval ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* donut */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-900">
            Distribusi Kerjasama Berdasarkan Wilayah
          </h2>
          <DonutChart dalam={dalamNegeri} luar={luarNegeri} />
        </div>

        {/* approval list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-900">✦ Pengajuan Menunggu Approval</h2>
          {pendingApprovals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
              Tidak ada pengajuan yang menunggu persetujuan.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {item.judulPengajuan || item.namaMitra}
                    </p>
                    <p className="text-xs text-slate-500">{item.namaMitra}</p>
                    <p className="text-xs text-slate-400">{item.namaUnitProdi}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                        item.jenisDokumen === 'MoU'
                          ? 'bg-blue-500'
                          : item.jenisDokumen === 'MoA'
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                      }`}
                    >
                      {item.jenisDokumen}
                    </span>
                    <span className="text-[10px] text-slate-400">{item.diajukanPada}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-slate-900">Key Performance Indicators (KPI)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpiCards.map((k) => {
            const Icon = k.icon;
            return (
              <div
                key={k.label}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <Icon size={22} className={k.color} />
                <div>
                  <p className="text-xl font-bold text-slate-900">{k.value}</p>
                  <p className="text-[11px] text-slate-500">{k.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
