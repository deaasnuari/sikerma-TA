'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronDown,
  Eye,
  FileText,
  Filter,
  Search,
  Users,
} from 'lucide-react';

import DetailStoryModal from './DetailStoryModal';
import { fetchRekapDokumenFromApi } from '@/services/dokumenKerjasamaApiService';
import type { RekapDokumen } from '@/services/adminRekapDataService';
import { refreshAktivitasDataFromApi } from '@/services/adminStoryAktivitasService';
import { groupStoryAktivitasFromRekap, type StoryAktivitasGroup } from '@/services/storyAktivitasGrouping';

// ── Types ──────────────────────────────────────────────

type Jenis = 'MoA' | 'MoU' | 'IA';
type StatusKerjasama = 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';
type StatusAktivitas = 'direncanakan' | 'berlangsung' | 'selesai';

export interface Aktivitas {
  id: string;
  judul: string;
  tanggal: string;
  peserta: number;
  deskripsi: string;
  picPolibatam: string;
  picMitra: string;
  status: StatusAktivitas;
}

export interface DokumenRingkas {
  id: number;
  /** Tanggal mentah (ISO) untuk kartu dokumen di detail Story — format tampilannya dibuat di sana. */
  diajukanPada?: string;
  tanggalMulaiRaw?: string;
  tanggalBerakhirRaw?: string;
  noDokumen: string;
  jenis: string;
  status: StatusKerjasama;
  tanggalMulai: string;
  tanggalBerakhir: string;
  unit: string;
  ruangLingkup: string[];
}

export interface KerjasamaStory {
  id: string;
  key: string;
  namaMitra: string;
  noDokumen: string;
  jenis: Jenis;
  status: StatusKerjasama;
  tanggalMulai: string;
  tanggalBerakhir: string;
  kategoriMitra: string;
  alamat: string;
  email: string;
  telepon: string;
  sisaWaktu: string;
  ruangLingkup: string[];
  jurusanTerlibat: string[];
  aktivitas: Aktivitas[];
  totalPengajuan: number;
  dokumenKerjasamaIds: number[];
  rincianStatus: { Aktif: number; 'Akan Berakhir': number; Kadaluarsa: number };
  dokumen: DokumenRingkas[];
}

// ── Helpers ────────────────────────────────────────────

function toDisplayDate(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB');
}

