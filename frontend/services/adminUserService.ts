import { apiRequest } from '@/lib/api';

type ApiRole = 'admin' | 'pimpinan' | 'internal' | 'external';
type ApiApprovalStatus = 'active' | 'pending' | 'rejected';

export type UiRole = 'Admin' | 'Jurusan' | 'Prodi' | 'Pimpinan' | 'Mitra';
export type UiStatus = 'Aktif' | 'NonAktif' | 'Ditolak';

export interface UserListItem {
  id: number;
  nama: string;
  email: string;
  role: UiRole;
  unitInstansi: string;
  status: UiStatus;
  username: string;
  phone: string;
}

interface ApiUser {
  id: string;
  name: string;
  username?: string;
  email: string;
  phone?: string;
  position?: string;
  institution_name?: string;
  account_type?: string;
  approval_status?: ApiApprovalStatus;
  role: ApiRole;
}

interface UserResponse {
  user?: ApiUser;
}

interface UserListResponse {
  data?: ApiUser[];
}

export interface CreateUserPayload {
  nama: string;
  username: string;
  email: string;
  password: string;
  role: UiRole;
  unitInstansi: string;
  phone: string;
}

export interface UpdateUserPayload {
  nama: string;
  email: string;
  role: UiRole;
  unitInstansi: string;
  status: UiStatus;
}

function toApiRole(role: UiRole): ApiRole {
  switch (role) {
    case 'Admin':
      return 'admin';
    case 'Pimpinan':
      return 'pimpinan';
    case 'Mitra':
      return 'external';
    case 'Jurusan':
    case 'Prodi':
    default:
      return 'internal';
  }
}

function toUiRole(user: ApiUser): UiRole {
  if (user.role === 'admin') return 'Admin';
  if (user.role === 'pimpinan') return 'Pimpinan';
  if (user.role === 'external') return 'Mitra';

  if (user.account_type === 'Jurusan') return 'Jurusan';
  if (user.account_type === 'Prodi') return 'Prodi';
  return 'Jurusan';
}

function toApiStatus(status: UiStatus): ApiApprovalStatus {
  switch (status) {
    case 'Aktif':
      return 'active';
    case 'Ditolak':
      return 'rejected';
    case 'NonAktif':
    default:
      return 'pending';
  }
}

function toUiStatus(status?: ApiApprovalStatus): UiStatus {
  switch (status) {
    case 'active':
      return 'Aktif';
    case 'rejected':
      return 'Ditolak';
    case 'pending':
    default:
      return 'NonAktif';
  }
}

function mapApiUser(user: ApiUser): UserListItem {
  return {
    id: Number(user.id),
    nama: user.name,
    email: user.email,
    role: toUiRole(user),
    unitInstansi: user.institution_name ?? '-',
    status: toUiStatus(user.approval_status),
    username: user.username ?? '',
    phone: user.phone ?? '',
  };
}

export async function getAdminUsers(): Promise<UserListItem[]> {
  const response = await apiRequest<UserListResponse>('/admin/users');
  return (response.data ?? []).map(mapApiUser);
}

export async function createAdminUser(payload: CreateUserPayload): Promise<UserListItem> {
  const response = await apiRequest<UserResponse>('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.nama,
      institution_name: payload.unitInstansi,
      username: payload.username,
      email: payload.email,
      phone: payload.phone,
      position: payload.role,
      account_type: payload.role,
      role: toApiRole(payload.role),
      approval_status: 'active',
      password: payload.password,
    }),
  });

  if (!response.user) {
    throw new Error('Data user baru tidak ditemukan dari server');
  }

  return mapApiUser(response.user);
}

export async function updateAdminUser(id: number, payload: UpdateUserPayload): Promise<UserListItem> {
  const response = await apiRequest<UserResponse>(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: payload.nama,
      email: payload.email,
      institution_name: payload.unitInstansi,
      position: payload.role,
      account_type: payload.role,
      role: toApiRole(payload.role),
      approval_status: toApiStatus(payload.status),
    }),
  });

  if (!response.user) {
    throw new Error('Data user hasil update tidak ditemukan dari server');
  }

  return mapApiUser(response.user);
}

export async function deleteAdminUser(id: number): Promise<void> {
  await apiRequest<{ message: string }>(`/admin/users/${id}`, {
    method: 'DELETE',
  });
}

export async function updateAdminUserStatus(id: number, status: UiStatus): Promise<UserListItem> {
  const response = await apiRequest<UserResponse>(`/admin/users/${id}/approval-status`, {
    method: 'PATCH',
    body: JSON.stringify({
      approval_status: toApiStatus(status),
    }),
  });

  if (!response.user) {
    throw new Error('Data user hasil update status tidak ditemukan dari server');
  }

  return mapApiUser(response.user);
}
