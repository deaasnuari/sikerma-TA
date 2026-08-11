'use client';

import { X, FileText, User, Building2, CalendarDays, Tag, CheckCircle2, Clock3, XCircle, MessageSquareText, ExternalLink, Paperclip, GitBranch, ShieldCheck, Download } from 'lucide-react';
import type { PengajuanItem, PengajuanStatus } from '@/services/adminPengajuanService';
import { pengajuanDokumenBadge } from '@/services/adminPengajuanService';
import TahapanStepper from '@/components/TahapanStepper';
import type { StageGroup } from '@/services/tahapanPengajuanService';

interface Props {
  item: PengajuanItem;
  onClose: () => void;
  scrollToReview?: boolean;
}

const statusConfig: Record<PengajuanStatus, { className: string; icon: React.ReactNode; label: string }> = {
  Menunggu: { className: 'bg-amber-100 text-amber-700', icon: <Clock3 size={14} />, label: 'Menunggu' },
  'Menunggu Review': { className: 'bg-amber-100 text-amber-700', icon: <Clock3 size={14} />, label: 'Menunggu Review' },
  Diproses: { className: 'bg-sky-100 text-sky-700', icon: <Clock3 size={14} />, label: 'Diproses' },
  Revisi: { className: 'bg-orange-100 text-orange-700', icon: <Clock3 size={14} />, label: 'Revisi' },
  Disetujui: { className: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={14} />, label: 'Disetujui' },
  'Disetujui Internal': { className: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={14} />, label: 'Disetujui Internal' },
  'Disetujui Mitra': { className: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 size={14} />, label: 'Disetujui Mitra' },
  'Final Approved': { className: 'bg-green-100 text-green-700', icon: <CheckCircle2 size={14} />, label: 'Final Approved' },
  Ditolak: { className: 'bg-rose-100 text-rose-700', icon: <XCircle size={14} />, label: 'Ditolak' },
};

const reviewCopy: Record<PengajuanStatus, string> = {
  Menunggu: 'Pengajuan sudah masuk dan sedang menunggu review dari admin.',
  'Menunggu Review': 'Pengajuan sedang menunggu review dari admin.',
  Diproses: 'Admin sedang memeriksa detail pengajuan kerja sama ini.',
  Revisi: 'Pengajuan perlu direvisi sesuai catatan admin.',
  Disetujui: 'Pengajuan sudah disetujui admin dan siap ditindaklanjuti.',
  'Disetujui Internal': 'Pengajuan telah disetujui oleh pihak internal.',
  'Disetujui Mitra': 'Pengajuan telah disetujui oleh mitra.',
  'Final Approved': 'Pengajuan telah mendapat persetujuan final.',
  Ditolak: 'Pengajuan belum disetujui admin. Silakan cek catatan review.',
};

const templatePreviewUrlByJenis: Record<string, string> = {
  MoU: '/templates/Draft%20MOU%20Industri.docx',
  MoA: '/templates/Draft%20MOA%20Magang.docx',
  IA: '/templates/DRAFT%20IA%20POLIBATAM.docx',
};

function normalizeWhatsAppNumber(value?: string | null): string {
  return (value || '').replace(/[^\d]/g, '');
}

function buildWhatsAppUrl(value?: string | null): string | null {
  const normalized = normalizeWhatsAppNumber(value);
  return normalized ? `https://wa.me/${normalized}` : null;
}

