'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { applyApprovedRenewalToMonitoring } from '@/services/adminMonitoringService';
import { applyApprovedRenewalToRekap } from '@/services/adminRekapDataService';
import { applyApprovedRenewalToPengajuan } from '@/services/adminPengajuanService';
import {
  getRenewalRequests,
  updateRenewalRequestStatus,
  type RenewalRequestItem,
  type RenewalRequestStatus,
} from '@/services/adminRenewalRequestService';
import { addAdminNotification, markNotificationsByHrefAsRead } from '@/services/adminService';
import { invalidateRekapCache } from '@/services/dokumenKerjasamaApiService';

type FilterKey = 'semua' | RenewalRequestStatus;

const statusStyle: Record<RenewalRequestStatus, string> = {
  menunggu: 'bg-amber-50 text-amber-700 border-amber-200',
  disetujui: 'bg-green-50 text-green-700 border-green-200',
  ditolak: 'bg-red-50 text-red-700 border-red-200',
};

export default function MonitoringPerpanjanganPage() {
  const [filter, setFilter] = useState<FilterKey>('semua');
  const [items, setItems] = useState<RenewalRequestItem[]>([]);

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
      alert(`✗ ${message}`);
    }
  };

//FORM PERMINTAAN PERPANJANGAN ACC/TIDAK
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[17px] font-bold text-gray-900">Permintaan Perpanjangan</h1>
        <p className="mt-0.5 text-[10px] text-gray-500">Antrian keputusan admin untuk pengajuan perpanjangan kerja sama dari Status dan Progres Kerja Sama.</p>
      </div>

      {/* Search bar dan tombol export */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            placeholder="Cari dokumen/mitra..."
            className="input-field w-full max-w-xs border border-slate-300 bg-white px-3 py-2 text-[12px] text-gray-700"
            // TODO: Implement search logic if needed
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-100"
            // TODO: Implement export logic
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 12l-4-4m4 4l4-4m-8 8h12" />
            </svg>
            Export Data
          </button>
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

              {item.status === 'menunggu' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleDecision(item, 'disetujui')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-[10px] font-semibold text-green-700 hover:bg-green-100"
                  >
                    <CheckCircle2 size={14} />
                    Setujui
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecision(item, 'ditolak')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                  >
                    <XCircle size={14} />
                    Tolak
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

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
