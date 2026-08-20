'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  MessageSquareText,
  Paperclip,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import LaporanPelaksanaanModal, { type LaporanPelaksanaanData } from '@/components/LaporanPelaksanaanModal';
import { exportToExcel } from '@/lib/exportExcel';
import type { PengajuanItem } from '../../../services/adminPengajuanService';
import { deletePengajuanItemApi, fetchPengajuanDataFromApi, refreshPengajuanDataFromApi } from '@/services/adminPengajuanService';
import TahapanStepper from '@/components/TahapanStepper';
import type { StageGroup } from '@/services/tahapanPengajuanService';
import {
  getExternalPengajuanData,
  getExternalPengajuanUpdateEventName,
  syncExternalPengajuanWithAdminData,
} from '@/services/externalPengajuanService';

interface KerjasamaItem {
  id: number;
  noDokumen: string;
  judulPengajuan: string;
  namaPengusul: string;
  diajukanPada: string;
  namaMitra: string;
  jenisMitra: string;
  tingkatPerusahaan: string;
  jenis: 'MoU' | 'MoA' | 'IA';
  unit: string;
  tanggalMulai: string;
  berlakuHingga: string;
  tahun: string;
  emailPengusul: string;
  whatsappPengusul: string;
  ruangLingkup: string[];
  fileAttachments: { name: string; url: string; isAcc?: boolean }[];
  finalFileName?: string | null;
  finalFilePath?: string | null;
  status: 'Menunggu' | 'Diproses' | 'Aktif' | 'Berakhir';
  reviewState: 'Belum Direview' | 'Sudah Direview';
  reviewComment?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  tahapanStage?: string | null;
  tahapanGroup?: string | null;
}

