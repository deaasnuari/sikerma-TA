'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearStoredUser,
  getStoredUser,
  loginUser,
  loginWithCampusAccount,
  logoutUser,
  persistUser,
  verifyCurrentUser,
} from '@/services/authService';
import { invalidateRekapCache } from '@/services/dokumenKerjasamaApiService';
import { invalidateMonitoringCache } from '@/services/adminMonitoringService';
import type { AuthUser } from '@/types/auth';

// Rekap Data & Monitoring punya cache singkat di memori (module-level, bukan per-user) —
// harus dikosongkan tiap kali identitas yang login berubah (login/login-kampus/logout).
// Kalau tidak, ganti akun dalam jendela cache (60 detik) bisa nampilin data hasil scope
// akses user SEBELUMNYA (mis. Kepala Unit login abis admin buka Rekap Data duluan).
function invalidateUserScopedCaches() {
  invalidateRekapCache();
  invalidateMonitoringCache();
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  loginWithCampus: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) {
      setIsLoading(false);
      return;
    }

    verifyCurrentUser().then((status) => {
      if (status === 'invalid') {
        clearStoredUser();
        setUser(null);
        router.replace('/login?reason=expired');
      } else {
        setUser(storedUser);
      }
    }).finally(() => {
      setIsLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const loggedInUser = await loginUser({ email, password });
      invalidateUserScopedCaches();
      setUser(loggedInUser);
      persistUser(loggedInUser);
      return loggedInUser;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithCampus = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const loggedInUser = await loginWithCampusAccount({ username, password });
      invalidateUserScopedCaches();
      setUser(loggedInUser);
      persistUser(loggedInUser);
      return loggedInUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    void logoutUser();
    invalidateUserScopedCaches();
    setUser(null);
    clearStoredUser();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithCampus, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
