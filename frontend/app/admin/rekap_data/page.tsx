'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Filter, Pencil, Plus, Search, Trash2, Upload, Eye, Building2, FileText, Hash, Phone, User, CheckCircle2, Clock, XCircle, Download, Paperclip, RefreshCw, CheckSquare, Square } from 'lucide-react';
import TambahDokumenModal from './TambahDokumenModal';
import {
  createDokumenFormData,
  deleteRekapDokumen,
  filterRekapData,
  getAvailableYears,
  getRekapJenisMitraOptions,
  getRekapJenisOptions,
  getRekapStats,
  getRekapTingkatPerusahaanOptions,
  getRekapUnitOptions,
  rekapJenisBadgeMap,
  rekapStatusBadgeMap,
  rekapStatusOptions,
  type DokumenData,
  type RekapDokumen,
} from '@/services/adminRekapDataService';
import { createDokumenKerjasama, dataUrlToBlob, deleteDokumenKerjasamaById, fetchRekapDokumenFromApi, mapJenisToApi, mapStatusToApi, updateDokumenKerjasamaById, updatePengajuanNamaMitra, uploadDokumenFile } from '@/services/dokumenKerjasamaApiService';
import { exportToExcel } from '@/lib/exportExcel';
import { getMasterUnitProdi } from '@/services/masterUnitProdiService';
import { upsertMasterMitraByName } from '@/services/masterMitraService';
import { generateNoDokumen } from '@/services/adminMonitoringService';
import { getRenewalRequests, type RenewalRequestItem } from '@/services/adminRenewalRequestService';
import { getPageNumbers } from '@/lib/pagination';

// Cari id master_unit_prodi berdasarkan nama jurusan/unit yang dipilih di form.
async function resolveUnitProdiId(unitName: string): Promise<number | null> {
  const [jurusanRows, unitRows] = await Promise.all([
    getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'jurusan', aktif: true }),
    getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'unit_kerja', aktif: true }),
  ]);
  const match = [...jurusanRows, ...unitRows].find((u) => u.nama === unitName);
  return match?.id ?? null;
}

// Kode Perusahaan harus selalu mengikuti Data Kemitraan (master_mitra) lewat mitra_id.
// Jika mitra sudah dipilih dari autocomplete, pakai id-nya langsung. Jika nama diketik manual
// dan belum terdaftar, daftarkan/pakai record master_mitra yang cocok agar tetap konsisten.
async function resolveMitraId(data: DokumenData): Promise<number | undefined> {
  if (typeof data.mitraId === 'number') {
    return data.mitraId;
  }

  const namaMitra = data.namaMitra.trim();
  if (!namaMitra) {
    return undefined;
  }

  try {
    const mitra = await upsertMasterMitraByName(namaMitra, { kategoriMitra: data.kategoriMitra || null });
    return mitra.id;
  } catch {
    return undefined;
  }
}

