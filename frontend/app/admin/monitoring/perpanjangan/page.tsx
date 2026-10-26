'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, XCircle, Paperclip, Eye, AlertTriangle, Trash2 } from 'lucide-react';
import FileDownloadLink from '@/components/FileDownloadLink';
import { applyApprovedRenewalToMonitoring } from '@/services/adminMonitoringService';
import { applyApprovedRenewalToRekap } from '@/services/adminRekapDataService';
import { applyApprovedRenewalToPengajuan } from '@/services/adminPengajuanService';
import {
  deleteRenewalRequest,
  getRenewalRequests,
  updateRenewalRequestStatus,
  type RenewalRequestItem,
  type RenewalRequestStatus,
} from '@/services/adminRenewalRequestService';
import { addAdminNotification, markNotificationsByHrefAsRead } from '@/services/adminService';
import { invalidateRekapCache } from '@/services/dokumenKerjasamaApiService';
import { showNotice } from '@/lib/dialog';

type FilterKey = 'semua' | RenewalRequestStatus;

const statusStyle: Record<RenewalRequestStatus, string> = {
  menunggu: 'bg-amber-50 text-amber-700 border-amber-200',
  disetujui: 'bg-green-50 text-green-700 border-green-200',
  ditolak: 'bg-red-50 text-red-700 border-red-200',
};

