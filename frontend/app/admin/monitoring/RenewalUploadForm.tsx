
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Upload, X, AlertCircle, Download } from 'lucide-react';
import { getMasterRuangLingkup, getCachedMasterRuangLingkup, type MasterRuangLingkup } from '@/services/masterRuangLingkupService';
import { compressImageFileIfNeeded, validateSelectedFile } from '@/lib/fileUploadUtils';
import { templateFilesByJenis, templateUrl } from '@/lib/templateDokumen';
import { showNotice } from '@/lib/dialog';

interface RenewalUploadFormProps {
  onSubmit: (data: { tanggalMulaiBaru: string; tanggalBerakhirBaru: string; catatan: string; dokumen: File[]; ruangLingkup: string[] }) => void | Promise<void>;
  // Tampilkan pilihan Ruang Lingkup (seperti di form perpanjangan admin). Bawaan: tidak tampil.
  withRuangLingkup?: boolean;
  // Ruang lingkup kerja sama saat ini, dipakai sebagai pilihan awal.
  initialRuangLingkup?: string[];
  // Backend perpanjangan menyimpan satu berkas per permintaan — dipakai form pengusul
  // (internal/eksternal) supaya tidak ada file kedua yang diam-diam terbuang.
  singleFile?: boolean;
  submitting?: boolean;
}

