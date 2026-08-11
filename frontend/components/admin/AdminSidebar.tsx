'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, FileText, RefreshCw, BarChart3,
  BookOpen, Archive, Users, Handshake, ChevronLeft, ChevronRight, Bell,
  type LucideIcon,
} from 'lucide-react';
import { getUnreadCountByHref, getUnreadCountByHrefPrefix } from '@/services/adminService';

export interface SidebarMenuItem {
  icon: LucideIcon;
  label: string;
  href: string;
  children?: Array<{ label: string; href: string }>;
  onClick?: () => void;
}

interface AdminSidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  menuItems?: SidebarMenuItem[];
  portalTitle?: string;
  portalSubtitle?: string;
  backgroundClassName?: string;
  activeItemClassName?: string;
}

const PERPANJANGAN_HREF = '/admin/monitoring/perpanjangan';
const DATA_PENGAJUAN_HREF_PREFIX = '/admin/data_pengajuan';

const defaultMenuItems: SidebarMenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/admin' },
  {
    icon: FileText,
    label: 'Data Pengajuan',
    href: '/admin/data_pengajuan',
    children: [{ label: 'Tahapan Pengajuan', href: '/admin/data_pengajuan/tahapan_pengajuan' }],
  },
  { icon: RefreshCw, label: 'Rekap Data dan Monitoring', href: '/admin/rekap_data' },
  {
    icon: BarChart3,
    label: 'Status dan Progres Kerja Sama',
    href: '/admin/monitoring',
    children: [{ label: 'Permintaan Perpanjangan', href: '/admin/monitoring/perpanjangan' }],
  },
  { icon: BookOpen, label: 'Story & Aktivitas', href: '/admin/story_aktivitas' },
  { icon: Archive, label: 'Arsip Dokumen', href: '/admin/arsip_dokumen' },
  { icon: Users, label: 'Manajemen User', href: '/admin/manajemen_users' },
  { icon: Handshake, label: 'Data Kemitraan', href: '/admin/master_mitra' },
];

