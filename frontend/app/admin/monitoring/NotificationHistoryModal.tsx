'use client';

import { useState } from 'react';
import { X, Mail, CheckCircle2, Clock, AlertCircle, Loader } from 'lucide-react';
import { sendNotificationEmail } from '@/services/adminMonitoringService';
import { logNotifikasiDikirim } from '@/services/kerjasamaEventLogService';

interface Notification {
  id: string;
  tanggalKirim: string;
  jenis: 'reminder-3bulan' | 'reminder-1bulan' | 'urgent';
  status: 'terkirim' | 'dibaca' | 'ditindaklanjuti' | 'tidak-direspons';
  pesan: string;
  emailMitra: string;
}

interface NotificationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  namaMitra: string;
  noDokumen: string;
  emailMitra: string;
  notifications: Notification[];
  kerjasamaId?: number;
  onSendNotification?: (jenis: string) => void;
}

const notificationConfig = {
  'reminder-3bulan': {
    label: 'Reminder 3 Bulan',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    describe: 'Notifikasi otomatis: Kerjasama akan berakhir dalam 3 bulan',
  },
  'reminder-1bulan': {
    label: 'Reminder 1 Bulan',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    describe: 'Notifikasi otomatis: Kerjasama akan berakhir dalam 1 bulan',
  },
  urgent: {
    label: 'Urgent Reminder',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    describe: 'Notifikasi urgency: Kerjasama segera berakhir minggu depan',
  },
};

const statusConfig = {
  terkirim: { icon: Mail, label: 'Terkirim', color: 'text-gray-500' },
  dibaca: { icon: CheckCircle2, label: 'Dibaca', color: 'text-blue-600' },
  ditindaklanjuti: { icon: CheckCircle2, label: 'Ditindaklanjuti', color: 'text-green-600' },
  'tidak-direspons': { icon: AlertCircle, label: 'Tidak Direspons', color: 'text-red-600' },
};

export default function NotificationHistoryModal({
  isOpen,
  onClose,
  namaMitra,
  noDokumen,
  emailMitra,
  notifications,
  kerjasamaId = 0,
  onSendNotification,
}: NotificationHistoryModalProps) {
  const [sendingNotification, setSendingNotification] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) {
    return null;
  }

  const isEmailValid = !!emailMitra && emailMitra.trim() !== '' && emailMitra.trim() !== '-' && emailMitra.includes('@');

  const handleSendNotification = async (jenis: string) => {
    if (!isEmailValid) {
      setFeedbackMessage({ type: 'error', text: 'Email mitra tidak tersedia. Perbarui data mitra terlebih dahulu sebelum mengirim notifikasi.' });
      return;
    }
    setSendingNotification(jenis);
    setFeedbackMessage(null);

    try {
      const result = await sendNotificationEmail(
        emailMitra,
        jenis as 'reminder-3bulan' | 'reminder-1bulan' | 'urgent',
        noDokumen,
        namaMitra
      );

      if (result.success) {
        setFeedbackMessage({
          type: 'success',
          text: result.message,
        });

        // Log event notifikasi dikirim
        logNotifikasiDikirim(
          kerjasamaId,
          namaMitra,
          noDokumen,
          jenis,
          emailMitra
        );

        if (onSendNotification) {
          onSendNotification(jenis);
        }

        // Auto-hide success message setelah 3 detik
        setTimeout(() => {
          setFeedbackMessage(null);
        }, 3000);
      } else {
        setFeedbackMessage({
          type: 'error',
          text: result.message,
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setFeedbackMessage({
        type: 'error',
        text: 'Terjadi kesalahan saat mengirim notifikasi email.',
      });
    } finally {
      setSendingNotification(null);
    }
  };

  const sortedNotifications = [...notifications].sort(
    (a, b) => new Date(b.tanggalKirim).getTime() - new Date(a.tanggalKirim).getTime()
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 px-4 py-8 backdrop-blur-[2px]">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[24px] bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-5">
          <div>
            <h2 className="text-[20px] font-bold text-[#1E376C]">Riwayat Notifikasi Email</h2>
            <p className="mt-1 text-xs text-gray-500">
              {namaMitra} • {noDokumen} • {emailMitra}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Tutup modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Feedback Message */}
          {feedbackMessage && (
            <div className={`rounded-lg p-4 ${feedbackMessage.type === 'success' ? 'border border-green-200 bg-green-50' : 'border border-red-200 bg-red-50'}`}>
              <p className={`text-sm font-semibold ${feedbackMessage.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                {feedbackMessage.text}
              </p>
            </div>
          )}

          {/* Send Notification Buttons */}
          <div className={`rounded-xl border p-4 ${isEmailValid ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
            <p className="mb-3 text-sm font-semibold text-[#1E376C]">Kirim Notifikasi Manual ke Email Mitra</p>
            {!isEmailValid && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-orange-500" />
                <p className="text-xs text-orange-700">Email mitra tidak tersedia. Perbarui data mitra terlebih dahulu agar notifikasi dapat dikirim.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {Object.entries(notificationConfig).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSendNotification(key)}
                  disabled={sendingNotification !== null || !isEmailValid}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                >
                  {sendingNotification === key ? (
                    <>
                      <Loader size={13} className="animate-spin" />
                      Mengirim...
                    </>
                  ) : (
                    <>
                      <Mail size={13} />
                      {config.label}
                    </>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-600">
              Email akan dikirim ke:{' '}
              <span className={`font-semibold ${isEmailValid ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                {isEmailValid ? emailMitra : 'Tidak tersedia'}
              </span>
            </p>
          </div>

          {/* Notification History List */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Riwayat Notifikasi ({notifications.length})</p>

            {notifications.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center">
                <Mail size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">Belum ada notifikasi yang dikirim</p>
              </div>
            ) : (
              sortedNotifications.map((notif) => {
                const cfg = notificationConfig[notif.jenis as keyof typeof notificationConfig];
                const statusCfg = statusConfig[notif.status as keyof typeof statusConfig];
                const StatusIcon = statusCfg.icon;

                return (
                  <div
                    key={notif.id}
                    className={`rounded-lg border ${cfg.borderColor} ${cfg.bgColor} p-4`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</p>
                          <span className="text-xs text-gray-500">•</span>
                          <p className="text-xs text-gray-500">{notif.tanggalKirim}</p>
                        </div>
                        <p className="mt-1 text-xs text-gray-600">{cfg.describe}</p>
                        <p className="mt-2 text-xs font-medium text-gray-700">{notif.pesan}</p>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <StatusIcon size={18} className={statusCfg.color} />
                        <p className="text-xs font-semibold text-gray-600">{statusCfg.label}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Info Box */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="text-xs text-amber-700">
                <p className="font-semibold">Info Notifikasi Otomatis</p>
                <ul className="mt-2 space-y-1">
                  <li>• Notifikasi 3 bulan: Dikirim otomatis saat contract 3 bulan menjelang berakhir</li>
                  <li>• Notifikasi 1 bulan: Dikirim otomatis saat contract 1 bulan menjelang berakhir</li>
                  <li>• Notifikasi Urgent: Dikirim saat contract tinggal minggu depan berakhir</li>
                  <li>• Jika tidak direspons dalam 3 bulan, contract otomatis nonaktif</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-300 px-8 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