export default function RekapDataPage() {
  const router = useRouter();
  const [rekapData, setRekapData] = useState<RekapDokumen[]>([]);
  const [search, setSearch] = useState('');
  const [filterJenis, setFilterJenis] = useState('Semua Jenis');
  const [filterUnit, setFilterUnit] = useState('Semua Jurusan/unit');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterTahun, setFilterTahun] = useState<string | null>(null);
  const [filterJenisMitra, setFilterJenisMitra] = useState('Semua Jenis Mitra');
  const [filterTingkatPerusahaan, setFilterTingkatPerusahaan] = useState('Semua Tingkat Perusahaan');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [isTambahModalOpen, setIsTambahModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<RekapDokumen | null>(null);
  const [editingItem, setEditingItem] = useState<RekapDokumen | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<RekapDokumen | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<{ title: string; message: string } | null>(null);
  const [masterUnitOptions, setMasterUnitOptions] = useState<string[]>([]);
  const [renewalHistory, setRenewalHistory] = useState<RenewalRequestItem[]>([]);
  const [isEditingManfaat, setIsEditingManfaat] = useState(false);
  const [manfaatDraft, setManfaatDraft] = useState('');
  const [savingManfaat, setSavingManfaat] = useState(false);
  const [isEditingFollowUp, setIsEditingFollowUp] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const detailItemRef = useRef<RekapDokumen | null>(null);
  useEffect(() => {
    detailItemRef.current = detailItem;
    setIsEditingManfaat(false);
    setManfaatDraft('');
    setIsEditingFollowUp(false);
    setFollowUpDraft('');
  }, [detailItem]);


  useEffect(() => {
    let mounted = true;

    const loadFromApi = async () => {
      try {
        // Jangan pakai cache/localStorage agar angka rekap tidak berubah-ubah saat sidebar diklik.
        // fetch ini harus cepat, tapi tetap async; UI dipegang tetap sampai data datang.
        const rows = await fetchRekapDokumenFromApi({ forceRefresh: true });
        if (mounted) {
          setRekapData(rows);
        }
      } catch (err) {
        console.error('Failed to load rekap dokumen from API:', err);
        if (mounted) {
          // fallback: biarkan state lama (nggak kosongin) supaya UI tidak “kedip”
          // jika sebelumnya sudah terisi dari page mount.
        }
      }
    };

    void loadFromApi();

    return () => {
      mounted = false;
    };
  }, []);

  // Re-fetch when perpanjangan approval dispatches the event
  useEffect(() => {
    const handler = async () => {
      try {
        const rows = await fetchRekapDokumenFromApi({ forceRefresh: true });
        setRekapData(rows);
        setDetailItem((prev) => {
          if (!prev) return null;
          const fresh = rows.find((r) => r.id === prev.id || r.noDokumen === prev.noDokumen);
          return fresh ?? prev;
        });
        // Refresh renewalHistory for the currently open item (ID unchanged, so its useEffect won't re-run)
        const currentId = detailItemRef.current?.id;
        if (currentId) {
          getRenewalRequests()
            .then((all) => setRenewalHistory(all.filter((r) => r.kerjasamaId === currentId && r.status === 'disetujui')))
            .catch(() => {});
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('rekap-data-updated', handler);
    return () => window.removeEventListener('rekap-data-updated', handler);
  }, []);

  // Load perpanjangan history when detail modal opens
  useEffect(() => {
    if (!detailItem?.id) {
      setRenewalHistory([]);
      return;
    }
    const targetId = detailItem.id;
    getRenewalRequests()
      .then((all) => setRenewalHistory(all.filter((r) => r.kerjasamaId === targetId && r.status === 'disetujui')))
      .catch(() => setRenewalHistory([]));
  }, [detailItem?.id]);

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

        const mergedFromMaster = Array.from(
          new Set(
            [...jurusanRows, ...unitRows, ...prodiRows].map((item) => item.nama).filter(Boolean)
          )
        );

        setMasterUnitOptions(mergedFromMaster);
      } catch {
        // fallback tetap dari service lokal bila API belum siap.
      }
    }

    loadMasterUnitOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  const jenisOptions = getRekapJenisOptions(rekapData);
  const unitOptions = useMemo(() => {
    const localOptions = getRekapUnitOptions(rekapData);
    const merged = Array.from(new Set([...localOptions, ...masterUnitOptions]));

    if (!merged.includes('Semua Jurusan/unit')) {
      return ['Semua Jurusan/unit', ...merged];
    }

    return merged;
  }, [rekapData, masterUnitOptions]);
  const statusOptions = rekapStatusOptions;
  const jenisMitraOptions = useMemo(() => getRekapJenisMitraOptions(rekapData), [rekapData]);
  const tingkatPerusahaanOptions = useMemo(() => getRekapTingkatPerusahaanOptions(rekapData), [rekapData]);
  const availableYears = useMemo(() => getAvailableYears(rekapData), [rekapData]);
  const currentYear = new Date().getFullYear();
  const defaultYearRangeStart = Math.min(currentYear - 4, availableYears[0] ?? currentYear);
  const [yearRangeStart, setYearRangeStart] = useState(defaultYearRangeStart);
  const yearGrid = Array.from({ length: 12 }, (_, index) => yearRangeStart + index);

  const filteredBase = filterRekapData(rekapData, {
    filterJenis,
    filterUnit,
    filterStatus,
    filterTahun,
    filterJenisMitra,
    filterTingkatPerusahaan,
    search,
  });
  const filteredRows = sortOrder === 'oldest' ? [...filteredBase].reverse() : filteredBase;

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * itemsPerPage;
  const paginatedRows = filteredRows.slice(pageStartIndex, pageStartIndex + itemsPerPage);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterJenis, filterUnit, filterStatus, filterTahun, filterJenisMitra, filterTingkatPerusahaan, sortOrder]);

  const { totalKerjasama, totalAktif, totalAkanBerakhir, totalKadaluarsa } = getRekapStats(rekapData);

  const handleExportExcel = () => {
    const headers = ['No', 'No Dokumen', 'Nama Mitra', 'Kode Perusahaan', 'Jenis', 'Jenis Mitra', 'Tingkat Perusahaan', 'Jurusan / Unit', 'Tanggal Mulai', 'Berlaku Hingga', 'Status', 'Manfaat Kerja Sama'];
    const rows = filteredRows.map((row, index) => [
      index + 1,
      row.noDokumen,
      row.namaMitra,
      row.kodePerusahaan || '',
      row.jenis,
      row.jenisMitra || '',
      row.tingkatPerusahaan || '',
      row.unit,
      row.tanggalMulai,
      row.berlakuHingga,
      row.status,
      row.manfaatKerjasama || '',
    ]);
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportToExcel(headers, rows, `rekap-data-${dateStamp}.xlsx`, 'Rekap Data dan Monitoring');
  };

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const validIds = filteredRows.map((r) => r.id).filter((id): id is number => typeof id === 'number');
    if (selectedIds.size === validIds.length && validIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(validIds));
    }
  }

  async function confirmBulkDelete() {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => deleteDokumenKerjasamaById(id)));
    } catch {
      // lanjut hapus lokal meski sebagian API gagal
    }
    for (const row of filteredRows) {
      if (typeof row.id === 'number' && ids.includes(row.id)) {
        deleteRekapDokumen(row.noDokumen);
      }
    }
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
    try {
      const rows = await fetchRekapDokumenFromApi({ forceRefresh: true });
      setRekapData(rows);
    } catch {
      setRekapData((prev) => prev.filter((r) => typeof r.id !== 'number' || !ids.includes(r.id)));
    }
    setFeedbackModal({ title: 'Berhasil Dihapus', message: `${ids.length} dokumen berhasil dihapus.` });
  }

  function handleDelete(item: RekapDokumen) {
    setDeleteCandidate(item);
  }

  async function confirmDelete() {
    if (!deleteCandidate) {
      return;
    }

    const candidate = deleteCandidate;

    try {
      if (typeof candidate.id === 'number') {
        await deleteDokumenKerjasamaById(candidate.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghapus data di server.';
      setFeedbackModal({
        title: 'Gagal Menghapus Dokumen',
        message,
      });
      return;
    }

    deleteRekapDokumen(candidate.noDokumen);
    if (detailItem?.noDokumen === candidate.noDokumen) {
      setDetailItem(null);
    }
    setDeleteCandidate(null);

    if (typeof candidate.id === 'number') {
      try {
        const rows = await fetchRekapDokumenFromApi({ forceRefresh: true });
        setRekapData(rows);
      } catch {
        // Keep optimistic local state when refresh fails.
      }
    }

    setFeedbackModal({
      title: 'Dokumen Berhasil Dihapus',
      message: `Dokumen ${candidate.noDokumen} berhasil dihapus dari rekap data.`,
    });
  }

  const handleSaveManfaat = async () => {
    if (!detailItem?.id) return;
    setSavingManfaat(true);
    try {
      await updateDokumenKerjasamaById(detailItem.id, { keterangan: manfaatDraft.trim() || null });
      const updated = { ...detailItem, manfaatKerjasama: manfaatDraft.trim() || undefined };
      setDetailItem(updated);
      setRekapData((prev) => prev.map((r) => r.id === detailItem.id ? updated : r));
      setIsEditingManfaat(false);
    } finally {
      setSavingManfaat(false);
    }
  };

  const handleSaveFollowUp = async () => {
    if (!detailItem?.id) return;
    setSavingFollowUp(true);
    try {
      await updateDokumenKerjasamaById(detailItem.id, { follow_up: followUpDraft.trim() || null });
      const updated = { ...detailItem, followUp: followUpDraft.trim() || undefined };
      setDetailItem(updated);
      setRekapData((prev) => prev.map((r) => r.id === detailItem.id ? updated : r));
      setIsEditingFollowUp(false);
    } finally {
      setSavingFollowUp(false);
    }
  };

  const downloadDokumen = async (url: string, fileName: string) => {
    if (!url) {
      return;
    }

    if (url.startsWith('data:')) {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="page-title">Rekap Data dan Monitoring</h1>
          <p className="page-subtitle mt-0.5">Daftar seluruh dokumen kerjasama yang terdaftar di sistem</p>
        </div>
        <button
          type="button"
          onClick={() => setIsTambahModalOpen(true)}
          className="btn-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-semibold shadow-sm"
        >
          <Plus size={16} />
          Tambah Dokumen
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatCard title="Total Kerjasama" value={totalKerjasama} caption="Semua dokumen" valueClassName="text-gray-900" />
        <StatCard title="Aktif" value={totalAktif} caption="Masa berlaku > 3 bulan" valueClassName="text-green-600" />
        <StatCard
          title="Akan Berakhir"
          value={totalAkanBerakhir}
          caption="Masa berlaku < 3 bulan"
          valueClassName="text-orange-600"
        />
        <StatCard title="Kadaluarsa" value={totalKadaluarsa} caption="Sudah berakhir" valueClassName="text-red-600" />
      </div>

      <section className="toolbar-shell p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-gray-800">
              <Filter size={15} />
              Filter:
            </span>

            <select
              value={filterJenis}
              onChange={(event) => setFilterJenis(event.target.value)}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {jenisOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={filterUnit}
              onChange={(event) => setFilterUnit(event.target.value)}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {unitOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={filterJenisMitra}
              onChange={(event) => setFilterJenisMitra(event.target.value)}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {jenisMitraOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={filterTingkatPerusahaan}
              onChange={(event) => setFilterTingkatPerusahaan(event.target.value)}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {tingkatPerusahaanOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <div className="relative">
              <button
                type="button"
                onClick={() => setYearPickerOpen((prev) => !prev)}
                className="input-field inline-flex min-w-[150px] items-center justify-between gap-2 px-3 py-2 text-[12px] text-gray-700 transition-colors"
              >
                <span>{filterTahun ?? 'Pilih Tahun'}</span>
                <CalendarDays size={16} className="text-gray-500" />
              </button>

              {yearPickerOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[280px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setYearRangeStart((prev) => prev - 12)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <p className="text-[12px] font-semibold text-gray-800">
                      {yearRangeStart} - {yearRangeStart + 11}
                    </p>
                    <button
                      type="button"
                      onClick={() => setYearRangeStart((prev) => prev + 12)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {yearGrid.map((year) => {
                      const isSelected = String(year) === filterTahun;
                      const hasData = availableYears.includes(year);

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
                              ? 'border-[#1E376C] bg-[#1E376C] text-white'
                              : hasData
                                ? 'border-gray-200 bg-white text-gray-800 hover:border-[#1E376C] hover:text-[#1E376C]'
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
                        setFilterTahun(null);
                        setYearPickerOpen(false);
                      }}
                      className="text-[10px] font-semibold text-[#1E376C] transition-colors hover:text-[#2B4A93]"
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
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              <option value="newest">Terbaru ke Terlama</option>
              <option value="oldest">Terlama ke Terbaru</option>
            </select>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative w-full">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari berdasarkan nama mitra"
                className="input-field h-10 w-full pl-10 pr-3 text-[12px] text-gray-700 placeholder:text-gray-400"
              />
            </label>

            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-[12px] font-semibold text-white hover:bg-red-700"
                >
                  <Trash2 size={14} />
                  Hapus ({selectedIds.size})
                </button>
              )}
              <button
                type="button"
                onClick={handleExportExcel}
                className="btn-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-[12px] font-semibold"
              >
                <Upload size={14} />
                Export Excel
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-[1340px] w-full border-collapse">
            <thead>
              <tr className="table-head border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                <th className="px-4 py-3">
                  <button type="button" onClick={toggleSelectAll} className="text-gray-500 hover:text-[#1E376C]">
                    {selectedIds.size > 0 && selectedIds.size === filteredRows.filter((r) => typeof r.id === 'number').length
                      ? <CheckSquare size={16} className="text-[#1E376C]" />
                      : <Square size={16} />}
                  </button>
                </th>
                <th className="px-4 py-3">No.Dokumen</th>
                <th className="px-4 py-3">Nama Mitra</th>
                <th className="px-4 py-3">Kode Perusahaan</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Jenis Mitra</th>
                <th className="px-4 py-3">Tingkat Perusahaan</th>
                <th className="px-4 py-3">Jurusan / Unit</th>
                <th className="px-4 py-3">Tanggal mulai</th>
                <th className="px-4 py-3">Berlaku Hingga</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Manfaat Kerja Sama</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr key="empty">
                  <td colSpan={12} className="px-4 py-10 text-center text-[12px] text-gray-500">
                    Data tidak ditemukan berdasarkan filter saat ini.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => {
                  const isSelected = typeof row.id === 'number' && selectedIds.has(row.id);
                  return (
                  <tr
                    key={`${row.noDokumen}-${row.namaMitra}-${row.tanggalMulai}-${index}`}
                    className={`border-b border-gray-100 text-[12px] text-gray-700 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50/60'}`}
                  >
                    <td className="px-4 py-3">
                      {typeof row.id === 'number' && (
                        <button type="button" onClick={() => toggleSelect(row.id as number)} className="text-gray-400 hover:text-[#1E376C]">
                          {isSelected ? <CheckSquare size={16} className="text-[#1E376C]" /> : <Square size={16} />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-gray-600">{row.noDokumen}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.namaMitra}</td>
                    <td className="px-4 py-3 text-[10px] text-gray-600">{row.kodePerusahaan || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${rekapJenisBadgeMap[row.jenis]}`}>{row.jenis}</span>
                    </td>
                    <td className="px-4 py-3">{row.jenisMitra || '-'}</td>
                    <td className="px-4 py-3">{row.tingkatPerusahaan || '-'}</td>
                    <td className="px-4 py-3">{row.unit}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.tanggalMulai}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.berlakuHingga}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${rekapStatusBadgeMap[row.status]}`}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <p className="text-[10px] text-gray-600 line-clamp-2">{row.manfaatKerjasama || '-'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setDetailItem(row)}
                          className="text-[#1E376C] transition-colors hover:text-[#2B4A93]"
                          title="Lihat detail"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="text-red-500 transition-colors hover:text-red-700"
                          title="Hapus dokumen"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingItem(row)}
                          className="text-green-600 transition-colors hover:text-green-700"
                          title="Edit dokumen"
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredRows.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-gray-500">
              Menampilkan <span className="font-semibold text-gray-700">{pageStartIndex + 1}–{Math.min(pageStartIndex + itemsPerPage, filteredRows.length)}</span> dari{' '}
              <span className="font-semibold text-gray-700">{filteredRows.length}</span> dokumen
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
      </section>

      {detailItem && (() => {
        const statusBadge: Record<string, { bg: string; text: string; icon: ReturnType<typeof CheckCircle2> }> = {
          'Aktif': { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle2 size={13} /> },
          'Akan Berakhir': { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Clock size={13} /> },
          'Kadaluarsa': { bg: 'bg-rose-100', text: 'text-rose-700', icon: <XCircle size={13} /> },
        };
        const jenisBadge: Record<string, string> = {
          MoU: 'bg-violet-600 text-white',
          MoA: 'bg-sky-600 text-white',
          IA: 'bg-teal-600 text-white',
        };
        const sb = statusBadge[detailItem.status] || statusBadge['Aktif'];
        return (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex-shrink-0 flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-[#1E376C] to-[#2B4A93] px-6 pt-5 pb-5 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${jenisBadge[detailItem.jenis] || 'bg-white/20 text-white'}`}>
                    {detailItem.jenis}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${sb.bg} ${sb.text}`}>
                    {sb.icon}
                    {detailItem.status}
                  </span>
                </div>
                <h2 className="text-[15px] font-bold text-white leading-tight">{detailItem.namaMitra}</h2>
                <p className="text-[10px] text-blue-200 mt-0.5">{detailItem.noDokumen}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* Info utama */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <Hash size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">No. Dokumen</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.noDokumen}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <FileText size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Jenis Dokumen</p>
                    <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${jenisBadge[detailItem.jenis] || 'bg-gray-200 text-gray-700'}`}>
                      {detailItem.jenis}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <Building2 size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Nama Mitra</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.namaMitra}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <User size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Jurusan / Unit</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.unit}</p>
                    {detailItem.kategoriUnit && (
                      <p className="text-[10.5px] text-gray-500">{detailItem.kategoriUnit}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Periode */}
              <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays size={14} className="text-[#1E376C]" />
                  <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Periode Kerjasama</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-[12px]">
                  <div>
                    <p className="text-[10.5px] text-gray-500">Tanggal Mulai</p>
                    <p className="font-semibold text-gray-800">{detailItem.tanggalMulai || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10.5px] text-gray-500">Berlaku Hingga</p>
                    <p className="font-semibold text-gray-800">{detailItem.berlakuHingga || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10.5px] text-gray-500">Tahun</p>
                    <p className="font-semibold text-gray-800">{detailItem.tahun || '-'}</p>
                  </div>
                </div>
                {detailItem.ruangLingkup && detailItem.ruangLingkup.length > 0 && (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <p className="text-[10.5px] text-gray-500 mb-1">Ruang Lingkup</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailItem.ruangLingkup.map((rl, i) => (
                        <span key={i} className="rounded-full bg-[#1E376C]/10 px-2.5 py-0.5 text-[10.5px] font-medium text-[#1E376C]">
                          {rl}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Kontak */}
              {detailItem.whatsappNumber && detailItem.whatsappNumber !== '-' && (
                <div className="flex items-start gap-3 rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                  <Phone size={15} className="mt-0.5 shrink-0 text-green-600" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">WhatsApp</p>
                    <a
                      href={`https://wa.me/${detailItem.whatsappNumber.replace(/[^\d]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-green-700 underline hover:text-green-800"
                    >
                      {detailItem.whatsappNumber}
                    </a>
                  </div>
                </div>
              )}

              {/* Manfaat Kerja Sama */}
              <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Manfaat Kerja Sama</p>
                  {!isEditingManfaat && detailItem.id && (
                    <button
                      type="button"
                      onClick={() => { setManfaatDraft(detailItem.manfaatKerjasama || ''); setIsEditingManfaat(true); }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[#1E376C] hover:bg-[#1E376C]/10 transition-colors"
                    >
                      <Pencil size={11} />
                      Edit
                    </button>
                  )}
                </div>
                {isEditingManfaat ? (
                  <div className="space-y-2">
                    <textarea
                      value={manfaatDraft}
                      onChange={(e) => setManfaatDraft(e.target.value)}
                      maxLength={100}
                      rows={3}
                      className="input-field w-full rounded-lg px-3 py-2 text-[12px]"
                      placeholder="Jelaskan manfaat kerja sama"
                    />
                    <p className={`text-right text-[10px] ${manfaatDraft.length >= 100 ? 'text-red-500' : 'text-gray-400'}`}>{manfaatDraft.length}/100</p>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setIsEditingManfaat(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50">Batal</button>
                      <button type="button" onClick={handleSaveManfaat} disabled={savingManfaat} className="rounded-lg bg-[#1E376C] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2B4A93] disabled:opacity-60">
                        {savingManfaat ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-700">{detailItem.manfaatKerjasama || <span className="italic text-gray-400">Belum diisi</span>}</p>
                )}
              </div>

              {/* Follow Up */}
              <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Follow Up</p>
                  {!isEditingFollowUp && detailItem.id && (
                    <button
                      type="button"
                      onClick={() => { setFollowUpDraft(detailItem.followUp || ''); setIsEditingFollowUp(true); }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[#1E376C] hover:bg-[#1E376C]/10 transition-colors"
                    >
                      <Pencil size={11} />
                      Edit
                    </button>
                  )}
                </div>
                {isEditingFollowUp ? (
                  <div className="space-y-2">
                    <textarea
                      value={followUpDraft}
                      onChange={(e) => setFollowUpDraft(e.target.value)}
                      maxLength={500}
                      rows={3}
                      className="input-field w-full rounded-lg px-3 py-2 text-[12px]"
                      placeholder="Catatan follow up kerja sama"
                    />
                    <p className={`text-right text-[10px] ${followUpDraft.length >= 500 ? 'text-red-500' : 'text-gray-400'}`}>{followUpDraft.length}/500</p>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setIsEditingFollowUp(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50">Batal</button>
                      <button type="button" onClick={handleSaveFollowUp} disabled={savingFollowUp} className="rounded-lg bg-[#1E376C] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2B4A93] disabled:opacity-60">
                        {savingFollowUp ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-700">{detailItem.followUp || <span className="italic text-gray-400">Belum diisi</span>}</p>
                )}
              </div>

              {/* Dokumen */}
              <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip size={14} className="text-[#1E376C]" />
                  <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Dokumen Kerjasama</p>
                </div>
                {detailItem.dokumenTerkait?.length ? (
                  <div className="space-y-2">
                    {detailItem.dokumenTerkait.map((doc, idx) => (
                      <div key={`${doc.nama}-${doc.tanggal}-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1E376C]/10">
                            <FileText size={14} className="text-[#1E376C]" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-semibold text-gray-800">{doc.nama}</p>
                            <p className="text-[10.5px] text-gray-400">{doc.ukuran} · {doc.tanggal}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { void downloadDokumen(doc.url, doc.nama); }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1E376C] px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-[#2B4A93] transition-colors"
                        >
                          <Download size={12} />
                          Unduh
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-500">Belum ada dokumen yang diunggah.</p>
                )}
              </div>

              {/* Riwayat Perpanjangan */}
              {renewalHistory.length > 0 && (
                <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                  <div className="flex items-center gap-2 mb-3">
                    <RefreshCw size={14} className="text-green-700" />
                    <p className="text-[10px] font-semibold text-green-800 uppercase tracking-wide">Riwayat Perpanjangan</p>
                  </div>
                  <div className="space-y-2">
                    {renewalHistory.map((r) => (
                      <div key={r.id} className="rounded-lg border border-green-200 bg-white px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold text-gray-800">
                              Periode: {r.tanggalMulaiBaru} — {r.tanggalBerakhirBaru}
                            </p>
                            {r.ruangLingkup && r.ruangLingkup.length > 0 && (
                              <p className="mt-0.5 text-[10.5px] text-gray-600">Ruang Lingkup: {r.ruangLingkup.join(', ')}</p>
                            )}
                            {r.catatan && (
                              <p className="mt-0.5 text-[10.5px] text-gray-500 leading-snug">{r.catatan}</p>
                            )}
                            {r.buktiPerpanjanganUrl && (
                              <a
                                href={r.buktiPerpanjanganUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-600 hover:underline"
                              >
                                <FileText size={11} />
                                Lihat Dokumen
                              </a>
                            )}
                          </div>
                          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[9.5px] font-semibold text-green-700">
                            Disetujui
                          </span>
                        </div>
                        {r.decidedAt && (
                          <p className="mt-1 text-[9.5px] text-gray-400">Disetujui {r.decidedAt}{r.decidedBy ? ` oleh ${r.decidedBy}` : ''}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lihat Story */}
              {detailItem.sourcePengajuanId && (
                <div className="border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setDetailItem(null);
                      router.push(`/admin/story_aktivitas/${detailItem.sourcePengajuanId}`);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1E376C] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#2B4A93] transition-colors"
                  >
                    <Activity size={15} />
                    Lihat Story Aktivitas
                  </button>
                </div>
              )}
            </div>{/* end scrollable body */}
          </div>
        </div>
        );
      })()}

      <TambahDokumenModal
        isOpen={isTambahModalOpen}
        onClose={() => setIsTambahModalOpen(false)}
        title="+ Tambah Dokumen Baru"
        submitLabel="Tambah Dokumen"
        onSubmit={async (data: DokumenData) => {
          try {
            const unitProdiId = await resolveUnitProdiId(data.unitKerja);
            if (!unitProdiId) {
              setFeedbackModal({
                title: 'Gagal Menambahkan Dokumen',
                message: 'Jurusan/unit yang dipilih tidak ditemukan di Master Unit/Prodi. Silakan pilih ulang.',
              });
              return;
            }

            // Kode Perusahaan mengikuti Data Kemitraan lewat mitra_id — tidak dikirim manual.
            const mitraId = await resolveMitraId(data);

            // Nomor dokumen dari modal dihitung dari localStorage (tidak lagi terisi sejak
            // create langsung ke backend), jadi generate ulang dari data rekap asli agar unik.
            const nomorDokumen = generateNoDokumen({
              urutan: rekapData.length + 1,
              jenis: data.jenisDokumen as 'MoU' | 'MoA' | 'IA',
              tanggal: data.tanggalMulai,
              unitName: data.unitKerja,
            });

            const created = await createDokumenKerjasama({
              nomor_dokumen: nomorDokumen,
              nama_dokumen: `Dokumen ${nomorDokumen}`,
              jenis_dokumen: mapJenisToApi(data.jenisDokumen),
              unit_prodi_id: unitProdiId,
              mitra_id: mitraId ?? null,
              tanggal_mulai: data.tanggalMulai || null,
              tanggal_berakhir: data.tanggalBerakhir || null,
              status_siklus: mapStatusToApi(data.status),
              keterangan: data.manfaatKerjasama || null,
            });

            const newDoc = data.dokumenTerkait?.[0];
            if (newDoc?.url?.startsWith('data:')) {
              const blob = dataUrlToBlob(newDoc.url);
              await uploadDokumenFile(created.id, blob, newDoc.nama);
            }

            setIsTambahModalOpen(false);

            const rows = await fetchRekapDokumenFromApi({ forceRefresh: true });
            setRekapData(rows);

            setFeedbackModal({
              title: 'Dokumen Berhasil Ditambahkan',
              message: `Dokumen "${data.namaMitra}" berhasil ditambahkan ke rekap data.`,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menambahkan dokumen ke server.';
            setFeedbackModal({
              title: 'Gagal Menambahkan Dokumen',
              message,
            });
          }
        }}
      />

      <TambahDokumenModal
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        initialData={editingItem ? createDokumenFormData(editingItem) : null}
        title="Edit Dokumen"
        submitLabel="Simpan Perubahan"
        onSubmit={async (data: DokumenData) => {
          if (!editingItem) {
            return;
          }

          // Optimistic update sementara menunggu API selesai
          setRekapData((prev) => prev.map((r) =>
            r.noDokumen === editingItem.noDokumen
              ? {
                  ...r,
                  namaMitra: data.namaMitra,
                  mitraId: data.mitraId,
                  kodePerusahaan: data.kodePerusahaan,
                  jenis: data.jenisDokumen as 'MoU' | 'MoA' | 'IA',
                  unit: data.unitKerja,
                  tanggalMulai: data.tanggalMulai || r.tanggalMulai,
                  berlakuHingga: data.tanggalBerakhir || r.berlakuHingga,
                  status: data.status as 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa',
                  noDokumen: data.nomorDokumen || r.noDokumen,
                }
              : r
          ));
          setEditingItem(null);

          try {
            const promises: Promise<void>[] = [];

            if (typeof editingItem.id === 'number') {
              const apiPayload: Parameters<typeof updateDokumenKerjasamaById>[1] = {
                nomor_dokumen: data.nomorDokumen || undefined,
                jenis_dokumen: mapJenisToApi(data.jenisDokumen),
                tanggal_mulai: data.tanggalMulai || null,
                tanggal_berakhir: data.tanggalBerakhir || null,
                status_siklus: mapStatusToApi(data.status),
                // Kode Perusahaan mengikuti master_mitra lewat relasi mitra_id — tidak dikirim manual.
                mitra_id: typeof data.mitraId === 'number' ? data.mitraId : null,
              };
              promises.push(updateDokumenKerjasamaById(editingItem.id, apiPayload));
            }

            if (typeof editingItem.sourcePengajuanId === 'number' && data.namaMitra && data.namaMitra !== editingItem.namaMitra) {
              promises.push(updatePengajuanNamaMitra(editingItem.sourcePengajuanId, data.namaMitra));
            }

            await Promise.all(promises);

            // Upload file baru jika user memilih "Ganti Dokumen"
            const newDoc = data.dokumenTerkait?.[0];
            if (typeof editingItem.id === 'number' && newDoc?.url?.startsWith('data:')) {
              const blob = dataUrlToBlob(newDoc.url);
              await uploadDokumenFile(editingItem.id, blob, newDoc.nama);
            }

            // Refresh dari API agar data konsisten
            const rows = await fetchRekapDokumenFromApi({ forceRefresh: true });
            setRekapData(rows);

            setFeedbackModal({
              title: 'Perubahan Berhasil Disimpan',
              message: `Dokumen "${data.namaMitra}" berhasil diperbarui.`,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menyimpan perubahan ke server.';
            setFeedbackModal({
              title: 'Gagal Menyimpan Perubahan',
              message,
            });
          }
        }}
      />

      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-[15px] font-bold text-gray-900">Hapus {selectedIds.size} Dokumen</h3>
            <p className="mt-2 text-[12px] text-gray-600">
              Yakin ingin menghapus <span className="font-semibold">{selectedIds.size} dokumen</span> yang dipilih? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowBulkDeleteConfirm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50">Batal</button>
              <button type="button" onClick={confirmBulkDelete} className="rounded-lg bg-red-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-red-700">Ya, Hapus Semua</button>
            </div>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-[15px] font-bold text-gray-900">Konfirmasi Hapus</h3>
            <p className="mt-2 text-[12px] text-gray-600">
              Yakin ingin menghapus dokumen <span className="font-semibold text-gray-900">{deleteCandidate.noDokumen}</span>?
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-red-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-[15px] font-bold text-[#1E376C]">{feedbackModal.title}</h3>
            <p className="mt-2 text-[12px] text-gray-600">{feedbackModal.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setFeedbackModal(null)}
                className="rounded-lg bg-[#1E376C] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#2B4A93]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
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