function statusDari(tanggalBerakhir?: string): StatusKerjasama {
  if (!tanggalBerakhir) return 'Aktif';
  const end = new Date(tanggalBerakhir);
  if (Number.isNaN(end.getTime())) return 'Aktif';
  const diffDays = Math.ceil((end.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return 'Kadaluarsa';
  if (diffDays <= 90) return 'Akan Berakhir';
  return 'Aktif';
}

function mapStoryGroupToStory(group: StoryAktivitasGroup): KerjasamaStory {
  const dokumen: DokumenRingkas[] = group.pengajuan.map((p) => {
    const st = (p as { statusKerjasama?: StatusKerjasama }).statusKerjasama ?? statusDari(p.tanggalBerakhir);
    return {
      id: p.id,
      noDokumen: p.nomorPengajuan,
      jenis: p.jenisDokumen,
      status: st,
      diajukanPada: p.diajukanPada,
      tanggalMulaiRaw: p.tanggalMulai,
      tanggalBerakhirRaw: p.tanggalBerakhir,
      tanggalMulai: toDisplayDate(p.tanggalMulai),
      tanggalBerakhir: toDisplayDate(p.tanggalBerakhir),
      unit: p.namaUnitProdi || '-',
      ruangLingkup: [...p.ruangLingkup],
    };
  });

  const rincianStatus = {
    Aktif: dokumen.filter((d) => d.status === 'Aktif').length,
    'Akan Berakhir': dokumen.filter((d) => d.status === 'Akan Berakhir').length,
    Kadaluarsa: dokumen.filter((d) => d.status === 'Kadaluarsa').length,
  };

  return {
    id: String(group.mitraId ?? group.pengajuan[0]?.id ?? group.key),
    key: group.key,
    namaMitra: group.namaMitra,
    noDokumen: group.nomorDokumen,
    jenis: group.jenis,
    status: group.status,
    tanggalMulai: group.pengajuan[0]?.tanggalMulai ? toDisplayDate(group.pengajuan[0].tanggalMulai) : '-',
    tanggalBerakhir: group.berakhir,
    kategoriMitra: group.pengajuan[0]?.kategoriPengajuan || 'Eksternal',
    alamat: group.pengajuan[0]?.mitraAlamat || '-',
    email: group.pengajuan[0]?.mitraEmail || group.pengajuan[0]?.emailPengusul || '-',
    telepon: group.pengajuan[0]?.mitraTelepon || group.pengajuan[0]?.whatsappPengusul || '-',
    sisaWaktu: group.masaBerlaku,
    ruangLingkup: [...group.ruangLingkup],
    jurusanTerlibat: [...group.jurusanTerlibat],
    aktivitas: group.aktivitas.map((a) => ({
      id: String(a.id),
      judul: a.judul,
      tanggal: a.tanggal,
      peserta: a.peserta,
      deskripsi: a.deskripsi,
      picPolibatam: a.picPolibatam,
      picMitra: a.picMitra,
      status: a.status as StatusAktivitas,
    })),
    totalPengajuan: group.totalPengajuan,
    dokumenKerjasamaIds: group.pengajuan.map((p) => p.id),
    rincianStatus,
    dokumen,
  };
}

// ── Badges ─────────────────────────────────────────────

const jenisBadgeMap: Record<Jenis, string> = {
  MoA: 'border-cyan-500 bg-cyan-50 text-cyan-700',
  MoU: 'border-violet-500 bg-violet-50 text-violet-700',
  IA: 'border-orange-500 bg-orange-50 text-orange-700',
};

const jenisOptions = ['Semua Jenis', 'MoA', 'MoU', 'IA'];
const statusOptions = ['Semua Status', 'Aktif', 'Akan Berakhir', 'Kadaluarsa'];

// ── Component ──────────────────────────────────────────

export default function EksternalStoryAktivitasPage() {
  const [kerjasamaData, setKerjasamaData] = useState<KerjasamaStory[]>([]);
  const [search, setSearch] = useState('');
  const [filterJenis, setFilterJenis] = useState('Semua Jenis');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterTahun, setFilterTahun] = useState('Semua Tahun');
  const [selectedStory, setSelectedStory] = useState<KerjasamaStory | null>(null);
  const rekapRef = useRef<RekapDokumen[]>([]);

  useEffect(() => {
    let isMounted = true;

    const rebuild = () => {
      if (!isMounted) return;
      setKerjasamaData(groupStoryAktivitasFromRekap(rekapRef.current).map(mapStoryGroupToStory));
    };

    void Promise.all([
      fetchRekapDokumenFromApi({ forceRefresh: true }),
      refreshAktivitasDataFromApi().catch(() => undefined),
    ])
      .then(([rows]) => {
        rekapRef.current = rows;
        rebuild();
      })
      .catch(() => undefined);

    window.addEventListener('story-data-updated', rebuild);
    return () => {
      isMounted = false;
      window.removeEventListener('story-data-updated', rebuild);
    };
  }, []);

  const tahunOptions = useMemo(
    () =>
      Array.from(
        new Set(kerjasamaData.map((k) => k.tanggalBerakhir.slice(-4)).filter((y) => /^\d{4}$/.test(y))),
      ).sort((a, b) => Number(b) - Number(a)),
    [kerjasamaData],
  );

  const filtered = useMemo(() => {
    return kerjasamaData.filter((k) => {
      const keyword = search.toLowerCase().trim();
      const matchSearch =
        keyword === '' ||
        k.namaMitra.toLowerCase().includes(keyword) ||
        k.noDokumen.toLowerCase().includes(keyword);
      const matchJenis = filterJenis === 'Semua Jenis' || k.jenis === filterJenis;
      const matchStatus = filterStatus === 'Semua Status' || k.status === filterStatus;
      const matchTahun = filterTahun === 'Semua Tahun' || k.tanggalBerakhir.endsWith(filterTahun);
      return matchSearch && matchJenis && matchStatus && matchTahun;
    });
  }, [kerjasamaData, search, filterJenis, filterStatus, filterTahun]);

  if (selectedStory) {
    return <DetailStoryModal story={selectedStory} onBack={() => setSelectedStory(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Story dan Aktivitas Kerja Sama</h1>
        <p className="page-subtitle mt-0.5">Rekam jejak aktivitas kerja sama, dikelompokkan per mitra</p>
      </div>

      {/* Toolbar: total mitra + filter + search */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none text-gray-900">{kerjasamaData.length}</p>
              <p className="mt-1 text-xs font-medium text-gray-500">Total mitra dengan kerja sama</p>
            </div>
          </div>

          <div className="relative w-full lg:max-w-xs">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama mitra…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <Filter size={14} /> Filter
          </span>
          {[
            { value: filterJenis, set: setFilterJenis, opts: jenisOptions },
            { value: filterStatus, set: setFilterStatus, opts: statusOptions },
            { value: filterTahun, set: setFilterTahun, opts: ['Semua Tahun', ...tahunOptions] },
          ].map((f, i) => (
            <div key={i} className="relative">
              <select
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2 pl-3.5 pr-9 text-sm font-medium text-gray-700 outline-none transition hover:bg-gray-100 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/30"
              >
                {f.opts.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          ))}
        </div>
      </div>

      {/* Kerjasama List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
            {kerjasamaData.length === 0
              ? 'Belum ada kerja sama yang disetujui. Story & aktivitas muncul setelah pengajuan di-ACC admin.'
              : 'Tidak ada data ditemukan'}
          </div>
        )}

        {filtered.map((k) => (
          <div
            key={k.key}
            className="group flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="w-1.5 shrink-0 bg-gradient-to-b from-blue-500 to-[#0e1d34]" />

            <div className="flex-1 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="line-clamp-2 text-[15px] font-bold text-gray-900">{k.namaMitra}</h3>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${jenisBadgeMap[k.jenis]}`}>
                      {k.jenis}
                    </span>
                    {k.totalPengajuan > 1 && (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {k.totalPengajuan} dokumen digabung
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {k.noDokumen} <span className="text-gray-300">•</span> Berakhir {k.tanggalBerakhir}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStory(k)}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl bg-[#0e1d34] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#1a2d4a]"
                >
                  <Eye size={14} />
                  Lihat Detail
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  <Activity size={13} className="text-gray-400" />
                  {k.aktivitas.length} Aktivitas
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  <Users size={13} className="text-gray-400" />
                  {k.jurusanTerlibat.length} Jurusan
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  <FileText size={13} className="text-gray-400" />
                  {k.ruangLingkup.length} Ruang Lingkup
                </span>
              </div>

              {k.jurusanTerlibat.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {k.jurusanTerlibat.map((j) => (
                    <span key={j} className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      {j}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