export default function RenewalUploadForm({ onSubmit, singleFile = false, submitting = false, withRuangLingkup = false, initialRuangLingkup = [] }: RenewalUploadFormProps) {
  const [tanggalMulaiBaru, setTanggalMulaiBaru] = useState('');
  const [tanggalBerakhirBaru, setTanggalBerakhirBaru] = useState('');
  const [catatan, setCatatan] = useState('');
  const [dokumen, setDokumen] = useState<File[]>([]);
  const [error, setError] = useState('');

  const [masterRuangLingkupList, setMasterRuangLingkupList] = useState<MasterRuangLingkup[]>(() => getCachedMasterRuangLingkup());
  const [loadingRuangLingkup, setLoadingRuangLingkup] = useState(withRuangLingkup && masterRuangLingkupList.length === 0);
  const [selectedRuangLingkup, setSelectedRuangLingkup] = useState<string[]>(initialRuangLingkup);
  const [ruangLingkupOpen, setRuangLingkupOpen] = useState(false);
  const ruangLingkupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!withRuangLingkup) return;
    getMasterRuangLingkup({ aktif: true })
      .then((list) => setMasterRuangLingkupList(list))
      .catch(() => {})
      .finally(() => setLoadingRuangLingkup(false));
  }, [withRuangLingkup]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ruangLingkupRef.current && !ruangLingkupRef.current.contains(e.target as Node)) {
        setRuangLingkupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleRuangLingkup = (nama: string) => {
    setSelectedRuangLingkup((prev) => (prev.includes(nama) ? prev.filter((n) => n !== nama) : [...prev, nama]));
  };

  const handleAddDokumen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const validationError = validateSelectedFile(file, {
        accept: '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',
        maxSizeBytes: 10 * 1024 * 1024,
      });
      if (validationError) {
        showNotice(validationError);
        return;
      }
      const processedFile = await compressImageFileIfNeeded(file, {
        maxDimension: 1920,
        quality: 0.8,
        minBytesToCompress: 400 * 1024,
      });
      setDokumen((prev) => (singleFile ? [processedFile] : [...prev, processedFile]));
    };
    input.click();
  };

  const handleRemoveDokumen = (index: number) => {
    setDokumen((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!tanggalMulaiBaru || !tanggalBerakhirBaru) {
      setError('Silakan isi tanggal mulai dan tanggal berakhir perpanjangan.');
      return;
    }
    if (new Date(tanggalBerakhirBaru) < new Date(tanggalMulaiBaru)) {
      setError('Tanggal berakhir tidak boleh lebih kecil dari tanggal mulai.');
      return;
    }
    if (dokumen.length === 0) {
      setError('Silakan upload dokumen perpanjangan.');
      return;
    }
    try {
      await onSubmit({ tanggalMulaiBaru, tanggalBerakhirBaru, catatan, dokumen, ruangLingkup: withRuangLingkup ? selectedRuangLingkup : [] });
    } catch (err) {
      // Form tetap terisi supaya pengguna tidak perlu mengunggah ulang.
      setError(err instanceof Error ? err.message : 'Gagal mengajukan perpanjangan.');
      return;
    }
    setTanggalMulaiBaru('');
    setTanggalBerakhirBaru('');
    setCatatan('');
    setDokumen([]);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-4">
      <div className="mb-3 flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
        <AlertCircle size={16} className="text-yellow-600" />
        <span className="text-xs text-yellow-800">Unggah dokumen kerja sama terbaru (MoU/MoA/IA) sebagai dasar perpanjangan.</span>
      </div>
      <div className="mb-3">
        <span className="block text-xs font-semibold text-blue-700 mb-1">Template Dokumen</span>
        <div className="flex flex-wrap gap-2">
          {Object.values(templateFilesByJenis).flat().map((file) => (
            <a
              key={file.fileName}
              href={templateUrl(file.fileName)}
              download={file.fileName}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Download size={12} />
              Template {file.label}
            </a>
          ))}
        </div>
        <span className="block text-[11px] text-blue-600 mt-1">Template bersifat opsional, kamu bisa langsung upload dokumen tanpa download template.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">Dari Tanggal</label>
          <input
            type="date"
            value={tanggalMulaiBaru}
            onChange={(e) => setTanggalMulaiBaru(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">Sampai Tanggal</label>
          <input
            type="date"
            value={tanggalBerakhirBaru}
            onChange={(e) => setTanggalBerakhirBaru(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
          />
        </div>
      </div>
      {withRuangLingkup && (
        <div ref={ruangLingkupRef} className="relative mt-3">
          <label className="mb-1 block text-xs font-semibold text-gray-700">Ruang Lingkup Kerjasama</label>
          <button
            type="button"
            onClick={() => setRuangLingkupOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
          >
            <span className={selectedRuangLingkup.length === 0 ? 'text-gray-400' : 'font-medium'}>
              {selectedRuangLingkup.length === 0
                ? 'Pilih ruang lingkup...'
                : selectedRuangLingkup.length === 1
                  ? selectedRuangLingkup[0]
                  : `${selectedRuangLingkup.length} ruang lingkup dipilih`}
            </span>
            <ChevronDown size={16} className={`text-blue-600 transition-transform ${ruangLingkupOpen ? 'rotate-180' : ''}`} />
          </button>
          {selectedRuangLingkup.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedRuangLingkup.map((nama) => (
                <span key={nama} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  {nama}
                  <button type="button" onClick={() => toggleRuangLingkup(nama)} className="hover:text-blue-600">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {ruangLingkupOpen && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-blue-200 bg-white shadow-lg">
              {loadingRuangLingkup ? (
                <p className="px-3 py-2 text-xs text-gray-500">Memuat opsi...</p>
              ) : masterRuangLingkupList.length === 0 ? (
                <p className="px-3 py-2 text-xs italic text-gray-500">Tidak ada data tersedia.</p>
              ) : (
                <ul className="max-h-52 overflow-y-auto py-1">
                  {masterRuangLingkupList.map((item) => {
                    const checked = selectedRuangLingkup.includes(item.nama_ruang_lingkup);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => toggleRuangLingkup(item.nama_ruang_lingkup)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 ${checked ? 'font-semibold text-blue-800' : 'text-gray-700'}`}
                        >
                          {item.nama_ruang_lingkup}
                          {checked && <Check size={14} className="shrink-0 text-blue-600" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <p className="mt-1 text-[11px] text-gray-500">Kosongkan bila ruang lingkup tidak berubah dari kerja sama sebelumnya.</p>
        </div>
      )}
      <textarea
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        placeholder="Catatan perpanjangan (opsional)..."
        rows={2}
        className="mt-3 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
      />
      <div className="mt-4">
        <label className="block text-xs font-semibold text-gray-700 mb-1">Upload Dokumen Baru</label>
        {dokumen.length > 0 && (
          <div className="space-y-2 mb-2">
            {dokumen.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Upload size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-700">{file.name}</span>
                  <span className="text-xs text-gray-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDokumen(index)}
                  className="text-red-500 transition-colors hover:text-red-700"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleAddDokumen}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 py-4 text-sm font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
        >
          <Plus size={16} />
          {singleFile && dokumen.length > 0 ? 'Ganti Dokumen' : 'Tambah Dokumen'}
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting ? 'Mengirim...' : 'Ajukan Perpanjangan'}
      </button>
    </form>
  );
}
