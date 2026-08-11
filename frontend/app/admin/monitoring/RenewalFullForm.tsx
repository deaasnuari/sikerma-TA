import { useState, useEffect, useRef } from 'react';
import { Plus, Upload, X, AlertCircle, RefreshCw, ChevronDown, Check } from 'lucide-react';
import { compressImageFileIfNeeded, validateSelectedFile } from '@/lib/fileUploadUtils';
import { getMasterRuangLingkup, getCachedMasterRuangLingkup, type MasterRuangLingkup } from '@/services/masterRuangLingkupService';

export interface RenewalFullFormProps {
  initialData: {
    namaMitra: string;
    jenisMitra: string;
    teleponMitra: string;
    emailMitra: string;
    alamatLengkap: string;
    negara: string;
    jenisKerjasama: string;
    unitPelaksana: string;
    tanggalMulai: string;
    tanggalBerakhir: string;
    judulKerjasama: string;
    deskripsi: string;
    ruangLingkup: string[];
    kontakNama: string;
    kontakJabatan: string;
    kontakEmail: string;
    kontakTelepon: string;
    dokumenTerakhir?: { nama: string; url: string; ukuran: string; tanggal: string };
    tanggalMulaiBaru?: string;
    tanggalBerakhirBaru?: string;
    catatanPerpanjangan?: string;
  };
  onSubmit: (data: any) => void;
}

