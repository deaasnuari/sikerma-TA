'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react';
import type { AdminNotification } from '@/types/admin';
import {
  getAdminNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/services/adminService';

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  useEffect(() => {
    const syncNotifications = () => {
      setNotifications(getAdminNotifications());
    };

    syncNotifications();
    window.addEventListener('admin-notifications-updated', syncNotifications);

    return () => window.removeEventListener('admin-notifications-updated', syncNotifications);
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const handleMarkAll = () => {
    setNotifications(markAllNotificationsAsRead());
  };

  const handleMarkOne = (id: number) => {
    setNotifications(markNotificationAsRead(id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-[17px] md:text-[20px] font-bold text-gray-900">Semua Notifikasi</h1>
          <p className="text-gray-500 text-[10px] md:text-[12px] mt-0.5">
            Pantau pembaruan pengajuan, dokumen, dan aktivitas terbaru dari sistem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <Link href="/admin" className="inline-flex items-center gap-2 font-bold text-[#173B82] hover:text-[#3B82F6] transition-colors">
            <ArrowLeft size={16} />
            Kembali ke Dashboard
          </Link>
          <button onClick={handleMarkAll} className="inline-flex items-center gap-2 font-bold text-[#173B82] hover:text-[#3B82F6] transition-colors">
            <CheckCheck size={16} />
            Tandai Semua Dibaca
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-gray-500">Total Notifikasi</p>
          <p className="text-[17px] font-bold text-gray-900 mt-0.5">{notifications.length}</p>
        </div>
        <div className="card p-3 border border-blue-100">
          <p className="text-[10px] text-gray-500">Belum Dibaca</p>
          <p className="text-[17px] font-bold text-[#173B82] mt-0.5">{unreadCount}</p>
        </div>
        <div className="card p-3 border border-green-100">
          <p className="text-[10px] text-gray-500">Sudah Dibaca</p>
          <p className="text-[17px] font-bold text-green-600 mt-0.5">{notifications.length - unreadCount}</p>
        </div>
      </div>

      <div className="card p-3 md:p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={15} className="text-[#173B82]" />
          <h2 className="text-[12px] font-semibold text-gray-900">Daftar Notifikasi</h2>
        </div>

        <div className="space-y-3">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-xl border p-4 transition-all ${
                  !notification.read ? 'border-blue-200 bg-sky-50/70' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${!notification.read ? 'bg-[#3B82F6]' : 'bg-slate-300'}`}
                      ></span>
                      <p className="text-[12px] font-semibold text-gray-900">{notification.title}</p>
                    </div>
                    <p className="text-[12px] text-gray-600">{notification.message}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-gray-500">
                      <span>📌 dari: {notification.from}</span>
                      <span>{notification.createdAt}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap md:flex-col md:items-end gap-2 md:min-w-[170px] text-[12px]">
                    {!notification.read && (
                      <button
                        onClick={() => handleMarkOne(notification.id)}
                        className="font-bold text-[#173B82] hover:text-[#3B82F6] transition-colors"
                      >
                        Tandai Dibaca
                      </button>
                    )}
                    {notification.href && (
                      <Link href={notification.href} className="font-bold text-[#173B82] hover:text-[#3B82F6] transition-colors">
                        Buka Terkait
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-gray-500">
              Belum ada notifikasi untuk ditampilkan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
