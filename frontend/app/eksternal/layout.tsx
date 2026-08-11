'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, FileText, LayoutDashboard, LogOut, SquarePen } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AdminNavbar from '@/components/admin/AdminNavbar';
import AdminFooter from '@/components/admin/AdminFooter';
import AdminSidebar, { type SidebarMenuItem } from '@/components/admin/AdminSidebar';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useViewportScale } from '@/lib/useViewportScale';

export default function EksternalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const viewportScale = useViewportScale();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setSidebarOpen(!mobile);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fixedChromeStyle =
    viewportScale === 1
      ? undefined
      : {
          transform: `scale(${1 / viewportScale})`,
          transformOrigin: 'top left',
          width: `${viewportScale * 100}%`,
        };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const menuItems: SidebarMenuItem[] = [
    {
      label: 'Dashboard',
      href: '/eksternal',
      icon: LayoutDashboard,
    },
    {
      label: 'Daftar Kerjasama',
      href: '/eksternal/daftar_kerjasama',
      icon: FileText,
    },
    {
      label: 'Pengajuan Baru',
      href: '/eksternal/pengajuan_baru',
      icon: SquarePen,
    },
    {
      label: 'Story & Aktivitas',
      href: '/eksternal/story_aktivitas',
      icon: BookOpen,
    },
  ];

  return (
    <ProtectedRoute requiredRole="external">
      <div className="flex h-screen flex-col bg-gray-100">
        <div className="sticky top-0 z-50 px-1 pt-1">
          <div style={fixedChromeStyle}>
            <AdminNavbar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} isSidebarOpen={sidebarOpen} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-1 px-1 pt-1 pb-1 overflow-hidden">
          <div className="h-full flex-shrink-0 self-stretch">
            <AdminSidebar
              isOpen={sidebarOpen}
              toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              menuItems={menuItems}
              portalTitle="SIKERMA"
              portalSubtitle="Mitra Eksternal"
              backgroundClassName="bg-[#091222]"
              activeItemClassName="border-l-[#F28C00] bg-white/12 text-white shadow-sm"
            />
          </div>

          <main className="flex flex-1 flex-col overflow-hidden pb-4">
            <div className="flex-1 overflow-y-auto rounded-lg bg-white p-3 shadow-sm">
              {children}
            </div>
          </main>
        </div>

        <div className="flex-shrink-0 px-1 pb-1">
          <div style={fixedChromeStyle}>
            <AdminFooter />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