export default function AdminSidebar({
  isOpen,
  toggleSidebar,
  menuItems = defaultMenuItems,
  portalTitle = 'SIKERMA',
  portalSubtitle = 'Polibatam',
  backgroundClassName = 'bg-[#091222]',
  activeItemClassName = 'border-l-[#57C9E8] bg-[#57C9E8]/15 text-white shadow-sm',
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [perpanjanganBadge, setPerpanjanganBadge] = useState(0);
  const [dataPengajuanBadge, setDataPengajuanBadge] = useState(0);

  useEffect(() => {
    const sync = () => {
      setPerpanjanganBadge(getUnreadCountByHref(PERPANJANGAN_HREF));
      setDataPengajuanBadge(getUnreadCountByHrefPrefix(DATA_PENGAJUAN_HREF_PREFIX));
    };
    sync();
    window.addEventListener('admin-notifications-updated', sync);
    return () => window.removeEventListener('admin-notifications-updated', sync);
  }, []);

  useEffect(() => {
    const hrefs = new Set<string>();

    menuItems.forEach((item) => {
      if (item.href) {
        hrefs.add(item.href);
      }

      item.children?.forEach((child) => {
        if (child.href) {
          hrefs.add(child.href);
        }
      });
    });

    hrefs.forEach((href) => {
      router.prefetch(href);
    });
  }, [menuItems, router]);

  const exactOnlyRoutes = new Set(['/admin', '/internal/dashboard', '/eksternal', '/pimpinan']);

  const isActive = (href: string) => {
    if (exactOnlyRoutes.has(href)) {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const handlePrefetch = (href: string) => {
    router.prefetch(href);
  };

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={toggleSidebar} />}

      {/* Sidebar */}
      <aside className={`fixed md:relative top-0 left-0 h-full md:h-full ${backgroundClassName} text-gray-300 z-30 flex flex-col transition-all duration-300 rounded-lg shadow-md overflow-visible
        ${isOpen ? 'w-60 md:w-56' : 'w-16'}
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-3 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[#091222] shadow-md transition hover:bg-slate-50 hover:text-[#173B82]"
          title={isOpen ? 'Tutup sidebar' : 'Buka sidebar'}
        >
          {isOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Logo */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-700/60">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/polibatam_logo.png" alt="Logo" className="w-8 h-8 object-contain flex-shrink-0" />
            {isOpen && (
              <div className="font-bold truncate">
                <p className="text-white text-[10px] leading-tight">{portalTitle}</p>
                <p className="text-gray-400 text-[11px] leading-tight">{portalSubtitle}</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigasi */}
        <nav className="flex-1 flex flex-col px-1.5 gap-0.5 overflow-y-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = item.onClick ? false : isActive(item.href);
            const showChildren = Boolean(
              isOpen &&
              item.children?.length &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`))
            );
            const sharedClassName = `flex w-full items-center ${isOpen ? 'gap-2.5 px-2.5 justify-start' : 'justify-center px-1'} rounded-lg border-l-[3px] py-2 transition-all duration-200 text-sm ${
              active
                ? activeItemClassName
                : 'border-l-transparent text-slate-300 hover:bg-white/5 hover:text-white'
            }`;

            if (item.onClick) {
              return (
                <button
                  key={`${item.label}-${item.href}`}
                  type="button"
                  onClick={item.onClick}
                  title={!isOpen ? item.label : undefined}
                  className={sharedClassName}
                >
                  <Icon size={15} className="flex-shrink-0" />
                  {isOpen && <span className="leading-tight text-[10px] font-medium">{item.label}</span>}
                </button>
              );
            }

            const hasPerpanjanganBadge = item.children?.some((c) => c.href === PERPANJANGAN_HREF) && perpanjanganBadge > 0;
            const hasDataPengajuanBadge = item.href === '/admin/data_pengajuan' && dataPengajuanBadge > 0;
            const hasParentBadge = hasPerpanjanganBadge || hasDataPengajuanBadge;
            const parentBadgeCount = hasPerpanjanganBadge ? perpanjanganBadge : dataPengajuanBadge;

            return (
              <div key={`${item.label}-${item.href}`} className="space-y-1">
                <Link
                  href={item.href}
                  prefetch
                  onMouseEnter={() => handlePrefetch(item.href)}
                  onFocus={() => handlePrefetch(item.href)}
                  onTouchStart={() => handlePrefetch(item.href)}
                  title={!isOpen ? item.label : undefined}
                  className={`${sharedClassName} relative`}
                >
                  <span className="relative flex-shrink-0">
                    <Icon size={15} />
                    {/* Dot indicator on collapsed parent when badge > 0 */}
                    {!isOpen && hasParentBadge && (
                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-1 ring-[#091222]" />
                    )}
                  </span>
                  {isOpen && <span className="leading-tight text-[10px] font-medium">{item.label}</span>}
                  {/* Badge count on expanded parent when children not visible */}
                  {isOpen && !showChildren && hasParentBadge && (
                    <span className="ml-auto inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {parentBadgeCount > 9 ? '9+' : parentBadgeCount}
                    </span>
                  )}
                </Link>

                {showChildren && (
                  <div className="ml-7 space-y-0.5 border-l border-slate-600/60 pl-2.5">
                    {item.children?.map((child) => {
                      const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                      const childBadge = child.href === PERPANJANGAN_HREF ? perpanjanganBadge : 0;
                      const hasBell = childBadge > 0;

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          prefetch
                          onMouseEnter={() => handlePrefetch(child.href)}
                          onFocus={() => handlePrefetch(child.href)}
                          onTouchStart={() => handlePrefetch(child.href)}
                          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[9px] font-medium transition-colors ${
                            hasBell
                              ? 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                              : childActive
                                ? 'bg-[#57C9E8]/20 text-white'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {hasBell && (
                            <span className="relative flex-shrink-0">
                              <Bell size={11} className="animate-[wiggle_1s_ease-in-out_infinite] text-amber-300" />
                              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
                            </span>
                          )}
                          <span className="flex-1 leading-tight">{child.label}</span>
                          {hasBell && (
                            <span className="ml-auto inline-flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                              {childBadge > 9 ? '9+' : childBadge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="text-gray-500 text-center px-2 py-1.5 border-t border-slate-700/60 text-[11px]">
          {isOpen ? '© 2026 Politeknik Negeri Batam' : '©'}
        </div>
      </aside>
    </>
  );
}