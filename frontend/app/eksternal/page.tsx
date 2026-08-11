'use client';

import Link from 'next/link';
import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock3,
  FileBadge2,
  FolderOpen,
  Plus,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getExternalPengajuanData, syncExternalPengajuanWithAdminData, getExternalPengajuanUpdateEventName } from '@/services/externalPengajuanService';
import { useEffect, useMemo, useState } from 'react';

// Dashboard Mitra Eksternal: dibuat lebih ringkas & “indah”, tetap mudah karena
// hanya memakai 1 komponen halaman dengan data utama dari localStorage user.
type DashboardStatus = 'Menunggu' | 'Diproses' | 'Aktif' | 'Berakhir';


type DashboardItem = {
  title: string;
  badge: DashboardStatus;
  badgeClass: string;
  jenis: string;
  unit: string;
  mulai: string;
  berakhir: string;
};

const statusBadgeClass: Record<DashboardStatus, string> = {
  Menunggu: 'bg-amber-400 text-white',
  Diproses: 'bg-sky-400 text-white',
  Aktif: 'bg-emerald-500 text-white',
  Berakhir: 'bg-rose-400 text-white',
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
  return 'Menunggu';
}

function mapJenis(jenisDokumen?: string): string {
  if (!jenisDokumen) return '—';
  return jenisDokumen;
}

function buildDashboardItems(items: any[]): DashboardItem[] {
  return (items || []).slice(0, 3).map((it) => {
    const status = mapStatus(it.statusPengajuan);
    return {
      title: it.judulPengajuan || it.namaMitra || 'Kerjasama',
      badge: status,
      badgeClass: statusBadgeClass[status],
      jenis: mapJenis(it.jenisDokumen),
      unit: it.namaUnitProdi || '—',
      mulai: toIdDate(it.tanggalMulai),
      berakhir: toIdDate(it.tanggalBerakhir),
    };
  });
}


export default function EksternalPage() {
  const { user } = useAuth();

  const [raw, setRaw] = useState<any[]>([]);


  useEffect(() => {
    let mounted = true;

    const sync = () => {
      const synced = syncExternalPengajuanWithAdminData();
      if (mounted) setRaw(synced as any[]);
    };

    // initial
    try {
      sync();
    } catch {
      // ignore
    }

    // realtime update
    const eventName = getExternalPengajuanUpdateEventName();
    const handler = () => sync();
    window.addEventListener(eventName, handler);

    return () => {
      mounted = false;
      window.removeEventListener(eventName, handler);
    };
  }, []);

  const total = raw.length;
  const totalAktif = raw.filter((i) => i.statusPengajuan === 'Disetujui').length;
  const totalDiproses = raw.filter((i) => i.statusPengajuan === 'Diproses').length;
  const totalUnit = new Set(raw.map((i) => i.namaUnitProdi).filter(Boolean)).size;

  const summaryCards = useMemo(
    () => [
      {
        title: 'Total Kerjasama',
        value: String(total),
        icon: FileBadge2,
        accent: 'border-slate-200 bg-white text-slate-900',
        iconStyle: 'bg-orange-100 text-orange-600',
      },
      {
        title: 'Aktif',
        value: String(totalAktif),
        icon: CheckCircle2,
        accent: 'border-slate-200 bg-white text-slate-900',
        iconStyle: 'bg-emerald-100 text-emerald-600',
      },
      {
        title: 'Dalam Proses',
        value: String(totalDiproses),
        icon: Clock3,
        accent: 'border-slate-200 bg-white text-slate-900',
        iconStyle: 'bg-amber-100 text-amber-600',
      },
      {
        title: 'Unit Terlibat',
        value: String(totalUnit),
        icon: Building2,
        accent: 'border-slate-200 bg-white text-slate-900',
        iconStyle: 'bg-blue-100 text-blue-600',
      },
    ],
    [total, totalAktif, totalDiproses, totalUnit],
  );

  const kerjasamaItems = useMemo(() => buildDashboardItems(raw), [raw]);

  const isEmpty = total === 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[17px] font-bold text-slate-900">Dashboard Mitra Eksternal</h1>
        <p className="text-[12px] text-slate-500">Kelola kerjasama dengan Politeknik Negeri Batam</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title} className={`rounded-lg border p-3.5 shadow-sm ${item.accent}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.title}</p>
                  <p className="mt-1.5 text-[17px] font-bold text-slate-900">{item.value}</p>
                </div>
                <div className={`flex h-7 w-7 items-center justify-center rounded-md ${item.iconStyle}`}>
                  <Icon size={14} />
                </div>
              </div>
            </div>
          );
        })}
      </div>


      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-bold text-slate-900">Kerjasama Anda</h2>
            <p className="text-[12px] text-slate-500">Daftar kerjasama dengan institusi</p>
          </div>
          <Link
            href="/eksternal/daftar_kerjasama"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Lihat Semua
          </Link>
        </div>

        <div className="space-y-3">
          {kerjasamaItems.map((item) => (
            <div key={`${item.title}-${item.mulai}`} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-800">{item.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold ${item.badgeClass}`}>
                      {item.badge}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10.5px] text-slate-500">
                    <span className="rounded-full border border-slate-200 px-2 py-0.5">{item.jenis}</span>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5">{item.unit}</span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">Tanggal Mulai: {item.mulai}</p>
                  <p className="text-[10px] text-slate-500">Berlaku Hingga: {item.berakhir}</p>
                </div>

                <Link href="/eksternal/daftar_kerjasama" className="text-[10px] font-semibold text-slate-700 hover:text-slate-900">
                  Detail
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-orange-600">
            <BriefcaseBusiness size={18} />
            <p className="text-[12px] font-bold text-slate-900">Ajukan Kerjasama Baru</p>
          </div>
          <p className="mb-4 text-[12px] text-slate-500">Buat proposal kerjasama dengan institusi</p>
          <Link
            href="/eksternal/pengajuan_baru"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={15} />
            Buat Pengajuan
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-blue-600">
            <UserRound size={18} />
            <p className="text-[12px] font-bold text-slate-900">Profil Mitra</p>
          </div>
          <p className="text-[12px] text-slate-500">Lihat dan update informasi mitra</p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            {user?.name || 'Mitra Eksternal'} • {user?.email || '-'}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-[#F8FBFF] p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[#0A2A66]">
          <FolderOpen size={18} />
          <p className="font-bold">Ringkasan Akses Mitra</p>
        </div>
        <p className="mt-2 text-[12px] text-slate-600">
          Area eksternal memakai navbar dan footer yang sama seperti admin, dengan sidebar khusus mitra eksternal dan warna portal yang berbeda.
        </p>
      </div>
    </div>
  );
}