function toDisplayDate(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mapPengajuanToItem(item: PengajuanItem): KerjasamaItem {
  const jenis = (['MoA', 'MoU', 'IA'].includes(item.jenisDokumen) ? item.jenisDokumen : 'MoU') as KerjasamaItem['jenis'];
  const tahun = (item.tanggalMulai || item.diajukanPada || new Date().toISOString()).slice(0, 4);
  const statusMap: Record<string, KerjasamaItem['status']> = {
    Menunggu: 'Menunggu',
    Diproses: 'Diproses',
    Disetujui: 'Aktif',
    Ditolak: 'Berakhir',
  };
  return {
    id: item.id,
    noDokumen: `${jenis}/${String(item.id).padStart(3, '0')}/${tahun}`,
    judulPengajuan: item.judulPengajuan || '-',
    namaPengusul: item.namaPengusul || '-',
    diajukanPada: toDisplayDate(item.diajukanPada),
    namaMitra: item.namaMitra,
    jenisMitra: item.mitraKategori || '-',
    tingkatPerusahaan: item.mitraTingkatPerusahaan || '-',
    jenis,
    unit: item.namaUnitProdi,
    tanggalMulai: toDisplayDate(item.tanggalMulai),
    berlakuHingga: toDisplayDate(item.tanggalBerakhir),
    tahun,
    emailPengusul: item.emailPengusul || '-',
    whatsappPengusul: item.whatsappPengusul || '-',
    ruangLingkup: item.ruangLingkup?.length ? item.ruangLingkup : [],
    fileAttachments:
      item.fileAttachments?.length
        ? item.fileAttachments.map((file) => ({ name: file.name, url: file.url || '', isAcc: file.isAcc }))
        : (item.fileName || '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => ({ name, url: '', isAcc: false })),
    finalFileName: item.finalFileName ?? null,
    finalFilePath: item.finalFilePath ?? null,
    status: statusMap[item.statusPengajuan] ?? 'Menunggu',
    reviewState: item.reviewedAt || item.reviewComment ? 'Sudah Direview' : 'Belum Direview',
    reviewComment: item.reviewComment,
    reviewedAt: item.reviewedAt,
    reviewedBy: item.reviewedBy,
    tahapanStage: item.tahapanStage ?? null,
    tahapanGroup: item.tahapanGroup ?? null,
  };
}

const statusStyle: Record<KerjasamaItem['status'], string> = {
  Menunggu: 'bg-amber-100 text-amber-700',
  Diproses: 'bg-sky-100 text-sky-700',
  Aktif: 'bg-emerald-100 text-emerald-700',
  Berakhir: 'bg-rose-100 text-rose-700',
};

const reviewStateStyle: Record<KerjasamaItem['reviewState'], string> = {
  'Belum Direview': 'bg-slate-100 text-slate-700',
  'Sudah Direview': 'bg-indigo-100 text-indigo-700',
};

const statusDetailConfig: Record<KerjasamaItem['status'], { className: string; icon: ReactNode; label: string }> = {
  Menunggu: {
    className: 'bg-amber-100 text-amber-700',
    icon: <Clock3 size={14} />,
    label: 'Menunggu',
  },
  Diproses: {
    className: 'bg-sky-100 text-sky-700',
    icon: <Clock3 size={14} />,
    label: 'Diproses',
  },
  Aktif: {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={14} />,
    label: 'Aktif',
  },
  Berakhir: {
    className: 'bg-rose-100 text-rose-700',
    icon: <XCircle size={14} />,
    label: 'Berakhir',
  },
};

const jenisStyle: Record<KerjasamaItem['jenis'], string> = {
  MoU: 'bg-violet-100 text-violet-700',
  MoA: 'bg-[#1E376C] text-white',
  IA: 'bg-orange-100 text-orange-700',
};

const reviewCopy: Record<KerjasamaItem['status'], string> = {
  Menunggu: 'Pengajuan sudah masuk dan sedang menunggu review dari admin.',
  Diproses: 'Admin sedang memeriksa detail pengajuan kerja sama ini.',
  Aktif: 'Pengajuan sudah disetujui admin dan siap ditindaklanjuti.',
  Berakhir: 'Pengajuan belum disetujui admin. Silakan cek catatan review.',
};

export default function DaftarKerjasamaEksternalPage() {
  const [data, setData] = useState<KerjasamaItem[]>([]);
  const [detailItem, setDetailItem] = useState<KerjasamaItem | null>(null);
  const [laporanItem, setLaporanItem] = useState<LaporanPelaksanaanData | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterReview, setFilterReview] = useState<'Semua Review' | 'Belum Direview' | 'Sudah Direview'>('Semua Review');
  const [filterTahun, setFilterTahun] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [yearRangeStart, setYearRangeStart] = useState(currentYear - 4);
  const yearGrid = Array.from({ length: 12 }, (_, index) => yearRangeStart + index);

  useEffect(() => {
    let isMounted = true;
    const updateEventName = getExternalPengajuanUpdateEventName();

    // Backend sudah membatasi /pengajuan ke milik akun eksternal yang login sendiri (lihat
    // PengajuanController::index), jadi sumber data utama sekarang fetch langsung dari API —
    // bukan cache localStorage per-browser (pengajuanKerjasamaDataEksternal:*) seperti sebelumnya.
    // Cache lokal itu cuma keisi kalau pengajuannya dibuat lewat form di browser yang SAMA, jadi
    // kalau akun eksternal login dari device/browser lain (atau cache-nya kosong/ke-clear),
    // daftarnya kelihatan kosong — termasuk baris yang sebetulnya sudah dihapus/masih ada di
    // server, bikin tombol Hapus seolah "tidak aktif" karena barisnya sendiri tidak pernah muncul.
    const sync = async () => {
      if (!isMounted) {
        return;
      }

      try {
        const allItems = await fetchPengajuanDataFromApi({ perPage: 500 });
        if (!isMounted) return;
        const ownItems = allItems.filter((item) => item.kategoriPengajuan === 'Eksternal');
        setData(ownItems.map(mapPengajuanToItem));
      } catch {
        // Offline/API gagal -> fallback ke cache lokal supaya halaman tidak kosong total.
        if (isMounted) {
          syncExternalPengajuanWithAdminData();
          setData(getExternalPengajuanData().map(mapPengajuanToItem));
        }
      }
    };

    void sync();
    window.addEventListener(updateEventName, sync);
    window.addEventListener('pengajuan-data-updated', sync);

    return () => {
      isMounted = false;
      window.removeEventListener(updateEventName, sync);
      window.removeEventListener('pengajuan-data-updated', sync);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = search.toLowerCase().trim();

    const filtered = data.filter((item) => {
      const matchesSearch =
        keyword === '' ||
        item.noDokumen.toLowerCase().includes(keyword) ||
        item.namaMitra.toLowerCase().includes(keyword) ||
        item.unit.toLowerCase().includes(keyword);

      const matchesStatus = filterStatus === 'Semua Status' || item.status === filterStatus;
      const matchesReview = filterReview === 'Semua Review' || item.reviewState === filterReview;
      const matchesTahun = filterTahun === null || item.tahun === filterTahun;

      return matchesSearch && matchesStatus && matchesReview && matchesTahun;
    });
    return sortOrder === 'oldest' ? [...filtered].reverse() : filtered;
  }, [data, search, filterStatus, filterReview, filterTahun, sortOrder]);

  const reviewStats = useMemo(() => {
    const belumDireview = data.filter((item) => item.reviewState === 'Belum Direview').length;
    const sudahDireview = data.filter((item) => item.reviewState === 'Sudah Direview').length;

    return { belumDireview, sudahDireview };
  }, [data]);

  const handleDelete = async (item: KerjasamaItem) => {
    if (!window.confirm(`Yakin ingin menghapus pengajuan ${item.noDokumen}? Pengajuan ini akan dihapus permanen dan tidak bisa dikembalikan lagi.`)) {
      return;
    }

    try {
      // Backend memastikan yang boleh dihapus cuma milik sendiri — dan sekarang hapus permanen
      // dari database (lihat PengajuanController::destroy), bukan cuma disembunyikan.
      await deletePengajuanItemApi(item.id);
      // Refresh cache pengajuan dari server & broadcast 'pengajuan-data-updated' — listener yang
      // sudah ada di halaman ini (lihat useEffect di atas) akan ikut sinkron ulang otomatis.
      await refreshPengajuanDataFromApi(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Gagal menghapus pengajuan.');
    }
  };

  const handleExport = () => {
    const headers = ['No. Dokumen', 'Nama Mitra', 'Jenis Mitra', 'Tingkat Perusahaan', 'Jenis', 'Jurusan/Unit', 'Tanggal Mulai', 'Berlaku Hingga', 'Tahun', 'Status'];
    const rows = filteredItems.map((item) => [
      item.noDokumen,
      item.namaMitra,
      item.jenisMitra,
      item.tingkatPerusahaan,
      item.jenis,
      item.unit,
      item.tanggalMulai,
      item.berlakuHingga,
      item.tahun,
      item.status,
    ]);
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportToExcel(headers, rows, `daftar-kerjasama-eksternal-${dateStamp}.xlsx`, 'Daftar Kerjasama');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[17px] font-bold text-slate-900">Daftar Kerjasama</h1>
          <p className="text-[12px] text-slate-500">Kelola dan monitor semua kerjasama</p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
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
              placeholder="Cari berdasarkan nomor atau mitra"
              className="input-field h-10 w-full pl-9 pr-3 text-[12px] text-slate-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-600">
              <Filter size={14} />
              Filter
            </span>

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="input-field h-10 px-3 text-[12px] text-slate-700"
            >
              <option>Semua Status</option>
              <option>Menunggu</option>
              <option>Diproses</option>
              <option>Aktif</option>
              <option>Berakhir</option>
            </select>

            <select
              value={filterReview}
              onChange={(event) => setFilterReview(event.target.value as 'Semua Review' | 'Belum Direview' | 'Sudah Direview')}
              className="input-field h-10 px-3 text-[12px] text-slate-700"
            >
              <option>Semua Review</option>
              <option>Belum Direview</option>
              <option>Sudah Direview</option>
            </select>

            <div className="relative">
              <button
                type="button"
                onClick={() => setYearPickerOpen((prev) => !prev)}
                className="input-field inline-flex h-10 min-w-[150px] items-center justify-between gap-2 px-3 text-[12px] text-slate-700"
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
                    <p className="text-[12px] font-semibold text-slate-800">
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
                          className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
                            isSelected
                              ? 'border-[#071B3C] bg-[#071B3C] text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-[#071B3C] hover:text-[#071B3C]'
                          }`}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <p className="text-[10px] text-slate-500">Pilih tahun dokumen</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterTahun(null);
                        setYearPickerOpen(false);
                      }}
                      className="text-[10px] font-semibold text-[#071B3C] hover:text-[#0d2b5b]"
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
              className="input-field h-10 px-3 text-[12px] text-slate-700"
            >
              <option value="newest">Terbaru ke Terlama</option>
              <option value="oldest">Terlama ke Terbaru</option>
            </select>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-semibold text-slate-700">
            Belum Direview: {reviewStats.belumDireview}
          </span>
          <span className="rounded-full bg-indigo-100 px-3 py-1.5 text-[10px] font-semibold text-indigo-700">
            Sudah Direview: {reviewStats.sudahDireview}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">No. Dokumen</th>
                <th className="px-4 py-3">Nama Mitra</th>
                <th className="px-4 py-3">Jenis Mitra</th>
                <th className="px-4 py-3">Tingkat Perusahaan</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Jurusan/Unit</th>
                <th className="px-4 py-3">Tanggal Mulai</th>
                <th className="px-4 py-3">Berlaku Hingga</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Review</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada data kerjasama.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 text-slate-700 hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.noDokumen}</td>
                    <td className="px-4 py-3">{item.namaMitra}</td>
                    <td className="px-4 py-3">{item.jenisMitra}</td>
                    <td className="px-4 py-3">{item.tingkatPerusahaan}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10.5px] font-semibold text-slate-700">
                        {item.jenis}
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3">{item.tanggalMulai}</td>
                    <td className="px-4 py-3">{item.berlakuHingga}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${statusStyle[item.status]}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${reviewStateStyle[item.reviewState]}`}>
                        {item.reviewState}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setDetailItem(item)}
                          className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900"
                        >
                          <Eye size={16} />
                          <span className="underline underline-offset-2">Lihat Detail</span>
                        </button>
                        <button
                          type="button"
                          title="Laporan Pelaksanaan"
                          onClick={() => setLaporanItem({
                            namaMitra:    item.namaMitra,
                            noDokumen:    item.noDokumen,
                            jenis:        item.jenis,
                            ruangLingkup: item.ruangLingkup,
                            unit:         item.unit,
                            pengajuanId:  item.id,
                          })}
                          className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-800"
                        >
                          <FileText size={16} />
                          <span className="underline underline-offset-2 text-[12px]">Laporan</span>
                        </button>
                        <button
                          type="button"
                          title="Hapus dari daftar saya"
                          onClick={() => handleDelete(item)}
                          className="inline-flex items-center gap-1.5 text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Menampilkan {filteredItems.length} dari {data.length} data</p>
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

      {/* Detail Modal */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDetailItem(null);
            }
          }}
        >
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Judul Pengajuan</div>
                <h2 className="text-[17px] font-bold text-slate-900">{detailItem.judulPengajuan}</h2>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {detailItem.diajukanPada} - {detailItem.namaPengusul}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-5 px-6 py-5">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold ${statusDetailConfig[detailItem.status].className}`}
                >
                  {statusDetailConfig[detailItem.status].icon}
                  {statusDetailConfig[detailItem.status].label}
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${jenisStyle[detailItem.jenis]}`}>
                  {detailItem.jenis}
                </span>
              </div>

              <section>
                <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">Informasi Umum</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={<Building2 size={15} />} label="Mitra" value={detailItem.namaMitra} />
                  <InfoRow icon={<Tag size={15} />} label="Jenis Mitra" value={detailItem.jenisMitra} />
                  <InfoRow icon={<Tag size={15} />} label="Tingkat Perusahaan" value={detailItem.tingkatPerusahaan} />
                  <InfoRow icon={<User size={15} />} label="Pengusul" value={detailItem.namaPengusul} />
                  <InfoRow icon={<Tag size={15} />} label="Jurusan / Unit" value={detailItem.unit} />
                  <InfoRow icon={<FileText size={15} />} label="Jenis Dokumen" value={detailItem.jenis} />
                  <InfoRow icon={<CalendarDays size={15} />} label="Tanggal Mulai" value={detailItem.tanggalMulai} />
                  <InfoRow icon={<CalendarDays size={15} />} label="Tanggal Berakhir" value={detailItem.berlakuHingga} />
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">Ruang Lingkup</h3>
                <div className="flex flex-wrap gap-2">
                  {detailItem.ruangLingkup.length > 0 ? (
                    detailItem.ruangLingkup.map((scope) => (
                      <span key={`${detailItem.id}-${scope}`} className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-700">
                        {scope}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-500">-</span>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">Kontak</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={<User size={15} />} label="Email Pengusul" value={detailItem.emailPengusul} />
                  <InfoRow icon={<User size={15} />} label="Whatsapp" value={detailItem.whatsappPengusul} />
                </div>
              </section>

              {/* Dokumen Pengajuan Awal */}
              {detailItem.fileAttachments.filter((f) => !f.isAcc).length > 0 && (
                <section>
                  <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">Dokumen Pendukung</h3>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                      <Paperclip size={13} />
                      Dokumen Pengajuan Awal
                    </div>
                    <ul className="space-y-1.5">
                      {detailItem.fileAttachments.filter((f) => !f.isAcc).map((file, index) => (
                        <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <Paperclip size={13} className="shrink-0 text-slate-400" />
                          {file.url ? (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={file.name}
                              className="truncate text-[10px] font-medium text-blue-600 underline hover:text-blue-800 flex items-center gap-1"
                            >
                              {file.name}
                              <Download size={12} />
                            </a>
                          ) : (
                            <span className="truncate text-[10px] text-slate-600">{file.name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}

              {/* Dokumen Final (Resmi) */}
              <section>
                <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">Dokumen Final</h3>
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
                    <ShieldCheck size={14} />
                    Dokumen Final (Resmi)
                  </div>
                  {(() => {
                    // Dedup by name, keep the last (terbaru) — sama seperti tampilan admin.
                    const accFilesMap = new Map<string, { name: string; url: string; isAcc?: boolean }>();
                    for (const f of detailItem.fileAttachments.filter((f) => f.isAcc)) {
                      accFilesMap.set(f.name, f);
                    }
                    const accFiles = Array.from(accFilesMap.values());

                    if (accFiles.length > 0) {
                      return (
                        <div className="space-y-2">
                          {accFiles.map((file, index) => (
                            <a
                              key={`${file.name}-${index}`}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={file.name}
                              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              <Paperclip size={13} className="shrink-0 text-emerald-600" />
                              <span className="truncate">{file.name}</span>
                              <Download size={13} className="ml-auto shrink-0" />
                            </a>
                          ))}
                        </div>
                      );
                    }

                    if (detailItem.finalFileName && detailItem.finalFilePath) {
                      return (
                        <a
                          href={detailItem.finalFilePath.startsWith('http') ? detailItem.finalFilePath : `http://127.0.0.1:8000/storage/${detailItem.finalFilePath.replace(/^\/+/, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={detailItem.finalFileName}
                          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          <Paperclip size={13} className="shrink-0 text-emerald-600" />
                          <span className="truncate">{detailItem.finalFileName}</span>
                          <Download size={13} className="ml-auto shrink-0" />
                        </a>
                      );
                    }

                    return <p className="text-[10px] text-slate-500">Belum ada dokumen final yang diupload oleh admin.</p>;
                  })()}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#173B82]">
                    <MessageSquareText size={15} />
                    Hasil Review Admin
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${reviewStateStyle[detailItem.reviewState]}`}
                  >
                    {detailItem.reviewState}
                  </span>
                </div>

                {detailItem.reviewComment ? (
                  <p className="text-[12px] text-slate-700">{detailItem.reviewComment}</p>
                ) : (
                  <p className="text-[12px] text-slate-700">{reviewCopy[detailItem.status]}</p>
                )}

                {(detailItem.reviewedAt || detailItem.reviewedBy) && (
                  <p className="mt-2 text-[10px] text-slate-500">
                    Diperbarui oleh {detailItem.reviewedBy || 'Admin'}
                    {detailItem.reviewedAt ? ` pada ${toDisplayDate(detailItem.reviewedAt)}` : ''}
                  </p>
                )}
              </section>

              {/* Progres Tahapan — dibaca dari data API */}
              {detailItem.tahapanStage && (
                <section>
                  <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">
                    Progres Tahapan
                  </h3>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <TahapanStepper
                      tahapan={{
                        stage: detailItem.tahapanStage,
                        group: (detailItem.tahapanGroup as StageGroup | null) ?? null,
                      }}
                    />
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      <LaporanPelaksanaanModal
        isOpen={laporanItem !== null}
        onClose={() => setLaporanItem(null)}
        data={laporanItem}
      />
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-[12px] font-medium text-slate-800">{value || '-'}</p>
      </div>
    </div>
  );
}
