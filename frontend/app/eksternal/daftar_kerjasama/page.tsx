'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
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
  Pencil,
  Trash2,
  Search,
  Send,
  ShieldCheck,
  Tag,
  User,
  X,
  XCircle,
} from 'lucide-react';
import LaporanPelaksanaanModal, { type LaporanPelaksanaanData } from '@/components/LaporanPelaksanaanModal';
import { exportToExcel } from '@/lib/exportExcel';
import type { PengajuanItem } from '../../../services/adminPengajuanService';
import { deletePengajuanItemApi, fetchPengajuanDataFromApi } from '@/services/adminPengajuanService';
import TahapanStepper from '@/components/TahapanStepper';
import { reviewTextFromTahapan, type StageGroup } from '@/services/tahapanPengajuanService';
import PerbaikanPengajuanModal, { bolehDiubahPengusul } from '@/components/PerbaikanPengajuanModal';
import PerpanjanganKerjasamaModal from '@/components/PerpanjanganKerjasamaModal';
import DokumenPerpanjanganSection from '@/components/DokumenPerpanjanganSection';
import { parseTanggal } from '@/lib/parseTanggal';
import { fetchRekapDokumenFromApi } from '@/services/dokumenKerjasamaApiService';
import { getRenewalRequests } from '@/services/adminRenewalRequestService';
import FileRevisiBox from '@/components/FileRevisiBox';
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
  revisiFiles?: { name: string; url: string }[];
  finalFileName?: string | null;
  finalFilePath?: string | null;
  status: 'Menunggu' | 'Diproses' | 'Revisi' | 'Aktif' | 'Berakhir';
  reviewState: 'Belum Direview' | 'Sudah Direview';
  reviewComment?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  tahapanStage?: string | null;
  tahapanGroup?: string | null;
  // Cuma terisi kalau status === 'Aktif' (kerjasama beneran disetujui) — dihitung dari
  // tanggalBerakhir asli (bukan dari `status` yang di sini artinya "hasil review pengajuan",
  // beda dari status masa berlaku dokumen di Rekap Data admin/internal).
  masaBerlakuTier?: 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa' | null;
  catatanRevisi?: string | null;
  direvisiPengusulPada?: string | null;
  // Data pengajuan asli dari API — dipakai form perbaikan/edit.
  sumber: PengajuanItem;
}

