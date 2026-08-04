'use client';

import { useState, useEffect } from 'react';
import AdminSidebar from './AdminSidebar';
import AdminNavbar from './AdminNavbar';
import AdminFooter from './AdminFooter';

interface AdminLayoutWrapperProps {
  children: React.ReactNode;
}

export default function AdminLayoutWrapper({ children }: AdminLayoutWrapperProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
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

  if (!isHydrated) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="sticky top-0 z-50 px-4 pt-4">
        <AdminNavbar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} isSidebarOpen={sidebarOpen} />
      </div>

      {/* Main container with sidebar and content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <AdminSidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Main content area */}
        <main
          className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
          style={{
            marginLeft: isMobile ? 0 : sidebarOpen ? 0 : 0, // No margin needed since sidebar is relative
          }}
        >
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </div>

          {/* Footer - Sticky at bottom */}
          <AdminFooter />
        </main>
      </div>
    </div>
  );
}
