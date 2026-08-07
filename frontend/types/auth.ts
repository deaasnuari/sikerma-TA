'use client';

export type UserRole = 'admin' | 'user' | 'pimpinan' | 'internal' | 'external';

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
