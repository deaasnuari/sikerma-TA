'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileBadge2,
  Plus,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getExternalPengajuanData, syncExternalPengajuanWithAdminData, getExternalPengajuanUpdateEventName } from '@/services/externalPengajuanService';
import { daftarJenisDokumen, fetchPengajuanDataFromApi } from '@/services/adminPengajuanService';
import { useEffect, useMemo, useState } from 'react';

// Dashboard Mitra Eksternal: ringkasan pengajuan/kerja sama milik akun yang sedang login.
type DashboardStatus = 'Menunggu' | 'Diproses' | 'Revisi' | 'Aktif' | 'Berakhir';

type DashboardItem = {
  id: number | string;
  title: string;
  mitra: string;
  status: DashboardStatus;
  jenis: string;
  /** Semua jenis bila satu pengajuan memuat MoU + MoA sekaligus. */
  jenisList: string[];
  unit: string;
  mulai: string;
  berakhir: string;
};

const statusBadgeClass: Record<DashboardStatus, string> = {
  Menunggu: 'bg-amber-100 text-amber-700',
  Diproses: 'bg-sky-100 text-sky-700',
  Revisi: 'bg-orange-100 text-orange-700',
  Aktif: 'bg-emerald-100 text-emerald-700',
  Berakhir: 'bg-rose-100 text-rose-700',
};

const jenisBadge: Record<string, string> = {
  mou: 'bg-purple-50 text-purple-700',
  moa: 'bg-blue-50 text-blue-700',
  ia: 'bg-orange-50 text-orange-700',
};

