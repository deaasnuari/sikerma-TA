
import { useState } from 'react';
import { Plus, Upload, X, AlertCircle, Download } from 'lucide-react';
import { compressImageFileIfNeeded, validateSelectedFile } from '@/lib/fileUploadUtils';

interface RenewalUploadFormProps {
  onSubmit: (data: { tanggalMulaiBaru: string; tanggalBerakhirBaru: string; catatan: string; dokumen: File[] }) => void;
}

export default function RenewalUploadForm({ onSubmit }: RenewalUploadFormProps) {
  const [tanggalMulaiBaru, setTanggalMulaiBaru] = useState('');
  const [tanggalBerakhirBaru, setTanggalBerakhirBaru] = useState('');
  const [catatan, setCatatan] = useState('');
  const [dokumen, setDokumen] = useState<File[]>([]);
  const [error, setError] = useState('');

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
        alert(validationError);
        return;
      }
      const processedFile = await compressImageFileIfNeeded(file, {
        maxDimension: 1920,
        quality: 0.8,
        minBytesToCompress: 400 * 1024,
      });
      setDokumen((prev) => [...prev, processedFile]);
    };
    input.click();
  };

  const handleRemoveDokumen = (index: number) => {
    setDokumen((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
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
    onSubmit({ tanggalMulaiBaru, tanggalBerakhirBaru, catatan, dokumen });
    setTanggalMulaiBaru('');
    setTanggalBerakhirBaru('');
    setCatatan('');
    setDokumen([]);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-4">
      <div className="mb-3 flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
        <AlertCircle size={16} className="text-yellow-600" />
        <span className="text-xs text-yellow-800">Upload dokumen terbaru (MoU/MoA/IA) jika ingin perpanjang, <b>tapi hubungi mitra terlebih dahulu</b>.</span>
      </div>
      <div className="mb-3">
        <span className="block text-xs font-semibold text-blue-700 mb-1">Template Dokumen</span>
        <div className="flex flex-wrap gap-2">
          <a
            href="/templates/Draft MOU Industri.docx"
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            <Download size={12} />
            Template MoU
          </a>
          <a
            href="/templates/DRAFT IA POLIBATAM.docx"
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            <Download size={12} />
            Template IA
          </a>
          <a
            href="/templates/Draft MOA Industri.docx"
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            <Download size={12} />
            Template MoA
          </a>
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
          Tambah Dokumen
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      <button
        type="submit"
        className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
      >
        Ajukan Perpanjangan
      </button>
    </form>
  );
}
