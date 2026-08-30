'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, FileText, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

import DetailKerjasamaModal from './DetailKerjasamaModal';
import EditDokumenModal from './EditDokumenModal';
import LaporanPelaksanaanModal, { type LaporanPelaksanaanData } from '@/components/LaporanPelaksanaanModal';
import GroupedFilterSelect from '@/components/GroupedFilterSelect';

import {
  getRekapStats,
  rekapJenisMitraOptions,
  rekapTingkatPerusahaanOptions,
  type DokumenTerkait,
  type RekapDokumen,
} from '@/services/adminRekapDataService';
import { deleteDokumenKerjasamaById, fetchRekapDokumenFromApi } from '@/services/dokumenKerjasamaApiService';
import { deletePengajuanItemApi, fetchPengajuanDataFromApi, type PengajuanItem, type PengajuanStatus } from '@/services/adminPengajuanService';

import { getMasterUnitProdi } from '@/services/masterUnitProdiService';
import { exportToExcel } from '@/lib/exportExcel';

type ApprovalStatus = 'Menunggu' | 'Disetujui' | 'Ditolak';
type Jenis = 'MoU' | 'MoA' | 'IA';

interface KerjasamaItem {
  id?: number;
  sourcePengajuanId?: number;
  noDokumen: string;
  namaMitra: string;
  jenis: Jenis;
  unit: string;
  tanggalMulai: string;
  berlakuHingga: string;
  status: ApprovalStatus;
  ruangLingkup: string[];
  dibuatOlehRole?: string | null;
  jenisMitra?: string;
  tingkatPerusahaan?: string;
  manfaatKerjasama?: string;
  // --- Field tambahan supaya kolom tabel disamakan dengan Rekap Data admin ---
  bidangUsaha?: string;
  alamatMitra?: string;
  picMitra?: string;
  kodePerusahaan?: string;
  judulKegiatan?: string;
  manfaatSebenarnya?: string;
  luaranKerjaSama?: string;
  durasiTahun?: number;
  jurusanNama?: string;
  prodiNama?: string;
  unitKerjaNama?: string;
  dokumenTerkait?: DokumenTerkait[];
}

function mapRekapToItem(d: RekapDokumen): KerjasamaItem {
  const statusMap: Record<string, ApprovalStatus> = {
    Aktif: 'Disetujui',
    'Akan Berakhir': 'Disetujui',
    Kadaluarsa: 'Ditolak',
  };

  return {
    id: d.id,
    sourcePengajuanId: d.sourcePengajuanId,
    noDokumen: d.noDokumen,
    namaMitra: d.namaMitra,
    jenis: d.jenis as Jenis,
    unit: d.unit,
    tanggalMulai: d.tanggalMulai,
    berlakuHingga: d.berlakuHingga,
    status: statusMap[d.status] ?? 'Menunggu',
    ruangLingkup: d.ruangLingkup ?? [],
    dibuatOlehRole: d.dibuatOlehRole ?? null,
    jenisMitra: d.jenisMitra,
    tingkatPerusahaan: d.tingkatPerusahaan,
    manfaatKerjasama: d.manfaatKerjasama,
    bidangUsaha: d.bidangUsaha,
    alamatMitra: d.alamatMitra,
    picMitra: d.picMitra,
    kodePerusahaan: d.kodePerusahaan,
    judulKegiatan: d.judulKegiatan,
    manfaatSebenarnya: d.manfaatSebenarnya,
    luaranKerjaSama: d.luaranKerjaSama,
    durasiTahun: d.durasiTahun,
    jurusanNama: d.jurusanNama,
    prodiNama: d.prodiNama,
    unitKerjaNama: d.unitKerjaNama,
    dokumenTerkait: d.dokumenTerkait,
  };
}

const APPROVED_STATUSES = new Set<PengajuanStatus>([
  'Disetujui',
  'Disetujui Internal',
  'Disetujui Mitra',
  'Final Approved',
]);

