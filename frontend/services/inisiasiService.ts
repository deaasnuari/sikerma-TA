import { apiRequest } from '@/lib/api';

export type InisiasiFoto = {
  id: number;
  path_file: string;
  url: string;
  nama_asli: string | null;
};

export type InisiasiDokumen = {
  id: number;
  path_file: string;
  nama_asli: string | null;
  ukuran: number | null;
};

export type InisiasiUnit = {
  id: number;
  unit_prodi_id: number | null;
  nama: string;
};

export type InisiasiItem = {
  id: number;
  tanggal_kegiatan: string;
  judul: string;
  nama_mitra: string;
  deskripsi: string;
  // Disiapkan untuk menghubungkan ke berita kerja sama di kemudian hari; belum dipakai (selalu opsional).
  berita_kerjasama_id: number | null;
  units: InisiasiUnit[];
  peserta: { id: number; nama: string }[];
  fotos: InisiasiFoto[];
  dokumens: InisiasiDokumen[];
  created_at: string | null;
  updated_at: string | null;
};

export type InisiasiUrut = 'terbaru' | 'terlama';

export type InisiasiListMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type InisiasiFormPayload = {
  tanggalKegiatan: string;
  judul: string;
  namaMitra: string;
  deskripsi: string;
  unitProdiIds: number[];
  unitLainnya: string[];
  peserta: string[];
  fotoBaru: File[];
  hapusFotoIds: number[];
  dokumenBaru: File[];
  hapusDokumenIds: number[];
};

export type InisiasiOpsiFilter = {
  tahun: number[];
  // value: "id:<id master>" atau "nama:<unit bebas>" — dikirim apa adanya sebagai parameter `unit`.
  unit: { value: string; nama: string; group: string }[];
};

export type InisiasiFilter = {
  q?: string;
  urut?: InisiasiUrut;
  unit?: string;
  tahun?: number | null;
  bulan?: number | null;
};

type ListResponse = { success: boolean; data: InisiasiItem[]; meta: InisiasiListMeta; opsi_filter: InisiasiOpsiFilter };
type SingleResponse = { success: boolean; message?: string; data: InisiasiItem };

export const INISIASI_MAKS_FOTO = 10;
export const INISIASI_MAKS_UKURAN_FOTO = 5 * 1024 * 1024;
// Batas total foto baru dalam satu kali simpan: server PHP membatasi seluruh isi request (post_max_size, umumnya 10 MB).
export const INISIASI_MAKS_TOTAL_UKURAN_BARU = 8 * 1024 * 1024;
export const INISIASI_FORMAT_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
export const INISIASI_MAKS_DOKUMEN = 10;
export const INISIASI_MAKS_UKURAN_DOKUMEN = 10 * 1024 * 1024;
// Batas gabungan semua berkas baru (foto + dokumen) dalam satu kali simpan; server perlu post_max_size di atas ini.
export const INISIASI_MAKS_TOTAL_UPLOAD_BARU = 48 * 1024 * 1024;

export function formatUkuranBerkas(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export async function getInisiasiList(
  params: InisiasiFilter & { page?: number; perPage?: number },
): Promise<{ data: InisiasiItem[]; meta: InisiasiListMeta; opsi: InisiasiOpsiFilter }> {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.urut) query.set('urut', params.urut);
  if (params.unit) query.set('unit', params.unit);
  if (params.tahun) query.set('tahun', String(params.tahun));
  if (params.bulan) query.set('bulan', String(params.bulan));
  if (params.page) query.set('page', String(params.page));
  if (params.perPage) query.set('per_page', String(params.perPage));

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiRequest<ListResponse>(`/inisiasi${suffix}`);
  return { data: response.data, meta: response.meta, opsi: response.opsi_filter ?? { tahun: [], unit: [] } };
}

// Seluruh data sesuai filter (bukan hanya satu halaman) — dipakai untuk export.
export async function getSemuaInisiasi(filter: InisiasiFilter): Promise<InisiasiItem[]> {
  const pertama = await getInisiasiList({ ...filter, page: 1, perPage: 50 });
  if (pertama.meta.last_page <= 1) return pertama.data;

  // Halaman sisanya diambil bersamaan, bukan satu per satu.
  const sisa = await Promise.all(
    Array.from({ length: pertama.meta.last_page - 1 }, (_, i) => getInisiasiList({ ...filter, page: i + 2, perPage: 50 })),
  );
  return [...pertama.data, ...sisa.flatMap((hasil) => hasil.data)];
}


export async function getInisiasi(id: number): Promise<InisiasiItem> {
  const response = await apiRequest<SingleResponse>(`/inisiasi/${id}`);
  return response.data;
}

// Dikirim sebagai multipart (ada berkas foto dan dokumen PDF). Update memakai POST + _method=PATCH karena PHP tidak
// mengurai multipart pada request PATCH.
export async function saveInisiasi(payload: InisiasiFormPayload, id?: number): Promise<InisiasiItem> {
  const body = new FormData();
  body.append('tanggal_kegiatan', payload.tanggalKegiatan);
  body.append('judul', payload.judul);
  body.append('nama_mitra', payload.namaMitra);
  body.append('deskripsi', payload.deskripsi);
  payload.unitProdiIds.forEach((unitId) => body.append('unit_prodi_ids[]', String(unitId)));
  payload.unitLainnya.forEach((nama) => body.append('unit_lainnya[]', nama));
  payload.peserta.forEach((nama) => body.append('peserta[]', nama));
  payload.fotoBaru.forEach((file) => body.append('fotos[]', file));
  payload.hapusFotoIds.forEach((fotoId) => body.append('hapus_foto_ids[]', String(fotoId)));
  payload.dokumenBaru.forEach((file) => body.append('dokumens[]', file));
  payload.hapusDokumenIds.forEach((dokumenId) => body.append('hapus_dokumen_ids[]', String(dokumenId)));

  if (id !== undefined) {
    body.append('_method', 'PATCH');
  }

  const response = await apiRequest<SingleResponse>(id !== undefined ? `/inisiasi/${id}` : '/inisiasi', {
    method: 'POST',
    body,
  });
  return response.data;
}

export async function deleteInisiasi(id: number): Promise<void> {
  await apiRequest<unknown>(`/inisiasi/${id}`, { method: 'DELETE' });
}

export function formatTanggalInisiasi(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
