'use client';

import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { Menu, LogOut, User, Bell, CheckCheck, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  getAdminNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  deleteNotification,
  deleteAllNotifications,
} from '@/services/adminService';
import { useRouter } from 'next/navigation';
import type { AdminNotification } from '@/types/admin';

interface AdminNavbarProps {
  toggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  isPublic?: boolean;
}

export default function AdminNavbar({ toggleSidebar, isSidebarOpen = false, isPublic = false }: AdminNavbarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPublicMenu, setShowPublicMenu] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const publicMenuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const router = useRouter();

  // Hapus satu notifikasi
  const handleDeleteNotification = (id: number) => {
    setNotifications(deleteNotification(id));
  };

  // Hapus semua notifikasi
  const handleDeleteAllNotifications = () => {
    setNotifications(deleteAllNotifications());
  };

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const roleLabelMap: Record<string, string> = {
    admin: 'Admin/Kerjasama',
    pimpinan: 'Pimpinan',
    internal: 'Internal',
    external: 'Eksternal',
    user: 'Pengguna',
  };
  const userDisplayName = user?.name?.split(' ')[0] || 'User';
  const userRoleLabel = roleLabelMap[user?.role || 'user'] || 'Pengguna';

  const refreshNotifications = () => {
    const allNotifications = getAdminNotifications();
    // Filter notifikasi berdasarkan role user
    const filteredNotifications = allNotifications.filter((notif) => {
      // Admin bisa lihat semua notifikasi (dari semua role)
      if (user?.role === 'admin') {
        return true;
      }
      // Selain admin, notifikasi tanpa targetRole dianggap notifikasi admin lama.
      return notif.targetRole === user?.role;
    });
    setNotifications(filteredNotifications);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const resolveNotificationRoute = (notification: AdminNotification) => {
    const fallbackRoute = '/admin/notifikasi';
    const targetRoute = notification.href || fallbackRoute;

    // Admin tetap diarahkan ke halaman admin meskipun notifikasi berasal dari role lain.
    if (user?.role === 'admin' && !targetRoute.startsWith('/admin')) {
      if (targetRoute.startsWith('/internal') || targetRoute.startsWith('/eksternal') || targetRoute.startsWith('/pimpinan')) {
        return '/admin/data_pengajuan';
      }
    }

    return targetRoute;
  };

  const handleOpenNotification = (notification: AdminNotification) => {
    setNotifications(markNotificationAsRead(notification.id));
    setShowNotifications(false);
    router.push(resolveNotificationRoute(notification));
  };

  const handleMarkAllAsRead = () => {
    setNotifications(markAllNotificationsAsRead());
  };

  const handleViewAll = () => {
    setShowNotifications(false);
    router.push('/admin/notifikasi');
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setShowNotifications(false);
      }
      if (publicMenuRef.current && !publicMenuRef.current.contains(target)) {
        setShowPublicMenu(false);
      }
    }

    const syncNotifications = () => refreshNotifications();

    refreshNotifications();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('admin-notifications-updated', syncNotifications);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('admin-notifications-updated', syncNotifications);
    };
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 bg-white shadow-sm ${
        isPublic ? 'border-b border-slate-200' : 'rounded-lg border border-slate-200'
      }`}
    >
      <div className="px-3 py-1 flex justify-between items-center">
        <div className="flex items-center gap-2 flex-1">
          {!isPublic && toggleSidebar && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex-shrink-0 inline-flex items-center justify-center rounded-lg bg-[#091222] p-2 text-white shadow-sm transition hover:bg-[#173B82] md:hidden"
              aria-label={isSidebarOpen ? 'Tutup menu' : 'Buka menu'}
              title={isSidebarOpen ? 'Tutup menu' : 'Buka menu'}
            >
              {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center flex-shrink-0">
              <Image
                src="/polibatam_logo.png"
                alt="Logo Polibatam"
                width={96}
                height={96}
                quality={100}
                unoptimized
                className="h-8 w-8 object-contain"
                priority
              />
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="text-[#091222] font-extrabold text-[11px] leading-tight tracking-wide">SIKERMA POLIBATAM</p>
              <p className="text-gray-500 text-[9px] leading-tight">Sistem Informasi Kerjasama</p>
            </div>
          </div>
        </div>

        {isPublic ? (
          <div className="relative flex items-center gap-2 flex-shrink-0" ref={publicMenuRef}>
            <nav className="hidden md:flex items-center gap-5 pr-2">
              {[
                { label: 'Beranda', href: '/#beranda' },
                { label: 'Aktivitas', href: '/#aktivitas' },
                { label: 'Kemitraan', href: '/#info-kerjasama' },
                { label: 'Berita', href: 'https://www.polibatam.ac.id/category/kerja-sama/', external: true },
                { label: 'Kontak', href: '/#kontak' },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="text-sm font-medium text-slate-700 transition-colors hover:text-[#173B82]"
                  onClick={() => setShowPublicMenu(false)}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => router.push('/register')}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Register
              </button>
              <button
                onClick={() => router.push('/login')}
                className="rounded-lg bg-[#091222] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#173B82]"
              >
                Login
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowPublicMenu((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-lg bg-[#091222] p-2.5 text-white shadow-sm transition hover:bg-[#173B82] md:hidden"
              aria-label="Buka menu navigasi"
            >
              {showPublicMenu ? <X size={18} /> : <Menu size={18} />}
            </button>

            {showPublicMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl md:hidden">
                <div className="flex flex-col gap-1">
                  {[
                    { label: 'Beranda', href: '/#beranda' },
                    { label: 'Aktivitas', href: '/#aktivitas' },
                    { label: 'Kemitraan', href: '/#info-kerjasama' },
                    { label: 'Berita', href: 'https://www.polibatam.ac.id/category/kerja-sama/', external: true },
                    { label: 'Kontak', href: '/#kontak' },
                  ].map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      onClick={() => setShowPublicMenu(false)}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-[#173B82]"
                    >
                      {item.label}
                    </a>
                  ))}

                  <div className="mt-1 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                    <button
                      onClick={() => {
                        setShowPublicMenu(false);
                        router.push('/register');
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Register
                    </button>
                    <button
                      onClick={() => {
                        setShowPublicMenu(false);
                        router.push('/login');
                      }}
                      className="rounded-lg bg-[#091222] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#173B82]"
                    >
                      Login
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Notifikasi - Bell icon untuk semua, tapi isi hanya Admin */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative text-gray-700 hover:bg-gray-100 rounded-lg p-1 transition-all duration-200"
                title="Notifikasi"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2.5 border-b border-slate-200">
                    <div className="flex justify-between items-center gap-2">
                      <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                        <Bell size={14} className="text-[#173B82]" />
                        Notifikasi Terbaru
                      </h3>
                      <button
                        onClick={handleViewAll}
                        className="text-xs text-[#173B82] hover:text-[#091222] font-medium"
                      >
                        Lihat Semua
                      </button>
                    </div>
                    {notifications.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleMarkAllAsRead}
                          className="text-xs text-slate-600 hover:text-[#091222] font-medium flex items-center gap-1"
                        >
                          <CheckCheck size={14} />
                          Tandai semua dibaca
                        </button>
                        <button
                          onClick={handleDeleteAllNotifications}
                          className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                        >
                          <X size={14} />
                          Hapus semua
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.slice(0, 5).map((notif) => (
                        <div key={notif.id} className="relative group">
                          <button
                            onClick={() => handleOpenNotification(notif)}
                            className={`w-full text-left px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors ${!notif.read ? 'bg-slate-50' : ''}`}
                          >
                            <div className="flex gap-3">
                              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!notif.read ? 'bg-[#173B82]' : 'bg-slate-300'}`}></div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900">{notif.title}</p>
                                <p className="text-xs text-gray-600 mt-1">{notif.message}</p>
                                <div className="flex items-center justify-between gap-2 mt-1">
                                  <p className="text-xs text-gray-500">📌 dari: {notif.from}</p>
                                  <p className="text-[11px] text-slate-400">{notif.createdAt}</p>
                                </div>
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => handleDeleteNotification(notif.id)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                            title="Hapus notifikasi"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-gray-600">Tidak ada notifikasi</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative flex-shrink-0" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 text-gray-700 hover:bg-gray-100 rounded-lg px-1.5 py-1 transition-all duration-200"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-medium text-gray-900">{userDisplayName}</p>
                  <p className="text-[10px] text-gray-600">{userRoleLabel}</p>
                </div>
                <div className="w-6 h-6 bg-[#091222] border border-slate-700 rounded-full flex items-center justify-center text-white hover:bg-[#173B82] transition-all">
                  <User size={13} />
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-xl py-0 z-50 overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-semibold text-gray-900">{user?.email}</p>
                    <p className="text-[11px] text-gray-600">{userRoleLabel}</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors rounded font-medium"
                    >
                      <LogOut size={16} />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-full overflow-hidden leading-none">
        <svg
          viewBox="0 0 1200 8"
          preserveAspectRatio="none"
          className="block h-1 w-full"
          aria-hidden="true"
        >
          <rect width="1200" height="12" fill="var(--color-primary)" />
          <path d="M0 0 H120 L88 12 H0 Z" fill="var(--color-highlight)" />
          <path d="M86 0 H268 L232 12 H50 Z" fill="var(--color-accent)" />
        </svg>
      </div>
    </header>
  );
}