function mapApprovedPengajuanToItem(p: PengajuanItem): KerjasamaItem {
  return {
    noDokumen: p.nomorPengajuan || `PGJ-${p.id}`,
    namaMitra: p.namaMitra,
    jenis: (p.jenisDokumen || 'MoU') as Jenis,
    unit: p.namaUnitProdi || '-',
    tanggalMulai: p.tanggalMulai || '-',
    berlakuHingga: p.tanggalBerakhir || '-',
    status: 'Disetujui',
    ruangLingkup: p.ruangLingkup ?? [],
  };
}

const jenisBadgeMap: Record<Jenis, string> = {
  MoU: 'bg-violet-100 text-violet-700',
  MoA: 'bg-cyan-100 text-cyan-700',
  IA: 'bg-orange-100 text-orange-700',
};

const statusBadgeMap: Record<ApprovalStatus, string> = {
  Menunggu: 'bg-orange-500 text-white',
  Disetujui: 'bg-green-500 text-white',
  Ditolak: 'bg-red-500 text-white',
};

const jenisOptions: Array<'Semua Jenis' | Jenis> = ['Semua Jenis', 'MoU', 'MoA', 'IA'];
const statusOptions: Array<'Semua Status' | ApprovalStatus> = [
  'Semua Status',
  'Menunggu',
  'Disetujui',
  'Ditolak',
];

const ITEMS_PER_PAGE = 10;

// Admin legacy data cutoff: dokumen dengan ID <= 1181 dibuat oleh admin lama, dan tidak boleh ditampilkan di halaman internal rekap data.
const ADMIN_LEGACY_DOKUMEN_CUTOFF_ID = 1181;

