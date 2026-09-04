'use client';

// 'unit'/'jurusan'/'prodi' — role civitas/LDAP hasil deteksi otomatis (lihat
// StructuralAccessService::determineCivitasRole() di backend), diperlakukan setara
// 'internal' di seluruh routing/guard frontend (semua "keluarga" akun kampus).
export type UserRole = 'admin' | 'user' | 'pimpinan' | 'internal' | 'external' | 'unit' | 'jurusan' | 'prodi';

export interface AuthUser {
  id: string;
  name: string;
  username?: string;
  email: string;
  accessToken?: string;
  role: UserRole;
  institution_name?: string;
  phone?: string;
  position?: string;
  account_type?: string;
  approval_status?: 'active' | 'pending' | 'rejected';
  // Unit kerja apa adanya dari data Civitas (data.UNIT_KERJA saat login LDAP), disegarkan
  // tiap login — dipakai buat nampilin nama unit di navbar, bukan cuma label role generik.
  unit_kerja?: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  username: string;
  email: string;
  role?: string;
  institution_name?: string;
  negara?: string;
  phone?: string;
  position?: string;
  account_type?: string;
  password: string;
  password_confirmation: string;
}
