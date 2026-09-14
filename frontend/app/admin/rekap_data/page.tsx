'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Filter, Pencil, Plus, Search, Trash2, Upload, Eye, Building2, FileText, Hash, Phone, User, CheckCircle2, Clock, XCircle, Download, Paperclip, RefreshCw, CheckSquare, Square, Tag, MapPin, Globe2, Target, Timer, ListChecks } from 'lucide-react';
import TambahDokumenModal from './TambahDokumenModal';
import MonevTriwulanSection from './MonevTriwulanSection';
import GroupedFilterSelect from '@/components/GroupedFilterSelect';
import FileDownloadLink from '@/components/FileDownloadLink';
import { downloadFileWithAuth } from '@/lib/api';
import {
  createDokumenFormData,
  deleteRekapDokumen,
  filterRekapData,
  getAvailableYears,
  getRekapJenisMitraOptions,
  getRekapJenisOptions,
  getRekapRuangLingkupOptions,
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
import { updateMasterMitra, upsertMasterMitraByName } from '@/services/masterMitraService';
import { generateNoDokumen } from '@/services/adminMonitoringService';
import { getRenewalRequests, type RenewalRequestItem } from '@/services/adminRenewalRequestService';
import { getPageNumbers } from '@/lib/pagination';

//ini helper untuk resolve unit/prodi ID dari nama unit/prodi yang diketik manual di modal Tambah/Edit Dokumen
async function resolveUnitProdiId(unitName: string, prodiId?: number | null): Promise<number | null> {
  if (prodiId) {
    return prodiId;
  }

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
  // Alamat & PIC ikut disinkronkan juga — sebelumnya cuma kategori/bidang usaha/tingkat
  // yang tersimpan dari modal ini, jadi Alamat Mitra dan PIC di Rekap Data selalu kosong.
  const mitraExtra = {
    alamat: data.alamatMitra?.trim() || undefined,
    whatsapp_mitra: data.whatsappMitra?.trim() || undefined,
    no_telepon_mitra: data.noTeleponMitra?.trim() || undefined,
    email_mitra: data.emailMitra?.trim() || undefined,
    nama_kontak_utama: data.namaPIC?.trim() || undefined,
    jabatan_kontak_utama: data.jabatanMitra?.trim() || undefined,
    negara: data.negara?.trim() || undefined,
  };

  if (typeof data.mitraId === 'number') {
    // Mitra sudah dipilih dari daftar — tetap sinkronkan kategori/bidang usaha/tingkat
    // yang mungkin diubah admin di modal ini ke record master_mitra-nya.
    try {
      await updateMasterMitra(data.mitraId, {
        kategori_mitra: data.kategoriMitra || null,
        bidang_usaha: data.bidangUsaha || null,
        tingkat_perusahaan: data.tingkatPerusahaan || null,
        ...mitraExtra,
      });
    } catch (err) {
      // Abaikan kalau gagal sinkron — mitra_id tetap dipakai apa adanya.
      console.error('Gagal sinkron data mitra ke Data Kemitraan:', err);
    }
    return data.mitraId;
  }

  const namaMitra = data.namaMitra.trim();
  if (!namaMitra) {
    return undefined;
  }

  try {
    const mitra = await upsertMasterMitraByName(namaMitra, {
      kategoriMitra: data.kategoriMitra || null,
      bidangUsaha: data.bidangUsaha || null,
      tingkatPerusahaan: data.tingkatPerusahaan || null,
      extra: mitraExtra,
    });
    return mitra.id;
  } catch (err) {
    console.error('Gagal sinkron data mitra ke Data Kemitraan:', err);
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
  const [filterRuangLingkup, setFilterRuangLingkup] = useState('Semua Ruang Lingkup');
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
  // Dipisah per kategori (Jurusan / Program Studi / Unit Kerja) supaya dropdown filter bisa
  // dikelompokkan pakai <optgroup>, sama seperti dropdown "Semua Unit" di landing page.
  const [masterJurusanOptions, setMasterJurusanOptions] = useState<string[]>([]);
  const [masterProdiOptions, setMasterProdiOptions] = useState<string[]>([]);
  const [masterUnitKerjaOptions, setMasterUnitKerjaOptions] = useState<string[]>([]);
  const [renewalHistory, setRenewalHistory] = useState<RenewalRequestItem[]>([]);
  const [isEditingManfaat, setIsEditingManfaat] = useState(false);
  const [manfaatDraft, setManfaatDraft] = useState('');
  const [savingManfaat, setSavingManfaat] = useState(false);
  const [isEditingFollowUp, setIsEditingFollowUp] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [isEditingLuaran, setIsEditingLuaran] = useState(false);
  const [luaranDraft, setLuaranDraft] = useState('');
  const [savingLuaran, setSavingLuaran] = useState(false);
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

        setMasterJurusanOptions(Array.from(new Set(jurusanRows.map((item) => item.nama).filter(Boolean))));
        setMasterUnitKerjaOptions(Array.from(new Set(unitRows.map((item) => item.nama).filter(Boolean))));
        setMasterProdiOptions(Array.from(new Set(prodiRows.map((item) => item.nama).filter(Boolean))));
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
  // Nama dari dokumen yang ter-load tapi tidak cocok ke Jurusan/Prodi/Unit Kerja aktif mana pun
  // (unit lama/nonaktif yang masih dipakai dokumen) — ditampilkan di grup "Lainnya" biar tetap
  // bisa difilter, bukan hilang begitu saja.
  const unitGroups = useMemo(() => {
    const docDerived = getRekapUnitOptions(rekapData).filter((o) => o !== 'Semua Jurusan/unit');
    const known = new Set([...masterJurusanOptions, ...masterProdiOptions, ...masterUnitKerjaOptions]);
    const lainnya = docDerived.filter((nama) => !known.has(nama));

    return {
      jurusan: masterJurusanOptions,
      prodi: masterProdiOptions,
      unit: masterUnitKerjaOptions,
      lainnya,
    };
  }, [rekapData, masterJurusanOptions, masterProdiOptions, masterUnitKerjaOptions]);
  const statusOptions = rekapStatusOptions;
  const jenisMitraOptions = useMemo(() => getRekapJenisMitraOptions(rekapData), [rekapData]);
  const tingkatPerusahaanOptions = useMemo(() => getRekapTingkatPerusahaanOptions(rekapData), [rekapData]);
  const ruangLingkupOptions = useMemo(() => getRekapRuangLingkupOptions(rekapData), [rekapData]);
  const availableYears = useMemo(() => getAvailableYears(rekapData), [rekapData]);
  const currentYear = new Date().getFullYear();
  const defaultYearRangeStart = Math.min(currentYear - 4, availableYears[0] ?? currentYear);
  const [yearRangeStart, setYearRangeStart] = useState(defaultYearRangeStart);
  // 24 tahun sekaligus (bukan 12) supaya rentang tahun yang bisa dipilih lebih panjang —
  // jangan sampai terkesan mentok di satu jangkauan pendek kayak "cuma sampai 2033".
  const YEAR_PICKER_SIZE = 24;
  const yearGrid = Array.from({ length: YEAR_PICKER_SIZE }, (_, index) => yearRangeStart + index);

  const filteredBase = filterRekapData(rekapData, {
    filterJenis,
    filterUnit,
    filterStatus,
    filterTahun,
    filterJenisMitra,
    filterTingkatPerusahaan,
    filterRuangLingkup,
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
  }, [search, filterJenis, filterUnit, filterStatus, filterTahun, filterJenisMitra, filterTingkatPerusahaan, filterRuangLingkup, sortOrder]);

  const { totalKerjasama, totalAktif, totalAkanBerakhir, totalKadaluarsa } = getRekapStats(rekapData);

  const handleExportExcel = () => {
    const headers = [
      'No',
      // Lembaga Mitra
      'Nama Mitra',
      'Bidang Usaha',
      'Alamat Mitra',
      'PIC Mitra',
      // Tingkat
      'Internasional',
      'Nasional',
      'Lokal/Wilayah',
      'Judul Kegiatan Kerja Sama',
      'Ruang Lingkup',
      'Manfaat bagi Polibatam/Prodi',
      'Luaran Kerja Sama',
      'Tanggal Awal Kerja Sama',
      'Tanggal Akhir Kerja Sama',
      'Durasi (dalam tahun)',
      // Jurusan / Unit
      'Jurusan',
      'Prodi',
      'Unit',
      'PIC Jurusan/Unit',
      // Hasil Monitoring
      'Triwulan 1 (Jan-Mar)',
      'Triwulan 2 (Apr-Jun)',
      'Triwulan 3 (Jul-Sep)',
      'Triwulan 4 (Okt-Des)',
      'Status Kerjasama',
      // Bukti Kerjasama
      'MoU',
      'MoA/PKS',
      'IA',
      'Laporan Kegiatan',
      
      'Link Bukti Kerjasama',
    ];
    const rows = filteredRows.map((row, index) => [
      index + 1,
      row.namaMitra,
      row.bidangUsaha || '',
      row.alamatMitra || '',
      row.picMitra || '',
      row.tingkatInternasional ? 'Ya' : '',
      row.tingkatNasional ? 'Ya' : '',
      row.tingkatLokal ? 'Ya' : '',
      row.judulKegiatan || row.noDokumen,
      (row.ruangLingkup && row.ruangLingkup.length > 0) ? row.ruangLingkup.join(', ') : '',
      row.manfaatSebenarnya || row.manfaatKerjasama || '',
      row.luaranKerjaSama || '',
      row.tanggalMulai,
      row.berlakuHingga,
      row.durasiTahun ?? '',
      row.jurusanNama || '',
      row.prodiNama || '',
      row.unitKerjaNama || '',
      row.picJurusanUnit || '',
      row.triwulan1 ? 'Ya' : '',
      row.triwulan2 ? 'Ya' : '',
      row.triwulan3 ? 'Ya' : '',
      row.triwulan4 ? 'Ya' : '',
      row.status,
      row.buktiMou || '',
      row.buktiMoaPks || '',
      row.buktiIa || '',
      (row.laporanKegiatanLinks && row.laporanKegiatanLinks.length > 0) ? row.laporanKegiatanLinks.join('; ') : '',
      row.keteranganAsli || '',
      (row.dokumenTerkait && row.dokumenTerkait.length > 0) ? row.dokumenTerkait[0].url : '',
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
    // Optimistik: buang semua baris terpilih dari tampilan sekarang juga.
    setRekapData((prev) => prev.filter((r) => typeof r.id !== 'number' || !ids.includes(r.id)));
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
    setFeedbackModal({ title: 'Berhasil Dihapus', message: `${ids.length} dokumen berhasil dihapus.` });

    // Sinkronisasi ulang dari server di latar belakang — jangan blokir tampilan sukses.
    void fetchRekapDokumenFromApi({ forceRefresh: true })
      .then((rows) => setRekapData(rows))
      .catch(() => {
        // pertahankan hasil optimistik kalau refresh gagal
      });
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

    // Optimistik: langsung buang baris dari tampilan tanpa nunggu fetch ulang ke server.
    setRekapData((prev) => prev.filter(
      (r) => r.noDokumen !== candidate.noDokumen
        && !(typeof candidate.id === 'number' && r.id === candidate.id),
    ));
    deleteRekapDokumen(candidate.noDokumen);
    if (detailItem?.noDokumen === candidate.noDokumen) {
      setDetailItem(null);
    }
    setDeleteCandidate(null);

    setFeedbackModal({
      title: 'Dokumen Berhasil Dihapus',
      message: `Dokumen ${candidate.noDokumen} berhasil dihapus dari rekap data.`,
    });
    // Sinkronisasi ulang dari server berjalan di latar belakang lewat event
    // 'rekap-data-updated' yang di-emit deleteRekapDokumen() — tidak perlu di-await di sini.
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

  const handleSaveLuaran = async () => {
    if (!detailItem?.id) return;
    setSavingLuaran(true);
    try {
      await updateDokumenKerjasamaById(detailItem.id, { luaran_kerja_sama: luaranDraft.trim() || null });
      const updated = { ...detailItem, luaranKerjaSama: luaranDraft.trim() || undefined };
      setDetailItem(updated);
      setRekapData((prev) => prev.map((r) => r.id === detailItem.id ? updated : r));
      setIsEditingLuaran(false);
    } finally {
      setSavingLuaran(false);
    }
  };

  const downloadDokumen = async (url: string, fileName: string, downloadUrl?: string | null) => {
    if (!url && !downloadUrl) {
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

    // Untuk berkas di storage server: WAJIB lewat endpoint API yang login (bukan <a download>
    // langsung ke URL storage) — atribut `download` HTML cuma dihormati browser untuk URL
    // same-origin, jadi kalau langsung ke URL storage (beda origin dari frontend), browser
    // abaikan nama filenya dan pakai nama acak hasil penyimpanan di server.
    if (downloadUrl) {
      try {
        await downloadFileWithAuth(downloadUrl, fileName);
        return;
      } catch {
        // lanjut ke fallback di bawah kalau gagal (mis. sesi habis)
      }
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

            <GroupedFilterSelect
              value={filterJenis}
              onChange={setFilterJenis}
              allLabel={jenisOptions[0]}
              groups={[{ label: '', options: jenisOptions.slice(1) }]}
            />

            <GroupedFilterSelect
              value={filterUnit}
              onChange={setFilterUnit}
              allLabel="Semua Jurusan/unit"
              groups={[
                { label: 'Jurusan', options: unitGroups.jurusan },
                { label: 'Program Studi', options: unitGroups.prodi },
                { label: 'Unit Kerja', options: unitGroups.unit },
                { label: 'Lainnya', options: unitGroups.lainnya },
              ]}
            />

            <GroupedFilterSelect
              value={filterStatus}
              onChange={setFilterStatus}
              allLabel={statusOptions[0]}
              groups={[{ label: '', options: statusOptions.slice(1) }]}
            />

            <GroupedFilterSelect
              value={filterJenisMitra}
              onChange={setFilterJenisMitra}
              allLabel={jenisMitraOptions[0]}
              groups={[{ label: '', options: jenisMitraOptions.slice(1) }]}
            />

            <GroupedFilterSelect
              value={filterTingkatPerusahaan}
              onChange={setFilterTingkatPerusahaan}
              allLabel={tingkatPerusahaanOptions[0]}
              groups={[{ label: '', options: tingkatPerusahaanOptions.slice(1) }]}
            />

            <GroupedFilterSelect
              value={filterRuangLingkup}
              onChange={setFilterRuangLingkup}
              allLabel={ruangLingkupOptions[0]}
              groups={[{ label: '', options: ruangLingkupOptions.slice(1) }]}
            />

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
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
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
                      const hasData = availableYears.includes(year);

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
                placeholder="Cari di semua kolom (nama mitra, judul, ruang lingkup, dll.)"
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
          <table className="min-w-[2650px] w-full border-collapse">
            <thead>
              <tr className="table-head border-b border-gray-200 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                <th rowSpan={2} className="px-4 py-3 align-middle">
                  <button type="button" onClick={toggleSelectAll} className="text-gray-500 hover:text-[#1E376C]">
                    {selectedIds.size > 0 && selectedIds.size === filteredRows.filter((r) => typeof r.id === 'number').length
                      ? <CheckSquare size={16} className="text-[#1E376C]" />
                      : <Square size={16} />}
                  </button>
                </th>
                <th rowSpan={2} className="px-4 py-3 align-middle">No. Dokumen</th>
                <th colSpan={5} className="px-4 py-2 border-b border-gray-200">Lembaga Mitra</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Tingkat Perusahaan</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Judul Kegiatan Kerja Sama</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Ruang Lingkup</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Manfaat bagi Polibatam/Prodi</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Luaran Kerja Sama</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Tanggal Awal Kerja Sama</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Tanggal Akhir Kerja Sama</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Durasi (tahun)</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Jurusan/Unit</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Status Kerjasama</th>
                <th rowSpan={2} className="px-4 py-3 align-middle">Jenis</th>
                
                <th rowSpan={2} className="px-4 py-3 align-middle">Aksi</th>
              </tr>
              <tr className="table-head border-b border-gray-200 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                {/* Lembaga Mitra */}
                <th className="px-4 py-2">Nama Mitra</th>
                <th className="px-4 py-2">Bidang Usaha</th>
                <th className="px-4 py-2">Alamat Mitra</th>
                <th className="px-4 py-2">PIC</th>
                <th className="px-4 py-2">Kode Perusahaan</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr key="empty">
                  <td colSpan={19} className="px-4 py-10 text-center text-[12px] text-gray-500">
                    Data tidak ditemukan berdasarkan filter saat ini.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => {
                  const isSelected = typeof row.id === 'number' && selectedIds.has(row.id);
                  // Jenis dokumen ditautkan ke file bukti kerja sama YANG BENAR-BENAR sudah diupload
                  // pada dokumen ini (dokumen_final/dokumen_perpanjangan) — bukan file acak, karena
                  // tiap dokumen_kerjasama cuma punya satu jenis_dokumen jadi filenya pasti sejenis.
                  const linkBukti = row.dokumenTerkait && row.dokumenTerkait.length > 0 ? row.dokumenTerkait[0].url : null;
                  const linkBuktiDownloadUrl = row.dokumenTerkait && row.dokumenTerkait.length > 0 ? row.dokumenTerkait[0].downloadUrl : null;
                  const linkBuktiNama = row.dokumenTerkait && row.dokumenTerkait.length > 0 ? row.dokumenTerkait[0].nama : null;
                  // Jurusan/Unit digabung jadi satu kolom: pilihan Jurusan -> "Jurusan / Prodi",
                  // pilihan Unit -> "Unit" saja. Detail PIC-nya ada di modal Lihat Detail.
                  const jurusanUnitDisplay = row.jurusanNama
                    ? `${row.jurusanNama}${row.prodiNama ? ` / ${row.prodiNama}` : ''}`
                    : (row.unitKerjaNama || row.unit || '-');
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
                    <td className="px-4 py-3 text-[10px] text-gray-600 whitespace-nowrap">{row.noDokumen}</td>
                    {/* Lembaga Mitra */}
                    <td className="px-4 py-3 font-medium text-gray-800">{row.namaMitra}</td>
                    <td className="px-4 py-3">{row.bidangUsaha || '-'}</td>
                    <td className="px-4 py-3 max-w-[160px]"><p className="line-clamp-2">{row.alamatMitra || '-'}</p></td>
                    <td className="px-4 py-3">{row.picMitra || '-'}</td>
                    <td className="px-4 py-3 text-[10px] text-gray-600">{row.kodePerusahaan || '-'}</td>
                    <td className="px-4 py-3">{row.tingkatPerusahaan || '-'}</td>
                    <td className="px-4 py-3 max-w-[220px]"><p>{row.judulKegiatan || row.noDokumen}</p></td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p>{(row.ruangLingkup && row.ruangLingkup.length > 0) ? row.ruangLingkup.join(', ') : '-'}</p>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]"><p className="text-[10px] text-gray-600 line-clamp-2">{row.manfaatSebenarnya || row.manfaatKerjasama || '-'}</p></td>
                    <td className="px-4 py-3 max-w-[180px]"><p className="text-[10px] text-gray-600 line-clamp-2">{row.luaranKerjaSama || '-'}</p></td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.tanggalMulai}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.berlakuHingga}</td>
                    <td className="px-4 py-3 text-center">{row.durasiTahun ?? '-'}</td>
                    {/* Jurusan/Unit — satu kolom, isinya menyesuaikan pilihan Jurusan (+Prodi) atau Unit saat pengajuan */}
                    <td className="px-4 py-3">{jurusanUnitDisplay}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${rekapStatusBadgeMap[row.status]}`}>{row.status}</span>
                    </td>
                    {/* Jenis — sekaligus jadi akses bukti kerja sama: jadi link ke file dokumen_final
                        kalau sudah ada yang diupload untuk dokumen ini, kalau belum tampil biasa saja. */}
                    <td className="px-4 py-3">
                      {linkBukti ? (
                        <FileDownloadLink url={linkBukti} downloadUrl={linkBuktiDownloadUrl} fileName={linkBuktiNama} className="cursor-pointer" >
                          <span title="Lihat bukti kerja sama" className={`rounded-md px-2 py-0.5 text-[10px] font-bold underline decoration-2 underline-offset-2 ${rekapJenisBadgeMap[row.jenis]}`}>{row.jenis}</span>
                        </FileDownloadLink>
                      ) : (
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${rekapJenisBadgeMap[row.jenis]}`} title="Belum ada file bukti kerja sama yang diupload">{row.jenis}</span>
                      )}
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
        // Dokumen final yang sudah diupload untuk kerjasama ini (kalau ada) — dipakai supaya
        // badge Jenis Dokumen bisa langsung dibuka untuk lihat filenya.
        const detailLinkBukti = detailItem.dokumenTerkait && detailItem.dokumenTerkait.length > 0 ? detailItem.dokumenTerkait[0].url : null;
        const detailLinkBuktiDownloadUrl = detailItem.dokumenTerkait && detailItem.dokumenTerkait.length > 0 ? detailItem.dokumenTerkait[0].downloadUrl : null;
        const detailLinkBuktiNama = detailItem.dokumenTerkait && detailItem.dokumenTerkait.length > 0 ? detailItem.dokumenTerkait[0].nama : null;
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
                    {detailLinkBukti ? (
                      <FileDownloadLink
                        url={detailLinkBukti}
                        downloadUrl={detailLinkBuktiDownloadUrl}
                        fileName={detailLinkBuktiNama}
                        title="Lihat dokumen bukti kerja sama"
                        className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold underline decoration-2 underline-offset-2 ${jenisBadge[detailItem.jenis] || 'bg-gray-200 text-gray-700'}`}
                      >
                        {detailItem.jenis}
                      </FileDownloadLink>
                    ) : (
                      <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${jenisBadge[detailItem.jenis] || 'bg-gray-200 text-gray-700'}`}>
                        {detailItem.jenis}
                      </span>
                    )}
                    {!detailLinkBukti && (
                      <p className="mt-1 text-[10px] italic text-gray-400">Belum ada file bukti kerja sama yang diupload</p>
                    )}
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
                  <Tag size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Kode Perusahaan</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.kodePerusahaan || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <Building2 size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Bidang Usaha</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.bidangUsaha || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Alamat Mitra</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.alamatMitra || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <User size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">PIC Mitra</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.picMitra || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <Globe2 size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Tingkat Perusahaan</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.tingkatPerusahaan || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <FileText size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Judul Kegiatan Kerja Sama</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">{detailItem.judulKegiatan || detailItem.noDokumen}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <User size={15} className="mt-0.5 shrink-0 text-[#1E376C]" />
                  <div>
                    <p className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wide">Jurusan / Unit</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-800">
                      {detailItem.jurusanNama
                        ? `${detailItem.jurusanNama}${detailItem.prodiNama ? ` / ${detailItem.prodiNama}` : ''}`
                        : (detailItem.unitKerjaNama || detailItem.unit || '-')}
                    </p>
                    {detailItem.picJurusanUnit && (
                      <p className="text-[10.5px] text-gray-500">PIC: {detailItem.picJurusanUnit}</p>
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
                <div className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
                  <div>
                    <p className="text-[10.5px] text-gray-500">Tanggal Mulai</p>
                    <p className="font-semibold text-gray-800">{detailItem.tanggalMulai || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10.5px] text-gray-500">Berlaku Hingga</p>
                    <p className="font-semibold text-gray-800">{detailItem.berlakuHingga || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10.5px] text-gray-500">Durasi</p>
                    <p className="font-semibold text-gray-800">{detailItem.durasiTahun !== undefined ? `${detailItem.durasiTahun} tahun` : '-'}</p>
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
                  <p className="text-[12px] text-gray-700">{detailItem.manfaatSebenarnya || detailItem.manfaatKerjasama || <span className="italic text-gray-400">Belum diisi</span>}</p>
                )}
              </div>

              {/* Luaran Kerja Sama — sengaja tidak diisi pengaju saat pengajuan, admin yang
                  melengkapi di sini setelah kerja samanya berjalan/selesai. */}
              <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target size={14} className="text-[#1E376C]" />
                    <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Luaran Kerja Sama</p>
                  </div>
                  {!isEditingLuaran && detailItem.id && (
                    <button
                      type="button"
                      onClick={() => { setLuaranDraft(detailItem.luaranKerjaSama || ''); setIsEditingLuaran(true); }}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[#1E376C] hover:bg-[#1E376C]/10 transition-colors"
                    >
                      <Pencil size={11} />
                      Edit
                    </button>
                  )}
                </div>
                {isEditingLuaran ? (
                  <div className="space-y-2">
                    <textarea
                      value={luaranDraft}
                      onChange={(e) => setLuaranDraft(e.target.value)}
                      maxLength={2000}
                      rows={3}
                      className="input-field w-full rounded-lg px-3 py-2 text-[12px]"
                      placeholder="Jelaskan luaran/output yang dihasilkan dari kerja sama ini"
                    />
                    <p className={`text-right text-[10px] ${luaranDraft.length >= 2000 ? 'text-red-500' : 'text-gray-400'}`}>{luaranDraft.length}/2000</p>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setIsEditingLuaran(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50">Batal</button>
                      <button type="button" onClick={handleSaveLuaran} disabled={savingLuaran} className="rounded-lg bg-[#1E376C] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2B4A93] disabled:opacity-60">
                        {savingLuaran ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-700">{detailItem.luaranKerjaSama || <span className="italic text-gray-400">Belum diisi</span>}</p>
                )}
              </div>

              {/* Monev Triwulan — SELALU bisa diisi manual (kuncinya detailItem.id / dokumen
                  kerjasama, bukan sourcePengajuanId, karena banyak dokumen tidak punya
                  pengajuan sumber). Kalau dokumen ini punya sourcePengajuanId, aktivitas dari
                  Story juga otomatis ikut muncul per triwulan berdasarkan tanggalnya.
                  Menggantikan ringkasan "Hasil Monitoring" lama yang cuma menandai Triwulan
                  1-4 lintas tahun; ringkasan lintas-tahun itu sendiri masih dipakai apa
                  adanya oleh Export Excel (lihat handleExportExcel), jadi datanya tidak
                  diubah, cuma tampilan detail di sini yang diganti supaya lebih lengkap dan
                  per-tahun. */}
              {detailItem.id ? (
                <MonevTriwulanSection dokumenKerjasamaId={detailItem.id} pengajuanId={detailItem.sourcePengajuanId} />
              ) : (
                <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ListChecks size={14} className="text-[#1E376C]" />
                    <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">Monev (Monitoring dan Evaluasi)</p>
                  </div>
                  <p className="text-[12px] text-gray-500">
                    Dokumen ini belum tersimpan, Monev baru bisa diisi setelah dokumen disimpan.
                  </p>
                </div>
              )}

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
                        <div className="flex shrink-0 items-center gap-2">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E376C] px-3 py-1.5 text-[10px] font-semibold text-[#1E376C] hover:bg-[#1E376C]/10 transition-colors"
                          >
                            <Eye size={12} />
                            Lihat
                          </a>
                          <button
                            type="button"
                            onClick={() => { void downloadDokumen(doc.url, doc.nama, doc.downloadUrl); }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E376C] px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-[#2B4A93] transition-colors"
                          >
                            <Download size={12} />
                            Unduh
                          </button>
                        </div>
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
                              <FileDownloadLink
                                url={r.buktiPerpanjanganUrl}
                                downloadUrl={`/dokumen-kerjasama/perpanjangan/${r.id}/download`}
                                fileName={r.buktiPerpanjanganNama || `dokumen-perpanjangan-${r.noDokumen}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-blue-600 hover:underline"
                              >
                                <FileText size={11} />
                                Lihat Dokumen
                              </FileDownloadLink>
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
            const unitProdiId = await resolveUnitProdiId(data.unitKerja, data.prodiId);
            if (!unitProdiId) {
              setFeedbackModal({
                title: 'Gagal Menambahkan Dokumen',
                message: data.asalKategori === 'Jurusan' && !data.prodiId
                  ? 'Prodi belum dipilih atau tidak ditemukan di Master Unit/Prodi. Silakan pilih ulang.'
                  : 'Jurusan/unit yang dipilih tidak ditemukan di Master Unit/Prodi. Silakan pilih ulang.',
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
              nama_dokumen: data.judulKegiatan?.trim() || `Dokumen ${nomorDokumen}`,
              judul_dokumen: data.judulKegiatan?.trim() || null,
              jenis_dokumen: mapJenisToApi(data.jenisDokumen),
              unit_prodi_id: unitProdiId,
              mitra_id: mitraId ?? null,
              tanggal_mulai: data.tanggalMulai || null,
              tanggal_berakhir: data.tanggalBerakhir || null,
              status_siklus: mapStatusToApi(data.status),
              keterangan: data.keterangan?.trim() || null,
              manfaat: data.manfaatKerjasama?.trim() || null,
              luaran_kerja_sama: data.luaranKerjaSama?.trim() || null,
              ruang_lingkup_ids: data.ruangLingkupIds && data.ruangLingkupIds.length > 0 ? data.ruangLingkupIds : null,
            });

            const newDoc = data.dokumenTerkait?.[0];
            if (newDoc?.url?.startsWith('data:')) {
              const blob = dataUrlToBlob(newDoc.url);
              await uploadDokumenFile(created.id, blob, newDoc.nama);
            }

            const newDocPendukung = data.dokumenPendukung?.[0];
            if (newDocPendukung?.url?.startsWith('data:')) {
              const blob = dataUrlToBlob(newDocPendukung.url);
              await uploadDokumenFile(created.id, blob, newDocPendukung.nama, 'dokumen_pendukung');
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

          const mergedData: DokumenData = {
            ...data,
            nomorDokumen: data.nomorDokumen || editingItem.noDokumen,
            jenisDokumen: data.jenisDokumen || editingItem.jenis,
            namaPIC: data.namaPIC || editingItem.picMitra || '',
            kategoriMitra: data.kategoriMitra || editingItem.jenisMitra || '',
            bidangUsaha: data.bidangUsaha || editingItem.bidangUsaha || '',
            tingkatPerusahaan: data.tingkatPerusahaan || editingItem.tingkatPerusahaan || '',
            namaMitra: data.namaMitra || editingItem.namaMitra,
            status: data.status || editingItem.status,
            jabatanMitra: data.jabatanMitra || editingItem.jabatanPicMitra || '',
            emailMitra: data.emailMitra || editingItem.emailMitra || '',
            tanggalMulai: data.tanggalMulai || editingItem.tanggalMulaiRaw || editingItem.tanggalMulai,
            tanggalBerakhir: data.tanggalBerakhir || editingItem.berlakuHinggaRaw || editingItem.berlakuHingga,
            alamatMitra: data.alamatMitra || editingItem.alamatMitra || '',
            whatsappMitra: data.whatsappMitra || editingItem.whatsappNumber || '',
            noTeleponMitra: data.noTeleponMitra || editingItem.noTeleponMitra || '',
            negara: data.negara || editingItem.mitraNegara || 'Indonesia',
            asalKategori: data.asalKategori || editingItem.kategoriUnit || 'Unit',
            unitKerja: data.unitKerja || editingItem.unit,
            prodiId: data.prodiId ?? (editingItem.jurusanUnitProdiId ? editingItem.unitProdiId : null),
            ruangLingkup: data.ruangLingkup?.length ? data.ruangLingkup : (editingItem.ruangLingkup || []),
            ruangLingkupIds: data.ruangLingkupIds?.length ? data.ruangLingkupIds : (editingItem.ruangLingkupIds || []),
            dokumenTerkait: data.dokumenTerkait?.length ? data.dokumenTerkait : editingItem.dokumenTerkait,
            dokumenPendukung: data.dokumenPendukung?.length ? data.dokumenPendukung : editingItem.dokumenPendukungTerkait,
            judulKegiatan: data.judulKegiatan || editingItem.judulKegiatan || '',
            manfaatKerjasama: data.manfaatKerjasama || editingItem.manfaatSebenarnya || editingItem.manfaatKerjasama || '',
            luaranKerjaSama: data.luaranKerjaSama || editingItem.luaranKerjaSama || '',
            keterangan: data.keterangan || editingItem.keteranganAsli || '',
          };

          // Optimistic update sementara menunggu API selesai
          setRekapData((prev) => prev.map((r) =>
            r.noDokumen === editingItem.noDokumen
              ? {
                  ...r,
                  namaMitra: mergedData.namaMitra,
                  mitraId: mergedData.mitraId,
                  kodePerusahaan: mergedData.kodePerusahaan,
                  bidangUsaha: mergedData.bidangUsaha || undefined,
                  tingkatPerusahaan: mergedData.tingkatPerusahaan || undefined,
                  alamatMitra: mergedData.alamatMitra || undefined,
                  picMitra: mergedData.namaPIC || undefined,
                  judulKegiatan: mergedData.judulKegiatan || undefined,
                  manfaatKerjasama: mergedData.manfaatKerjasama || undefined,
                  manfaatSebenarnya: mergedData.manfaatKerjasama || undefined,
                  luaranKerjaSama: mergedData.luaranKerjaSama || undefined,
                  keteranganAsli: mergedData.keterangan || undefined,
                  jenis: mergedData.jenisDokumen as 'MoU' | 'MoA' | 'IA',
                  unit: mergedData.unitKerja,
                  tanggalMulai: mergedData.tanggalMulai || r.tanggalMulai,
                  berlakuHingga: mergedData.tanggalBerakhir || r.berlakuHingga,
                  status: mergedData.status as 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa',
                  noDokumen: mergedData.nomorDokumen || r.noDokumen,
                }
              : r
          ));
          setEditingItem(null);

          try {
            const promises: Promise<void>[] = [];

            if (typeof editingItem.id === 'number') {
              // Sinkronkan kategori/bidang usaha/tingkat ke master_mitra juga (bukan cuma mitra_id).
              const resolvedMitraId = await resolveMitraId(mergedData);
              // Sebelumnya unit_prodi_id tidak pernah dikirim saat edit, jadi ganti Jurusan/Unit/Prodi
              // di modal ini diam-diam tidak tersimpan — resolve & kirim sekarang juga.
              const unitProdiId = await resolveUnitProdiId(mergedData.unitKerja, mergedData.prodiId);

              const apiPayload: Parameters<typeof updateDokumenKerjasamaById>[1] = {
                nomor_dokumen: mergedData.nomorDokumen || undefined,
                judul_dokumen: mergedData.judulKegiatan?.trim() || null,
                jenis_dokumen: mapJenisToApi(mergedData.jenisDokumen),
                unit_prodi_id: unitProdiId ?? undefined,
                tanggal_mulai: mergedData.tanggalMulai || null,
                tanggal_berakhir: mergedData.tanggalBerakhir || null,
                status_siklus: mapStatusToApi(mergedData.status),
                // Kode Perusahaan mengikuti master_mitra lewat relasi mitra_id — tidak dikirim manual.
                mitra_id: resolvedMitraId ?? null,
                keterangan: mergedData.keterangan?.trim() || null,
                manfaat: mergedData.manfaatKerjasama?.trim() || null,
                luaran_kerja_sama: mergedData.luaranKerjaSama?.trim() || null,
                ruang_lingkup_ids: mergedData.ruangLingkupIds && mergedData.ruangLingkupIds.length > 0 ? mergedData.ruangLingkupIds : null,
              };
              promises.push(updateDokumenKerjasamaById(editingItem.id, apiPayload));
            }

            if (typeof editingItem.sourcePengajuanId === 'number' && mergedData.namaMitra !== editingItem.namaMitra) {
              promises.push(updatePengajuanNamaMitra(editingItem.sourcePengajuanId, mergedData.namaMitra));
            }

            await Promise.all(promises);

            // Upload file baru jika user memilih "Ganti Dokumen"
            const newDoc = mergedData.dokumenTerkait?.[0];
            if (typeof editingItem.id === 'number' && newDoc?.url?.startsWith('data:')) {
              const blob = dataUrlToBlob(newDoc.url);
              await uploadDokumenFile(editingItem.id, blob, newDoc.nama);
            }

            const newDocPendukung = mergedData.dokumenPendukung?.[0];
            if (typeof editingItem.id === 'number' && newDocPendukung?.url?.startsWith('data:')) {
              const blob = dataUrlToBlob(newDocPendukung.url);
              await uploadDokumenFile(editingItem.id, blob, newDocPendukung.nama, 'dokumen_pendukung');
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
