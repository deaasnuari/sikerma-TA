'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Filter,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  deletePengajuanItemApi,
  getFilteredPengajuanData,
  getPengajuanData,
  getPengajuanStats,
  pengajuanDokumenBadge,
  refreshPengajuanDataFromApi,
  type PengajuanItem,
  type PengajuanStatus,
} from '@/services/adminPengajuanService';
import AjukanKerjasamaForm from './AjukanKerjasamaForm';
import GroupedFilterSelect from '@/components/GroupedFilterSelect';
import { getPageNumbers } from '@/lib/pagination';
import DetailPengajuanModal from './DetailPengajuanModal';
import { getMasterUnitProdi } from '@/services/masterUnitProdiService';
import { reviewTextFromTahapan } from '@/services/tahapanPengajuanService';
import PerbaikanPengajuanModal, { bolehDiubahPengusul } from '@/components/PerbaikanPengajuanModal';

const statusConfig: Record<PengajuanStatus, { className: string; icon: React.ReactNode }> = {
  Menunggu: {
    className: 'bg-amber-100 text-amber-700',
    icon: <Clock3 size={13} />,
  },
  'Menunggu Review': {
    className: 'bg-amber-100 text-amber-700',
    icon: <Clock3 size={13} />,
  },
  Diproses: {
    className: 'bg-sky-100 text-sky-700',
    icon: <Clock3 size={13} />,
  },
  Revisi: {
    className: 'bg-orange-100 text-orange-700',
    icon: <Clock3 size={13} />,
  },
  Disetujui: {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={13} />,
  },
  'Disetujui Internal': {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={13} />,
  },
  'Disetujui Mitra': {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={13} />,
  },
  'Final Approved': {
    className: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 size={13} />,
  },
  Ditolak: {
    className: 'bg-rose-100 text-rose-700',
    icon: <XCircle size={13} />,
  },
};

const reviewCopy: Record<PengajuanStatus, string> = {
  Menunggu: 'Pengajuan sudah masuk dan sedang menunggu review dari admin.',
  'Menunggu Review': 'Pengajuan sedang menunggu review dari admin.',
  Diproses: 'Admin sedang memeriksa detail pengajuan kerja sama ini.',
  Revisi: 'Pengajuan perlu direvisi sesuai catatan admin.',
  Disetujui: 'Pengajuan sudah disetujui admin dan siap ditindaklanjuti.',
  'Disetujui Internal': 'Pengajuan telah disetujui oleh pihak internal.',
  'Disetujui Mitra': 'Pengajuan telah disetujui oleh mitra.',
  'Final Approved': 'Pengajuan telah mendapat persetujuan final.',
  Ditolak: 'Pengajuan belum disetujui admin. Silakan cek catatan review.',
};


