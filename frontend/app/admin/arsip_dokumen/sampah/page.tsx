'use client';

import { useEffect, useState } from 'react';
import { Trash2, Search, RotateCcw, Info, ShieldAlert, FileText } from 'lucide-react';
import {
  fetchTrashDokumenFromApi,
  restoreDokumenKerjasamaById,
  permanentDeleteDokumenKerjasamaById,
  type TrashDokumenApiItem,
} from '@/services/dokumenKerjasamaApiService';
import ConfirmDialog from '@/components/ConfirmDialog';
import FileDownloadLink from '@/components/FileDownloadLink';

const jenisColor: Record<string, string> = {
  MoA: 'bg-blue-50 text-blue-700',
  MoU: 'bg-purple-50 text-purple-700',
  IA: 'bg-orange-50 text-orange-700',
  Lainnya: 'bg-gray-100 text-gray-700',
};

const statusColor: Record<string, string> = {
  Aktif: 'bg-green-100 text-green-700',
  'Akan Berakhir': 'bg-orange-100 text-orange-700',
  Kadaluarsa: 'bg-red-100 text-red-700',
};

export default function SampahDokumenPage() {
  const [search, setSearch] = useState('');
  const [data, setData] = useState<TrashDokumenApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoreCandidate, setRestoreCandidate] = useState<TrashDokumenApiItem | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [permanentCandidate, setPermanentCandidate] = useState<TrashDokumenApiItem | null>(null);
  const [permanentLoading, setPermanentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    try {
      const rows = await fetchTrashDokumenFromApi();
      setData(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data Sampah.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const confirmRestore = async () => {
    if (!restoreCandidate) return;
    setRestoreLoading(true);
    try {
      await restoreDokumenKerjasamaById(restoreCandidate.id);
      setData((prev) => prev.filter((d) => d.id !== restoreCandidate.id));
      setRestoreCandidate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulihkan dokumen.');
    } finally {
      setRestoreLoading(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!permanentCandidate) return;
    setPermanentLoading(true);
    try {
      await permanentDeleteDokumenKerjasamaById(permanentCandidate.id);
      setData((prev) => prev.filter((d) => d.id !== permanentCandidate.id));
      setPermanentCandidate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus dokumen secara permanen.');
    } finally {
      setPermanentLoading(false);
    }
  };

  const filtered = data.filter(
    (item) =>
      item.namaMitra.toLowerCase().includes(search.toLowerCase()) ||
      item.noDokumen.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[17px] font-bold text-gray-900">Sampah Dokumen Kerjasama</h1>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Dokumen yang dihapus dari Rekap Data — masih tersimpan dan bisa dipulihkan kapan saja
        </p>
      </div>

      <div className="card bg-blue-50 border border-blue-200 p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <Info size={18} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-blue-900 text-[12px] mb-2">Cara Kerja Sampah</h3>
            <ul className="text-[12px] text-blue-800 space-y-1.5 list-disc list-inside">
              <li>
                Dokumen yang dihapus di Rekap Data (oleh admin maupun pemiliknya sendiri) tidak langsung hilang — masuk ke sini dulu.
              </li>
              <li>
                Klik <span className="font-semibold">Pulihkan</span> untuk mengembalikan dokumen ke Rekap Data seperti semula.
              </li>
              <li>
                Belum ada batas waktu penghapusan otomatis — dokumen tetap ada di sini sampai dipulihkan atau dihapus permanen secara manual.
              </li>
              <li>
                <span className="font-semibold">Hapus Permanen</span> tidak bisa dibatalkan — gunakan hanya jika benar-benar yakin.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari dokumen di Sampah..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-full pl-9 pr-4 py-2.5 text-[12px]"
          />
        </div>
        <span className="text-[11px] text-gray-500">{filtered.length} dokumen di Sampah</span>
      </div>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-[12px] border-collapse">
            <thead>
              <tr className="table-head border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                <th className="py-3 px-4 whitespace-nowrap">No. Dokumen</th>
                <th className="py-3 px-4">Nama Mitra</th>
                <th className="py-3 px-4 whitespace-nowrap">Jenis</th>
                <th className="py-3 px-4 whitespace-nowrap">Berlaku Hingga</th>
                <th className="py-3 px-4 whitespace-nowrap">Status</th>
                <th className="py-3 px-4 whitespace-nowrap">Dihapus Oleh</th>
                <th className="py-3 px-4 whitespace-nowrap">Dihapus Pada</th>
                <th className="py-3 px-4 whitespace-nowrap text-center">Dokumen</th>
                <th className="py-3 px-4 whitespace-nowrap text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-gray-400">
                    Memuat data...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-gray-400">
                    Sampah kosong
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
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
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap text-[10px]">{item.berlakuHingga}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor[item.status]}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[10px] text-gray-600 whitespace-nowrap">
                      {item.dihapusOlehAdmin ? 'Admin' : item.dihapusOlehPemilik ? 'Pemilik dokumen' : '-'}
                    </td>
                    <td className="py-3 px-4 text-[10px] text-gray-600 whitespace-nowrap">{item.dihapusPada || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      {item.dokumenUrl ? (
                        <FileDownloadLink
                          url={item.dokumenUrl}
                          downloadUrl={item.dokumenDownloadUrl}
                          fileName={item.dokumenNama}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-[10px] font-medium whitespace-nowrap"
                          title="Buka dokumen untuk dipastikan isinya"
                        >
                          <FileText size={13} />
                          Lihat Dokumen
                        </FileDownloadLink>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setRestoreCandidate(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-[10.5px] font-semibold text-green-700 hover:bg-green-100 transition-colors whitespace-nowrap"
                          title="Pulihkan dokumen"
                        >
                          <RotateCcw size={11} />
                          Pulihkan
                        </button>
                        <button
                          onClick={() => setPermanentCandidate(item)}
                          className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition"
                          title="Hapus Permanen"
                        >
                          <Trash2 size={13} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!restoreCandidate}
        title="Pulihkan Dokumen Ini?"
        message={`Dokumen "${restoreCandidate?.noDokumen}" (${restoreCandidate?.namaMitra}) akan dikembalikan ke Rekap Data seperti semula.`}
        confirmLabel="Ya, Pulihkan"
        tone="default"
        loading={restoreLoading}
        onConfirm={confirmRestore}
        onCancel={() => setRestoreCandidate(null)}
      />

      <ConfirmDialog
        open={!!permanentCandidate}
        title="Hapus Dokumen Permanen?"
        message={
          <span className="flex items-start gap-1.5">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-red-500" />
            Dokumen "{permanentCandidate?.noDokumen}" ({permanentCandidate?.namaMitra}) akan dihapus permanen dari database dan
            tidak bisa dikembalikan lagi.
          </span>
        }
        confirmLabel="Ya, Hapus Permanen"
        tone="danger"
        loading={permanentLoading}
        onConfirm={confirmPermanentDelete}
        onCancel={() => setPermanentCandidate(null)}
      />
    </div>
  );
}
