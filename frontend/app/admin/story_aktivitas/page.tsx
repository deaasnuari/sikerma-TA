'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  CheckCircle,
  CalendarDays,
  BarChart3,
  Filter,
  Search,
  Users,
  FileText,
  Eye,
  ChevronDown,
} from 'lucide-react';
import { getHiddenStoryIds, getAktivitasByKerjasamaId } from '@/services/adminStoryAktivitasService';
import { getPengajuanData, refreshPengajuanDataFromApi, type PengajuanItem } from '../../../services/adminPengajuanService';

interface Kerjasama {
  id: number;
  nama: string;
  nomorDokumen: string;
  jenis: 'MoA' | 'MoU' | 'IA';
  berakhir: string;
  tahun: number;
  status: 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';
  aktivitas: number;
  jurusanTerlibat: number;
  ruangLingkup: string[];
  jurusan: string[];
}

function parseDateString(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDisplayDate(value?: string): string {
  const parsed = parseDateString(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
}

function getKerjasamaStatus(tanggalBerakhir?: string): Kerjasama['status'] {
  const endDate = parseDateString(tanggalBerakhir);

  if (!endDate) {
    return 'Aktif';
  }

  const now = new Date();
  const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'Kadaluarsa';
  }

  if (diffDays <= 120) {
    return 'Akan Berakhir';
  }

  return 'Aktif';
}

function mapPengajuanToKerjasama(item: PengajuanItem): Kerjasama {
  const tahun = Number(item.diajukanPada?.slice(0, 4)) || new Date().getFullYear();
  const jenis = (['MoA', 'MoU', 'IA'].includes(item.jenisDokumen) ? item.jenisDokumen : 'MoU') as Kerjasama['jenis'];

  return {
    id: item.id,
    nama: item.namaMitra,
    nomorDokumen: `${jenis}/${String(item.id).padStart(3, '0')}/${tahun}`,
    jenis,
    berakhir: toDisplayDate(item.tanggalBerakhir),
    tahun,
    status: getKerjasamaStatus(item.tanggalBerakhir),
    aktivitas: getAktivitasByKerjasamaId(item.id).length,
    jurusanTerlibat: item.namaUnitProdi ? 1 : 0,
    ruangLingkup: [...item.ruangLingkup],
    jurusan: item.namaUnitProdi ? [item.namaUnitProdi] : [],
  };
}

const statusColor: Record<string, { dot: string; text: string }> = {
  Aktif: { dot: 'bg-green-500', text: 'text-green-700' },
  'Akan Berakhir': { dot: 'bg-yellow-400', text: 'text-yellow-700' },
  Kadaluarsa: { dot: 'bg-red-500', text: 'text-red-700' },
};

const jenisColor: Record<string, string> = {
  MoA: 'border-blue-500 text-blue-700 bg-blue-50',
  MoU: 'border-purple-500 text-purple-700 bg-purple-50',
  IA: 'border-orange-500 text-orange-700 bg-orange-50',
};

const accentColor: Record<string, string> = {
  Aktif: 'from-green-400 to-green-500',
  'Akan Berakhir': 'from-yellow-400 to-yellow-500',
  Kadaluarsa: 'from-red-400 to-red-500',
};

export default function StoryAktivitasPage() {
  const router = useRouter();
  const [filterJenis, setFilterJenis] = useState('Semua Jenis');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterTahun, setFilterTahun] = useState('Semua Tahun');
  const [search, setSearch] = useState('');
  const [hiddenStoryIds, setHiddenStoryIds] = useState<number[]>([]);
  const [sourceData, setSourceData] = useState<Kerjasama[]>([]);

  useEffect(() => {
    let isMounted = true;

    const syncData = () => {
      if (!isMounted) {
        return;
      }

      setSourceData(getPengajuanData().map(mapPengajuanToKerjasama));
    };

    const syncHiddenStoryIds = () => {
      if (!isMounted) {
        return;
      }

      setHiddenStoryIds(getHiddenStoryIds());
    };

    void refreshPengajuanDataFromApi(true).finally(syncData);
    syncHiddenStoryIds();

    window.addEventListener('pengajuan-data-updated', syncData);
    window.addEventListener('story-data-updated', syncHiddenStoryIds);

    return () => {
      isMounted = false;
      window.removeEventListener('pengajuan-data-updated', syncData);
      window.removeEventListener('story-data-updated', syncHiddenStoryIds);
    };
  }, []);

  const visibleData = sourceData.filter((item) => !hiddenStoryIds.includes(item.id));

  const tahunOptions = Array.from(
    new Set(visibleData.map((d) => d.tahun))
  ).sort((a, b) => b - a);

  // Filter dan deduplikasi berdasarkan id
  const filteredRaw = visibleData.filter((item) => {
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
  const seen = new Set();
  const filtered = [];
  for (const item of filteredRaw) {
    if (!seen.has(item.id)) {
      filtered.push(item);
      seen.add(item.id);
    }
  }

  const totalAktivitas = visibleData.reduce((s, i) => s + i.aktivitas, 0);
  const kerjasamaAktif = visibleData.filter((i) => i.status === 'Aktif').length;
  const now = new Date();
  const bulanIni = sourceData.filter((item) => {
    const year = Number(item.tahun);
    return year === now.getFullYear();
  }).length;
  const rataRata =
    visibleData.length > 0
      ? Math.round(totalAktivitas / visibleData.length)
      : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Activity size={22} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Aktivitas</p>
            <p className="text-3xl font-bold text-gray-900">{totalAktivitas}</p>
            <p className="text-xs text-gray-400 mt-0.5">Semua aktivitas tercatat</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle size={22} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Kerjasama Aktif</p>
            <p className="text-3xl font-bold text-gray-900">{kerjasamaAktif}</p>
            <p className="text-xs text-gray-400 mt-0.5">Memiliki aktivitas</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <CalendarDays size={22} className="text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Bulan Ini</p>
            <p className="text-3xl font-bold text-gray-900">{bulanIni}</p>
            <p className="text-xs text-gray-400 mt-0.5">Aktivitas di bulan ini</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
            <BarChart3 size={22} className="text-pink-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Rata-rata</p>
            <p className="text-3xl font-bold text-gray-900">{rataRata}</p>
            <p className="text-xs text-gray-400 mt-0.5">Aktivitas per kerjasama</p>
          </div>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-gray-700 font-semibold">
          <Filter size={16} />
          <span>Filter:</span>
        </div>

        <div className="relative">
          <select
            value={filterJenis}
            onChange={(e) => setFilterJenis(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-lg pl-4 pr-9 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option>Semua Jenis</option>
            <option>MoA</option>
            <option>MoU</option>
            <option>IA</option>
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>

        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-lg pl-4 pr-9 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option>Semua Status</option>
            <option>Aktif</option>
            <option>Akan Berakhir</option>
            <option>Kadaluarsa</option>
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>

        <div className="relative">
          <select
            value={filterTahun}
            onChange={(e) => setFilterTahun(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-lg pl-4 pr-9 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option>Semua Tahun</option>
            {tahunOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>

        <div className="relative ml-auto">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Cari berdasarkan nama mitra"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm w-72 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Kerjasama List */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
            Tidak ada data ditemukan
          </div>
        )}

        {filtered.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex"
          >
            <div
              className={`w-2 shrink-0 bg-gradient-to-b ${accentColor[item.status]}`}
            />

            <div className="flex-1 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-bold text-gray-900">
                      {item.nama}
                    </h3>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${jenisColor[item.jenis]}`}
                    >
                      {item.jenis}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span>{item.nomorDokumen}</span>
                    <span>• Berakhir: {item.berakhir}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className={`w-3 h-3 rounded-full ${statusColor[item.status].dot}`}
                  />
                  <span
                    className={`text-sm font-semibold ${statusColor[item.status].text}`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-6 text-sm text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Activity size={14} className="text-gray-400" />
                    {item.aktivitas} Aktivitas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users size={14} className="text-gray-400" />
                    {item.jurusanTerlibat} Jurusan Terlibat
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileText size={14} className="text-gray-400" />
                    {item.ruangLingkup.length} Ruang Lingkup
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      router.push(`/admin/story_aktivitas/${item.id}`)
                    }
                    className="flex items-center gap-1.5 bg-[#0e1d34] hover:bg-[#1a2d4a] text-white text-sm font-medium px-4 py-2 rounded-lg transition"
                  >
                    <Eye size={14} />
                    Lihat Detail Story
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {item.jurusan.map((j) => (
                  <span
                    key={j}
                    className="bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1 rounded-lg"
                  >
                    {j}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
