'use client';

import { useState, useEffect } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminNavbar from '@/components/admin/AdminNavbar';
import AdminFooter from '@/components/admin/AdminFooter';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useViewportScale } from '@/lib/useViewportScale';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const viewportScale = useViewportScale();

  // Handle responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      // Auto close sidebar on mobile, auto open on desktop
      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
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

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-gray-100">
        <div className="sticky top-0 z-50 px-1 pt-1">
          <div style={fixedChromeStyle}>
            <AdminNavbar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} isSidebarOpen={sidebarOpen} />
          </div>
        </div>

        {/* Main Container - Sidebar + Content with gaps */}
        <div className="flex flex-1 overflow-hidden gap-1 px-1 pt-1 pb-1 min-h-0">
          {/* Sidebar with gap */}
          <div className="flex-shrink-0 h-full self-stretch">
            <AdminSidebar isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          </div>

          {/* Main Content Area */}
          <main className="flex-2 flex flex-col overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm p-3">
              {children}
            </div>
          </main>
        </div>

        {/* Footer - Full Width at Bottom */}
        <div className="flex-shrink-0 px-1 pb-1">
          <div style={fixedChromeStyle}>
            <AdminFooter />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}