function resolveMasaBerlakuTier(tanggalBerakhir?: string): 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa' | null {
  const end = parseTanggal(tanggalBerakhir);
  if (!end) return null;
  const diffDays = Math.ceil((end.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return 'Kadaluarsa';
  if (diffDays <= 90) return 'Akan Berakhir';
  return 'Aktif';
}

function toDisplayDate(value?: string): string {
  if (!value) return '-';
  const d = parseTanggal(value);
  if (!d) return value;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mapPengajuanToItem(item: PengajuanItem): KerjasamaItem {
  const jenis = (['MoA', 'MoU', 'IA'].includes(item.jenisDokumen) ? item.jenisDokumen : 'MoU') as KerjasamaItem['jenis'];
  const tahun = String((parseTanggal(item.tanggalMulai) ?? parseTanggal(item.diajukanPada) ?? new Date()).getFullYear());
  const statusMap: Record<string, KerjasamaItem['status']> = {
    Menunggu: 'Menunggu',
    'Menunggu Review': 'Menunggu',
    Diproses: 'Diproses',
    Revisi: 'Revisi',
    'Disetujui Internal': 'Diproses',
    'Disetujui Mitra': 'Diproses',
    Disetujui: 'Aktif',
    'Final Approved': 'Aktif',
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
    revisiFiles: item.revisiFiles,
    finalFileName: item.finalFileName ?? null,
    finalFilePath: item.finalFilePath ?? null,
    status: statusMap[item.statusPengajuan] ?? 'Menunggu',
    reviewState: item.reviewedAt || item.reviewComment ? 'Sudah Direview' : 'Belum Direview',
    reviewComment: item.reviewComment,
    reviewedAt: item.reviewedAt,
    reviewedBy: item.reviewedBy,
    tahapanStage: item.tahapanStage ?? null,
    tahapanGroup: item.tahapanGroup ?? null,
    masaBerlakuTier: statusMap[item.statusPengajuan] === 'Aktif' ? resolveMasaBerlakuTier(item.tanggalBerakhir) : null,
    catatanRevisi: item.catatanRevisi ?? null,
    direvisiPengusulPada: item.direvisiPengusulPada ?? null,
    sumber: item,
  };
}

const statusStyle: Record<KerjasamaItem['status'], string> = {
  Menunggu: 'bg-amber-100 text-amber-700',
  Diproses: 'bg-sky-100 text-sky-700',
  Revisi: 'bg-orange-100 text-orange-700',
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
  Revisi: {
    className: 'bg-orange-100 text-orange-700',
    icon: <AlertTriangle size={14} />,
    label: 'Revisi',
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
  Revisi: 'Pengajuan perlu direvisi sesuai catatan admin.',
  Aktif: 'Pengajuan sudah disetujui admin dan siap ditindaklanjuti.',
  Berakhir: 'Pengajuan belum disetujui admin. Silakan cek catatan review.',
};

export default function DaftarKerjasamaEksternalPage() {
  const [data, setData] = useState<KerjasamaItem[]>([]);
  const [detailItem, setDetailItem] = useState<KerjasamaItem | null>(null);
  const [laporanItem, setLaporanItem] = useState<LaporanPelaksanaanData | null>(null);
  const [editingItem, setEditingItem] = useState<PengajuanItem | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [perpanjangItem, setPerpanjangItem] = useState<KerjasamaItem | null>(null);
  const [hapusTarget, setHapusTarget] = useState<KerjasamaItem | null>(null);
  const [menghapus, setMenghapus] = useState(false);
  // Daftar ini berbasis pengajuan, sedangkan perpanjangan diikat ke dokumen kerja sama —
  // dipetakan lewat sumber_pengajuan_id dari data rekap.
  const [dokumenIdByPengajuan, setDokumenIdByPengajuan] = useState<Map<number, number>>(new Map());
  const [perpanjanganMenunggu, setPerpanjanganMenunggu] = useState<Set<number>>(new Set());

  const refreshPerpanjangan = () => {
    fetchRekapDokumenFromApi({ forceRefresh: true })
      .then((rows) => {
        const map = new Map<number, number>();
        rows.forEach((row) => {
          if (row.sourcePengajuanId && typeof row.id === 'number') map.set(row.sourcePengajuanId, row.id);
        });
        setDokumenIdByPengajuan(map);
      })
      .catch(() => {});
    getRenewalRequests()
      .then((items) =>
        setPerpanjanganMenunggu(new Set(items.filter((r) => r.status === 'menunggu').map((r) => r.kerjasamaId))),
      )
      .catch(() => {});
  };

  useEffect(() => {
    refreshPerpanjangan();
  }, []);

  // Tombol muncul untuk kerja sama yang sudah disetujui dan masa berlakunya tinggal <= 90 hari
  // atau sudah lewat; mengembalikan ID dokumen kalau berhak, null kalau tidak.
  const dokumenIdPerpanjangan = (item: KerjasamaItem): number | null => {
    if (item.status !== 'Aktif' || item.masaBerlakuTier === 'Aktif' || !item.masaBerlakuTier) return null;
    return dokumenIdByPengajuan.get(item.id) ?? null;
  };
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
    // daftarnya kelihatan kosong padahal datanya masih ada di server.
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

    // Polling supaya keputusan admin (revisi / ACC / tahapan) langsung kelihatan tanpa refresh.
    // Di-skip saat tab tidak aktif; begitu tab dibuka lagi langsung fetch.
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') void sync();
    }, 10000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener(updateEventName, sync);
      window.removeEventListener('pengajuan-data-updated', sync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Modal detail yang sedang terbuka ikut diperbarui saat data baru masuk.
  useEffect(() => {
    setDetailItem((current) => (current ? data.find((item) => item.id === current.id) ?? current : current));
  }, [data]);

  // Mitra boleh menghapus (menyembunyikan dari daftarnya) pengajuan dengan status apa pun.
  const sudahDisetujui = (item: KerjasamaItem) =>
    ['Disetujui', 'Disetujui Internal', 'Disetujui Mitra', 'Final Approved'].includes(item.sumber.statusPengajuan);

  const jalankanHapus = async () => {
    if (!hapusTarget) return;
    setMenghapus(true);
    try {
      await deletePengajuanItemApi(hapusTarget.sumber.id);
      setData((prev) => prev.filter((item) => item.id !== hapusTarget.id));
      setDetailItem((current) => (current && current.id === hapusTarget.id ? null : current));
      setHapusTarget(null);
      setInfoMessage('Pengajuan berhasil dihapus dari daftar Anda.');
    } catch (err) {
      setHapusTarget(null);
      setInfoMessage(err instanceof Error ? err.message : 'Gagal menghapus pengajuan.');
    } finally {
      setMenghapus(false);
    }
  };

  const bukaPerbaikan = (item: KerjasamaItem) => {
    if (!bolehDiubahPengusul(item.sumber.statusPengajuan)) {
      setInfoMessage(
        'Pengajuan ini sedang diproses admin sehingga belum bisa diubah. Perubahan hanya bisa dilakukan saat pengajuan masih menunggu review atau diminta revisi.'
      );
      return;
    }
    setDetailItem(null);
    setEditingItem(item.sumber);
  };

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

  // Cerminan dari kartu "Total Kerjasama/Aktif/Akan Berakhir/Kadaluarsa" di Rekap Data
  // admin/internal — di sini "Total Kerjasama" = pengajuan yang sudah disetujui (status
  // 'Aktif' di halaman ini), rinciannya dari masaBerlakuTier (berdasarkan tanggalBerakhir).
  const kerjasamaStats = useMemo(() => {
    const disetujui = data.filter((item) => item.status === 'Aktif');
    return {
      totalKerjasama: disetujui.length,
      totalAktif: disetujui.filter((item) => item.masaBerlakuTier === 'Aktif').length,
      totalAkanBerakhir: disetujui.filter((item) => item.masaBerlakuTier === 'Akan Berakhir').length,
      totalKadaluarsa: disetujui.filter((item) => item.masaBerlakuTier === 'Kadaluarsa').length,
    };
  }, [data]);

  const handleExport = () => {
    const headers = ['No. Dokumen', 'Nama Mitra', 'Jenis Mitra', 'Tingkat Perusahaan', 'Jenis', 'Jurusan/Prodi/Unit', 'Tanggal Mulai', 'Berlaku Hingga', 'Tahun', 'Status'];
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatCard title="Total Kerjasama" value={kerjasamaStats.totalKerjasama} caption="Sudah disetujui" valueClassName="text-gray-900" />
        <StatCard title="Aktif" value={kerjasamaStats.totalAktif} caption="Masa berlaku > 3 bulan" valueClassName="text-green-600" />
        <StatCard title="Akan Berakhir" value={kerjasamaStats.totalAkanBerakhir} caption="Masa berlaku < 3 bulan" valueClassName="text-orange-600" />
        <StatCard title="Kadaluarsa" value={kerjasamaStats.totalKadaluarsa} caption="Sudah berakhir" valueClassName="text-red-600" />
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
              <option>Revisi</option>
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
          {/* Kolom dipadatkan (mitra + jenis/tingkat, masa berlaku, status + review) dan kolom Aksi
              menempel di kanan, supaya aksi selalu terlihat tanpa harus geser tabel jauh-jauh. */}
          <table className="min-w-[920px] w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">No. Dokumen</th>
                <th className="px-4 py-3">Mitra</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Jurusan/Prodi/Unit</th>
                <th className="px-4 py-3">Masa Berlaku</th>
                <th className="px-4 py-3">Status</th>
                <th className="sticky right-0 bg-slate-50 px-4 py-3 text-center shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.15)]">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada data kerjasama.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="group border-b border-slate-100 text-slate-700 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{item.noDokumen}</td>
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate font-medium text-slate-800" title={item.namaMitra}>{item.namaMitra}</p>
                      <p className="truncate text-[10.5px] text-slate-500">
                        {[item.jenisMitra, item.tingkatPerusahaan].filter((v) => v && v !== '-').join(' · ') || '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10.5px] font-semibold text-slate-700">
                        {item.jenis}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <p className="line-clamp-2" title={item.unit}>{item.unit}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[11px]">
                      {item.tanggalMulai} – {item.berlakuHingga}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${statusStyle[item.status]}`}>
                          {item.status}
                        </span>
                        {item.status === 'Menunggu' && item.direvisiPengusulPada ? (
                          <span className="text-[10px] font-medium text-sky-700">Perbaikan terkirim</span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${reviewStateStyle[item.reviewState]}`}>
                            {item.reviewState}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="sticky right-0 bg-white px-3 py-3 shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.15)] group-hover:bg-slate-50">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          title="Lihat Detail"
                          onClick={() => setDetailItem(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Eye size={16} />
                        </button>
                        {item.status === 'Revisi' ? (
                          <button
                            type="button"
                            title="Perbaiki & kirim ulang"
                            onClick={() => bukaPerbaikan(item)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange-600 px-2.5 text-[11px] font-semibold text-white hover:bg-orange-700"
                          >
                            <Send size={13} />
                            Perbaiki
                          </button>
                        ) : (
                          bolehDiubahPengusul(item.sumber.statusPengajuan) && (
                            <button
                              type="button"
                              title="Edit pengajuan"
                              onClick={() => bukaPerbaikan(item)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                            >
                              <Pencil size={15} />
                            </button>
                          )
                        )}
                        {(() => {
                          const dokumenId = dokumenIdPerpanjangan(item);
                          if (dokumenId === null) return null;
                          return perpanjanganMenunggu.has(dokumenId) ? (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700" title="Menunggu keputusan admin">
                              Perpanjangan menunggu
                            </span>
                          ) : (
                            <button
                              type="button"
                              title="Ajukan perpanjangan"
                              onClick={() => setPerpanjangItem(item)}
                              className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-2.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                            >
                              Perpanjang
                            </button>
                          );
                        })()}
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
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"
                        >
                          <FileText size={16} />
                        </button>
                        {(
                          <button
                            type="button"
                            title="Hapus pengajuan"
                            onClick={() => setHapusTarget(item)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
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

              {detailItem.status === 'Revisi' && (
                <section className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-orange-800">
                    <AlertTriangle size={15} />
                    Admin meminta revisi
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[12px] text-orange-900">
                    {detailItem.catatanRevisi || detailItem.reviewComment || 'Silakan perbaiki pengajuan sesuai arahan admin.'}
                  </p>
                  <p className="mt-1 text-[11px] text-orange-800">Cukup perbarui data/dokumen pada pengajuan ini. Tidak perlu membuat pengajuan baru.</p>
                  <button
                    type="button"
                    onClick={() => bukaPerbaikan(detailItem)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-orange-700"
                  >
                    <Send size={14} />
                    Perbaiki &amp; Kirim Ulang
                  </button>
                </section>
              )}

              {detailItem.status === 'Menunggu' && detailItem.direvisiPengusulPada && (
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-[10.5px] font-medium text-sky-700">
                  <CheckCircle2 size={13} />
                  Perbaikan terkirim {new Date(detailItem.direvisiPengusulPada).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} — menunggu review ulang admin.
                </p>
              )}

              <section>
                <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">Informasi Umum</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={<Building2 size={15} />} label="Mitra" value={detailItem.namaMitra} />
                  <InfoRow icon={<Tag size={15} />} label="Jenis Mitra" value={detailItem.jenisMitra} />
                  <InfoRow icon={<Tag size={15} />} label="Tingkat Perusahaan" value={detailItem.tingkatPerusahaan} />
                  <InfoRow icon={<User size={15} />} label="Pengusul" value={detailItem.namaPengusul} />
                  <InfoRow icon={<Tag size={15} />} label="Jurusan / Prodi / Unit" value={detailItem.unit} />
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

              <FileRevisiBox files={detailItem.revisiFiles} />

              {/* Dokumen Pengajuan Awal */}
              {detailItem.fileAttachments.filter((f) => !f.isAcc).length > 0 && (
                <section>
                  <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">Dokumen Pengajuan</h3>
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

              <DokumenPerpanjanganSection files={detailItem.sumber.perpanjanganFiles} />

              {detailItem.status === 'Berakhir' && (
                <section className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-red-800">
                    <XCircle size={15} />
                    Pengajuan ditolak oleh admin
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[12px] text-red-900">
                    <span className="font-semibold">Alasan:</span>{' '}
                    {detailItem.reviewComment || 'Tidak ada alasan yang dicantumkan. Silakan hubungi admin untuk keterangan lebih lanjut.'}
                  </p>
                  <p className="mt-2 text-[11px] text-red-800">Pengajuan yang ditolak tidak bisa diperbaiki. Silakan buat pengajuan baru bila ingin mengajukan kembali.</p>
                </section>
              )}

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
                  <p className="text-[12px] text-slate-700">
                    {(detailItem.status !== 'Berakhir' && detailItem.status !== 'Revisi'
                      ? reviewTextFromTahapan(detailItem.tahapanStage)
                      : null) ||
                      reviewCopy[detailItem.status]}
                  </p>
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

      {editingItem && (
        <PerbaikanPengajuanModal
          item={editingItem}
          nomorPengajuanSource="eksternal"
          onClose={() => setEditingItem(null)}
          onMessage={setInfoMessage}
        />
      )}

      {perpanjangItem && (() => {
        const dokumenId = dokumenIdPerpanjangan(perpanjangItem);
        if (dokumenId === null) return null;
        return (
          <PerpanjanganKerjasamaModal
            target={{
              dokumenId,
              namaMitra: perpanjangItem.namaMitra,
              noDokumen: perpanjangItem.noDokumen,
              berlakuHingga: perpanjangItem.berlakuHingga,
              ruangLingkup: perpanjangItem.ruangLingkup,
            }}
            onClose={() => setPerpanjangItem(null)}
            onSubmitted={(message) => {
              setPerpanjangItem(null);
              setInfoMessage(message);
              refreshPerpanjangan();
            }}
          />
        );
      })()}

      {hapusTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <h2 className="mb-1 text-[15px] font-bold text-gray-900">Hapus Pengajuan</h2>
            <p className="mb-1 text-[12px] text-gray-500">Yakin ingin menghapus pengajuan berikut dari daftar Anda?</p>
            <p className="mb-1 text-[13px] font-semibold text-gray-800">{hapusTarget.judulPengajuan || hapusTarget.namaMitra}</p>
            <p className="mb-3 text-[11px] text-gray-500">{hapusTarget.namaMitra}</p>
            {sudahDisetujui(hapusTarget) && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Kerja sama ini sudah disetujui. Menghapusnya hanya menyembunyikannya dari daftar Anda; dokumen kerja sama tetap tersimpan di sistem dan masih dapat dilihat admin.
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setHapusTarget(null)}
                disabled={menghapus}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => { void jalankanHapus(); }}
                disabled={menghapus}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {menghapus ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {infoMessage && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-bold text-slate-900">Informasi</h3>
            </div>
            <p className="px-5 py-4 text-[12px] text-slate-700">{infoMessage}</p>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setInfoMessage(null)}
                className="h-9 rounded-lg bg-[#173B82] px-4 text-[12px] font-semibold text-white hover:bg-[#2A4A8F]"
              >
                OK
              </button>
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

function StatCard({
  title,
  value,
  caption,
  valueClassName,
}: {
  title: string;
  value: number;
  caption: string;
  valueClassName: string;
}) {
  return (
    <div className="stat-card p-3">
      <p className="text-[10px] text-gray-500">{title}</p>
      <p className={`mt-0.5 text-[17px] font-bold ${valueClassName}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-gray-400">{caption}</p>
    </div>
  );
}
