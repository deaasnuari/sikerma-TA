// Semua permintaan lewat proxy Next (/api/backend/*). Proxy-lah yang memegang token login di cookie
// HttpOnly dan memasangnya ke backend — JavaScript di browser tidak pernah melihat atau menyimpan
// token. Karena itu API TIDAK boleh dipanggil langsung ke backend dari browser (cookie tidak ikut
// dan permintaannya akan ditolak). Alamat backend sebenarnya diatur di sisi server lewat
// BACKEND_INTERNAL_URL (lihat app/api/backend/[...path]/route.ts).
const API_BASE_URL = '/api/backend';

async function fetchWithFallback(endpoint: string, options: RequestInit, buildHeaders: () => HeadersInit): Promise<Response> {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  try {
    return await fetch(`${API_BASE_URL}${normalizedEndpoint}`, {
      ...options,
      cache: options.cache ?? 'no-store',
      credentials: 'same-origin',
      headers: buildHeaders(),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Gagal terhubung ke server API. Pastikan backend aktif dan URL API benar.');
    }

    throw error;
  }
}

export interface ApiRequestOptions extends RequestInit {
  // Jangan pindahkan halaman ke /login saat dijawab 401 — pemanggil yang memutuskan sendiri
  // (mis. pengecekan sesi saat aplikasi pertama dibuka, yang tidak boleh menendang pengunjung
  // halaman publik).
  skipAuthRedirect?: boolean;
}

export async function apiRequest<T>(endpoint: string, { skipAuthRedirect, ...options }: ApiRequestOptions = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const response = await fetchWithFallback(endpoint, options, () => ({
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  }));

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && !skipAuthRedirect) {
      localStorage.removeItem('user');
      window.location.replace('/login?reason=expired');
      throw new Error('Unauthenticated.');
    }

    const validationMessage =
      typeof body === 'object' && body !== null && 'errors' in body && body.errors
        ? Object.values(body.errors as Record<string, string[]>)
            .flat()
            .find(Boolean)
        : undefined;

    const message =
      validationMessage ||
      (typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : 'Request gagal diproses');

    throw new Error(String(message));
  }

  return body as T;
}

// Unduh file lewat endpoint API yang butuh login (mis. /dokumen-kerjasama/{id}/documents/{fileId}/download),
// lalu simpan pakai NAMA ASLI berkasnya — bukan nama acak hasil penyimpanan di server. Ditempuh
// lewat fetch+blob (bukan <a href> langsung ke endpoint API) karena dua alasan: endpoint API perlu
// header Authorization (navigasi <a> biasa tidak membawa header), dan atribut `download` HTML cuma
// dihormati browser untuk URL same-origin — begitu jadi object URL dari blob, unduhannya otomatis
// dianggap same-origin jadi nama filenya konsisten dipakai di semua browser.
export async function downloadFileWithAuth(endpoint: string, fileName: string): Promise<void> {
  const response = await fetchWithFallback(endpoint, {}, () => ({}));

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('user');
      window.location.replace('/login?reason=expired');
      throw new Error('Unauthenticated.');
    }

    throw new Error('Gagal mengunduh file.');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export { API_BASE_URL };

// ---------------------------------------------------------------------------------------------
// Berkas di storage. Semua berkas (kecuali carousel) TIDAK lagi bisa dibuka lewat URL /storage/...
// langsung — backend hanya melayani lewat GET /berkas?path=... yang butuh login. Karena navigasi
// <a href> tidak membawa header Authorization, berkas diambil lewat fetch lalu dibuka dari blob.
// ---------------------------------------------------------------------------------------------

// Kembalikan path berkas (mis. "pengajuan/2026/01/x.pdf") kalau url menunjuk ke /storage/...
// yang dilindungi; null kalau bukan (carousel, URL luar, blob:, data:, dst.).
export function extractProtectedStoragePath(url: string | null | undefined): string | null {
  if (!url || /^(blob|data):/i.test(url)) return null;

  let pathname: string;
  try {
    pathname = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').pathname;
  } catch {
    return null;
  }

  const match = pathname.match(/^\/storage\/(.+)$/);
  if (!match || /^carousel\//i.test(match[1])) return null;

  return decodeURIComponent(match[1]);
}

function berkasEndpoint(path: string): string {
  return `/berkas?path=${encodeURIComponent(path)}`;
}

// Buka berkas terlindungi di tab baru. Tab dibuka SEKARANG (sinkron dengan klik) supaya tidak
// diblokir popup blocker, lalu diarahkan ke blob setelah fetch selesai.
export async function openProtectedFile(path: string): Promise<void> {
  const tab = window.open('', '_blank');

  try {
    const response = await fetchWithFallback(berkasEndpoint(path), {}, () => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('user');
        window.location.replace('/login?reason=expired');
        throw new Error('Unauthenticated.');
      }
      throw new Error(response.status === 404 ? 'File tidak ditemukan atau Anda tidak punya akses.' : 'Gagal membuka file.');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    if (tab) {
      tab.location.href = objectUrl;
    } else {
      window.location.href = objectUrl;
    }
    // Dilepas belakangan: tab baru butuh waktu memuat blob-nya.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
  } catch (err) {
    tab?.close();
    alert(err instanceof Error ? err.message : 'Gagal membuka file.');
  }
}

// Pengganti window.open(url, '_blank') untuk URL berkas: yang menunjuk ke /storage/... terlindungi
// dibuka lewat login, sisanya (blob:, URL luar) dibuka seperti biasa.
export function openUrl(url: string): void {
  const protectedPath = extractProtectedStoragePath(url);
  if (protectedPath) {
    void openProtectedFile(protectedPath);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function downloadProtectedFile(path: string, fileName: string): Promise<void> {
  await downloadFileWithAuth(berkasEndpoint(path), fileName);
}

// Foto/berkas gambar terlindungi sebagai object URL siap pakai untuk <img src>. <img> tidak bisa
// membawa header Authorization, jadi gambarnya diambil lewat fetch (GET /berkas) lalu dijadikan blob.
// Hasilnya di-cache per path supaya galeri/kartu yang sama tidak mengunduh ulang tiap render.
const protectedObjectUrlCache = new Map<string, Promise<string>>();

export function getProtectedObjectUrl(path: string): Promise<string> {
  const cached = protectedObjectUrlCache.get(path);
  if (cached) return cached;

  const request = (async () => {
    const response = await fetchWithFallback(berkasEndpoint(path), {}, () => ({}));

    if (!response.ok) {
      throw new Error(response.status === 404 ? 'Gambar tidak ditemukan.' : 'Gagal memuat gambar.');
    }

    return URL.createObjectURL(await response.blob());
  })();

  protectedObjectUrlCache.set(path, request);
  request.catch(() => protectedObjectUrlCache.delete(path));
  return request;
}
