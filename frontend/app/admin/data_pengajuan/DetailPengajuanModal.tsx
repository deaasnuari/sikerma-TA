'use client';

import { X, FileText, CheckCircle2, Clock3, XCircle, ExternalLink, Paperclip, Download, ShieldCheck } from 'lucide-react';
import type { PengajuanItem, PengajuanStatus } from '@/services/adminPengajuanService';
import CatatanAdminPanel from '@/components/CatatanAdminPanel';

interface Props {
  item: PengajuanItem;
  onClose: () => void;
  scrollToReview?: boolean;
}

function normalizeWhatsAppNumber(value?: string | null): string {
  const digits = (value || '').replace(/[^\d]/g, '');
  if (digits.startsWith('08')) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

function buildWhatsAppUrl(value?: string | null): string | null {
  const normalized = normalizeWhatsAppNumber(value);
  return normalized ? `https://wa.me/${normalized}` : null;
}

const statusConfig: Record<PengajuanStatus, { className: string; icon: React.ReactNode; label: string }> = {
  Menunggu: {
    className: 'bg-amber-100 text-amber-700',
    icon: <Clock3 size={14} />,
    label: 'Menunggu Review',
  },
  'Menunggu Review': {
    className: 'bg-amber-100 text-amber-700',
    icon: <Clock3 size={14} />,
    label: 'Menunggu Review',
  },
  Diproses: {
    className: 'bg-sky-100 text-sky-700',
    icon: <Clock3 size={14} />,
    label: 'Diproses',
  },
  Revisi: {
    className: 'bg-orange-100 text-orange-700',
    icon: <XCircle size={14} />,
    label: 'Revisi',
  },
  'Disetujui Internal': {
    className: 'bg-indigo-100 text-indigo-700',
    icon: <CheckCircle2 size={14} />,
    label: 'Disetujui Internal',
  },
  'Disetujui Mitra': {
    className: 'bg-cyan-100 text-cyan-700',
    icon: <CheckCircle2 size={14} />,
    label: 'Disetujui Mitra',
  },
  'Final Approved': {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={14} />,
    label: 'Final Approved',
  },
  Disetujui: {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={14} />,
    label: 'Disetujui',
  },
  Ditolak: {
    className: 'bg-rose-100 text-rose-700',
    icon: <XCircle size={14} />,
    label: 'Ditolak',
  },
};

const reviewCopy: Record<PengajuanStatus, string> = {
  Menunggu: 'Pengajuan sudah masuk dan sedang menunggu review.',
  'Menunggu Review': 'Pengajuan sudah masuk dan sedang menunggu review.',
  Diproses: 'Pengajuan sedang diproses.',
  Revisi: 'Pengajuan membutuhkan revisi.',
  'Disetujui Internal': 'Pengajuan sudah disetujui pihak internal.',
  'Disetujui Mitra': 'Pengajuan sudah disetujui pihak mitra.',
  'Final Approved': 'Berkas final telah disetujui oleh kedua belah pihak.',
  Disetujui: 'Pengajuan sudah disetujui.',
  Ditolak: 'Pengajuan ditolak.',
};

export default function DetailPengajuanModal({ item, onClose }: Props) {
  const sc = statusConfig[item.statusPengajuan] || statusConfig['Menunggu Review'];
  const fileEntries = item.fileAttachments?.length
    ? item.fileAttachments
    : (item.fileName || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name, url: '', isAcc: false }));

  const finalFileUrl = item.finalFilePath
    ? (item.finalFilePath.startsWith('http') ? item.finalFilePath : `http://127.0.0.1:8000/storage/${item.finalFilePath.replace(/^\/+/, '')}`)
    : null;

  const picWaUrl = buildWhatsAppUrl(item.whatsappPengusul);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-[17px] font-bold text-slate-900">{item.judulPengajuan}</h2>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {item.diajukanPada} · {item.namaPengusul}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold ${sc.className}`}>
              {sc.icon}
              {sc.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700">
              <FileText size={13} />
              {item.jenisDokumen}
            </span>
          </div>

          <div className="mb-2 text-[10px] text-slate-500">Pengusul: {item.namaPengusul}</div>
          <div className="mb-2 text-[10px] text-slate-500">Mitra: {item.namaMitra}</div>
          <div className="mb-2 text-[10px] text-slate-500">Jurusan/Unit: {item.namaUnitProdi}</div>
          <div className="mb-2 text-[10px] text-slate-500">Ruang Lingkup: {item.ruangLingkup?.join(', ') || '-'}</div>
          <div className="mb-2 text-[10px] text-slate-500">Review: {item.reviewComment || reviewCopy[item.statusPengajuan]}</div>
          <div className="mb-2 text-[10px] text-slate-500">Catatan Revisi: {item.catatanRevisi || '-'}</div>
          <div className="mb-2 text-[10px] text-slate-500">ACC Internal: {item.accInternalAt || '-'}</div>
          <div className="mb-2 text-[10px] text-slate-500">ACC Mitra: {item.accMitraAt || '-'}</div>
          <div className="mb-2 text-[10px] text-slate-500">Final Approved At: {item.finalApprovedAt || '-'}</div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <p className="text-[10px] font-semibold text-slate-700 mb-2">Kontak PIC</p>
            <p className="text-[10px] text-slate-600 mb-2">WhatsApp PIC: {item.whatsappPengusul || '-'}</p>
            {picWaUrl && (
              <a
                href={picWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-[10px] font-semibold text-green-700 hover:bg-green-100"
              >
                Hubungi PIC via WhatsApp
                <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* Dokumen Pengajuan Awal */}
          {(() => {
            const originalFiles = fileEntries.filter((f) => !f.isAcc);
            return originalFiles.length > 0 ? (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-700">
                  <Paperclip size={13} />
                  Dokumen Pengajuan Awal
                </div>
                <div className="space-y-1.5">
                  {originalFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <Paperclip size={13} className="shrink-0 text-slate-400" />
                      {file.url ? (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={file.name}
                          className="truncate text-[10px] font-medium text-blue-600 underline hover:text-blue-800 flex items-center gap-1"
                        >
                          {file.name}
                          <Download size={12} />
                        </a>
                      ) : (
                        <span className="truncate text-[10px] text-slate-600">{file.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Dokumen Final — ditampilkan terpisah dan menonjol */}
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
              <ShieldCheck size={14} />
              Dokumen Final (Resmi)
            </div>
            {item.finalFileName && finalFileUrl ? (
              <a
                href={finalFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={item.finalFileName}
                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <Paperclip size={13} className="shrink-0 text-emerald-600" />
                <span className="truncate">{item.finalFileName}</span>
                <Download size={13} className="ml-auto shrink-0" />
              </a>
            ) : (
              <p className="text-[10px] text-slate-500">Belum ada dokumen final yang diupload.</p>
            )}
          </div>

          {/* Catatan Admin — hanya terlihat oleh Admin */}
          <CatatanAdminPanel pengajuanId={item.id} />
        </div>
      </div>
    </div>
  );
}
