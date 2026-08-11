'use client';

import { useState } from 'react';
import RenewalUploadForm from './RenewalUploadForm';
import { Check, Clock, X } from 'lucide-react';
import type { RenewalRecord } from '@/services/adminMonitoringService';

interface RenewalHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  namaMitra: string;
  noDokumen: string;
  tanggalMulaiSaatIni: string;
  tanggalBerakhirSaatIni: string;
  history: RenewalRecord[];
  onMarkInactive: () => void;
  onAddRenewal: (catatan: string, tanggalMulaiBaru: string, tanggalBerakhirBaru: string) => void;
}

export default function RenewalHistoryModal({
  isOpen,
  onClose,
  namaMitra,
  noDokumen,
  tanggalMulaiSaatIni,
  tanggalBerakhirSaatIni,
  history,
  onMarkInactive,
  onAddRenewal,
}: RenewalHistoryModalProps) {
  const [newCatatan, setNewCatatan] = useState('');
  const [tanggalMulaiBaru, setTanggalMulaiBaru] = useState('');
  const [tanggalBerakhirBaru, setTanggalBerakhirBaru] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleAddRenewal = () => {
    if (!tanggalMulaiBaru || !tanggalBerakhirBaru) {
      alert('Silakan isi tanggal mulai dan tanggal berakhir perpanjangan.');
      return;
    }

    if (new Date(tanggalBerakhirBaru) < new Date(tanggalMulaiBaru)) {
      alert('Tanggal berakhir tidak boleh lebih kecil dari tanggal mulai.');
      return;
    }

    onAddRenewal(newCatatan, tanggalMulaiBaru, tanggalBerakhirBaru);
    setNewCatatan('');
    setTanggalMulaiBaru('');
    setTanggalBerakhirBaru('');
  };

  const formatTanggal = (value: string) => {
    if (!value) return '-';

    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? value : parsedDate.toLocaleDateString('id-ID');
  };

  const statusConfig = {
    menunggu: { label: 'Menunggu Respons', color: 'text-orange-600', bg: 'bg-orange-50', icon: Clock },
    disetujui: { label: 'Disetujui', color: 'text-green-600', bg: 'bg-green-50', icon: Check },
    ditolak: { label: 'Ditolak', color: 'text-red-600', bg: 'bg-red-50', icon: X },
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 px-3 py-6">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-[#1E376C]">History Perpanjangan Kerjasama</h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {namaMitra} ({noDokumen})
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Masa berlaku saat ini: <span className="font-semibold">{tanggalMulaiSaatIni || '-'} s/d {tanggalBerakhirSaatIni || '-'}</span>
          </div>

          <RenewalUploadForm
            onSubmit={({ catatan, tanggalMulaiBaru, tanggalBerakhirBaru, dokumen }) => {
              // Ganti dokumen lama dengan dokumen baru di record perpanjangan
              onAddRenewal(catatan, tanggalMulaiBaru, tanggalBerakhirBaru);
              // TODO: Simpan dokumen ke record renewal jika backend/localstorage support
            }}
          />

          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Riwayat Permintaan ({history.length})</p>
            {history.length === 0 ? (
              <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                Belum ada riwayat perpanjangan.
              </div>
            ) : (
              [...history].reverse().map((record) => {
                const status = statusConfig[record.statusResponse];
                const Icon = status.icon;

                return (
                  <div key={record.id} className={`rounded-lg border border-gray-200 p-4 ${status.bg}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <Icon className={`mt-1 shrink-0 ${status.color}`} size={18} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900">{status.label}</p>
                          <p className="mt-0.5 text-xs text-gray-600">Tanggal Permintaan: {record.tanggalPermintaan}</p>
                          <p className="text-xs text-gray-600">
                            Periode Perpanjangan: {formatTanggal(record.tanggalMulaiBaru)} s/d {formatTanggal(record.tanggalBerakhirBaru)}
                          </p>
                          {record.tanggalResponse && (
                            <p className="text-xs text-gray-600">Tanggal Respons: {record.tanggalResponse}</p>
                          )}
                          {record.catatan && <p className="mt-1.5 whitespace-pre-wrap text-xs text-gray-700">{record.catatan}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-gray-200 pt-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">Aksi</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  onMarkInactive();
                  onClose();
                }}
                className="flex-1 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                Nonaktifkan Kerjasama
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