export default function RenewalFullForm({ initialData, onSubmit }: RenewalFullFormProps) {
  const [form, setForm] = useState({
    tanggalMulaiBaru: initialData.tanggalMulaiBaru || initialData.tanggalBerakhir,
    tanggalBerakhirBaru: initialData.tanggalBerakhirBaru || '',
    catatanPerpanjangan: initialData.catatanPerpanjangan || '',
  });
  const [dokumen, setDokumen] = useState(initialData.dokumenTerakhir ? [initialData.dokumenTerakhir] : []);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [masterRuangLingkupList, setMasterRuangLingkupList] = useState<MasterRuangLingkup[]>(() => getCachedMasterRuangLingkup());
  const [loadingRuangLingkup, setLoadingRuangLingkup] = useState(masterRuangLingkupList.length === 0);
  const [selectedRuangLingkup, setSelectedRuangLingkup] = useState<string[]>(initialData.ruangLingkup || []);
  const [ruangLingkupOpen, setRuangLingkupOpen] = useState(false);
  const ruangLingkupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMasterRuangLingkup({ aktif: true })
      .then((list) => setMasterRuangLingkupList(list))
      .catch(() => {})
      .finally(() => setLoadingRuangLingkup(false));
  }, []);

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
    setSelectedRuangLingkup((prev) =>
      prev.includes(nama) ? prev.filter((n) => n !== nama) : [...prev, nama]
    );
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
        alert(validationError);
        return;
      }
      const processedFile = await compressImageFileIfNeeded(file, {
        maxDimension: 1920,
        quality: 0.8,
        minBytesToCompress: 400 * 1024,
      });
      const reader = new FileReader();
      reader.onload = () => {
        setDokumen([{ nama: processedFile.name, url: reader.result as string, ukuran: (processedFile.size / 1024 / 1024).toFixed(1) + ' MB', tanggal: new Date().toLocaleDateString('id-ID') }]);
      };
      reader.readAsDataURL(processedFile);
    };
    input.click();
  };

  const handleRemoveDokumen = () => {
    setDokumen([]);
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    setError('');

    if (!form.tanggalMulaiBaru || form.tanggalMulaiBaru.trim() === '') {
      setError('Tanggal mulai perpanjangan wajib diisi.');
      return;
    }
    if (!form.tanggalBerakhirBaru || form.tanggalBerakhirBaru.trim() === '') {
      setError('Tanggal berakhir perpanjangan wajib diisi.');
      return;
    }
    if (!form.catatanPerpanjangan || form.catatanPerpanjangan.trim() === '') {
      setError('Alasan/catatan perpanjangan wajib diisi.');
      return;
    }
    if (dokumen.length === 0) {
      setError('Silakan upload dokumen final yang telah ditandatangani kedua belah pihak.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      onSubmit({
        ...initialData,
        tanggalMulaiBaru: form.tanggalMulaiBaru,
        tanggalBerakhirBaru: form.tanggalBerakhirBaru,
        catatanPerpanjangan: form.catatanPerpanjangan,
        ruangLingkup: selectedRuangLingkup,
        dokumen: dokumen[0],
      });
      setIsSubmitting(false);
    }, 500);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 p-0 md:p-0 bg-white">
      {/* ===== BAGIAN 1: DATA KERJASAMA LAMA (READ-ONLY) ===== */}
      <div className="rounded-xl border border-gray-300 bg-gray-50 p-4">
        <h3 className="font-bold text-gray-900 mb-3 text-base flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-400 text-xs font-bold text-white">1</span>
          Data Kerjasama Saat Ini
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nama Mitra</label>
            <p className="text-sm font-medium text-gray-900">{initialData.namaMitra}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Jenis Kerjasama</label>
            <p className="text-sm font-medium text-gray-900">{initialData.jenisKerjasama}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tanggal Mulai</label>
            <p className="text-sm font-medium text-gray-900">{initialData.tanggalMulai}</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tanggal Berakhir</label>
            <p className="text-sm font-medium text-gray-900">{initialData.tanggalBerakhir}</p>
          </div>
          {initialData.judulKerjasama && (
            <div className="bg-white rounded-lg p-3 border border-gray-200 md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Judul Kerjasama</label>
              <p className="text-sm font-medium text-gray-900">{initialData.judulKerjasama}</p>
            </div>
          )}
        </div>
      </div>

      {/* ===== BAGIAN 2: PERPANJANGAN KERJASAMA (EDITABLE) ===== */}
      <div className="rounded-xl border border-green-300 bg-green-50 p-4">
        <h3 className="font-bold text-green-900 mb-3 text-base flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">2</span>
          Data Perpanjangan Kerjasama
        </h3>

        <div className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-green-900 mb-1.5">Tanggal Mulai Perpanjangan <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.tanggalMulaiBaru}
                onChange={(e) => setForm({ ...form, tanggalMulaiBaru: e.target.value })}
                className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-green-900 mb-1.5">Tanggal Berakhir Perpanjangan <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.tanggalBerakhirBaru}
                onChange={(e) => setForm({ ...form, tanggalBerakhirBaru: e.target.value })}
                className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-green-900 mb-1.5">Alasan/Catatan Perpanjangan <span className="text-red-500">*</span></label>
            <textarea
              value={form.catatanPerpanjangan}
              onChange={(e) => setForm({ ...form, catatanPerpanjangan: e.target.value })}
              placeholder="Jelaskan alasan perpanjangan kerjasama ini..."
              rows={3}
              className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Ruang Lingkup */}
          <div ref={ruangLingkupRef} className="relative">
            <label className="block text-xs font-semibold text-green-900 mb-1.5">Ruang Lingkup Kerjasama</label>
            {/* Trigger button */}
            <button
              type="button"
              onClick={() => setRuangLingkupOpen((o) => !o)}
              className="w-full flex items-center justify-between rounded-lg border border-green-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors hover:border-green-500 focus:border-green-500 focus:ring-2 focus:ring-green-100"
            >
              <span className={selectedRuangLingkup.length === 0 ? 'text-gray-400' : 'font-medium'}>
                {selectedRuangLingkup.length === 0
                  ? 'Pilih ruang lingkup...'
                  : selectedRuangLingkup.length === 1
                    ? selectedRuangLingkup[0]
                    : `${selectedRuangLingkup.length} ruang lingkup dipilih`}
              </span>
              <ChevronDown size={16} className={`text-green-600 transition-transform ${ruangLingkupOpen ? 'rotate-180' : ''}`} />
            </button>
            {/* Selected tags */}
            {selectedRuangLingkup.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedRuangLingkup.map((nama) => (
                  <span key={nama} className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    {nama}
                    <button type="button" onClick={() => toggleRuangLingkup(nama)} className="hover:text-green-600">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Dropdown list */}
            {ruangLingkupOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-green-200 bg-white shadow-lg overflow-hidden">
                {loadingRuangLingkup ? (
                  <p className="px-3 py-2 text-xs text-gray-500">Memuat opsi...</p>
                ) : masterRuangLingkupList.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-500 italic">Tidak ada data tersedia.</p>
                ) : (
                  <ul className="max-h-52 overflow-y-auto py-1">
                    {masterRuangLingkupList.map((item) => {
                      const checked = selectedRuangLingkup.includes(item.nama_ruang_lingkup);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => toggleRuangLingkup(item.nama_ruang_lingkup)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors hover:bg-green-50 ${checked ? 'font-semibold text-green-800' : 'text-gray-700'}`}
                          >
                            {item.nama_ruang_lingkup}
                            {checked && <Check size={14} className="text-green-600 shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== BAGIAN 3: DOKUMEN PERPANJANGAN ===== */}
      <div className="rounded-xl border border-blue-300 bg-blue-50 p-4">
        <h3 className="font-bold text-blue-900 mb-1 text-base flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
          Upload Dokumen Perpanjangan
        </h3>
        <p className="text-xs text-red-700 mb-3 pl-8">Upload dokumen final yang telah ditanda tangani kedua belah pihak.</p>

        <div className="space-y-3">
          {dokumen.length > 0 && (
            <div className="rounded-lg border-2 border-green-200 bg-green-50 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload size={16} className="text-green-600" />
                <div>
                  <a href={dokumen[0].url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-green-700 hover:underline">
                    {dokumen[0].nama}
                  </a>
                  <p className="text-xs text-green-600">Ukuran: {dokumen[0].ukuran} | Tanggal: {dokumen[0].tanggal}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveDokumen}
                className="text-red-500 hover:text-red-700 transition-colors p-1.5 hover:bg-red-100 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleAddDokumen}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-400 bg-white py-4 px-3 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-500 hover:bg-blue-100"
          >
            <Plus size={18} />
            {dokumen.length > 0 ? 'Ganti Dokumen Perpanjangan' : 'Upload Dokumen Perpanjangan'}
          </button>
          <p className="text-xs text-blue-700">
            📄 Format yang didukung: PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG (Maks. 10 MB)
          </p>
        </div>
      </div>

      {/* ===== ERROR MESSAGE ===== */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex gap-2">
          <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs font-medium text-red-700">{error}</p>
        </div>
      )}

      {/* ===== ACTION BUTTONS ===== */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-3 text-sm transition-all hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Mengajukan...
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              Ajukan Perpanjangan Kerjasama
            </>
          )}
        </button>
      </div>
    </form>
  );
}
