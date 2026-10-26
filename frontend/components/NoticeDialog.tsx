'use client';

import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface NoticeDialogProps {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  buttonLabel?: string;
  tone?: 'warning' | 'success';
  onClose: () => void;
}

/**
 * Pop up pemberitahuan satu tombol — pengganti window.alert() supaya tidak memunculkan
 * dialog bawaan browser ("localhost says"). Dikendalikan lewat prop `open`.
 */
export default function NoticeDialog({
  open,
  title,
  message,
  buttonLabel = 'Mengerti',
  tone = 'warning',
  onClose,
}: NoticeDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              tone === 'success' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {tone === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-bold text-gray-900">{title ?? (tone === 'success' ? 'Berhasil' : 'Perhatian')}</h3>
            {message && <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{message}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-lg bg-[#1E376C] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#28478A]"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
