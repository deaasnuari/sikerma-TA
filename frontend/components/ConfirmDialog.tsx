'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal konfirmasi generik — pengganti window.confirm() supaya tidak lagi
 * memunculkan dialog bawaan browser. Dikendalikan lewat prop `open`.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-[#0e1d34] hover:bg-[#1a2d4a]';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-[2px]"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
            }`}
          >
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-bold text-gray-900">{title}</h3>
            {message && <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{message}</p>}
          </div>
          <button
            type="button"
            onClick={() => !loading && onCancel()}
            className="-mr-1 -mt-1 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
