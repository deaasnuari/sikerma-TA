'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Search,
  Download,
  Trash2,
  FileText,
  AlertCircle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { fetchArsipDokumenFromApi } from '@/services/dokumenKerjasamaApiService';
import { exportToExcel } from '@/lib/exportExcel';

interface ArsipDokumen {
  id: number;
  noDokumen: string;
  namaMitra: string;
  jenis: 'MoA' | 'MoU' | 'IA';
  tanggalMulai: string;
  berlakuHingga: string;
  alasanArsip: string | null;
  buktiPdf: string | null;
}

function toDisplayDate(value?: string): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
}

const jenisColor: Record<string, string> = {
  MoA: 'bg-blue-50 text-blue-700',
  MoU: 'bg-purple-50 text-purple-700',
  IA: 'bg-orange-50 text-orange-700',
};

export default function ArsipDokumenPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ArsipDokumen[]>([]);
  const [activeTab, setActiveTab] = useState<'akan-kadaluarsa' | 'kadaluarsa'>('akan-kadaluarsa');

  const handlePerpanjang = (item: ArsipDokumen) => {
    sessionStorage.setItem('open-perpanjang-id', String(item.id));
    router.push('/admin/monitoring');
  };

  // Helper function to determine document status
  const getDocumentStatus = (berlakuHingga: string): 'akan-kadaluarsa' | 'kadaluarsa' | null => {
    const dateStr = berlakuHingga.split('/').reverse().join('-');
    const expiryDate = new Date(dateStr);
    const today = new Date();
    
    // Reset time to compare only dates
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);

    if (isNaN(expiryDate.getTime())) {
      return null;
    }

    // Jika sudah berlalu
    if (expiryDate < today) {
      return 'kadaluarsa'; // Already expired
    }

    // 3 months warning threshold
    const threeMonthsFromNow = new Date(today);
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    // Jika akan berakhir dalam 3 bulan ke depan
    if (expiryDate <= threeMonthsFromNow) {
      return 'akan-kadaluarsa'; // Will expire within 3 months
    }

    // Masih jauh dari masa berlaku, tidak perlu di arsip
    return null;
  };

  useEffect(() => {
    let mounted = true;

    const loadArsip = async () => {
      try {
        const rows = await fetchArsipDokumenFromApi();
        if (!mounted) {
          return;
        }

        setData(
          rows.map((item) => ({
            id: item.id,
            noDokumen: item.noDokumen,
            namaMitra: item.namaMitra,
            jenis: item.jenis,
            tanggalMulai: item.tanggalMulai,
            berlakuHingga: item.berlakuHingga,
            alasanArsip: item.alasanArsip,
            buktiPdf: item.buktiPdf,
          }))
        );
      } catch {
        if (mounted) {
          setData([]);
        }
      }
    };

    loadArsip();

    return () => {
      mounted = false;
    };
  }, []);

  const handleDelete = (id: number) => {
    const item = data.find((d) => d.id === id);
    if (!item) return;
    if (!confirm(`Yakin ingin menghapus arsip "${item.noDokumen}" (${item.namaMitra})?`)) return;
    setData((prev) => prev.filter((d) => d.id !== id));
  };

  // Filter dan deduplikasi berdasarkan id
  const filteredRaw = data.filter(
    (item) =>
      item.namaMitra.toLowerCase().includes(search.toLowerCase()) ||
      item.noDokumen.toLowerCase().includes(search.toLowerCase())
  );
  const seen = new Set();
  const filtered = [];
  for (const item of filteredRaw) {
    if (!seen.has(item.id)) {
      const status = getDocumentStatus(item.berlakuHingga);
      if (status === activeTab && status !== null) {
        filtered.push(item);
      }
      seen.add(item.id);
    }
  }

  const handleExportExcel = () => {
    const headers = ['No', 'No Dokumen', 'Nama Mitra', 'Jenis', 'Tanggal Mulai', 'Berlaku Hingga', 'Alasan Arsip', 'Bukti PDF'];
    const rows = filtered.map((item, index) => [
      index + 1,
      item.noDokumen,
      item.namaMitra,
      item.jenis,
      item.tanggalMulai,
      item.berlakuHingga,
      item.alasanArsip || '-',
      item.buktiPdf || '-',
    ]);
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportToExcel(headers, rows, `arsip-dokumen-${dateStamp}.xlsx`, 'Arsip Dokumen');
  };

  const totalArsip = data.filter((item) => {
    const status = getDocumentStatus(item.berlakuHingga);
    return status !== null;
  }).length;
  const akanKadaluarsa = data.filter((item) => getDocumentStatus(item.berlakuHingga) === 'akan-kadaluarsa').length;
  const sudahKadaluarsa = data.filter((item) => getDocumentStatus(item.berlakuHingga) === 'kadaluarsa').length;
  // const tidakDirespon = data.filter(
  //   (item) => item.statusFollowUp === 'Tidak Direspon'
  // ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[17px] font-bold text-gray-900">
          Arsip Dokumen Kerjasama
        </h1>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Daftar dokumen kerjasama yang akan atau sudah kadaluarsa
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Arsip */}
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-50 border-l-4 border-gray-500 flex items-center justify-center shrink-0">
            <Archive size={18} className="text-gray-500" />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 font-medium">Total Dokumen</p>
            <p className="text-[17px] font-bold text-gray-900">{totalArsip}</p>
          </div>
        </div>

        {/* Akan Kadaluarsa */}
        <div className="bg-white rounded-lg border border-orange-200 shadow-sm p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-50 border-l-4 border-orange-500 flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="text-orange-500" />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 font-medium">Akan Kadaluarsa</p>
            <p className="text-[17px] font-bold text-orange-700">{akanKadaluarsa}</p>
          </div>
        </div>

        {/* Sudah Kadaluarsa */}
        <div className="bg-white rounded-lg border border-red-200 shadow-sm p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 border-l-4 border-red-500 flex items-center justify-center shrink-0">
            <Archive size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 font-medium">Sudah Kadaluarsa</p>
            <p className="text-[17px] font-bold text-red-700">{sudahKadaluarsa}</p>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="card bg-blue-50 border border-blue-200 p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <Info size={18} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-blue-900 text-[12px] mb-2">
              Panduan Arsip Dokumen
            </h3>
            <ul className="text-[12px] text-blue-800 space-y-1.5 list-disc list-inside">
              <li>
                <span className="font-semibold">Akan Kadaluarsa (⏰)</span>: Dokumen yang akan berakhir dalam 3 bulan ke depan
              </li>
              <li>
                <span className="font-semibold">Sudah Kadaluarsa (❌)</span>: Dokumen yang sudah melampaui tanggal berlaku
              </li>
              <li>
                Dokumen yang sudah kadaluarsa dapat diperpanjang — klik tombol <span className="font-semibold">Perpanjang</span> untuk langsung membuka form perpanjangan di halaman Status dan Progres Kerja Sama
              </li>
              <li>
                Arsip dapat dihapus permanen oleh admin jika tidak diperlukan lagi
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('akan-kadaluarsa')}
          className={`px-4 py-3 font-semibold text-[12px] border-b-2 transition ${
            activeTab === 'akan-kadaluarsa'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          ⏰ Akan Kadaluarsa ({akanKadaluarsa})
        </button>
        <button
          onClick={() => setActiveTab('kadaluarsa')}
          className={`px-4 py-3 font-semibold text-[12px] border-b-2 transition ${
            activeTab === 'kadaluarsa'
              ? 'border-red-500 text-red-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          ❌ Sudah Kadaluarsa ({sudahKadaluarsa})
        </button>
      </div>

      {/* Search & Export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Cari dokumen arsip..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-full pl-9 pr-4 py-2.5 text-[12px]"
          />
        </div>
        <button
          onClick={handleExportExcel}
          className="btn-primary flex items-center gap-2 text-[12px] font-medium px-4 py-2.5"
        >
          <Download size={15} />
          Export Arsip
        </button>
      </div>

      {/* Table */}
      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-[12px] border-collapse">
            <thead>
              <tr className="table-head border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                <th className="py-3 px-4 whitespace-nowrap">No. Dokumen</th>
                <th className="py-3 px-4">Nama Mitra</th>
                <th className="py-3 px-4 whitespace-nowrap">Jenis</th>
                <th className="py-3 px-4 whitespace-nowrap">Tgl Mulai</th>
                <th className="py-3 px-4 whitespace-nowrap">Berlaku Hingga</th>
                <th className="py-3 px-4 whitespace-nowrap">Status</th>
                <th className="py-3 px-4">Alasan Arsip</th>
                <th className="py-3 px-4 whitespace-nowrap text-center">Bukti PDF</th>
                <th className="py-3 px-4 whitespace-nowrap text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-gray-400">
                    Tidak ada data ditemukan
                  </td>
                </tr>
              )}
              {filtered.map((item) => {
                const isKadaluarsa = getDocumentStatus(item.berlakuHingga) === 'kadaluarsa';
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 transition-colors ${
                      isKadaluarsa ? 'bg-red-50/40 hover:bg-red-50' : 'bg-orange-50/30 hover:bg-orange-50'
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-gray-900 whitespace-nowrap text-[10px]">
                      {item.noDokumen}
                    </td>
                    <td className="py-3 px-4 text-gray-700 max-w-[200px]">
                      <span className="block truncate" title={item.namaMitra}>
                        {item.namaMitra}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${jenisColor[item.jenis]}`}>
                        {item.jenis}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap text-[10px]">{item.tanggalMulai}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-[10px] font-semibold">
                      <span className={isKadaluarsa ? 'text-red-600' : 'text-orange-600'}>{item.berlakuHingga}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        isKadaluarsa ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {isKadaluarsa ? '❌ Kadaluarsa' : '⏰ Akan Kadaluarsa'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[10px] text-gray-600 max-w-[180px]">
                      <span className="block truncate" title={item.alasanArsip || '-'}>
                        {item.alasanArsip || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.buktiPdf ? (
                        <a
                          href={item.buktiPdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-[10px] font-medium whitespace-nowrap"
                        >
                          <FileText size={13} />
                          Lihat PDF
                        </a>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handlePerpanjang(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-[10.5px] font-semibold text-green-700 hover:bg-green-100 transition-colors whitespace-nowrap"
                          title="Perpanjang di Monitoring"
                        >
                          <RefreshCw size={11} />
                          Perpanjang
                        </button>
                        <button
                          className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition"
                          title="Download"
                        >
                          <Download size={13} className="text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition"
                          title="Hapus Arsip"
                        >
                          <Trash2 size={13} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
