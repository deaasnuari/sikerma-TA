'use client';

import * as XLSX from 'xlsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Archive, Bell, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Eye, Filter, HandshakeIcon, Mail, MessageCircle, Phone, RefreshCw, Search, Trash2, X } from 'lucide-react';
import LaporanPelaksanaanModal from '@/components/LaporanPelaksanaanModal';
import GroupedFilterSelect from '@/components/GroupedFilterSelect';
import ConfirmDialog from '@/components/ConfirmDialog';

// import RenewalHistoryModal from './RenewalHistoryModal';
import RenewalFullForm from './RenewalFullForm';
import RenewalForm from './RenewalForm';

// import RenewalForm from './RenewalForm';
import NotificationHistoryModal from './NotificationHistoryModal';
import NonactiveConfirmationModal from './NonactiveConfirmationModal';
import MonthPicker from '@/components/MonthPicker';
import { semuaBulanLabel } from '@/services/adminRekapDataService';
import {
  createRenewalRecord,
  createWhatsAppLink,
  deleteMonitoringItem,
  fetchMonitoringDataFromApi,
  fetchNotifikasiKerjasama,
  filterMonitoringData,
  findKerjasamaById,
  getFilteredMonitoringData,
  getMonitoringData,
  getMonitoringJenisMitraOptions,
  getMonitoringJenisOptions,
  getMonitoringStats,
  getMonitoringTabs,
  getMonitoringTingkatOptions,
  getMonitoringUnitOptions,
  getMonitoringYearOptions,
  monitoringJenisBadgeMap,
  monitoringStatusConfig,
  type Kerjasama,
  type MonitoringNotification,
  type RenewalRecord,
  type TabKey,
} from '@/services/adminMonitoringService';
import { getPengajuanData } from '@/services/adminPengajuanService';
import { addAdminNotification } from '@/services/adminService';
import { addRenewalRequest } from '@/services/adminRenewalRequestService';
import { logPerpanjanganDiajukan, logNotifikasiDikirim } from '@/services/kerjasamaEventLogService';
import { useMasterUnitProdi } from '@/hooks/useMasterData';
import { updateDokumenKerjasamaById, uploadDokumenFile } from '@/services/dokumenKerjasamaApiService';
import { getPageNumbers } from '@/lib/pagination';


