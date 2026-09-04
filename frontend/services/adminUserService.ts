import { apiRequest } from '@/lib/api';

//ini adalah service untuk mengelola user admin, termasuk mendapatkan daftar user, membuat user baru, memperbarui user, menghapus user, dan memperbarui status user. Service ini menggunakan tipe data yang sesuai dengan API backend dan juga mengubah data dari API menjadi format yang sesuai untuk UI.
type ApiRole = 'admin' | 'pimpinan' | 'internal' | 'external' | 'unit' | 'jurusan' | 'prodi';
type ApiApprovalStatus = 'active' | 'pending' | 'rejected';

export type UiRole = 'Admin' | 'Jurusan' | 'Prodi' | 'Pimpinan' | 'Mitra' | 'Unit';
export type UiStatus = 'Aktif' | 'NonAktif' | 'Ditolak';

export interface UserListItem {
  id: number;
  nama: string;
  email: string;
  role: UiRole;
  unitInstansi: string;
  unitProdiId: number | null;
  status: UiStatus;
  username: string;
  phone: string;
  // Jabatan struktural (Ketua Jurusan/Ketua Prodi/Kepala Unit) + nama unit/jurusan/
  // prodi-nya — dihitung backend dari NIK vs data Civitas, bukan dari role. Null kalau
  // dosen/staff biasa (tidak terdeteksi jabatan struktural apa pun).
  structuralPositionLabel: string | null;
  structuralUnitName: string | null;
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
  unit_prodi_id?: number | null;
  unit_prodi_nama?: string | null;
  structural_position?: string | null;
  structural_position_label?: string | null;
  structural_unit_id?: number | null;
  structural_unit_name?: string | null;
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
  unitProdiId?: number | null;
  phone: string;
}

export interface UpdateUserPayload {
  nama: string;
  email: string;
  role: UiRole;
  unitInstansi: string;
  unitProdiId?: number | null;
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
    case 'Unit':
      return 'unit';
    case 'Jurusan':
      return 'jurusan';
    case 'Prodi':
      return 'prodi';
    default:
      return 'internal';
  }
}

function toUiRole(user: ApiUser): UiRole {
  if (user.role === 'admin') return 'Admin';
  if (user.role === 'pimpinan') return 'Pimpinan';
  if (user.role === 'external') return 'Mitra';
  if (user.role === 'jurusan') return 'Jurusan';
  if (user.role === 'prodi') return 'Prodi';
  if (user.role === 'unit') return 'Unit';

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
    unitInstansi: user.unit_prodi_nama ?? user.institution_name ?? '-',
    unitProdiId: user.unit_prodi_id ?? null,
    status: toUiStatus(user.approval_status),
    username: user.username ?? '',
    phone: user.phone ?? '',
    structuralPositionLabel: user.structural_position_label ?? null,
    structuralUnitName: user.structural_unit_name ?? null,
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
      unit_prodi_id: payload.unitProdiId ?? null,
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
      unit_prodi_id: payload.unitProdiId ?? null,
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