export default function DetailPengajuanModal({ item, onClose, scrollToReview }: Props) {
  const sc = statusConfig[item.statusPengajuan];
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Judul Pengajuan</div>
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

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Status badge */}
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold ${sc.className}`}>
              {sc.icon}
              {sc.label}
            </span>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${pengajuanDokumenBadge[item.jenisDokumen] || 'bg-slate-100 text-slate-700'}`}>
              {item.jenisDokumen}
            </span>
          </div>

          {/* Informasi Umum */}
          <section>
            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">
              Informasi Umum
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow icon={<Building2 size={15} />} label="Mitra" value={item.namaMitra} />
              <InfoRow icon={<User size={15} />} label="Pengusul" value={item.namaPengusul} />
              <InfoRow icon={<Tag size={15} />} label="Jurusan / Unit" value={item.namaUnitProdi} />
              <InfoRow icon={<FileText size={15} />} label="Jenis Dokumen" value={item.jenisDokumen} />
              {item.tanggalMulai && (
                <InfoRow icon={<CalendarDays size={15} />} label="Tanggal Mulai" value={item.tanggalMulai} />
              )}
              {item.tanggalBerakhir && (
                <InfoRow icon={<CalendarDays size={15} />} label="Tanggal Berakhir" value={item.tanggalBerakhir} />
              )}
            </div>
          </section>

          {/* Ruang Lingkup */}
          {item.ruangLingkup.length > 0 && (
            <section>
              <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">
                Ruang Lingkup
              </h3>
              <div className="flex flex-wrap gap-2">
                {item.ruangLingkup.map((scope) => (
                  <span
                    key={scope}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-700"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Kontak / info tambahan */}
          {(item.emailPengusul || item.whatsappPengusul || item.mitraTelepon) && (
            <section>
              <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">
                Kontak
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {item.emailPengusul && (
                  <InfoRow icon={<User size={15} />} label="Email Pengusul" value={item.emailPengusul} />
                )}
                {item.whatsappPengusul && (
                  <InfoRow icon={<User size={15} />} label="No WhatsApp Person PIC" value={<WhatsAppLink number={item.whatsappPengusul} />} />
                )}
                {item.mitraTelepon && (
                  <InfoRow icon={<Building2 size={15} />} label="Nomor WhatsApp Aktif Mitra" value={<WhatsAppLink number={item.mitraTelepon} />} />
                )}
              </div>
            </section>
          )}

          {/* Dokumen Pengajuan Awal */}
          {fileEntries.filter((f) => !f.isAcc).length > 0 && (
            <section>
              <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">
                Dokumen Pendukung
              </h3>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                  <Paperclip size={13} />
                  Dokumen Pengajuan Awal
                </div>
                <ul className="space-y-1.5">
                  {fileEntries.filter((f) => !f.isAcc).map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
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
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Dokumen Final (Resmi) */}
          <section>
            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">
              Dokumen Final
            </h3>
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
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
          </section>



          {/* Hasil Review Admin */}
          <section
            id="review-section"
            className={`rounded-xl border p-4 ${
              scrollToReview
                ? 'border-[#173B82] bg-[#173B82]/5 ring-2 ring-[#173B82]/20'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#173B82]">
              <MessageSquareText size={15} />
              Hasil Review Admin
            </div>
            <p className="text-[12px] text-slate-700">
              {item.reviewComment || reviewCopy[item.statusPengajuan]}
            </p>
            {item.reviewedAt && (
              <p className="mt-2 text-[10px] text-slate-500">
                Diperbarui oleh {item.reviewedBy || 'Admin'} pada {item.reviewedAt}
              </p>
            )}
          </section>

          {/* Progres Tahapan — dibaca dari data API (item.tahapanStage) */}
          {item.tahapanStage && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <GitBranch size={15} className="text-[#173B82]" />
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Progres Tahapan</h3>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <TahapanStepper
                  tahapan={{
                    stage: item.tahapanStage ?? null,
                    group: (item.tahapanGroup as StageGroup | null) ?? null,
                  }}
                />
              </div>
            </section>
          )}
        </div>
      </div>


    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className="mt-0.5 text-[12px] font-medium text-slate-800">{value || '-'}</div>
      </div>
    </div>
  );
}

function WhatsAppLink({ number }: { number: string }) {
  const url = buildWhatsAppUrl(number);

  if (!url) {
    return <span>{number || '-'}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-green-700 underline hover:text-green-800"
    >
      {number}
      <ExternalLink size={13} />
    </a>
  );
}
