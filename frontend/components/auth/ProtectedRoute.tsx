'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
}

// Kemana tiap role diarahkan kalau ternyata bukan role yang diminta halaman ini —
// 'unit'/'jurusan'/'prodi' (role civitas/LDAP hasil deteksi otomatis, lihat
// StructuralAccessService::determineCivitasRole()) semuanya diarahkan ke dashboard
// internal yang sama, persis seperti role 'internal' polos.
const roleRouteMap: Record<string, string> = {
  admin: '/admin',
  pimpinan: '/pimpinan',
  internal: '/internal/dashboard',
  unit: '/internal/dashboard',
  jurusan: '/internal/dashboard',
  prodi: '/internal/dashboard',
  external: '/eksternal',
};

export default function ProtectedRoute({ children, requiredRole = 'admin' }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }

    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      router.replace(roleRouteMap[user.role] || '/login');
    }
  }, [isLoading, isAuthenticated, user, requiredRole, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
