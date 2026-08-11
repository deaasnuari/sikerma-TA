import { apiRequest } from '@/lib/api';

export interface CatatanAdminItem {
  id: number;
  pengajuan_id: number;
  teks: string;
  dibuat_oleh: string;
  dibuat_oleh_user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export async function fetchCatatanAdmin(pengajuanId: number): Promise<CatatanAdminItem[]> {
  const res = await apiRequest<ApiResponse<CatatanAdminItem[]>>(
    `/catatan-admin?pengajuan_id=${pengajuanId}`,
  );
  return res.data;
}

export async function createCatatanAdmin(pengajuanId: number, teks: string): Promise<CatatanAdminItem> {
  const res = await apiRequest<ApiResponse<CatatanAdminItem>>('/catatan-admin', {
    method: 'POST',
    body: JSON.stringify({ pengajuan_id: pengajuanId, teks }),
  });
  return res.data;
}

export async function updateCatatanAdmin(id: number, teks: string): Promise<CatatanAdminItem> {
  const res = await apiRequest<ApiResponse<CatatanAdminItem>>(`/catatan-admin/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ teks }),
  });
  return res.data;
}

export async function deleteCatatanAdmin(id: number): Promise<void> {
  await apiRequest<ApiResponse<null>>(`/catatan-admin/${id}`, { method: 'DELETE' });
}
