'use client';

import { useState, useRef } from 'react';
import { X, AlertTriangle, Clock, CheckCircle2, Upload, FileText, Trash2 } from 'lucide-react';
import { validateSelectedFile } from '@/lib/fileUploadUtils';

interface NonactiveRecord {
  id: string;
  tanggalDinonaktifkan: string;
  alasan: string;
  buktiFile?: {
    nama: string;
    ukuran: string;
    tipe: string;
    uploadedAt: string;
  };
  status: 'pending' | 'confirmed';
}

interface NonactiveConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  namaMitra: string;
  noDokumen: string;
  tanggalBerakhir: string;
  sisaMasaBerlaku: string | null;
  nonactiveHistory: NonactiveRecord[];
  onConfirmNonactive: (alasan: string, buktiFile?: { nama: string; ukuran: string; tipe: string }) => void;
}

export default function NonactiveConfirmationModal({
  isOpen,
  onClose,
  namaMitra,
  noDokumen,
  tanggalBerakhir,
  sisaMasaBerlaku,
  nonactiveHistory,
  onConfirmNonactive,
}: NonactiveConfirmationModalProps) {
  const [alasan, setAlasan] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const validationError = validateSelectedFile(file, {
      accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png',
      maxSizeBytes: 5 * 1024 * 1024,
    });

    if (validationError) {
      alert(validationError);
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    if (!alasan.trim()) {
      alert('Silahkan isi alasan terlebih dahulu');
      return;
    }
    setIsConfirming(true);
    setTimeout(() => {
      const buktiData = selectedFile ? {
        nama: selectedFile.name,
        ukuran: `${(selectedFile.size / 1024).toFixed(2)} KB`,
        tipe: selectedFile.type,
      } : undefined;
      onConfirmNonactive(alasan, buktiData);
      setAlasan('');
      setSelectedFile(null);
      setIsConfirming(false);
      onClose();
    }, 800);
  };

  const handleCancel = () => {
    setAlasan('');
    setSelectedFile(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 px-4 py-8 backdrop-blur-[2px]">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-red-100 bg-red-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} className="text-red-600" />
            <div>
              <h2 className="text-[20px] font-bold text-red-700">Konfirmasi Nonaktifkan Kerjasama</h2>
              <p className="mt-0.5 text-xs text-red-600">
                {namaMitra} • {noDokumen}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Tutup modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Contract Info */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">Informasi Kerjasama</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Tanggal Berakhir</span>
                <span className="font-semibold text-gray-900">{tanggalBerakhir}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Sisa Masa Berlaku</span>
                <span className={`font-semibold ${sisaMasaBerlaku ? 'text-orange-600' : 'text-red-600'}`}>
                  {sisaMasaBerlaku || 'Kadaluarsa'}
                </span>
              </div>
            </div>
          </div>

          {/* Nonactive History */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Riwayat Nonaktif ({nonactiveHistory.length})</p>

            {nonactiveHistory.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-center">
                <Clock size={24} className="mx-auto mb-2 text-gray-300" />
                <p className="text-xs text-gray-500">Belum ada riwayat nonaktif</p>
              </div>
            ) : (
              <div className="space-y-2">
                {nonactiveHistory
                  .sort((a, b) => new Date(b.tanggalDinonaktifkan).getTime() - new Date(a.tanggalDinonaktifkan).getTime())
                  .map((record) => (
                    <div
                      key={record.id}
                      className={`rounded-lg border p-3 ${
                        record.status === 'confirmed'
                          ? 'border-red-200 bg-red-50'
                          : 'border-yellow-200 bg-yellow-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {record.status === 'confirmed' ? (
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-red-600" />
                        ) : (
                          <Clock size={16} className="mt-0.5 shrink-0 text-yellow-600" />
                        )}
                        <div className="flex-1 text-xs">
                          <p className="font-semibold text-gray-900">{record.tanggalDinonaktifkan}</p>
                          <p className="mt-1 text-gray-700">{record.alasan}</p>
                          {record.buktiFile && (
                            <div className="mt-2 flex items-center gap-2 rounded-md bg-white/50 px-2 py-1.5">
                              <FileText size={14} className="text-blue-600" />
                              <span className="flex-1 text-xs font-medium text-gray-700">{record.buktiFile.nama}</span>
                              <span className="text-xs text-gray-500">{record.buktiFile.ukuran}</span>
                            </div>
                          )}
                          <p className="mt-1 inline-block rounded-full bg-opacity-50 px-2 py-0.5 text-xs font-medium">
                            Status: <span className="font-bold">{record.status === 'confirmed' ? 'Dinonaktifkan' : 'Pending'}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Reason Form */}
          <div className="space-y-2">
            <label htmlFor="alasan" className="block text-sm font-semibold text-gray-700">
              Alasan Nonaktif *
            </label>
            <textarea
              id="alasan"
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Contoh: Kerjasama telah berakhir dan mitra tidak merespons untuk perpanjangan dalam 3 bulan terakhir..."
              className="h-24 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <p className="text-xs text-gray-500">Jelaskan alasan mengapa kerjasama ini akan dinonaktifkan</p>
          </div>

          {/* Warning Box */}
                    {/* File Upload */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Bukti/Dokumen Pendukung <span className="text-xs font-normal text-gray-500">(Opsional)</span>
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="hidden"
                      />
                      {!selectedFile ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm font-semibold text-gray-600 transition-colors hover:border-blue-500 hover:bg-blue-50"
                        >
                          <Upload size={18} />
                          Klik atau drag file untuk upload bukti
                        </button>
                      ) : (
                        <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText size={18} className="text-green-600" />
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{selectedFile.name}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFile(null)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-100 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">Format: PDF, Word, JPG, PNG | Maksimal ukuran: 5MB</p>
                    </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs text-red-700">
                <p className="font-semibold">⚠️ Perhatian</p>
                <p className="mt-1">
                  Tindakan ini akan menandai kerjasama sebagai{' '}
                  <strong>NONAKTIF</strong> dan tidak dapat dikerjakan sampai diperpanjang kembali. Pastikan semua data sudah
                  dicek sebelum melanjutkan.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isConfirming}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-300 px-8 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isConfirming || !alasan.trim()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-8 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {isConfirming ? 'Memproses...' : 'Nonaktifkan Kerjasama'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