export default function InternalRekapDataPage() {
  const { user } = useAuth();

  const [data, setData] = useState<KerjasamaItem[]>([]);
  // Dihitung dari data mentah (RekapDokumen) sebelum di-mapping ke KerjasamaItem — soalnya
  // mapping-nya menyederhanakan status jadi Disetujui/Ditolak, jadi rincian Aktif/Akan
  // Berakhir/Kadaluarsa harus diambil di titik ini (sama seperti admin/rekap_data).
  const [stats, setStats] = useState({ totalKerjasama: 0, totalAktif: 0, totalAkanBerakhir: 0, totalKadaluarsa: 0 });
  const [search, setSearch] = useState('');
  const [filterJurusan, setFilterJurusan] = useState('Semua Jurusan/unit');
  const [filterJenis, setFilterJenis] = useState('Semua Jenis');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterJenisMitra, setFilterJenisMitra] = useState('Semua Jenis Mitra');
  const [filterTingkatPerusahaan, setFilterTingkatPerusahaan] = useState('Semua Tingkat Perusahaan');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState(1);

  const [detailItem, setDetailItem] = useState<KerjasamaItem | null>(null);
  const [editItem, setEditItem] = useState<KerjasamaItem | null>(null);
  const [laporanItem, setLaporanItem] = useState<LaporanPelaksanaanData | null>(null);

  // Dipakai untuk mengisi tab Kontak & Histori di modal Detail Kerjasama dengan data pengajuan
  // asli yang sudah di-ACC admin (mitraPicNama, accInternalAt, tahapanRiwayat, dst), bukan dummy.
  const [allPengajuan, setAllPengajuan] = useState<PengajuanItem[]>([]);

  // Dipisah per kategori (Jurusan / Program Studi / Unit Kerja) — sama seperti admin/rekap_data
  // — supaya dropdown filter bisa dikelompokkan dan selalu ikut Data Master (bukan daftar
  // hardcode) begitu nama Jurusan/Unit diganti/disinkron ulang.
  const [masterJurusanNames, setMasterJurusanNames] = useState<string[]>([]);
  const [masterProdiNames, setMasterProdiNames] = useState<string[]>([]);
  const [masterUnitNames, setMasterUnitNames] = useState<string[]>([]);

  const unitGroups = useMemo(() => {
    const docDerived = Array.from(new Set(data.map((item) => item.unit).filter(Boolean)));
    const known = new Set([...masterJurusanNames, ...masterProdiNames, ...masterUnitNames]);
    const lainnya = docDerived.filter((nama) => !known.has(nama));

    return { jurusan: masterJurusanNames, prodi: masterProdiNames, unit: masterUnitNames, lainnya };
  }, [data, masterJurusanNames, masterProdiNames, masterUnitNames]);

  const jenisMitraOptions = useMemo(() => [
    'Semua Jenis Mitra',
    ...Array.from(new Set([...rekapJenisMitraOptions, ...data.map((item) => item.jenisMitra).filter((v): v is string => Boolean(v))])),
  ], [data]);

  const tingkatPerusahaanOptions = useMemo(() => [
    'Semua Tingkat Perusahaan',
    ...Array.from(new Set([...rekapTingkatPerusahaanOptions, ...data.map((item) => item.tingkatPerusahaan).filter((v): v is string => Boolean(v))])),
  ], [data]);

  // Akun internal (Jurusan/Prodi) hanya boleh melihat data kerjasama milik unitnya sendiri,
  // dicocokkan dari institution_name yang diisi admin saat membuat akun.
  const scopedUnit = useMemo(() => {
    if (user?.role === 'internal' && user.institution_name?.trim()) {
      return user.institution_name.trim();
    }
    return null;
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    async function loadMasterJurusans() {
      try {
        const [jurusanRows, unitRows, prodiRows] = await Promise.all([
          getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'jurusan', aktif: true }),
          getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'unit_kerja', aktif: true }),
          getMasterUnitProdi({ jenis_node: 'prodi', aktif: true }),
        ]);

        if (!isMounted) return;

        setMasterJurusanNames(Array.from(new Set(jurusanRows.map((item) => item.nama).filter(Boolean))));
        setMasterUnitNames(Array.from(new Set(unitRows.map((item) => item.nama).filter(Boolean))));
        setMasterProdiNames(Array.from(new Set(prodiRows.map((item) => item.nama).filter(Boolean))));
      } catch {
        // fallback tetap gunakan opsi lokal dari service.
      }
    }

    loadMasterJurusans();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        // Data pengajuan lengkap selalu diambil (bukan cuma saat fallback) supaya modal Detail
        // Kerjasama bisa menampilkan Kontak & Histori asli dari pengajuan yang sudah di-ACC admin.
        // forceRefresh: true — jangan pakai cache 60 detik (module-level, bukan per-user),
        // supaya kalau baru ganti akun (mis. jadi Kepala Unit) datanya langsung sesuai
        // scope akses user yang sedang login, bukan sisa cache akun sebelumnya.
        const [rekapData, allPengajuanData] = await Promise.all([
          fetchRekapDokumenFromApi({ forceRefresh: true }),
          fetchPengajuanDataFromApi({ perPage: 500 }),
        ]);
        if (!mounted) return;

        setAllPengajuan(allPengajuanData);

        if (rekapData.length > 0) {
          setData(rekapData.map(mapRekapToItem));
          setStats(getRekapStats(rekapData));
          return;
        }

        // Fallback: tampilkan dari pengajuan yang sudah di-ACC jika monitoring belum terisi
        const approvedInternal = allPengajuanData.filter(
          (item) => APPROVED_STATUSES.has(item.statusPengajuan) && item.kategoriPengajuan !== 'Eksternal',
        );
        setData(approvedInternal.map(mapApprovedPengajuanToItem));
        setStats({ totalKerjasama: approvedInternal.length, totalAktif: approvedInternal.length, totalAkanBerakhir: 0, totalKadaluarsa: 0 });
      } catch {
        if (mounted) setData([]);
      }
    };

    void sync();
    const handleUpdate = () => { void sync(); };
    window.addEventListener('rekap-data-updated', handleUpdate);

    return () => {
      mounted = false;
      window.removeEventListener('rekap-data-updated', handleUpdate);
    };
  }, []);

  async function handleDelete(item: KerjasamaItem) {
    if (!window.confirm(`Yakin ingin menghapus dokumen ${item.noDokumen}? Dokumen ini akan dihapus permanen dan tidak bisa dikembalikan lagi.`)) return;

    try {
      // Sudah ada dokumen kerjasama (Rekap Data) -> hapus lewat situ; kalau belum (masih data
      // pengajuan mentah dari fallback), hapus pengajuannya langsung. Backend memastikan yang
      // boleh dihapus cuma milik sendiri — dan sekarang hapus permanen dari database (lihat
      // PengajuanController::destroy / DokumenKerjasamaController::destroy), bukan cuma
      // disembunyikan.
      if (typeof item.id === 'number') {
        await deleteDokumenKerjasamaById(item.id);
      } else if (typeof item.sourcePengajuanId === 'number') {
        await deletePengajuanItemApi(item.sourcePengajuanId);
      }
      setData((prev) => prev.filter((row) => row !== item));
      window.dispatchEvent(new Event('rekap-data-updated'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghapus dokumen.';
      alert(message);
    }
  }

  const filteredData = useMemo(() => {
    const filtered = data.filter((item) => {
      const keyword = search.toLowerCase().trim();

      const matchesSearch =
        keyword === '' ||
        item.namaMitra.toLowerCase().includes(keyword) ||
        item.noDokumen.toLowerCase().includes(keyword);

      const matchesJurusan = filterJurusan === 'Semua Jurusan/unit' || item.unit === filterJurusan;
      const matchesJenis = filterJenis === 'Semua Jenis' || item.jenis === filterJenis;
      const matchesStatus = filterStatus === 'Semua Status' || item.status === filterStatus;
      const matchesJenisMitra = filterJenisMitra === 'Semua Jenis Mitra' || item.jenisMitra === filterJenisMitra;
      const matchesTingkatPerusahaan =
        filterTingkatPerusahaan === 'Semua Tingkat Perusahaan' || item.tingkatPerusahaan === filterTingkatPerusahaan;
      const matchesScopedUnit = !scopedUnit || item.unit.trim().toLowerCase() === scopedUnit.toLowerCase();
      return (
        matchesSearch && matchesJurusan && matchesJenis && matchesStatus &&
        matchesJenisMitra && matchesTingkatPerusahaan &&
        matchesScopedUnit
      );
    });
    return sortOrder === 'oldest' ? [...filtered].reverse() : filtered;
  }, [data, search, filterJurusan, filterJenis, filterStatus, filterJenisMitra, filterTingkatPerusahaan, sortOrder, scopedUnit]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  function handleExport() {
    // Kolom export disamakan dengan kolom tabel Rekap Data di layar (lihat header tabel di bawah),
    // supaya isi Excel tidak berbeda dari apa yang ditampilkan.
    const headers = [
      'No. Dokumen',
      'Nama Mitra',
      'Bidang Usaha',
      'Alamat Mitra',
      'PIC',
      'Kode Perusahaan',
      'Tingkat Perusahaan',
      'Judul Kegiatan Kerja Sama',
      'Manfaat bagi Polibatam/Prodi',
      'Luaran Kerja Sama',
      'Tanggal Awal Kerja Sama',
      'Tanggal Akhir Kerja Sama',
      'Durasi (tahun)',
      'Jurusan/Unit',
      'Status Kerjasama',
      'Jenis',
    ];
    const rows = filteredData.map((item) => {
      const jurusanUnitDisplay = item.jurusanNama
        ? `${item.jurusanNama}${item.prodiNama ? ` / ${item.prodiNama}` : ''}`
        : (item.unitKerjaNama || item.unit || '-');
      return [
        item.noDokumen,
        item.namaMitra,
        item.bidangUsaha || '-',
        item.alamatMitra || '-',
        item.picMitra || '-',
        item.kodePerusahaan || '-',
        item.tingkatPerusahaan || '-',
        item.judulKegiatan || item.noDokumen,
        item.manfaatSebenarnya || item.manfaatKerjasama || '-',
        item.luaranKerjaSama || '-',
        item.tanggalMulai,
        item.berlakuHingga,
        item.durasiTahun ?? '-',
        jurusanUnitDisplay,
        item.status,
        item.jenis,
      ];
    });
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportToExcel(headers, rows, `rekap-kerjasama-${dateStamp}.xlsx`, 'Rekap Kerjasama');
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="page-title">Rekap Data dan Monitoring</h1>
          <p className="page-subtitle mt-1">Kelola dan monitor semua kerjasama</p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          className="btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-semibold shadow-sm"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <StatCard title="Total Kerjasama" value={stats.totalKerjasama} caption="Semua dokumen" valueClassName="text-gray-900" />
        <StatCard title="Aktif" value={stats.totalAktif} caption="Masa berlaku > 3 bulan" valueClassName="text-green-600" />
        <StatCard title="Akan Berakhir" value={stats.totalAkanBerakhir} caption="Masa berlaku < 3 bulan" valueClassName="text-orange-600" />
        <StatCard title="Kadaluarsa" value={stats.totalKadaluarsa} caption="Sudah berakhir" valueClassName="text-red-600" />
      </div>

      {/* Filters */}
      <section className="toolbar-shell p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative w-full md:max-w-md">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari berdasarkan nama mitra atau nomor..."
              className="input-field h-10 w-full pl-10 pr-3 text-[12px] text-gray-700 placeholder:text-gray-400"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            {scopedUnit ? (
              <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-600">
                Unit: {scopedUnit}
              </span>
            ) : (
              <GroupedFilterSelect
                value={filterJurusan}
                onChange={(next) => {
                  setFilterJurusan(next);
                  setCurrentPage(1);
                }}
                allLabel="Semua Jurusan/unit"
                groups={[
                  { label: 'Jurusan', options: unitGroups.jurusan },
                  { label: 'Program Studi', options: unitGroups.prodi },
                  { label: 'Unit Kerja', options: unitGroups.unit },
                  { label: 'Lainnya', options: unitGroups.lainnya },
                ]}
              />
            )}

            <GroupedFilterSelect
              value={filterJenis}
              onChange={(next) => {
                setFilterJenis(next);
                setCurrentPage(1);
              }}
              allLabel={jenisOptions[0]}
              groups={[{ label: '', options: jenisOptions.slice(1) }]}
            />

            <GroupedFilterSelect
              value={filterStatus}
              onChange={(next) => {
                setFilterStatus(next);
                setCurrentPage(1);
              }}
              allLabel={statusOptions[0]}
              groups={[{ label: '', options: statusOptions.slice(1) }]}
            />

            <GroupedFilterSelect
              value={filterJenisMitra}
              onChange={(next) => {
                setFilterJenisMitra(next);
                setCurrentPage(1);
              }}
              allLabel={jenisMitraOptions[0]}
              groups={[{ label: '', options: jenisMitraOptions.slice(1) }]}
            />

            <GroupedFilterSelect
              value={filterTingkatPerusahaan}
              onChange={(next) => {
                setFilterTingkatPerusahaan(next);
                setCurrentPage(1);
              }}
              allLabel={tingkatPerusahaanOptions[0]}
              groups={[{ label: '', options: tingkatPerusahaanOptions.slice(1) }]}
            />

            <select
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value as 'newest' | 'oldest');
                setCurrentPage(1);
              }}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              <option value="newest">Terbaru ke Terlama</option>
              <option value="oldest">Terlama ke Terbaru</option>
            </select>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-[2200px] w-full border-collapse">
            <thead>
              <tr className="table-head border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                <th className="px-4 py-3">No. Dokumen</th>
                <th className="px-4 py-3">Nama Mitra</th>
                <th className="px-4 py-3">Bidang Usaha</th>
                <th className="px-4 py-3">Alamat Mitra</th>
                <th className="px-4 py-3">PIC</th>
                <th className="px-4 py-3">Kode Perusahaan</th>
                <th className="px-4 py-3">Tingkat Perusahaan</th>
                <th className="px-4 py-3">Judul Kegiatan Kerja Sama</th>
                <th className="px-4 py-3">Manfaat bagi Polibatam/Prodi</th>
                <th className="px-4 py-3">Luaran Kerja Sama</th>
                <th className="px-4 py-3">Tanggal Awal Kerja Sama</th>
                <th className="px-4 py-3">Tanggal Akhir Kerja Sama</th>
                <th className="px-4 py-3">Durasi (tahun)</th>
                <th className="px-4 py-3">Jurusan/Unit</th>
                <th className="px-4 py-3">Status Kerjasama</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-4 py-10 text-center text-[12px] text-gray-500">
                    Data tidak ditemukan berdasarkan filter saat ini.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, index) => {
                  // Jenis dokumen ditautkan ke file bukti kerja sama yang sudah diupload untuk
                  // dokumen ini — sama seperti perilaku kolom Jenis di Rekap Data admin.
                  const linkBukti = row.dokumenTerkait && row.dokumenTerkait.length > 0 ? row.dokumenTerkait[0].url : null;
                  // Jurusan/Unit digabung jadi satu kolom, sama seperti tabel admin.
                  const jurusanUnitDisplay = row.jurusanNama
                    ? `${row.jurusanNama}${row.prodiNama ? ` / ${row.prodiNama}` : ''}`
                    : (row.unitKerjaNama || row.unit || '-');
                  return (
                  <tr
                    key={`${row.noDokumen}-${index}`}
                    className="border-b border-gray-100 text-[12px] text-gray-700 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 text-[10px] text-gray-600 whitespace-nowrap">
                      {row.noDokumen}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.namaMitra}</td>
                    <td className="px-4 py-3">{row.bidangUsaha || '-'}</td>
                    <td className="px-4 py-3 max-w-[160px]"><p className="line-clamp-2">{row.alamatMitra || '-'}</p></td>
                    <td className="px-4 py-3">{row.picMitra || '-'}</td>
                    <td className="px-4 py-3 text-[10px] text-gray-600">{row.kodePerusahaan || '-'}</td>
                    <td className="px-4 py-3">{row.tingkatPerusahaan || '-'}</td>
                    <td className="px-4 py-3 max-w-[180px]"><p className="line-clamp-2">{row.judulKegiatan || row.noDokumen}</p></td>
                    <td className="px-4 py-3 max-w-[180px]"><p className="text-[10px] text-gray-600 line-clamp-2">{row.manfaatSebenarnya || row.manfaatKerjasama || '-'}</p></td>
                    <td className="px-4 py-3 max-w-[180px]"><p className="text-[10px] text-gray-600 line-clamp-2">{row.luaranKerjaSama || '-'}</p></td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.tanggalMulai}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.berlakuHingga}</td>
                    <td className="px-4 py-3 text-center">{row.durasiTahun ?? '-'}</td>
                    <td className="px-4 py-3">{jurusanUnitDisplay}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${statusBadgeMap[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {linkBukti ? (
                        <a href={linkBukti} target="_blank" rel="noreferrer" title="Lihat bukti kerja sama">
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold underline decoration-2 underline-offset-2 ${jenisBadgeMap[row.jenis]}`}>{row.jenis}</span>
                        </a>
                      ) : (
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${jenisBadgeMap[row.jenis]}`} title="Belum ada file bukti kerja sama yang diupload">{row.jenis}</span>
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
                          title="Laporan Pelaksanaan"
                          onClick={() => setLaporanItem({
                            namaMitra:   row.namaMitra,
                            noDokumen:   row.noDokumen,
                            jenis:       row.jenis,
                            ruangLingkup: row.ruangLingkup,
                            unit:        row.unit,
                            pengajuanId: row.sourcePengajuanId,
                            dokumenKerjasamaId: row.id,
                          })}
                          className="text-emerald-600 transition-colors hover:text-emerald-800"
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          type="button"
                          title="Hapus dari daftar saya"
                          onClick={() => handleDelete(row)}
                          className="text-red-500 transition-colors hover:text-red-700"
                        >
                          <Trash2 size={16} />
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

        {/* Pagination */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row">
          <p className="text-[12px] text-gray-500">
            Menampilkan {paginatedData.length} dari {filteredData.length} data
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
              Sebelumnya
            </button>

            <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-[#1E376C] px-2 text-[12px] font-semibold text-white">
              {currentPage}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Selanjutnya
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {detailItem && (
        <DetailKerjasamaModal
          item={detailItem}
          pengajuan={allPengajuan.find((p) => p.id === detailItem.sourcePengajuanId)}
          onClose={() => setDetailItem(null)}
        />
      )}

      {editItem && (
        <EditDokumenModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(data) => {
            setEditItem(null);
            alert(`Dokumen "${data.namaMitra}" berhasil diperbarui.`);
          }}
        />
      )}

      <LaporanPelaksanaanModal
        isOpen={laporanItem !== null}
        onClose={() => setLaporanItem(null)}
        data={laporanItem}
      />
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