export default function InternalDataPengajuanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAjukanView = searchParams.get('mode') === 'ajukan';
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterKategori, setFilterKategori] = useState<'Semua' | 'Jurusan' | 'Unit'>('Semua');
  const [filterJurusan, setFilterJurusan] = useState('Semua Jurusan/Prodi/Unit');
  const [pengajuanData, setPengajuanData] = useState<PengajuanItem[]>([]);
  const [detailItem, setDetailItem] = useState<PengajuanItem | null>(null);
  const [reviewItem, setReviewItem] = useState<PengajuanItem | null>(null);
  const [editingItem, setEditingItem] = useState<PengajuanItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PengajuanItem | null>(null);
  const [infoModalMessage, setInfoModalMessage] = useState<string | null>(null);
  const [finalGuardItem, setFinalGuardItem] = useState<PengajuanItem | null>(null);

  // Dipisah per kategori (Jurusan / Program Studi / Unit Kerja) dari Data Master —
  // dipakai untuk mengelompokkan dropdown filter (<optgroup>) dan menggantikan
  // klasifikasi keyword-tebak-tebakan lama (isUnitValue) yang gampang meleset
  // begitu nama Jurusan/Unit di Data Master diubah/disinkron ulang.
  const [masterJurusanNames, setMasterJurusanNames] = useState<string[]>([]);
  const [masterProdiNames, setMasterProdiNames] = useState<string[]>([]);
  const [masterUnitNames, setMasterUnitNames] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadMasterUnitOptions() {
      try {
        const [jurusanRows, unitRows, prodiRows] = await Promise.all([
          getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'jurusan', aktif: true }),
          getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'unit_kerja', aktif: true }),
          getMasterUnitProdi({ jenis_node: 'prodi', aktif: true }),
        ]);

        if (!isMounted) {
          return;
        }

        setMasterJurusanNames(Array.from(new Set(jurusanRows.map((item) => item.nama).filter(Boolean))));
        setMasterUnitNames(Array.from(new Set(unitRows.map((item) => item.nama).filter(Boolean))));
        setMasterProdiNames(Array.from(new Set(prodiRows.map((item) => item.nama).filter(Boolean))));
      } catch {
        // fallback: klasifikasi sementara nganggur (dianggap Jurusan) sampai API siap.
      }
    }

    loadMasterUnitOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  const unitNameSet = useMemo(() => new Set(masterUnitNames), [masterUnitNames]);
  const prodiNameSet = useMemo(() => new Set(masterProdiNames), [masterProdiNames]);

  useEffect(() => {
    let isMounted = true;

    // Ambil data internal saja, exclude admin, dan deduplikasi berdasarkan id
    const syncPengajuan = () => {
      if (!isMounted) {
        return;
      }

      const internalOnly = getPengajuanData({ excludeAdmin: true }).filter(
        (item) => item.kategoriPengajuan === 'Internal'
      );
      // Dedup berdasarkan id
      const seen = new Set();
      const unique = [];
      for (const item of internalOnly) {
        if (!seen.has(item.id)) {
          unique.push(item);
          seen.add(item.id);
        }
      }
      setPengajuanData(unique);
    };

    // Hard refresh awal dari API agar daftar internal langsung up-to-date.
    void refreshPengajuanDataFromApi(true).finally(syncPengajuan);
    window.addEventListener('pengajuan-data-updated', syncPengajuan);

    // Polling supaya perubahan dari admin (revisi / ACC / tahapan) langsung kelihatan tanpa
    // refresh halaman. Hasil fetch disimpan ke store lalu memicu 'pengajuan-data-updated'
    // -> syncPengajuan. Di-skip saat tab tidak aktif; begitu tab dibuka lagi langsung fetch.
    const POLL_INTERVAL_MS = 10000;
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshPengajuanDataFromApi(true);
      }
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshPengajuanDataFromApi(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener('pengajuan-data-updated', syncPengajuan);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Modal detail yang sedang terbuka ikut diperbarui saat data hasil polling masuk.
  useEffect(() => {
    if (detailItem) {
      const refreshed = pengajuanData.find((item) => item.id === detailItem.id);
      if (refreshed && refreshed !== detailItem) setDetailItem(refreshed);
    }
    if (reviewItem) {
      const refreshed = pengajuanData.find((item) => item.id === reviewItem.id);
      if (refreshed && refreshed !== reviewItem) setReviewItem(refreshed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pengajuanData]);

  // Flat (Jurusan/Unit tab — 1 kategori saja) atau null (tab Semua, pakai jurusanOptionGroups
  // yang sudah dikelompokkan Jurusan/Program Studi/Unit Kerja/Lainnya lewat <optgroup>).
  const jurusanOptionsFlat = useMemo(() => {
    const currentValues = pengajuanData.map((item) => item.namaUnitProdi).filter(Boolean);

    if (filterKategori === 'Jurusan') {
      return Array.from(new Set([
        ...masterJurusanNames,
        ...currentValues.filter((value) => !unitNameSet.has(value) && !prodiNameSet.has(value)),
      ]));
    }

    if (filterKategori === 'Unit') {
      return Array.from(new Set([...masterUnitNames, ...currentValues.filter((value) => unitNameSet.has(value))]));
    }

    return null;
  }, [filterKategori, pengajuanData, masterJurusanNames, masterUnitNames, unitNameSet, prodiNameSet]);

  const jurusanOptionGroups = useMemo(() => {
    const currentValues = pengajuanData.map((item) => item.namaUnitProdi).filter(Boolean);
    const known = new Set([...masterJurusanNames, ...masterProdiNames, ...masterUnitNames]);
    const lainnya = Array.from(new Set(currentValues.filter((value) => !known.has(value))));

    return { jurusan: masterJurusanNames, prodi: masterProdiNames, unit: masterUnitNames, lainnya };
  }, [pengajuanData, masterJurusanNames, masterProdiNames, masterUnitNames]);

  const filteredItems = useMemo(() => {
    const baseItems = getFilteredPengajuanData(pengajuanData, {
      filterStatus,
      filterJurusan,
      filterTahun: 'Semua Tahun',
      search,
    }, { excludeAdmin: true });

    let filtered = baseItems;
    if (filterKategori === 'Jurusan') {
      filtered = baseItems.filter((item) => !unitNameSet.has(item.namaUnitProdi));
    } else if (filterKategori === 'Unit') {
      filtered = baseItems.filter((item) => unitNameSet.has(item.namaUnitProdi));
    }
    // Dedup sebelum render
    const seen = new Set();
    const unique = [];
    for (const item of filtered) {
      if (!seen.has(item.id)) {
        unique.push(item);
        seen.add(item.id);
      }
    }
    return unique;
  }, [pengajuanData, filterStatus, filterJurusan, search, filterKategori, unitNameSet]);

  // Daftar ditampilkan 10 per halaman, seperti di Rekap Data.
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredItems.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  // Kembali ke halaman 1 setiap kali filter atau pencarian berubah.
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterJurusan, filterKategori, search]);

  const stats = getPengajuanStats(pengajuanData);

  // Sama seperti Data Pengajuan admin: begitu status-nya sudah difinalkan (dipindah ke
  // Rekap Data oleh backend — lihat PengajuanController::moveApprovedPengajuanToDokumen()),
  // edit lanjutan diarahkan ke halaman Rekap Data, bukan lewat form ini lagi.
  function isPengajuanSudahFinal(item: PengajuanItem): boolean {
    return item.statusPengajuan === 'Disetujui' || item.statusPengajuan === 'Final Approved';
  }

  function bolehDiubah(item: PengajuanItem): boolean {
    return bolehDiubahPengusul(item.statusPengajuan);
  }

  function openEdit(item: PengajuanItem) {
    if (isPengajuanSudahFinal(item)) {
      setFinalGuardItem(item);
      return;
    }

    if (!bolehDiubah(item)) {
      setInfoModalMessage(
        `Pengajuan ini sedang berstatus "${item.statusPengajuan}" sehingga belum bisa diubah. ` +
          'Perubahan hanya bisa dilakukan saat pengajuan masih menunggu review atau diminta revisi oleh admin.'
      );
      return;
    }

    setEditingItem(item);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    try {
      // Sebelumnya pakai deletePengajuanItem (fungsi lokal, cuma ubah cache localStorage tanpa
      // pernah memanggil API) — kelihatan seperti berhasil dihapus, tapi begitu halaman
      // refresh/fetch ulang data dari server, baris itu muncul lagi karena aslinya tidak pernah
      // benar-benar terhapus di database. Sekarang panggil endpoint API yang sesungguhnya.
      await deletePengajuanItemApi(deletedId);
      setDeleteTarget(null);
      if (detailItem?.id === deletedId) setDetailItem(null);
      if (reviewItem?.id === deletedId) setReviewItem(null);
      setInfoModalMessage('Data pengajuan berhasil dihapus.');
      await refreshPengajuanDataFromApi(true);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menghapus pengajuan.';
      setInfoModalMessage(message);
    }
  }

  if (isAjukanView) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pengajuan Kerjasama</h2>
          <p className="text-sm text-slate-500">Form pengajuan sekarang ditempatkan langsung di dalam menu data pengajuan.</p>
        </div>

        <AjukanKerjasamaForm
          onCancel={() => router.replace('/internal/data_pengajuan')}
          onSubmitted={() => router.replace('/internal/data_pengajuan')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pengajuan Kerjasama</h2>
          <p className="text-sm text-slate-500">
            Daftar pengajuan internal akan otomatis mengikuti hasil review dari admin.
          </p>
        </div>
        <Link href="/internal/data_pengajuan?mode=ajukan" className="btn-primary px-4 py-2.5 text-sm font-semibold">
          <Plus size={16} />
          Ajukan Kerjasama Baru
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Pengajuan</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.totalPengajuan}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Menunggu</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{stats.menunggu}</p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Diproses</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">{stats.diproses}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Disetujui</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{stats.disetujui}</p>
        </div>
      </div>

      <div className="toolbar-shell p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Filter size={15} />
            Filter:
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
            {(['Semua', 'Jurusan', 'Unit'] as const).map((kategori) => (
              <button
                key={kategori}
                type="button"
                onClick={() => {
                  setFilterKategori(kategori);
                  setFilterJurusan('Semua Jurusan/Prodi/Unit');
                }}
                className={`px-3 py-2 text-sm font-semibold transition ${
                  filterKategori === kategori
                    ? 'bg-[#173B82] text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {kategori}
              </button>
            ))}
          </div>

          <GroupedFilterSelect
            value={filterJurusan}
            onChange={setFilterJurusan}
            allLabel={
              filterKategori === 'Jurusan'
                ? 'Semua Jurusan'
                : filterKategori === 'Unit'
                  ? 'Semua Unit'
                  : 'Semua Jurusan/Prodi/Unit'
            }
            allValue="Semua Jurusan/Prodi/Unit"
            className="min-w-[220px]"
            buttonClassName="input-field flex min-w-[220px] items-center justify-between gap-2 px-3 py-2 text-sm text-gray-700 cursor-pointer"
            groups={
              jurusanOptionsFlat
                ? [{ label: '', options: jurusanOptionsFlat }]
                : [
                    { label: 'Jurusan', options: jurusanOptionGroups.jurusan },
                    { label: 'Program Studi', options: jurusanOptionGroups.prodi },
                    { label: 'Unit Kerja', options: jurusanOptionGroups.unit },
                    { label: 'Lainnya', options: jurusanOptionGroups.lainnya },
                  ]
            }
          />

          <GroupedFilterSelect
            value={filterStatus}
            onChange={setFilterStatus}
            allLabel="Semua Status"
            buttonClassName="input-field flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-700 cursor-pointer"
            groups={[{ label: '', options: ['Menunggu', 'Diproses', 'Disetujui', 'Ditolak'] }]}
          />

          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                filterKategori === 'Jurusan'
                  ? 'Cari judul, mitra, pengusul, atau jurusan'
                  : filterKategori === 'Unit'
                    ? 'Cari judul, mitra, pengusul, atau unit'
                    : 'Cari judul, mitra, pengusul, atau jurusan/unit'
              }
              className="input-field w-full pl-9 pr-3 py-2 text-sm text-gray-700"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 shadow-sm">
            Belum ada pengajuan internal yang masuk.
          </div>
        ) : (
          paginatedItems.map((item) => {
            const sc = statusConfig[item.statusPengajuan];

            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{item.judulPengajuan}</h3>
                      <p className="text-xs text-slate-500">
                        Pengusul: {item.namaPengusul} • {item.diajukanPada}
                      </p>
                    </div>

                    <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-400">Mitra Tujuan</p>
                        <p className="font-semibold">{item.namaMitra}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Jenis Dokumen</p>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${pengajuanDokumenBadge[item.jenisDokumen] || 'bg-slate-100 text-slate-700'}`}>
                          {item.jenisDokumen}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Jurusan / Prodi / Unit</p>
                        <p className="font-semibold">{item.namaUnitProdi}</p>
                      </div>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${sc.className}`}>
                    {sc.icon}
                    {item.statusPengajuan}
                  </span>
                </div>

                {item.statusPengajuan === 'Revisi' && (
                  <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 text-sm font-semibold text-orange-800">
                          <AlertTriangle size={15} />
                          Admin meminta revisi
                        </p>
                        <p className="whitespace-pre-line text-sm text-orange-900">
                          {item.catatanRevisi || item.reviewComment || 'Silakan perbaiki pengajuan sesuai arahan admin.'}
                        </p>
                        <p className="text-xs text-orange-800">Cukup perbarui data/dokumen pada pengajuan ini. Tidak perlu membuat pengajuan baru.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                      >
                        <Send size={15} />
                        Perbaiki &amp; Kirim Ulang
                      </button>
                    </div>
                  </div>
                )}

                {item.direvisiPengusulPada && (item.statusPengajuan === 'Menunggu Review' || item.statusPengajuan === 'Menunggu') && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
                    <CheckCircle2 size={13} />
                    Perbaikan terkirim {new Date(item.direvisiPengusulPada).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} — menunggu review ulang admin.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {item.ruangLingkup.map((scope) => (
                      <span key={`${item.id}-${scope}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        {scope}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-5 text-sm">
                    <button type="button" onClick={() => setDetailItem(item)} className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900">
                      <Eye size={16} />
                      <span className="underline underline-offset-2">Lihat Detail</span>
                    </button>
                    <button type="button" onClick={() => setReviewItem(item)} className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700">
                      <MessageSquareText size={16} />
                      <span>Review</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      title={
                        isPengajuanSudahFinal(item)
                          ? 'Sudah difinalkan — edit lewat Rekap Data'
                          : !bolehDiubah(item)
                            ? 'Sedang diproses admin — belum bisa diubah'
                            : undefined
                      }
                      className={`inline-flex items-center gap-2 ${
                        bolehDiubah(item) ? 'text-amber-600 hover:text-amber-700' : 'text-slate-400 hover:text-slate-500'
                      }`}
                    >
                      <Pencil size={16} />
                      <span>Edit</span>
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(item)} className="inline-flex items-center gap-2 text-red-500 hover:text-red-700">
                      <Trash2 size={16} />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>

                {item.statusPengajuan === 'Ditolak' && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
                      <XCircle size={15} />
                      Pengajuan ditolak oleh admin
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-red-900">
                      <span className="font-semibold">Alasan:</span>{' '}
                      {item.reviewComment || 'Tidak ada alasan yang dicantumkan. Silakan hubungi admin untuk keterangan lebih lanjut.'}
                    </p>
                    <p className="mt-2 text-xs text-red-800">Pengajuan yang ditolak tidak bisa diperbaiki. Silakan buat pengajuan baru bila ingin mengajukan kembali.</p>
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#173B82]">
                    <FileText size={15} />
                    Hasil Review Admin
                  </div>
                  <p className="text-sm text-slate-600">
                    {item.reviewComment ||
                      (item.statusPengajuan !== 'Revisi' && item.statusPengajuan !== 'Ditolak'
                        ? reviewTextFromTahapan(item.tahapanStage)
                        : null) ||
                      reviewCopy[item.statusPengajuan]}
                  </p>
                  {item.reviewedAt && (
                    <p className="mt-2 text-xs text-slate-500">
                      Diperbarui oleh {item.reviewedBy || 'Admin'} pada {item.reviewedAt}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {filteredItems.length > ITEMS_PER_PAGE && (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-gray-500">
            Menampilkan <span className="font-semibold text-gray-700">{pageStartIndex + 1}–{Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredItems.length)}</span> dari{' '}
            <span className="font-semibold text-gray-700">{filteredItems.length}</span> pengajuan
          </p>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Prev
            </button>

            {pageNumbers.map((page, idx) =>
              page === '...' ? (
                <span key={`dots-${idx}`} className="px-2 text-[12px] text-gray-400">
                  …
                </span>
              ) : (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-[12px] font-semibold transition-colors ${
                    page === safePage
                      ? 'bg-[#1E376C] text-white'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {detailItem && (
        <DetailPengajuanModal item={detailItem} onClose={() => setDetailItem(null)} />
      )}

      {reviewItem && (
        <DetailPengajuanModal item={reviewItem} onClose={() => setReviewItem(null)} scrollToReview />
      )}

      {/* Edit / Perbaikan Revisi — form pengajuan lengkap (termasuk ganti dokumen) */}
      {editingItem && (
        <PerbaikanPengajuanModal
          item={editingItem}
          nomorPengajuanSource="internal"
          onClose={() => setEditingItem(null)}
          onMessage={setInfoModalMessage}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Hapus Pengajuan</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-700">Yakin ingin menghapus pengajuan <span className="font-semibold">{deleteTarget.judulPengajuan}</span>? Tindakan ini tidak bisa dibatalkan.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setDeleteTarget(null)} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200">Batal</button>
              <button type="button" onClick={confirmDelete} className="h-9 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {infoModalMessage && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Informasi</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-700">{infoModalMessage}</p>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setInfoModalMessage(null)} className="h-9 rounded-lg bg-[#173B82] px-4 text-sm font-semibold text-white hover:bg-[#2A4A8F]">OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Final Guard Modal */}
      {finalGuardItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Sudah Difinalkan</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-700">
                Pengajuan ini sudah difinalkan dan datanya sudah ada di Rekap Data. Untuk mengedit, silakan lakukan lewat halaman Rekap Data.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setFinalGuardItem(null)} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200">Batal</button>
              <button
                type="button"
                onClick={() => {
                  setFinalGuardItem(null);
                  router.push('/internal/rekap_data');
                }}
                className="h-9 rounded-lg bg-[#173B82] px-4 text-sm font-semibold text-white hover:bg-[#2A4A8F]"
              >
                Buka Rekap Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
