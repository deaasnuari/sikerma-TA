'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, FileText, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

import DetailKerjasamaModal from './DetailKerjasamaModal';
import EditDokumenModal from './EditDokumenModal';
import LaporanPelaksanaanModal, { type LaporanPelaksanaanData } from '@/components/LaporanPelaksanaanModal';

import {
  deleteRekapDokumen,
  rekapJenisMitraOptions,
  rekapJurusanOptions,
  rekapTingkatPerusahaanOptions,
  type RekapDokumen,
} from '@/services/adminRekapDataService';
import { fetchRekapDokumenFromApi } from '@/services/dokumenKerjasamaApiService';
import { fetchPengajuanDataFromApi, type PengajuanItem, type PengajuanStatus } from '@/services/adminPengajuanService';

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

// Sementara: seluruh dokumen kerjasama yang sudah ada sebelum fitur pemisahan data
// internal ini dibuat (id <= cutoff) dianggap "data admin" dan disembunyikan dari
// rekap internal. Dokumen baru (id > cutoff) akan tetap tampil seperti biasa.
const ADMIN_LEGACY_DOKUMEN_CUTOFF_ID = 1181;

export default function InternalRekapDataPage() {
  const { user } = useAuth();

  const [data, setData] = useState<KerjasamaItem[]>([]);
  const [search, setSearch] = useState('');
  const [filterJurusan, setFilterJurusan] = useState('Semua Jurusan');
  const [filterJenis, setFilterJenis] = useState('Semua Jenis');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterJenisMitra, setFilterJenisMitra] = useState('Semua Jenis Mitra');
  const [filterTingkatPerusahaan, setFilterTingkatPerusahaan] = useState('Semua Tingkat Perusahaan');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState(1);

  const [detailItem, setDetailItem] = useState<KerjasamaItem | null>(null);
  const [editItem, setEditItem] = useState<KerjasamaItem | null>(null);
  const [laporanItem, setLaporanItem] = useState<LaporanPelaksanaanData | null>(null);

  const [masterJurusanOptions, setMasterJurusanOptions] = useState<string[]>([]);

  const jurusanOptions = useMemo(() => {
    const merged = Array.from(new Set([...rekapJurusanOptions, ...masterJurusanOptions]));
    return ['Semua Jurusan', ...merged];
  }, [masterJurusanOptions]);

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

        const names = Array.from(
          new Set([...jurusanRows, ...unitRows, ...prodiRows].map((item) => item.nama).filter(Boolean))
        );
        setMasterJurusanOptions(names);
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
        const rekapData = await fetchRekapDokumenFromApi();
        if (!mounted) return;

        if (rekapData.length > 0) {
          setData(rekapData.map(mapRekapToItem));
          return;
        }

        // Fallback: tampilkan dari pengajuan yang sudah di-ACC jika monitoring belum terisi
        const allPengajuan = await fetchPengajuanDataFromApi({ perPage: 500 });
        if (!mounted) return;
        const approvedInternal = allPengajuan.filter(
          (item) => APPROVED_STATUSES.has(item.statusPengajuan) && item.kategoriPengajuan !== 'Eksternal',
        );
        setData(approvedInternal.map(mapApprovedPengajuanToItem));
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

  function handleDelete(item: KerjasamaItem) {
    if (!window.confirm(`Yakin ingin menghapus dokumen ${item.noDokumen}?`)) return;
    deleteRekapDokumen(item.noDokumen);
  }

  const filteredData = useMemo(() => {
    const filtered = data.filter((item) => {
      const keyword = search.toLowerCase().trim();

      const matchesSearch =
        keyword === '' ||
        item.namaMitra.toLowerCase().includes(keyword) ||
        item.noDokumen.toLowerCase().includes(keyword);

      const matchesJurusan = filterJurusan === 'Semua Jurusan' || item.unit === filterJurusan;
      const matchesJenis = filterJenis === 'Semua Jenis' || item.jenis === filterJenis;
      const matchesStatus = filterStatus === 'Semua Status' || item.status === filterStatus;
      const matchesJenisMitra = filterJenisMitra === 'Semua Jenis Mitra' || item.jenisMitra === filterJenisMitra;
      const matchesTingkatPerusahaan =
        filterTingkatPerusahaan === 'Semua Tingkat Perusahaan' || item.tingkatPerusahaan === filterTingkatPerusahaan;
      const matchesScopedUnit = !scopedUnit || item.unit.trim().toLowerCase() === scopedUnit.toLowerCase();
      const isLegacyAdminData = typeof item.id === 'number' && item.id <= ADMIN_LEGACY_DOKUMEN_CUTOFF_ID;
      const isCreatedByAdmin = item.dibuatOlehRole === 'admin';

      return (
        matchesSearch && matchesJurusan && matchesJenis && matchesStatus &&
        matchesJenisMitra && matchesTingkatPerusahaan &&
        matchesScopedUnit && !isLegacyAdminData && !isCreatedByAdmin
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
    const headers = ['No. Dokumen', 'Nama Mitra', 'Jenis', 'Unit', 'Tanggal Mulai', 'Berlaku Hingga', 'Status'];
    const rows = filteredData.map((item) => [
      item.noDokumen,
      item.namaMitra,
      item.jenis,
      item.unit,
      item.tanggalMulai,
      item.berlakuHingga,
      item.status,
    ]);
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
              <select
                value={filterJurusan}
                onChange={(e) => {
                  setFilterJurusan(e.target.value);
                  setCurrentPage(1);
                }}
                className="input-field px-3 py-2 text-[12px] text-gray-700"
              >
                {jurusanOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            <select
              value={filterJenis}
              onChange={(e) => {
                setFilterJenis(e.target.value);
                setCurrentPage(1);
              }}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {jenisOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <select
              value={filterJenisMitra}
              onChange={(e) => {
                setFilterJenisMitra(e.target.value);
                setCurrentPage(1);
              }}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {jenisMitraOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <select
              value={filterTingkatPerusahaan}
              onChange={(e) => {
                setFilterTingkatPerusahaan(e.target.value);
                setCurrentPage(1);
              }}
              className="input-field px-3 py-2 text-[12px] text-gray-700"
            >
              {tingkatPerusahaanOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

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
          <table className="min-w-[1300px] w-full border-collapse">
            <thead>
              <tr className="table-head border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                <th className="px-4 py-3">No. Dokumen</th>
                <th className="px-4 py-3">Nama Mitra</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Jenis Mitra</th>
                <th className="px-4 py-3">Tingkat Perusahaan</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Tanggal mulai</th>
                <th className="px-4 py-3">Berlaku Hingga</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Manfaat Kerja Sama</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-[12px] text-gray-500">
                    Data tidak ditemukan berdasarkan filter saat ini.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, index) => (
                  <tr
                    key={`${row.noDokumen}-${index}`}
                    className="border-b border-gray-100 text-[12px] text-gray-700 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 text-[10px] text-gray-600">
                      {row.noDokumen}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.namaMitra}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${jenisBadgeMap[row.jenis]}`}>
                        {row.jenis}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.jenisMitra || '-'}</td>
                    <td className="px-4 py-3">{row.tingkatPerusahaan || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-[#1E376C] px-3 py-1 text-[10px] font-medium text-white">
                        {row.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.tanggalMulai}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.berlakuHingga}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${statusBadgeMap[row.status]}`}>
                        {row.status}
                      </span>
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
                      </div>
                    </td>
                  </tr>
                ))
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
        <DetailKerjasamaModal item={detailItem} onClose={() => setDetailItem(null)} />
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

