'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, User, FileText, ChevronDown, Download } from 'lucide-react';
import { getEventLogsByKerjasamaId, exportEventLogsToCSV, type EventLog } from '@/services/kerjasamaEventLogService';

interface EventHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  kerjasamaId: number;
  namaMitra: string;
  noDokumen: string;
}

export default function EventHistoryModal({
  isOpen,
  onClose,
  kerjasamaId,
  namaMitra,
  noDokumen,
}: EventHistoryModalProps) {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const logs = getEventLogsByKerjasamaId(kerjasamaId);
      setEvents(logs);
    }
  }, [isOpen, kerjasamaId]);

  if (!isOpen) {
    return null;
  }

  const getEventIcon = (eventType: string): string => {
    const iconMap: Record<string, string> = {
      'kerjasama-dibuat': '✅',
      'kerjasama-diperbarui': '🔄',
      'perpanjangan-diajukan': '📝',
      'perpanjangan-disetujui': '✓',
      'perpanjangan-ditolak': '✗',
      'aktivitas-ditambah': '✏️',
      'aktivitas-diubah': '✏️',
      'aktivitas-dihapus': '🗑️',
      'dokumen-diupload': '📄',
      'notifikasi-dikirim': '📧',
      'status-berubah': '🔀',
    };
    return iconMap[eventType] || '📋';
  };

  const getEventColor = (eventType: string): string => {
    const colorMap: Record<string, string> = {
      'kerjasama-dibuat': 'bg-green-50 border-green-200',
      'kerjasama-diperbarui': 'bg-blue-50 border-blue-200',
      'perpanjangan-diajukan': 'bg-purple-50 border-purple-200',
      'perpanjangan-disetujui': 'bg-green-50 border-green-200',
      'perpanjangan-ditolak': 'bg-red-50 border-red-200',
      'aktivitas-ditambah': 'bg-orange-50 border-orange-200',
      'aktivitas-diubah': 'bg-yellow-50 border-yellow-200',
      'aktivitas-dihapus': 'bg-red-50 border-red-200',
      'dokumen-diupload': 'bg-cyan-50 border-cyan-200',
      'notifikasi-dikirim': 'bg-indigo-50 border-indigo-200',
      'status-berubah': 'bg-gray-50 border-gray-200',
    };
    return colorMap[eventType] || 'bg-gray-50 border-gray-200';
  };

  const handleExportCSV = () => {
    const csv = exportEventLogsToCSV(kerjasamaId);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `event-log-${noDokumen}-${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 px-2 pt-32 pb-4">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-[#1E376C] to-[#173B82] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-white">📖 Riwayat Event Kerjasama</h2>
            <p className="text-[12px] text-blue-100 mt-1">{namaMitra} - {noDokumen}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-blue-100 transition-colors p-1.5 hover:bg-white/10 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
          {events.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-8 text-center">
              <FileText size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-[12px] font-medium text-gray-600">Belum ada event/aktivitas untuk kerjasama ini</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[12px] font-semibold text-gray-700">Total {events.length} event</p>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download size={14} />
                  Export CSV
                </button>
              </div>

              {events.map((event) => (
                <div
                  key={event.id}
                  className={`rounded-lg border p-4 transition-all ${getEventColor(event.eventType)}`}
                >
                  <div
                    className="flex items-start justify-between gap-3 cursor-pointer"
                    onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-[20px]">{getEventIcon(event.eventType)}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{event.title}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">{event.description}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Calendar size={12} />
                            {event.createdAt}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <User size={12} />
                            {event.createdBy}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`transition-transform p-1 hover:bg-white/50 rounded ${
                        expandedEventId === event.id ? 'rotate-180' : ''
                      }`}
                    >
                      <ChevronDown size={18} className="text-gray-500" />
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {expandedEventId === event.id && event.details && (
                    <div className="mt-3 pt-3 border-t border-current border-opacity-10">
                      <div className="grid grid-cols-1 gap-2 text-[10px]">
                        {Object.entries(event.details).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2">
                            <span className="font-semibold text-gray-700 min-w-max">{key}:</span>
                            <span className="text-gray-600 break-all">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 rounded-b-2xl px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-100"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