export default function MonitoringPerpanjanganPage() {
  const [filter, setFilter] = useState<FilterKey>('semua');
  const [items, setItems] = useState<RenewalRequestItem[]>([]);
  // Dokumen yang sudah dibuka admin — Setujui/Tolak baru aktif setelah dokumen dicek
  const [viewedDocIds, setViewedDocIds] = useState<Set<number>>(new Set());
  const [hapusTarget, setHapusTarget] = useState<RenewalRequestItem | null>(null);
  const [menghapus, setMenghapus] = useState(false);

  const markDocViewed = (id: number) => {
    setViewedDocIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  useEffect(() => {
    // Tandai notifikasi perpanjangan sebagai sudah dibaca saat halaman ini dibuka
    markNotificationsByHrefAsRead('/admin/monitoring/perpanjangan');

    const syncItems = async () => {
      try {
        const data = await getRenewalRequests();
        setItems(data);
      } catch (error) {
        console.error('Gagal memuat permintaan perpanjangan:', error);
        setItems([]);
      }
    };

    void syncItems();

    const handleUpdated = () => {
      void syncItems();
    };
    window.addEventListener('renewal-requests-updated', handleUpdated);

    return () => window.removeEventListener('renewal-requests-updated', handleUpdated);
  }, []);

  const counts = useMemo(() => {
    return {
      semua: items.length,
      menunggu: items.filter((item) => item.status === 'menunggu').length,
      disetujui: items.filter((item) => item.status === 'disetujui').length,
      ditolak: items.filter((item) => item.status === 'ditolak').length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === 'semua') {
      return items;
    }

    return items.filter((item) => item.status === filter);
  }, [filter, items]);

  const handleDecision = async (item: RenewalRequestItem, status: 'disetujui' | 'ditolak') => {
    try {
      const updated = await updateRenewalRequestStatus(item.id, status);
      setItems(updated);

      if (status === 'disetujui') {
        applyApprovedRenewalToMonitoring(item.kerjasamaId, item.tanggalMulaiBaru, item.tanggalBerakhirBaru);
        applyApprovedRenewalToRekap(item.noDokumen, item.tanggalMulaiBaru, item.tanggalBerakhirBaru);
        applyApprovedRenewalToPengajuan(item.kerjasamaId, item.tanggalMulaiBaru, item.tanggalBerakhirBaru);
        // Invalidate API cache so next fetch to monitoring/rekap data gets fresh data
        invalidateRekapCache();
        window.dispatchEvent(new Event('monitoring-data-updated'));
        window.dispatchEvent(new Event('rekap-data-updated'));
      }

      addAdminNotification({
        title: status === 'disetujui' ? 'Perpanjangan Disetujui' : 'Perpanjangan Ditolak',
        message: `Permintaan perpanjangan ${item.noDokumen} (${item.namaMitra}) telah ${status}.`,
        from: 'Admin Monitoring',
        href: item.notificationHref,
        category: status === 'disetujui' ? 'approval' : 'reminder',
        targetRole: item.requesterRole,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memproses keputusan perpanjangan.';
      showNotice(`✗ ${message}`);
    }
  };

const handleHapus = async () => {
    if (!hapusTarget) return;
    setMenghapus(true);
    try {
      const updated = await deleteRenewalRequest(hapusTarget.id);
      setItems(updated);
      setHapusTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghapus permintaan perpanjangan.';
      showNotice(`✗ ${message}`);
    } finally {
      setMenghapus(false);
    }
  };

//FORM PERMINTAAN PERPANJANGAN ACC/TIDAK
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[17px] font-bold text-gray-900">Permintaan Perpanjangan</h1>
        <p className="mt-0.5 text-[10px] text-gray-500">Antrian keputusan admin untuk pengajuan perpanjangan kerja sama dari Status dan Progres Kerja Sama.</p>
      </div>

      {/* Search bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            placeholder="Cari dokumen/mitra..."
            className="input-field w-full max-w-xs border border-slate-300 bg-white px-3 py-2 text-[12px] text-gray-700"
            // TODO: Implement search logic if needed
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 mt-2">
        <button
          type="button"
          onClick={() => setFilter('semua')}
          className={`rounded-lg border p-3 text-left ${filter === 'semua' ? 'border-[#1E376C] bg-[#EEF2FF]' : 'border-slate-200 bg-white'}`}
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Semua</p>
          <p className="mt-0.5 text-[17px] font-bold text-slate-900">{counts.semua}</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter('menunggu')}
          className={`rounded-lg border p-3 text-left ${filter === 'menunggu' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Menunggu</p>
          <p className="mt-0.5 text-[17px] font-bold text-amber-700">{counts.menunggu}</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter('disetujui')}
          className={`rounded-lg border p-3 text-left ${filter === 'disetujui' ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'}`}
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Disetujui</p>
          <p className="mt-0.5 text-[17px] font-bold text-green-700">{counts.disetujui}</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter('ditolak')}
          className={`rounded-lg border p-3 text-left ${filter === 'ditolak' ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Ditolak</p>
          <p className="mt-0.5 text-[17px] font-bold text-red-700">{counts.ditolak}</p>
        </button>
      </div>

      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-[12px] text-slate-500">
            Belum ada data permintaan perpanjangan.
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[13.5px] font-bold text-slate-900">{item.namaMitra}</p>
                  <p className="text-[10px] text-slate-500">{item.noDokumen}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${statusStyle[item.status]}`}>
                  {item.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-[12px] text-slate-700 md:grid-cols-2">
                <p>
                  Periode diajukan: <span className="font-semibold">{item.tanggalMulaiBaru} s/d {item.tanggalBerakhirBaru}</span>
                </p>
                <p>
                  Diajukan: <span className="font-semibold">{item.requestedAt}</span>
                </p>
                <p className="md:col-span-2">
                  Catatan: <span className="font-semibold">{item.catatan || '-'}</span>
                </p>
                {item.decidedAt && (
                  <p className="md:col-span-2 text-[10px] text-slate-500">
                    Diputuskan {item.decidedAt} oleh {item.decidedBy || '-'}
                  </p>
                )}
              </div>

              {/* Dokumen bukti perpanjangan — selalu tampil; untuk yang masih menunggu, admin wajib cek dulu sebelum memutuskan */}
              {(
                <div className="mt-3" onClick={() => markDocViewed(item.id)}>
                  {item.buktiPerpanjanganUrl ? (
                    <FileDownloadLink
                      url={item.buktiPerpanjanganUrl}
                      downloadUrl={`/dokumen-kerjasama/perpanjangan/${item.id}/download`}
                      fileName={item.buktiPerpanjanganNama || `dokumen-perpanjangan-${item.noDokumen}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <Paperclip size={13} />
                      Lihat Dokumen Perpanjangan
                      <Eye size={13} />
                    </FileDownloadLink>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">
                      <AlertTriangle size={13} />
                      Tidak ada dokumen bukti perpanjangan
                    </div>
                  )}
                </div>
              )}

              {item.status === 'menunggu' && (() => {
                const hasDoc = Boolean(item.buktiPerpanjanganUrl);
                const canDecide = !hasDoc || viewedDocIds.has(item.id);
                return (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canDecide}
                        onClick={() => handleDecision(item, 'disetujui')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-[10px] font-semibold text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-green-50"
                      >
                        <CheckCircle2 size={14} />
                        Setujui
                      </button>
                      <button
                        type="button"
                        disabled={!canDecide}
                        onClick={() => handleDecision(item, 'ditolak')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-50"
                      >
                        <XCircle size={14} />
                        Tolak
                      </button>
                    </div>
                    {hasDoc && !canDecide && (
                      <p className="mt-1.5 text-[10px] text-amber-600">
                        Buka dan periksa dokumen terlebih dahulu sebelum menyetujui atau menolak.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setHapusTarget(item)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-[10px] font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={13} />
                  Hapus
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {hapusTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <h2 className="mb-1 text-[15px] font-bold text-gray-900">Hapus Permintaan Perpanjangan</h2>
            <p className="mb-1 text-[12px] text-gray-500">Yakin ingin menghapus permintaan perpanjangan berikut?</p>
            <p className="mb-1 text-[13px] font-semibold text-gray-800">{hapusTarget.namaMitra}</p>
            <p className="mb-3 text-[11px] text-gray-500">{hapusTarget.noDokumen}</p>
            {hapusTarget.status === 'disetujui' && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                Permintaan ini sudah disetujui. Menghapusnya hanya menghilangkan catatan permintaan; perubahan tanggal pada dokumen tidak dikembalikan.
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setHapusTarget(null)}
                disabled={menghapus}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => { void handleHapus(); }}
                disabled={menghapus}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {menghapus ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[10px] text-slate-600">
          <div className="inline-flex items-center gap-1.5">
            <Clock3 size={14} />
            Permintaan baru otomatis masuk dari aksi Ajukan Perpanjangan pada halaman Status dan Progres Kerja Sama.
          </div>
        </div>
      )}
    </div>
  );
}
