const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api/backend';

interface StoredAuthUser {
  accessToken?: string;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function buildApiBaseUrlCandidates(): string[] {
  const configured = normalizeBaseUrl(rawApiBaseUrl);
  const candidates = [
    configured,
    configured.startsWith('/')
      ? configured
      : configured.endsWith('/api')
        ? configured
        : `${configured}/api`,
    'http://127.0.0.1:8000/api',
    'http://localhost:8000/api',
  ];

  return Array.from(new Set(candidates.map(normalizeBaseUrl)));
}

const API_BASE_URL = normalizeBaseUrl(rawApiBaseUrl);
const API_BASE_URL_CANDIDATES = buildApiBaseUrlCandidates();

function getAccessTokenFromStorage(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const rawUser = window.localStorage.getItem('user');
  if (!rawUser) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawUser) as StoredAuthUser;
    return typeof parsed.accessToken === 'string' && parsed.accessToken.trim().length > 0
      ? parsed.accessToken
      : undefined;
  } catch {
    return undefined;
  }
}

// Coba tiap kandidat base URL sampai ada yang berhasil merespons — dipakai bersama oleh
// apiRequest (JSON/text) dan downloadFileWithAuth (blob) supaya logic fallback-nya satu tempat.
async function fetchWithFallback(endpoint: string, options: RequestInit, buildHeaders: (accessToken?: string) => HeadersInit): Promise<Response> {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let response: Response | null = null;
  let lastError: unknown = null;
  const accessToken = getAccessTokenFromStorage();

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const candidateResponse = await fetch(`${baseUrl}${normalizedEndpoint}`, {
        ...options,
        cache: options.cache ?? 'no-store',
        headers: buildHeaders(accessToken),
      });

      // Jika kandidat relative proxy gagal (404/5xx),
      // coba kandidat berikutnya seperti URL backend langsung.
      const isRelativeCandidate = baseUrl.startsWith('/');
      const shouldFallbackToNextCandidate =
        !candidateResponse.ok &&
        isRelativeCandidate &&
        (candidateResponse.status === 404 || candidateResponse.status >= 500);

      if (shouldFallbackToNextCandidate) {
        response = candidateResponse;
        continue;
      }

      response = candidateResponse;
      break;
    } catch (error) {
      lastError = error;

      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  if (!response) {
    if (lastError instanceof TypeError) {
      throw new Error('Gagal terhubung ke server API. Pastikan backend aktif dan URL API benar.');
    }

    throw lastError;
  }

  return response;
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const response = await fetchWithFallback(endpoint, options, (accessToken) => ({
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers || {}),
  }));

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
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
  const response = await fetchWithFallback(endpoint, {}, (accessToken) => ({
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }));

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
    const response = await fetchWithFallback(berkasEndpoint(path), {}, (accessToken) => ({
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }));

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
