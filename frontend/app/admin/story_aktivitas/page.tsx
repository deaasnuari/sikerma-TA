'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Users,
  FileText,
  Eye,
  ChevronDown,
} from 'lucide-react';
import { getHiddenStoryIds, refreshAktivitasDataFromApi } from '@/services/adminStoryAktivitasService';
import { fetchRekapDokumenFromApi } from '@/services/dokumenKerjasamaApiService';
import type { RekapDokumen } from '@/services/adminRekapDataService';
import { groupStoryAktivitasFromRekap, type StoryAktivitasGroup } from '@/services/storyAktivitasGrouping';

interface Kerjasama {
  key: string;
  nama: string;
  nomorDokumen: string;
  jenis: 'MoA' | 'MoU' | 'IA';
  berakhir: string;
  tahun: number;
  status: 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';
  aktivitas: number;
  totalPengajuan: number;
  jurusanTerlibat: number;
  ruangLingkup: string[];
  jurusan: string[];
}

function mapGroupToKerjasama(group: StoryAktivitasGroup): Kerjasama {
  return {
    key: group.key,
    nama: group.namaMitra,
    nomorDokumen: group.nomorDokumen,
    jenis: group.jenis,
    berakhir: group.berakhir,
    tahun: group.tahun,
    status: group.status,
    aktivitas: group.totalAktivitas,
    totalPengajuan: group.totalPengajuan,
    jurusanTerlibat: group.jurusanTerlibat.length,
    ruangLingkup: [...group.ruangLingkup],
    jurusan: [...group.jurusanTerlibat],
  };
}

const jenisColor: Record<string, string> = {
  MoA: 'border-blue-500 text-blue-700 bg-blue-50',
  MoU: 'border-purple-500 text-purple-700 bg-purple-50',
  IA: 'border-orange-500 text-orange-700 bg-orange-50',
};

export default function StoryAktivitasPage() {
  const router = useRouter();
  const [filterJenis, setFilterJenis] = useState('Semua Jenis');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterTahun, setFilterTahun] = useState('Semua Tahun');
  const [search, setSearch] = useState('');
  const [sourceData, setSourceData] = useState<Kerjasama[]>([]);
  const rekapRowsRef = useRef<RekapDokumen[]>([]);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [yearRangeStart, setYearRangeStart] = useState(currentYear - 4);
  // 24 tahun sekaligus, sama seperti kalender tahun di Rekap Data/Monitoring.
  const YEAR_PICKER_SIZE = 24;
  const yearGrid = Array.from({ length: YEAR_PICKER_SIZE }, (_, index) => yearRangeStart + index);

  useEffect(() => {
    let isMounted = true;

    // Satu kartu per mitra — kalau satu mitra punya beberapa dokumen kerja sama
    // (Rekap Data), digabung jadi satu (lihat groupStoryAktivitasFromRekap),
    // bukan dipecah per dokumen. Detail-nya baru menampilkan tiap dokumen.
    const rebuild = () => {
      if (!isMounted) return;
      const groups = groupStoryAktivitasFromRekap(rekapRowsRef.current, getHiddenStoryIds());
      setSourceData(groups.map(mapGroupToKerjasama));
    };

    void Promise.all([
      fetchRekapDokumenFromApi({ forceRefresh: true }),
      refreshAktivitasDataFromApi().catch(() => undefined),
    ])
      .then(([rows]) => {
        rekapRowsRef.current = rows;
        rebuild();
      })
      .catch(() => undefined);

    window.addEventListener('story-data-updated', rebuild);

    return () => {
      isMounted = false;
      window.removeEventListener('story-data-updated', rebuild);
    };
  }, []);

  const tahunOptions = Array.from(
    new Set(sourceData.map((d) => d.tahun))
  ).sort((a, b) => b - a);

  const filtered = sourceData.filter((item) => {
    const matchJenis =
      filterJenis === 'Semua Jenis' || item.jenis === filterJenis;
    const matchStatus =
      filterStatus === 'Semua Status' || item.status === filterStatus;
    const matchTahun =
      filterTahun === 'Semua Tahun' || item.tahun === Number(filterTahun);
    const matchSearch = item.nama
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchJenis && matchStatus && matchTahun && matchSearch;
  });

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
              <p className="text-2xl font-bold leading-none text-gray-900">{sourceData.length}</p>
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
          {([
            { value: filterJenis, set: setFilterJenis, opts: ['Semua Jenis', 'MoA', 'MoU', 'IA'] },
            { value: filterStatus, set: setFilterStatus, opts: ['Semua Status', 'Aktif', 'Akan Berakhir', 'Kadaluarsa'] },
          ] as const).map((f, i) => (
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

          <div className="relative">
            <button
              type="button"
              onClick={() => setYearPickerOpen((prev) => !prev)}
              className="inline-flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-3.5 pr-3 text-sm font-medium text-gray-700 outline-none transition hover:bg-gray-100 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/30"
            >
              <span>{filterTahun}</span>
              <CalendarDays size={14} className="text-gray-400" />
            </button>

            {yearPickerOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setYearRangeStart((prev) => prev - YEAR_PICKER_SIZE)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-[12px] font-semibold text-gray-800">
                    {yearRangeStart} - {yearRangeStart + YEAR_PICKER_SIZE - 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => setYearRangeStart((prev) => prev + YEAR_PICKER_SIZE)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {yearGrid.map((year) => {
                    const isSelected = String(year) === filterTahun;
                    const hasData = tahunOptions.includes(year);

                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setFilterTahun(String(year));
                          setYearPickerOpen(false);
                        }}
                        className={`rounded-lg border px-2 py-2 text-[11.5px] font-medium transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : hasData
                              ? 'border-gray-200 bg-white text-gray-800 hover:border-blue-400 hover:text-blue-600'
                              : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                        }`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <p className="text-[10px] text-gray-500">Pilih tahun untuk menampilkan data tahunan</p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterTahun('Semua Tahun');
                      setYearPickerOpen(false);
                    }}
                    className="text-[10px] font-semibold text-blue-600 transition-colors hover:text-blue-800"
                  >
                    Semua Tahun
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kerjasama List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
            Tidak ada data ditemukan
          </div>
        )}

        {filtered.map((item) => (
          <div
            key={item.key}
            className="group flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="w-1.5 shrink-0 bg-gradient-to-b from-blue-500 to-[#0e1d34]" />

            <div className="flex-1 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="line-clamp-2 text-[15px] font-bold text-gray-900">{item.nama}</h3>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${jenisColor[item.jenis]}`}>
                      {item.jenis}
                    </span>
                    {item.totalPengajuan > 1 && (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {item.totalPengajuan} dokumen digabung
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {item.nomorDokumen} <span className="text-gray-300">•</span> Berakhir {item.berakhir}
                  </p>
                </div>

                <button
                  onClick={() => router.push(`/admin/story_aktivitas/${item.key}`)}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl bg-[#0e1d34] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#1a2d4a]"
                >
                  <Eye size={14} />
                  Lihat Detail
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  <Activity size={13} className="text-gray-400" />
                  {item.aktivitas} Aktivitas
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  <Users size={13} className="text-gray-400" />
                  {item.jurusanTerlibat} Jurusan
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                  <FileText size={13} className="text-gray-400" />
                  {item.ruangLingkup.length} Ruang Lingkup
                </span>
              </div>

              {item.jurusan.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.jurusan.map((j) => (
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
