'use client';

import { useState, useRef } from 'react';
import { X, AlertTriangle, Upload, FileText, Trash2 } from 'lucide-react';
import { validateSelectedFile } from '@/lib/fileUploadUtils';
import FileDownloadLink from '@/components/FileDownloadLink';

interface NonactiveConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  namaMitra: string;
  noDokumen: string;
  tanggalBerakhir: string;
  sisaMasaBerlaku: string | null;
  // Keputusan "tidak diperpanjang" yang sudah tersimpan sebelumnya (kalau ada) — diambil dari
  // catatan_arsip/bukti_tidak_diperpanjang yang sungguhan tersimpan di server, bukan cuma cache lokal.
  existingDecision?: { catatan: string | null; buktiUrl: string | null; buktiDownloadUrl?: string | null; buktiNama?: string | null } | null;
  onConfirmNonactive: (alasan: string, file: File | null) => Promise<void> | void;
}

export default function NonactiveConfirmationModal({
  isOpen,
  onClose,
  namaMitra,
  noDokumen,
  tanggalBerakhir,
  sisaMasaBerlaku,
  existingDecision,
  onConfirmNonactive,
}: NonactiveConfirmationModalProps) {
  const [alasan, setAlasan] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleConfirm = async () => {
    if (!alasan.trim()) {
      setError('Silahkan isi alasan terlebih dahulu');
      return;
    }

    setError(null);
    setIsConfirming(true);
    try {
      await onConfirmNonactive(alasan.trim(), selectedFile);
      setAlasan('');
      setSelectedFile(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan keputusan tidak diperpanjang.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    if (isConfirming) return;
    setAlasan('');
    setSelectedFile(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-100 bg-linear-to-r from-red-50 to-white px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100">
              <AlertTriangle size={22} className="text-red-600" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight text-red-700">Konfirmasi Nonaktifkan Kerjasama</h2>
              <p className="mt-0.5 truncate text-xs text-red-600/80">
                {namaMitra} • {noDokumen}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isConfirming}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Tutup modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5 scrollbar-thin [scrollbar-color:#cbd5e1_transparent]">
          {/* Contract Info */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
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

          {/* Existing decision, kalau sudah pernah ditandai sebelumnya */}
          {existingDecision?.catatan && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 text-sm font-semibold text-amber-800">Sudah pernah ditandai tidak diperpanjang</p>
              <p className="text-xs text-amber-700">{existingDecision.catatan}</p>
              {existingDecision.buktiUrl && (
                <FileDownloadLink
                  url={existingDecision.buktiUrl}
                  downloadUrl={existingDecision.buktiDownloadUrl}
                  fileName={existingDecision.buktiNama}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
                >
                  <FileText size={14} />
                  Lihat bukti sebelumnya
                </FileDownloadLink>
              )}
              <p className="mt-2 text-[11px] text-amber-600">Mengisi form di bawah akan menimpa catatan &amp; bukti ini.</p>
            </div>
          )}

          {/* Reason Form */}
          <div className="space-y-2">
            <label htmlFor="alasan" className="block text-sm font-semibold text-gray-700">
              Alasan Tidak Diperpanjang *
            </label>
            <textarea
              id="alasan"
              value={alasan}
              onChange={(e) => { setAlasan(e.target.value); setError(null); }}
              placeholder="Contoh: Kerjasama telah berakhir dan mitra tidak merespons untuk perpanjangan dalam 3 bulan terakhir..."
              className="h-24 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <p className="text-xs text-gray-500">Jelaskan alasan mengapa kerjasama ini tidak diperpanjang.</p>
          </div>

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

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs text-red-700">
                <p className="font-semibold">Perhatian</p>
                <p className="mt-1">
                  Tindakan ini akan menandai kerjasama sebagai{' '}
                  <strong>NONAKTIF</strong> dan tidak dapat dikerjakan sampai diperpanjang kembali. Catatan dan
                  bukti ini akan tersimpan dan tampil di halaman Arsip Dokumen. Pastikan semua data sudah
                  dicek sebelum melanjutkan.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Action Buttons (tetap di bawah, tidak ikut scroll) */}
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 bg-white px-6 py-4 sm:flex-row sm:justify-end">
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
            className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-8 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConfirming ? 'Menyimpan...' : 'Nonaktifkan Kerjasama'}
          </button>
        </div>
      </div>
    </div>
  );
}