export default function MonitoringdanstatusPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('Semua');
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedLaporan, setSelectedLaporan] = useState<Kerjasama | null>(null);
  const [renewalModal, setRenewalModal] = useState<{ open: boolean; kerjasamaId: number | null }>({ open: false, kerjasamaId: null });
  const [renewalHistories, setRenewalHistories] = useState<Record<number, RenewalRecord[]>>({});
  const [notificationModal, setNotificationModal] = useState<{ open: boolean; kerjasamaId: number | null }>({ open: false, kerjasamaId: null });
  const [notificationHistories, setNotificationHistories] = useState<Record<number, MonitoringNotification[]>>({});
  const [nonactiveModal, setNonactiveModal] = useState<{ open: boolean; kerjasamaId: number | null }>({ open: false, kerjasamaId: null });
  const [monitoringData, setMonitoringData] = useState<Kerjasama[]>([]);
  const [hapusTarget, setHapusTarget] = useState<Kerjasama | null>(null);
  // State untuk toggle form sederhana/baru
  const [showSimpleForm, setShowSimpleForm] = useState(false);

  // Filter tambahan mengikuti pola yang sama dengan halaman Rekap Data.
  const [filterJenis, setFilterJenis] = useState('Semua Jenis');
  const [filterUnit, setFilterUnit] = useState('Semua Jurusan/unit');
  const [filterJenisMitra, setFilterJenisMitra] = useState('Semua Jenis Mitra');
  const [filterTingkatPerusahaan, setFilterTingkatPerusahaan] = useState('Semua Tingkat Perusahaan');
  const [filterTahun, setFilterTahun] = useState<string | null>(null);
  const [filterBulan, setFilterBulan] = useState(semuaBulanLabel);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  // Dipisah per kategori (Jurusan / Program Studi / Unit Kerja) supaya dropdown filter bisa
  // dikelompokkan pakai <optgroup>, sama seperti dropdown "Semua Unit" di landing page.
  const { data: masterJurusanRows } = useMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'jurusan', aktif: true });
  const { data: masterUnitKerjaRows } = useMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'unit_kerja', aktif: true });
  const { data: masterProdiRows } = useMasterUnitProdi({ jenis_node: 'prodi', aktif: true });
  const masterJurusanOptions = useMemo(
    () => Array.from(new Set(masterJurusanRows.map((item) => item.nama).filter(Boolean))),
    [masterJurusanRows],
  );
  const masterUnitKerjaOptions = useMemo(
    () => Array.from(new Set(masterUnitKerjaRows.map((item) => item.nama).filter(Boolean))),
    [masterUnitKerjaRows],
  );
  const masterProdiOptions = useMemo(
    () => Array.from(new Set(masterProdiRows.map((item) => item.nama).filter(Boolean))),
    [masterProdiRows],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Pilihan saat klik tombol Perpanjang Kerjasama
  const [renewalChoiceModal, setRenewalChoiceModal] = useState<{ open: boolean; kerjasamaId: number | null }>({
    open: false,
    kerjasamaId: null,
  });

  // Toast hint setelah perpanjangan berhasil diajukan
  const [perpanjanganHint, setPerpanjanganHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Modal konfirmasi setelah kerja sama berhasil dinonaktifkan — pengganti alert() bawaan browser.
  const [nonaktifSuccessMessage, setNonaktifSuccessMessage] = useState<string | null>(null);

  const showPerpanjanganHint = () => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setPerpanjanganHint(true);
    hintTimerRef.current = setTimeout(() => setPerpanjanganHint(false), 7000);
  };


  const resolveRenewalNotificationTarget = (item: Kerjasama) => {
    const sourceItem = item.sourcePengajuanId
      ? getPengajuanData().find((pengajuan) => pengajuan.id === item.sourcePengajuanId)
      : undefined;

    if (!sourceItem) {
      return {
        targetRole: 'admin' as const,
        href: '/admin/monitoring/perpanjangan',
      };
    }

    if (sourceItem.kategoriPengajuan === 'Eksternal') {
      return {
        targetRole: 'eksternal' as const,
        href: '/eksternal/daftar_kerjasama',
      };
    }

    return {
      targetRole: sourceItem.isFromAdmin ? 'admin' as const : 'internal' as const,
      href: sourceItem.isFromAdmin ? '/admin/data_pengajuan' : '/internal/data_pengajuan',
    };
  };

  // Data asli dari server baru boleh dipakai untuk auto-buka form perpanjangan setelah
  // benar-benar termuat — sebelum itu monitoringData masih cache lama (localStorage) yang
  // ID-nya bisa kebetulan cocok tapi menunjuk ke mitra yang SALAH (beda dari data server
  // yang sebenarnya), bikin modal "Tidak Perpanjang" kebuka untuk dokumen yang salah.
  const [isRealDataLoaded, setIsRealDataLoaded] = useState(false);

  // Auto-buka form perpanjangan jika diarahkan dari halaman Arsip Dokumen
  useEffect(() => {
    if (!isRealDataLoaded) return;
    const pendingId = sessionStorage.getItem('open-perpanjang-id');
    if (!pendingId) return;
    sessionStorage.removeItem('open-perpanjang-id');
    const targetId = parseInt(pendingId, 10);
    const found = monitoringData.find((k) => k.id === targetId);
    if (found) {
      setRenewalChoiceModal({ open: true, kerjasamaId: targetId });
    }
  }, [isRealDataLoaded, monitoringData]);

  useEffect(() => {
    let mounted = true;
    const syncMonitoringData = async () => {
      // First, immediately show cached/default data so UI doesn't blink empty
      setMonitoringData(getMonitoringData());

      // Then fetch real data from API and update
      const realData = await fetchMonitoringDataFromApi();
      if (mounted) {
        setMonitoringData(realData);
        setIsRealDataLoaded(true);
      }
    };

    void syncMonitoringData();
    window.addEventListener('monitoring-data-updated', syncMonitoringData);

    return () => {
      mounted = false;
      window.removeEventListener('monitoring-data-updated', syncMonitoringData);
    };
  }, []);

  // Muat riwayat notifikasi asli (tabel notifikasi_kerjasama) tiap modal riwayat dibuka.
  const muatRiwayatNotifikasi = useCallback(async (kerjasamaId: number) => {
    if (!kerjasamaId) return;
    const rows = await fetchNotifikasiKerjasama(kerjasamaId);
    setNotificationHistories((prev) => ({ ...prev, [kerjasamaId]: rows }));
  }, []);

  useEffect(() => {
    if (notificationModal.open && notificationModal.kerjasamaId) {
      void muatRiwayatNotifikasi(notificationModal.kerjasamaId);
    }
  }, [notificationModal.open, notificationModal.kerjasamaId, muatRiwayatNotifikasi]);

  const { totalAktif, totalAkanBerakhir, totalKadaluarsa } = getMonitoringStats(monitoringData);
  const filteredByTab = getFilteredMonitoringData(monitoringData, activeTab);

  const jenisOptions = useMemo(() => getMonitoringJenisOptions(monitoringData), [monitoringData]);
  // Nama dari data monitoring yang ter-load tapi tidak cocok ke Jurusan/Prodi/Unit Kerja aktif
  // mana pun (unit lama/nonaktif) — ditampilkan di grup "Lainnya" biar tetap bisa difilter.
  const unitGroups = useMemo(() => {
    const docDerived = getMonitoringUnitOptions(monitoringData).filter((o) => o !== 'Semua Jurusan/unit');
    const known = new Set([...masterJurusanOptions, ...masterProdiOptions, ...masterUnitKerjaOptions]);
    const lainnya = docDerived.filter((nama) => !known.has(nama));

    return {
      jurusan: masterJurusanOptions,
      prodi: masterProdiOptions,
      unit: masterUnitKerjaOptions,
      lainnya,
    };
  }, [monitoringData, masterJurusanOptions, masterProdiOptions, masterUnitKerjaOptions]);
  const jenisMitraOptions = useMemo(() => getMonitoringJenisMitraOptions(monitoringData), [monitoringData]);
  const tingkatPerusahaanOptions = useMemo(() => getMonitoringTingkatOptions(monitoringData), [monitoringData]);
  const availableYears = useMemo(() => getMonitoringYearOptions(monitoringData), [monitoringData]);
  const currentYear = new Date().getFullYear();
  const defaultYearRangeStart = Math.min(currentYear - 4, availableYears[0] ?? currentYear);
  const [yearRangeStart, setYearRangeStart] = useState(defaultYearRangeStart);
  // 24 tahun sekaligus, sama seperti kalender tahun di Rekap Data.
  const YEAR_PICKER_SIZE = 24;
  const yearGrid = Array.from({ length: YEAR_PICKER_SIZE }, (_, index) => yearRangeStart + index);

  const filteredByDropdowns = filterMonitoringData(filteredByTab, {
    filterJenis,
    filterUnit,
    filterJenisMitra,
    filterTingkatPerusahaan,
    filterTahun,
    filterBulan,
  });

  const normalizedKeyword = searchKeyword.trim().toLowerCase();
  const filtered = normalizedKeyword
    ? filteredByDropdowns.filter((item) => {
        const searchText = [
          item.namaMitra,
          item.noDokumen,
          item.jenis,
          item.status,
          item.tanggalMulai,
          item.tanggalBerakhir,
          ...item.ruangLingkup,
        ]
          .join(' ')
          .toLowerCase();

        return searchText.includes(normalizedKeyword);
      })
    : filteredByDropdowns;

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * itemsPerPage;
  const paginatedItems = filtered.slice(pageStartIndex, pageStartIndex + itemsPerPage);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchKeyword, filterJenis, filterUnit, filterJenisMitra, filterTingkatPerusahaan, filterTahun, filterBulan]);

  const tabs = getMonitoringTabs(monitoringData);
  const selectedRenewalItem = findKerjasamaById(monitoringData, renewalChoiceModal.open ? renewalChoiceModal.kerjasamaId : renewalModal.kerjasamaId);

  const selectedNotificationItem = findKerjasamaById(monitoringData, notificationModal.kerjasamaId);
  const selectedNonactiveItem = findKerjasamaById(monitoringData, nonactiveModal.kerjasamaId);

  const handleDeleteMonitoring = (item: Kerjasama) => {
    setHapusTarget(item);
  };

  const jalankanHapusMonitoring = () => {
    if (!hapusTarget) return;
    // Langsung perbarui tampilan dari hasil hapus lokal — jangan nunggu refetch API
    // (event 'monitoring-data-updated' tetap memicu sinkronisasi server di latar belakang).
    setMonitoringData(deleteMonitoringItem(hapusTarget.id));
    setHapusTarget(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[17px] font-bold text-gray-900">Status dan Progres Kerja Sama</h1>
        <p className="mt-0.5 text-[10px] text-gray-500">Pantau masa berlaku dokumen kerjasama dan status aktivitas</p>
      </div>

      {/* Alert Banner */}
      <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
        <div>
          <p className="text-[12px] font-bold text-gray-900">Peringatan Monitoring</p>
          <ul className="mt-0.5 space-y-0.5 text-[10px] text-gray-700">
            <li>• {totalAkanBerakhir} dokumen akan berakhir dalam waktu kurang dari 3 bulan</li>
            <li>• {totalKadaluarsa} dokumen sudah melewati masa berlaku</li>
          </ul>
          <p className="mt-1.5 text-[10px] text-gray-700">Segera lakukan perpanjangan atau hubungi mitra untuk tindak lanjut.</p>
        </div>
      </div>

      {/* Export Button & Stat Cards */}
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E376C] bg-[#1E376C] px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#162c56]"
          onClick={() => {
            const tabFileNameMap: Record<string, string> = {
              'Semua': 'semua-status',
              'Aktif': 'kerjasama-aktif',
              'Akan Berakhir': 'akan-berakhir',
              'Kadaluarsa': 'kadaluarsa',
            };
            const rows = [
              ['Nama Mitra', 'No Dokumen', 'Jenis', 'Status', 'Tanggal Mulai', 'Tanggal Berakhir', 'Sisa Masa Berlaku', 'Email Mitra', 'WhatsApp', 'Ruang Lingkup'],
              ...filtered.map(item => [
                item.namaMitra,
                item.noDokumen,
                item.jenis,
                item.status,
                item.tanggalMulai,
                item.tanggalBerakhir,
                item.sisaMasaBerlaku || '',
                item.emailMitra,
                item.whatsappNumber,
                item.ruangLingkup.join('; '),
              ]),
            ];
            const ws = XLSX.utils.aoa_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Monitoring');
            const fileName = `monitoring-kerjasama-${tabFileNameMap[activeTab] ?? activeTab.toLowerCase().replace(/\s+/g, '-')}.xlsx`;
            XLSX.writeFile(wb, fileName);
          }}
        >
          Export Data
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setActiveTab('Aktif')}
          className={`flex items-center gap-3 rounded-lg border-2 bg-white p-3 text-left shadow-sm transition-colors ${
            activeTab === 'Aktif' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-blue-400 hover:bg-blue-50/50'
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <HandshakeIcon size={18} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-gray-700">Kerjasama Aktif</p>
              <span className="h-2 w-2 rounded-full bg-green-500" />
            </div>
            <p className="mt-0.5 text-[17px] font-bold text-gray-900">{totalAktif}</p>
            <p className="text-[10.5px] text-gray-500">Masa berlaku &gt; 3 bulan</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('Akan Berakhir')}
          className={`flex items-center gap-3 rounded-lg border-2 bg-white p-3 text-left shadow-sm transition-colors ${
            activeTab === 'Akan Berakhir' ? 'border-orange-500 ring-2 ring-orange-100' : 'border-orange-400 hover:bg-orange-50/50'
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
            <CalendarClock size={18} className="text-orange-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-gray-700">Akan Berakhir</p>
              <span className="h-2 w-2 rounded-full bg-orange-400" />
            </div>
            <p className="mt-0.5 text-[17px] font-bold text-gray-900">{totalAkanBerakhir}</p>
            <p className="text-[10.5px] text-gray-500">perlu perhatian segera</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('Kadaluarsa')}
          className={`flex items-center gap-3 rounded-lg border-2 bg-white p-3 text-left shadow-sm transition-colors ${
            activeTab === 'Kadaluarsa' ? 'border-red-500 ring-2 ring-red-100' : 'border-red-400 hover:bg-red-50/50'
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
            <Archive size={18} className="text-red-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-gray-700">Kadaluarsa</p>
              <span className="h-2 w-2 rounded-full bg-red-500" />
            </div>
            <p className="mt-0.5 text-[17px] font-bold text-gray-900">{totalKadaluarsa}</p>
            <p className="text-[10.5px] text-gray-500">sudah berakhir</p>
          </div>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-t-lg px-3 py-2 text-[10px] font-semibold transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-[#1E376C] bg-[#EEF2FF] text-[#1E376C]'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Filter */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-gray-800">
            <Filter size={15} />
            Filter:
          </span>

          <GroupedFilterSelect
            value={filterJenis}
            onChange={setFilterJenis}
            allLabel={jenisOptions[0]}
            buttonClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-700 outline-none transition-colors focus:border-[#1E376C] flex items-center justify-between gap-2 min-w-[140px]"
            groups={[{ label: '', options: jenisOptions.slice(1) }]}
          />

          <GroupedFilterSelect
            value={filterUnit}
            onChange={setFilterUnit}
            allLabel="Semua Jurusan/unit"
            buttonClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-700 outline-none transition-colors focus:border-[#1E376C] flex items-center justify-between gap-2 min-w-[200px]"
            groups={[
              { label: 'Jurusan', options: unitGroups.jurusan },
              { label: 'Program Studi', options: unitGroups.prodi },
              { label: 'Unit Kerja', options: unitGroups.unit },
              { label: 'Lainnya', options: unitGroups.lainnya },
            ]}
          />

          <GroupedFilterSelect
            value={filterJenisMitra}
            onChange={setFilterJenisMitra}
            allLabel={jenisMitraOptions[0]}
            buttonClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-700 outline-none transition-colors focus:border-[#1E376C] flex items-center justify-between gap-2 min-w-[160px]"
            groups={[{ label: '', options: jenisMitraOptions.slice(1) }]}
          />

          <GroupedFilterSelect
            value={filterTingkatPerusahaan}
            onChange={setFilterTingkatPerusahaan}
            allLabel={tingkatPerusahaanOptions[0]}
            buttonClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-700 outline-none transition-colors focus:border-[#1E376C] flex items-center justify-between gap-2 min-w-[180px]"
            groups={[{ label: '', options: tingkatPerusahaanOptions.slice(1) }]}
          />

          <div className="relative">
            <button
              type="button"
              onClick={() => setYearPickerOpen((prev) => !prev)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-700 outline-none transition-colors focus:border-[#1E376C] inline-flex min-w-[150px] items-center justify-between gap-2"
            >
              <span>{filterTahun ?? 'Semua Tahun'}</span>
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

          <MonthPicker
            value={filterBulan}
            onChange={setFilterBulan}
            buttonClassName="rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12px] text-gray-700 outline-none transition-colors focus:border-[#1E376C] inline-flex min-w-[150px] items-center justify-between gap-2"
          />
        </div>
      </div>

      {/* Search */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSearchKeyword(searchInput);
        }}
        className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 md:flex-row md:items-center"
      >
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Cari mitra, nomor dokumen, jenis, atau ruang lingkup"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-[12px] outline-none transition-colors focus:border-[#1E376C]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E376C] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#162c56]"
          >
            <Search size={14} />
            Cari
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setSearchKeyword('');
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-[12px] font-semibold text-gray-600 transition-colors hover:bg-gray-100"
          >
            <X size={14} />
            Reset
          </button>
        </div>
      </form>

      {searchKeyword.trim() !== '' && (
        <p className="text-[12px] text-gray-600">
          Hasil pencarian untuk <span className="font-semibold">&quot;{searchKeyword}&quot;</span>: {filtered.length} record ditemukan.
        </p>
      )}

      {/* Cards List */}
      <div className="space-y-4">
        {paginatedItems.map((item) => {
          const cfg = monitoringStatusConfig[item.status];
          const isUrgent = item.status === 'Akan Berakhir' || item.status === 'Kadaluarsa';

          return (
            <div
              key={item.id}
              className={`overflow-hidden rounded-xl border border-gray-200 border-l-4 ${cfg.border} bg-white shadow-sm`}
            >
              <div className="p-4">
                {/* Top row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 md:gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] font-extrabold text-gray-900 md:text-[15px]">{item.namaMitra}</p>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${monitoringJenisBadgeMap[item.jenis]}`}>{item.jenis}</span>
                    </div>
                    {item.judul && (
                      <p className="text-[12px] font-semibold text-blue-900 whitespace-pre-line break-words">{item.judul}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                    <span className={cfg.labelColor}>{cfg.label}</span>
                  </div>
                </div>

                {/* Meta info */}
                <p className="mt-1 text-[10px] text-gray-400">No. Dokumen: {item.noDokumen}</p>

                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-gray-500 md:grid-cols-4">
                  <div>
                    <p className="font-medium text-gray-600">Tanggal Mulai</p>
                    <p>{item.tanggalMulai}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">Tanggal Berakhir</p>
                    <p>{item.tanggalBerakhir}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">Sisa Masa Berlaku</p>
                    {item.sisaMasaBerlaku ? (
                      <p className={item.status === 'Aktif' ? 'font-semibold text-green-600' : 'font-semibold text-orange-500'}>
                        {item.sisaMasaBerlaku}
                      </p>
                    ) : (
                      <p className="font-semibold text-red-500">Kadaluarsa</p>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">Kontak</p>
                    <div className="flex items-center gap-2 pt-0.5 text-gray-500">
                      <Mail size={13} className="cursor-pointer hover:text-[#1E376C]" />
                      <Phone size={13} className="cursor-pointer hover:text-[#1E376C]" />
                    </div>
                  </div>
                </div>

                {/* Ruang Lingkup */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-medium text-gray-500">Ruang Lingkup:</p>
                  {item.ruangLingkup.map((tag) => (
                    <span key={tag} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLaporan(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E376C] px-3 py-1.5 text-[10px] font-semibold text-[#1E376C] transition-colors hover:bg-[#EEF2FF]"
                  >
                    <Eye size={13} />
                    Tambah Laporan Pelaksanaan
                  </button>

                  {isUrgent && (
                    <>
                      <button
                        type="button"
                        onClick={() => setRenewalChoiceModal({ open: true, kerjasamaId: item.id })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-600 px-3 py-1.5 text-[10px] font-semibold text-green-700 transition-colors hover:bg-green-50"
                      >
                        <RefreshCw size={13} />
                        Perpanjang Kerjasama
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          window.open(createWhatsAppLink(item), '_blank');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-green-600"
                      >
                        <MessageCircle size={13} />
                        Hubungi Mitra
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotificationModal({ open: true, kerjasamaId: item.id })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500 px-3 py-1.5 text-[10px] font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                      >
                        <Mail size={13} />
                        Riwayat Email
                      </button>
                      <button
                        type="button"
                        onClick={() => setNonactiveModal({ open: true, kerjasamaId: item.id })}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-semibold text-gray-500 transition-colors hover:bg-gray-100"
                      >
                        Nonaktifkan
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteMonitoring(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-[10px] font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <Trash2 size={13} />
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-gray-500">
            Menampilkan <span className="font-semibold text-gray-700">{pageStartIndex + 1}–{Math.min(pageStartIndex + itemsPerPage, filtered.length)}</span> dari{' '}
            <span className="font-semibold text-gray-700">{filtered.length}</span> kerjasama
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

      <LaporanPelaksanaanModal
        isOpen={selectedLaporan !== null}
        onClose={() => setSelectedLaporan(null)}
        data={selectedLaporan ? {
          namaMitra: selectedLaporan.namaMitra,
          noDokumen: selectedLaporan.noDokumen,
          jenis: selectedLaporan.jenis,
          ruangLingkup: selectedLaporan.ruangLingkup,
          unit: selectedLaporan.unit,
          pengajuanId: selectedLaporan.sourcePengajuanId,
          dokumenKerjasamaId: selectedLaporan.id,
        } : null}
      />


      {renewalChoiceModal.open && selectedRenewalItem && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/40 px-2 py-8">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl p-6">
            <h2 className="text-[15px] font-bold text-[#1E376C]">Perpanjangan Kerjasama</h2>
            <p className="mt-2 text-[12px] text-gray-600">
              Untuk <span className="font-semibold">{selectedRenewalItem.namaMitra}</span> ({selectedRenewalItem.noDokumen}) apakah anda ingin perpanjang kerjasama?
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setRenewalChoiceModal({ open: false, kerjasamaId: null });
                  setRenewalModal({ open: true, kerjasamaId: selectedRenewalItem.id });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[12px] font-semibold text-green-700 hover:bg-green-100"
              >
                <RefreshCw size={16} />
                Perpanjang
              </button>

              <button
                type="button"
                onClick={() => {
                  setRenewalChoiceModal({ open: false, kerjasamaId: null });
                  setNonactiveModal({ open: true, kerjasamaId: selectedRenewalItem.id });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Archive size={16} />
                Tidak Perpanjang
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRenewalChoiceModal({ open: false, kerjasamaId: null })}
              className="mt-4 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {renewalModal.open && selectedRenewalItem && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 px-2 pt-32 pb-4">

          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl p-0 flex flex-col" style={{ maxHeight: 'calc(100vh - 9rem)' }}>
            <div className="overflow-auto p-4" style={{ maxHeight: 'calc(100vh - 11rem)' }}>
            <h2 className="text-[15px] font-bold text-[#1E376C] mb-2">Form Perpanjangan Kerjasama</h2>
            {/* Form lengkap selalu tampil di atas */}
            <RenewalFullForm
              initialData={{
                namaMitra: selectedRenewalItem.namaMitra || '',
                jenisMitra: '',
                teleponMitra: selectedRenewalItem.whatsappNumber || '',
                emailMitra: selectedRenewalItem.emailMitra || '',
                alamatLengkap: '',
                negara: 'Indonesia',
                jenisKerjasama: selectedRenewalItem.jenis || '',
                unitPelaksana: '',
                tanggalMulai: selectedRenewalItem.tanggalMulai || '',
                tanggalBerakhir: selectedRenewalItem.tanggalBerakhir || '',
                judulKerjasama: selectedRenewalItem.judul || '',
                deskripsi: '',
                ruangLingkup: selectedRenewalItem.ruangLingkup || [],
                kontakNama: '',
                kontakJabatan: '',
                kontakEmail: '',
                kontakTelepon: '',
                dokumenTerakhir: undefined,
                tanggalMulaiBaru: '',
                tanggalBerakhirBaru: '',
                catatanPerpanjangan: '',
              }}
              onSubmit={async (data) => {
                const renewalNotificationTarget = resolveRenewalNotificationTarget(selectedRenewalItem);

                try {
                  // Simpan ke database dokumen_log melalui API backend.
                  await addRenewalRequest({
                    kerjasamaId: selectedRenewalItem.id,
                    namaMitra: selectedRenewalItem.namaMitra,
                    noDokumen: selectedRenewalItem.noDokumen,
                    tanggalMulaiBaru: data.tanggalMulaiBaru,
                    tanggalBerakhirBaru: data.tanggalBerakhirBaru,
                    catatan: data.catatanPerpanjangan,
                    buktiPerpanjangan: data?.dokumen?.url || null,
                    buktiPerpanjanganNama: data?.dokumen?.nama || null,
                    ruangLingkup: data?.ruangLingkup || [],
                    requesterRole: renewalNotificationTarget.targetRole,
                    notificationHref: renewalNotificationTarget.href,
                  });

                  // Juga buat record di monitoring history
                  const renewalRecord = createRenewalRecord(
                    selectedRenewalItem.id,
                    data.catatanPerpanjangan,
                    data.tanggalMulaiBaru,
                    data.tanggalBerakhirBaru
                  );
                  setRenewalHistories((prev) => ({
                    ...prev,
                    [selectedRenewalItem.id]: [...(prev[selectedRenewalItem.id] || []), renewalRecord],
                  }));

                  // Log event perpanjangan
                  logPerpanjanganDiajukan(
                    selectedRenewalItem.id,
                    selectedRenewalItem.namaMitra,
                    selectedRenewalItem.noDokumen,
                    data.tanggalMulaiBaru,
                    data.tanggalBerakhirBaru,
                    data.catatanPerpanjangan
                  );

                  // Notifikasi untuk pihak pengusul
                  addAdminNotification({
                    title: 'Permintaan Perpanjangan Kerjasama',
                    message: `Perpanjangan kerjasama dengan ${selectedRenewalItem.namaMitra} (${selectedRenewalItem.noDokumen}) telah diajukan. Periode baru: ${data.tanggalMulaiBaru} s/d ${data.tanggalBerakhirBaru}`,
                    from: 'Admin SIKERMA',
                    href: renewalNotificationTarget.href,
                    category: 'info',
                    targetRole: renewalNotificationTarget.targetRole,
                  });

                  // Notifikasi untuk admin agar muncul di sidebar "Permintaan Perpanjangan"
                  addAdminNotification({
                    title: 'Permintaan Perpanjangan Baru',
                    message: `Perpanjangan ${selectedRenewalItem.noDokumen} (${selectedRenewalItem.namaMitra}) menunggu review. Periode: ${data.tanggalMulaiBaru} s/d ${data.tanggalBerakhirBaru}`,
                    from: 'Sistem Monitoring',
                    href: '/admin/monitoring/perpanjangan',
                    category: 'approval',
                    targetRole: 'admin',
                  });

                  setRenewalModal({ open: false, kerjasamaId: null });
                  showPerpanjanganHint();
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Gagal mengajukan perpanjangan.';
                  alert(`✗ ${message}`);
                }
              }}
            />
            <button
              type="button"
              onClick={() => { setRenewalModal({ open: false, kerjasamaId: null }); }}
              className="mt-4 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Tutup
            </button>
          </div>
          </div>
        </div>
      )}


      <NotificationHistoryModal
        isOpen={notificationModal.open}
        onClose={() => setNotificationModal({ open: false, kerjasamaId: null })}
        namaMitra={selectedNotificationItem?.namaMitra || ''}
        noDokumen={selectedNotificationItem?.noDokumen || ''}
        emailMitra={selectedNotificationItem?.emailMitra || ''}
        notifications={notificationHistories[notificationModal.kerjasamaId || 0] || []}
        kerjasamaId={notificationModal.kerjasamaId || 0}
        onSendNotification={() => {
          // Pengiriman manual sudah dicatat backend ke tabel notifikasi_kerjasama —
          // cukup muat ulang riwayatnya.
          if (notificationModal.kerjasamaId) {
            void muatRiwayatNotifikasi(notificationModal.kerjasamaId);
          }
        }}
      />

      <NonactiveConfirmationModal
        isOpen={nonactiveModal.open}
        onClose={() => setNonactiveModal({ open: false, kerjasamaId: null })}
        namaMitra={selectedNonactiveItem?.namaMitra || ''}
        noDokumen={selectedNonactiveItem?.noDokumen || ''}
        tanggalBerakhir={selectedNonactiveItem?.tanggalBerakhir || ''}
        sisaMasaBerlaku={selectedNonactiveItem?.sisaMasaBerlaku || null}
        existingDecision={
          selectedNonactiveItem?.alasanArsip
            ? {
                catatan: selectedNonactiveItem.alasanArsip,
                buktiUrl: selectedNonactiveItem.buktiTidakDiperpanjang || null,
                buktiDownloadUrl: selectedNonactiveItem.buktiTidakDiperpanjangDownloadUrl || null,
                buktiNama: selectedNonactiveItem.buktiTidakDiperpanjangNama || null,
              }
            : null
        }
        onConfirmNonactive={async (alasan, file) => {
          if (!nonactiveModal.kerjasamaId) return;
          const id = nonactiveModal.kerjasamaId;

          // Catatan tersimpan lewat alasan_arsip (kolom yang sama dipakai kolom "Catatan
          // Tidak Diperpanjang" di Arsip Dokumen) — sekaligus tandai statusnya archived.
          await updateDokumenKerjasamaById(id, {
            status_siklus: 'archived',
            alasan_arsip: alasan,
          });

          // Bukti (opsional) diunggah terpisah dari dokumen final supaya tidak saling timpa.
          if (file) {
            await uploadDokumenFile(id, file, file.name, 'bukti_tidak_diperpanjang');
          }

          const namaMitra = selectedNonactiveItem?.namaMitra || '';
          const realData = await fetchMonitoringDataFromApi({ forceRefresh: true });
          setMonitoringData(realData);
          setNonaktifSuccessMessage(`Kerjasama "${namaMitra}" telah berhasil dinonaktifkan.`);
        }}
      />

      {/* Toast hint setelah perpanjangan berhasil diajukan */}
      {perpanjanganHint && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
          <div className="relative flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-2xl max-w-sm">
            {/* Bouncing left arrows pointing toward sidebar */}
            <div className="absolute -left-6 top-1/2 -translate-y-1/2 flex gap-0.5 text-amber-500">
              <ChevronLeft size={14} className="animate-bounce" />
              <ChevronLeft size={14} className="animate-bounce opacity-60" style={{ animationDelay: '120ms' }} />
            </div>

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 size={18} className="text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-gray-900">Perpanjangan Berhasil Diajukan!</p>
              <p className="mt-0.5 text-[10px] text-gray-600 leading-snug">
                Jangan lupa cek{' '}
                <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700">
                  <Bell size={11} />
                  Permintaan Perpanjangan
                </span>{' '}
                di sidebar untuk menyetujui atau menolak.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <a
                  href="/admin/monitoring/perpanjangan"
                  className="inline-flex items-center gap-1 rounded-lg bg-[#1E376C] px-3 py-1.5 text-[10.5px] font-semibold text-white hover:bg-[#2B4A93] transition-colors"
                >
                  Lihat Sekarang
                </a>
                <button
                  type="button"
                  onClick={() => setPerpanjanganHint(false)}
                  className="text-[10.5px] font-medium text-gray-500 hover:text-gray-700"
                >
                  Tutup
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPerpanjanganHint(false)}
              className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Konfirmasi berhasil dinonaktifkan — pengganti alert() bawaan browser */}
      {nonaktifSuccessMessage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[1px]"
          onClick={() => setNonaktifSuccessMessage(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 size={20} className="text-green-600" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[13px] font-bold text-gray-900">Berhasil Dinonaktifkan</p>
                <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{nonaktifSuccessMessage}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setNonaktifSuccessMessage(null)}
                className="rounded-lg bg-[#1E376C] px-5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#2B4A93]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={hapusTarget !== null}
        title="Hapus data monitoring?"
        message={`Data monitoring untuk ${hapusTarget?.namaMitra ?? ''} akan dihapus dari daftar.`}
        confirmLabel="Ya, hapus"
        onConfirm={jalankanHapusMonitoring}
        onCancel={() => setHapusTarget(null)}
      />
    </div>
  );
}
