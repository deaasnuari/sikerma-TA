import { apiRequest } from '@/lib/api';
import type { AuthUser, LoginPayload, RegisterPayload, UserRole } from '@/types/auth';

const STORAGE_KEY = 'user';
const ENABLE_DEMO_AUTH = process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === 'true';

function normalizeRole(role?: string): UserRole {
  switch (role) {
    case 'admin':
    case 'admin-humas':
      return 'admin';
    case 'pimpinan':
      return 'pimpinan';
    case 'internal':
      return 'internal';
    case 'external':
      return 'external';
    // Role civitas/LDAP hasil deteksi otomatis (lihat
    // StructuralAccessService::determineCivitasRole() di backend) — diteruskan apa
    // adanya, BUKAN dijatuhkan ke 'user' generik (itu bikin ProtectedRoute/roleRouteMap
    // tidak kenal role-nya dan malah nendang balik ke /login).
    case 'unit':
      return 'unit';
    case 'jurusan':
      return 'jurusan';
    case 'prodi':
      return 'prodi';
    default:
      return 'user';
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  const storedUser = localStorage.getItem(STORAGE_KEY);
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser) as AuthUser;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function persistUser(user: AuthUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export async function registerUser(payload: RegisterPayload): Promise<AuthUser> {
  const response = await apiRequest<{ user?: Partial<AuthUser>; data?: Partial<AuthUser> }>('/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const userData = response.user || response.data;
  if (!userData?.email) {
    throw new Error('Registrasi gagal diproses');
  }

  return {
    id: String(userData.id ?? ''),
    name: userData.name ?? payload.name,
    username: userData.username ?? payload.username,
    email: userData.email,
    institution_name: userData.institution_name ?? payload.institution_name,
    phone: userData.phone ?? payload.phone,
    position: userData.position ?? payload.position,
    account_type: userData.account_type ?? payload.account_type,
    approval_status: userData.approval_status as 'active' | 'pending' | 'rejected' | undefined,
    role: normalizeRole(userData.role ?? payload.role ?? 'external'),
  };
}

export async function loginUser(payload: LoginPayload): Promise<AuthUser> {
  const identifier = payload.email.trim().toLowerCase();
  // Role tidak lagi dipilih manual — server yang menentukan dari akun yang cocok.
  const apiPayload = {
    email: identifier,
    password: payload.password,
  };

  try {
    const response = await apiRequest<{ user?: Partial<AuthUser>; data?: Partial<AuthUser> }>('/login', {
      method: 'POST',
      body: JSON.stringify(apiPayload),
    });

    const token =
      (response as { access_token?: string; token?: string }).access_token ||
      (response as { access_token?: string; token?: string }).token;

    const userData = response.user || response.data;
    if (userData?.email) {
      return {
        id: String(userData.id ?? '1'),
        name: userData.name ?? identifier.split('@')[0],
        username: userData.username,
        email: userData.email,
        institution_name: userData.institution_name,
        phone: userData.phone,
        position: userData.position,
        account_type: userData.account_type,
        approval_status: userData.approval_status as 'active' | 'pending' | 'rejected' | undefined,
        accessToken: typeof token === 'string' ? token : undefined,
        role: normalizeRole(userData.role),
        unit_kerja: userData.unit_kerja,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const isNetworkIssue = /fetch|network|failed to fetch|load failed|gagal terhubung/i.test(message);

    if (!isNetworkIssue || !ENABLE_DEMO_AUTH) {
      throw error;
    }

    console.warn('Laravel API tidak tersedia, menggunakan akun demo.', error);
  }

  const demoAccounts: Record<string, AuthUser> = {
    'admin@polibatam.ac.id': {
      id: '1',
      name: 'Admin Sikerma',
      username: 'admin.sikerma',
      email: 'admin@polibatam.ac.id',
      approval_status: 'active',
      role: 'admin',
    },
    'pimpinan@polibatam.ac.id': {
      id: '2',
      name: 'Pimpinan Polibatam',
      username: 'pimpinan.polibatam',
      email: 'pimpinan@polibatam.ac.id',
      approval_status: 'active',
      role: 'pimpinan',
    },
    'internal@polibatam.ac.id': {
      id: '3',
      name: 'User Internal',
      username: 'internal.polibatam',
      email: 'internal@polibatam.ac.id',
      approval_status: 'active',
      role: 'internal',
    },
    'external@mitra.com': {
      id: '4',
      name: 'Mitra Eksternal',
      username: 'mitra.eksternal',
      email: 'external@mitra.com',
      approval_status: 'active',
      role: 'external',
    },
  };

  const matchedDemoUser = Object.values(demoAccounts).find(
    (user) => user.email.toLowerCase() === identifier || user.username?.toLowerCase() === identifier,
  );

  if (!matchedDemoUser) {
    throw new Error('Email atau username tidak terdaftar.');
  }

  // Akun demo ini bukan hasil sinkron LDAP sungguhan (cuma dipakai saat backend offline),
  // jadi tetap boleh login manual apapun role-nya — konsisten dengan akun lama/testing
  // yang auth_provider-nya bukan 'ldap' di backend.
  if (payload.password !== 'Sikerma#2026') {
    throw new Error('Password yang Anda masukkan salah.');
  }

  return matchedDemoUser;
}

export async function loginWithCampusAccount(payload: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  const response = await apiRequest<{ user?: Partial<AuthUser>; data?: Partial<AuthUser> }>('/login-kampus', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const token =
    (response as { access_token?: string; token?: string }).access_token ||
    (response as { access_token?: string; token?: string }).token;

  const userData = response.user || response.data;
  if (!userData?.email && !userData?.username) {
    throw new Error('Login akun kampus gagal diproses');
  }

  return {
    id: String(userData.id ?? ''),
    name: userData.name ?? payload.username,
    username: userData.username,
    email: userData.email ?? '',
    institution_name: userData.institution_name,
    phone: userData.phone,
    position: userData.position,
    account_type: userData.account_type,
    approval_status: userData.approval_status as 'active' | 'pending' | 'rejected' | undefined,
    accessToken: typeof token === 'string' ? token : undefined,
    role: normalizeRole(userData.role),
    unit_kerja: userData.unit_kerja,
  };
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(payload: {
  email: string;
  otp: string;
  password: string;
  password_confirmation: string;
}): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyCurrentUser(): Promise<'valid' | 'invalid' | 'offline'> {
  const stored = getStoredUser();
  if (!stored?.accessToken) return 'valid';

  try {
    await apiRequest<{ user: unknown }>('/me');
    return 'valid';
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const isNetwork = /gagal terhubung|failed to fetch|network|load failed|fetch/i.test(message);
    if (isNetwork) return 'offline';
    // Token kedaluwarsa/tidak valid tidak selalu berarti akun dihapus admin,
    // jadi jangan diklaim sebagai penghapusan akun di sini.
    return 'invalid';
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await apiRequest<{ message: string }>('/logout', {
      method: 'POST',
    });
  } catch {
    // Ignore logout errors and always clear local session on client.
  }
}
