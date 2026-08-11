'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Eye, Filter, Search } from 'lucide-react';
import { exportToExcel } from '@/lib/exportExcel';
import {
  fetchMonitoringDataFromApi,
  getMonitoringData,
  type Kerjasama,
  type StatusKerjasama,
} from '@/services/adminMonitoringService';

const statusStyle: Record<StatusKerjasama, string> = {
  'Aktif': 'bg-emerald-100 text-emerald-700',
  'Akan Berakhir': 'bg-amber-100 text-amber-700',
  'Kadaluarsa': 'bg-rose-100 text-rose-700',
};

function getTahun(item: Kerjasama): string {
  const d = item.tanggalMulai;
  if (!d) return '-';
  if (d.includes('/')) return d.split('/')[2] ?? '-';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? '-' : String(parsed.getFullYear());
}

export default function PimpinanDaftarKerjasamaPage() {
  const [kerjasamaList, setKerjasamaList] = useState<Kerjasama[]>(() => getMonitoringData());
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterTahun, setFilterTahun] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<Kerjasama | null>(null);
  const currentYear = new Date().getFullYear();
  const [yearRangeStart, setYearRangeStart] = useState(currentYear - 4);
  const yearGrid = Array.from({ length: 12 }, (_, index) => yearRangeStart + index);

  useEffect(() => {
    let mounted = true;
    fetchMonitoringDataFromApi()
      .then((data) => {
        if (mounted) {
          setKerjasamaList(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = search.toLowerCase().trim();

    const filtered = kerjasamaList.filter((item) => {
      const matchesSearch =
        keyword === '' ||
        item.noDokumen.toLowerCase().includes(keyword) ||
        item.namaMitra.toLowerCase().includes(keyword) ||
        item.ruangLingkup.some((r) => r.toLowerCase().includes(keyword));

      const matchesStatus = filterStatus === 'Semua Status' || item.status === filterStatus;
      const matchesTahun = filterTahun === null || getTahun(item) === filterTahun;

      return matchesSearch && matchesStatus && matchesTahun;
    });
    return sortOrder === 'oldest' ? [...filtered].reverse() : filtered;
  }, [kerjasamaList, search, filterStatus, filterTahun, sortOrder]);

  const handleExport = () => {
    const headers = ['No. Dokumen', 'Nama Mitra', 'Jenis', 'Ruang Lingkup', 'Tanggal Mulai', 'Berlaku Hingga', 'Tahun', 'Status'];
    const rows = filteredItems.map((item) => [
      item.noDokumen,
      item.namaMitra,
      item.jenis,
      item.ruangLingkup.join(', '),
      item.tanggalMulai,
      item.tanggalBerakhir,
      getTahun(item),
      item.status,
    ]);
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportToExcel(headers, rows, `daftar-kerjasama-pimpinan-${dateStamp}.xlsx`, 'Daftar Kerjasama');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Daftar Kerjasama</h1>
          <p className="text-sm text-slate-500">Kelola dan monitor semua kerjasama</p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download size={15} />
          Export
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nomor, mitra, atau ruang lingkup"
              className="input-field h-10 w-full pl-9 pr-3 text-sm text-slate-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-600">
              <Filter size={14} />
              Filter
            </span>

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="input-field h-10 px-3 text-sm text-slate-700"
            >
              <option>Semua Status</option>
              <option>Aktif</option>
              <option>Akan Berakhir</option>
              <option>Kadaluarsa</option>
            </select>

            <div className="relative">
              <button
                type="button"
                onClick={() => setYearPickerOpen((prev) => !prev)}
                className="input-field inline-flex h-10 min-w-[150px] items-center justify-between gap-2 px-3 text-sm text-slate-700"
              >
                <span>{filterTahun ?? 'Pilih Tahun'}</span>
                <CalendarDays size={15} className="text-slate-500" />
              </button>

              {yearPickerOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setYearRangeStart((prev) => prev - 12)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <p className="text-sm font-semibold text-slate-800">
                      {yearRangeStart} - {yearRangeStart + 11}
                    </p>
                    <button
                      type="button"
                      onClick={() => setYearRangeStart((prev) => prev + 12)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {yearGrid.map((year) => {
                      const isSelected = String(year) === filterTahun;

                      return (
                        <button
                          key={year}
                          type="button"
                          onClick={() => {
                            setFilterTahun(String(year));
                            setYearPickerOpen(false);
                          }}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            isSelected
                              ? 'border-[#102A43] bg-[#102A43] text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-[#102A43] hover:text-[#102A43]'
                          }`}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">Pilih tahun dokumen</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterTahun(null);
                        setYearPickerOpen(false);
                      }}
                      className="text-xs font-semibold text-[#102A43] hover:text-[#1A3B5D]"
                    >
                      Semua Tahun
                    </button>
                  </div>
                </div>
              )}
            </div>

            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')}
              className="input-field h-10 px-3 text-sm text-slate-700"
            >
              <option value="newest">Terbaru ke Terlama</option>
              <option value="oldest">Terlama ke Terbaru</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">No. Dokumen</th>
                <th className="px-4 py-3">Nama Mitra</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Ruang Lingkup</th>
                <th className="px-4 py-3">Tanggal Mulai</th>
                <th className="px-4 py-3">Berlaku Hingga</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Memuat data...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada data kerjasama.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 text-slate-700 hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.noDokumen}</td>
                    <td className="px-4 py-3">{item.namaMitra}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                        {item.jenis}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.ruangLingkup.slice(0, 2).map((r) => (
                          <span key={r} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {r}
                          </span>
                        ))}
                        {item.ruangLingkup.length > 2 && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            +{item.ruangLingkup.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{item.tanggalMulai}</td>
                    <td className="px-4 py-3">{item.tanggalBerakhir}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle[item.status]}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailItem(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Eye size={14} />
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Menampilkan {filteredItems.length} dari {kerjasamaList.length} data
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
              Sebelumnya
            </button>
            <button type="button" className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
              Selanjutnya
            </button>
          </div>
        </div>
      </section>

      {detailItem && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/35 backdrop-blur-[2px]">
          <div className="flex min-h-full items-start justify-center px-4 py-8 sm:items-center">
            <div className="w-full max-w-2xl rounded-[24px] bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 pb-4 pt-6">
                <div>
                  <h2 className="text-xl font-bold text-[#102A43]">Detail Kerjasama</h2>
                  <p className="mt-1 text-sm text-slate-500">Informasi lengkap dokumen kerjasama (read-only)</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 px-6 py-5 text-sm sm:grid-cols-2">
                <DetailItem label="No. Dokumen" value={detailItem.noDokumen} />
                <DetailItem label="Nama Mitra" value={detailItem.namaMitra} />
                <DetailItem label="Jenis Dokumen" value={detailItem.jenis} />
                <DetailItem label="Status" value={detailItem.status} />
                <DetailItem label="Tanggal Mulai" value={detailItem.tanggalMulai} />
                <DetailItem label="Berlaku Hingga" value={detailItem.tanggalBerakhir} />
                {detailItem.sisaMasaBerlaku && (
                  <DetailItem label="Sisa Masa Berlaku" value={detailItem.sisaMasaBerlaku} />
                )}
                {detailItem.emailMitra && (
                  <DetailItem label="Email Mitra" value={detailItem.emailMitra} />
                )}
              </div>

              {detailItem.ruangLingkup.length > 0 && (
                <div className="px-6 pb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Ruang Lingkup</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailItem.ruangLingkup.map((r) => (
                      <span key={r} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
