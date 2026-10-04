'use client';

import KategoriMitraDonutCard from '@/components/KategoriMitraDonutCard';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Clock3,
  FileCheck,
  FileText,
  Globe,
  Landmark,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import DonutChart from '@/components/DonutChart';
import {
  fetchMonitoringDataFromApi,
  getMonitoringData,
  getMonitoringStats,
} from '@/services/adminMonitoringService';
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

/* ───────── charts ───────── */

interface JenisChartData {
  MoU: number;
  MoA: number;
  IA: number;
}

/* ───────── page ───────── */

export default function PimpinanPage() {
  const { user } = useAuth();

  const [kerjasamaAktif, setKerjasamaAktif] = useState(0);
  const [kerjasamaTidakAktif, setKerjasamaTidakAktif] = useState(0);

  // Dalam Negeri/Luar Negeri/Total Mitra — sumber data sama persis dengan landing page & dashboard
  // Admin (endpoint /dokumen-kerjasama/stats/mitra, klasifikasi prioritas tingkat_perusahaan lalu
  // fallback negara di backend), BUKAN dihitung sendiri dari field negara di frontend —
  // supaya angkanya tidak berbeda dari yang ditampilkan ke Admin.
  const [mitraStats, setMitraStats] = useState({
    total: 0,
    kategori: [] as { label: string; value: number }[],
    dalam_negeri: 0,
    luar_negeri: 0,
    dudi_nasional: 0,
    dudi_internasional: 0,
    instansi_nasional: 0,
    instansi_internasional: 0,
  });
  const { dalamNegeri, luarNegeri, totalMitra } = {
    dalamNegeri: mitraStats.dalam_negeri,
    luarNegeri: mitraStats.luar_negeri,
    totalMitra: mitraStats.total,
  };

  useEffect(() => {
    let mounted = true;

    apiRequest<{ success: boolean; data: typeof mitraStats }>('/dokumen-kerjasama/stats/mitra')
      .then((res) => {
        if (!mounted || !res.data) return;
        setMitraStats(res.data);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pendingApprovals, setPendingApprovals] = useState<PengajuanItem[]>([]);
  const [akanBerakhirCount, setAkanBerakhirCount] = useState(0);
  const [kadaluarsaCount, setKadaluarsaCount] = useState(0);

  const currentYear = new Date().getFullYear();

  const [jenisDistribution, setJenisDistribution] = useState<JenisChartData>({ MoU: 0, MoA: 0, IA: 0 });

  // Fetch monitoring data → kerjasama stats + distribusi jenis dokumen
  useEffect(() => {
    let mounted = true;

    // forceRefresh: true — dashboard Admin selalu ambil data segar (bukan cache 60 detik),
    // jadi Pimpinan disamakan supaya tidak menampilkan angka basi setelah Admin edit/hapus data.
    fetchMonitoringDataFromApi({ forceRefresh: true })
      .then((items) => {
        if (!mounted) return;

        const stats = getMonitoringStats(items);
        setKerjasamaAktif(stats.totalAktif + stats.totalAkanBerakhir);
        setKerjasamaTidakAktif(stats.totalKadaluarsa);
        setAkanBerakhirCount(stats.totalAkanBerakhir);
        setKadaluarsaCount(stats.totalKadaluarsa);

        setJenisDistribution({
          MoU: items.filter((item) => item.jenis === 'MoU').length,
          MoA: items.filter((item) => item.jenis === 'MoA').length,
          IA: items.filter((item) => item.jenis === 'IA').length,
        });
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

      {/* ── Statistik Kerjasama (sama persis dengan landing page) ── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
        <div className="mb-6">
          <p className="text-[11.5px] font-semibold text-[#173B82]">Statistik Kerjasama</p>
          <h2 className="text-[20px] font-bold text-slate-900">Gambaran umum kolaborasi Polibatam</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Card 1: Kategori Mitra (sama dengan filter Kategori di Data Kemitraan) */}
          <KategoriMitraDonutCard total={totalMitra} kategori={mitraStats.kategori} />

          {/* Card 2: Komposisi Dokumen */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-slate-50 p-4 md:p-5">
            <h3 className="text-[12px] font-bold text-slate-800">Komposisi Dokumen</h3>
            <div className="mt-4 flex items-center justify-center">
              <DonutChart
                size={180}
                centerLabel={String(jenisDistribution.MoU + jenisDistribution.MoA + jenisDistribution.IA)}
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
                const total = jenisDistribution.MoU + jenisDistribution.MoA + jenisDistribution.IA;
                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
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
        </div>
      </div>

    </div>
  );
}