function toIdDate(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mapStatus(statusPengajuan: string): DashboardStatus {
  if (statusPengajuan === 'Disetujui') return 'Aktif';
  if (statusPengajuan === 'Ditolak') return 'Berakhir';
  if (statusPengajuan === 'Diproses') return 'Diproses';
  if (statusPengajuan === 'Revisi') return 'Revisi';
  return 'Menunggu';
}

function buildDashboardItems(items: any[]): DashboardItem[] {
  return (items || []).slice(0, 5).map((it) => ({
    id: it.id ?? `${it.judulPengajuan}-${it.tanggalMulai}`,
    title: it.judulPengajuan || it.namaMitra || 'Kerjasama',
    mitra: it.namaMitra || '',
    status: mapStatus(it.statusPengajuan),
    jenis: it.jenisDokumen || '—',
    jenisList: it.jenisDokumen ? daftarJenisDokumen(it) : ['—'],
    unit: it.namaUnitProdi || '—',
    mulai: toIdDate(it.tanggalMulai),
    berakhir: toIdDate(it.tanggalBerakhir),
  }));
}

export default function EksternalPage() {
  const { user } = useAuth();

  const [raw, setRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Sumber data disamakan dengan halaman Daftar Kerjasama: fetch langsung dari API lalu filter
    // pengajuan Eksternal (cache lokal bisa basi atau milik akun lain di browser yang sama).
    const sync = async () => {
      if (!mounted) return;

      try {
        const allItems = await fetchPengajuanDataFromApi({ perPage: 500 });
        if (!mounted) return;
        setRaw(allItems.filter((item) => item.kategoriPengajuan === 'Eksternal'));
      } catch {
        // Offline/API gagal -> fallback ke cache lokal supaya halaman tidak kosong total.
        if (mounted) {
          syncExternalPengajuanWithAdminData();
          setRaw(getExternalPengajuanData());
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void sync();

    const eventName = getExternalPengajuanUpdateEventName();
    const handler = () => void sync();
    window.addEventListener(eventName, handler);
    window.addEventListener('pengajuan-data-updated', handler);

    return () => {
      mounted = false;
      window.removeEventListener(eventName, handler);
      window.removeEventListener('pengajuan-data-updated', handler);
    };
  }, []);

  const total = raw.length;
  const totalAktif = raw.filter((i) => i.statusPengajuan === 'Disetujui').length;
  const totalDiproses = raw.filter((i) => i.statusPengajuan === 'Diproses' || i.statusPengajuan === 'Menunggu').length;
  const totalRevisi = raw.filter((i) => i.statusPengajuan === 'Revisi').length;
  const totalDitolak = raw.filter((i) => i.statusPengajuan === 'Ditolak').length;

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const summaryCards = useMemo(
    () => [
      { title: 'Total Kerjasama', value: total, note: 'Semua pengajuan Anda', icon: FileBadge2, iconBox: 'bg-orange-100 text-orange-600', bar: 'bg-orange-400' },
      { title: 'Aktif', value: totalAktif, note: `${pct(totalAktif)}% dari total`, icon: CheckCircle2, iconBox: 'bg-emerald-100 text-emerald-600', bar: 'bg-emerald-500' },
      { title: 'Dalam Proses', value: totalDiproses, note: 'Menunggu atau diproses admin', icon: Clock3, iconBox: 'bg-amber-100 text-amber-600', bar: 'bg-amber-500' },
      { title: 'Perlu Review/Revisi', value: totalRevisi, note: 'Perbarui data/dokumen', icon: Building2, iconBox: 'bg-orange-100 text-orange-700', bar: 'bg-orange-500' },
    ],
    [total, totalAktif, totalDiproses, totalRevisi],
  );

  const kerjasamaItems = useMemo(() => buildDashboardItems(raw), [raw]);

  const hariIni = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const isEmpty = !loading && total === 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[17px] font-bold text-slate-900">Dashboard Mitra Eksternal</h1>
        <p className="mt-0.5 text-[12px] text-slate-500">
          Selamat datang, <span className="font-semibold text-slate-700">{user?.name || 'Mitra'}</span>. Kelola kerjasama dengan Politeknik Negeri Batam.
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
          <CalendarDays size={12} />
          {hariIni}
        </p>
      </div>

      {/* Perlu tindakan */}
      {!loading && (totalRevisi > 0 || totalDitolak > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-orange-600" />
            <div>
              <p className="text-[12px] font-bold text-orange-900">Ada pengajuan yang perlu perhatian Anda</p>
              <p className="text-[11px] text-orange-800">
                {totalRevisi > 0 && <>{totalRevisi} pengajuan diminta revisi: cukup perbarui data/dokumen pada pengajuan yang sama. </>}
                {totalDitolak > 0 && <>{totalDitolak} pengajuan ditolak: buat pengajuan baru bila ingin mengajukan kembali. </>}
              </p>
            </div>
          </div>
          <Link
            href="/eksternal/daftar_kerjasama"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-orange-900 underline hover:text-orange-950"
          >
            Lihat pengajuan
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

      {/* Ajukan kerjasama baru: tepat di bawah kartu ringkasan */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-orange-600">
            <BriefcaseBusiness size={18} />
            <p className="text-[13px] font-bold text-slate-900">Ajukan Kerjasama Baru</p>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">Buat proposal kerjasama dengan institusi.</p>
        </div>
        <Link
          href="/eksternal/pengajuan_baru"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-slate-800"
        >
          <Plus size={15} />
          Buat Pengajuan
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        {/* Kerjasama Anda */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[13.5px] font-bold text-slate-900">Kerjasama Anda</h2>
              <p className="text-[12px] text-slate-500">Pengajuan dan kerja sama terbaru dengan institusi.</p>
            </div>
            <Link href="/eksternal/daftar_kerjasama" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#173B82] hover:underline">
              Lihat Semua
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="space-y-2.5">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[64px] animate-pulse rounded-xl bg-slate-100" />)
            ) : isEmpty ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 py-8 text-center">
                <FileBadge2 size={24} className="text-slate-300" />
                <div>
                  <p className="text-[12.5px] font-semibold text-slate-600">Belum ada pengajuan kerjasama</p>
                  <p className="text-[11px] text-slate-400">Mulai dengan membuat pengajuan baru.</p>
                </div>
                <Link
                  href="/eksternal/pengajuan_baru"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#173B82] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#0f2c61]"
                >
                  <Plus size={14} />
                  Buat Pengajuan
                </Link>
              </div>
            ) : (
              kerjasamaItems.map((item) => (
                <Link
                  key={item.id}
                  href="/eksternal/daftar_kerjasama"
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-[#173B82]/40 hover:bg-slate-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#173B82]/10 text-[14px] font-bold text-[#173B82]">
                    {(item.mitra || item.title || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-slate-800">{item.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-500">
                      {item.jenisList.map((jenis) => (
                        <span key={jenis} className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${jenisBadge[jenis.toLowerCase()] || 'bg-slate-100 text-slate-700'}`}>
                          {jenis}
                        </span>
                      ))}
                      <span className="truncate">{item.unit}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={11} />
                        {item.mulai} s/d {item.berakhir}
                      </span>
                    </p>
                  </div>
                  <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold sm:inline-flex ${statusBadgeClass[item.status]}`}>
                    {item.status === 'Berakhir' ? 'Ditolak' : item.status === 'Revisi' ? 'Review/Revisi' : item.status}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:text-[#173B82]" />
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Profil */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-blue-600">
              <UserRound size={18} />
              <p className="text-[12px] font-bold text-slate-900">Profil Mitra</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#173B82] text-[13px] font-bold text-white">
                {(user?.name || 'M').trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-slate-800">{user?.name || 'Mitra Eksternal'}</p>
                <p className="truncate text-[10.5px] text-slate-500">{user?.email || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
