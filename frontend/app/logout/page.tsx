'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LogoutPage() {
  const router = useRouter();
  const { logout, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      logout();
    }

    router.replace('/login');
  }, [isLoading, isAuthenticated, logout, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#173B82]" />
        <p className="text-sm text-slate-500">Mengakhiri sesi...</p>
      </div>
    </div>
  );
}
