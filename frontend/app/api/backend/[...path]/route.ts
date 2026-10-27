import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BACKEND_BASE_URL = (process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

// Endpoint yang beneran publik di backend (di luar middleware auth:sanctum, lihat
// backend/routes/api.php) — responsnya sama untuk semua orang, tidak pernah bergantung
// pada user yang login. Ini yang dihit landing page/dashboard admin berkali-kali
// (statistik, daftar kerjasama publik, daftar unit/prodi publik, carousel) sehingga aman
// di-cache sebentar, beda dari endpoint ber-auth yang wajib selalu fresh & scoped per user.
const PUBLIC_CACHEABLE_PATHS = new Set(['carousel-images', 'dokumen-kerjasama/stats/mitra']);
const PUBLIC_CACHEABLE_PREFIXES = ['public/'];
const PUBLIC_CACHE_REVALIDATE_SECONDS = 20;

function buildTargetUrl(pathSegments: string[], request: NextRequest): string {
  const path = pathSegments.join('/');
  const queryString = request.nextUrl.search || '';

  return `${BACKEND_BASE_URL}/api/${path}${queryString}`;
}

function isPubliclyCacheable(method: string, path: string): boolean {
  if (method !== 'GET') {
    return false;
  }

  return PUBLIC_CACHEABLE_PATHS.has(path) || PUBLIC_CACHEABLE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ── Sesi login lewat cookie HttpOnly ─────────────────────────────────────────────────────────
// Token Sanctum TIDAK PERNAH sampai ke JavaScript browser: proxy ini mengambilnya dari respons
// login, menyimpannya di cookie HttpOnly (tidak terbaca skrip → kebal dicuri lewat XSS), lalu
// memasangnya sebagai header Authorization pada setiap permintaan ke backend. Browser cukup
// memanggil /api/backend/* dan cookie ikut otomatis.
const SESSION_COOKIE = 'sikerma_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // sama dengan SANCTUM_TOKEN_EXPIRATION (480 menit)
const LOGIN_PATHS = new Set(['login', 'login-kampus']);

function isHttps(request: NextRequest): boolean {
  return request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
}

function sessionCookie(request: NextRequest, value: string, maxAge: number): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    // Lax: cookie tidak ikut permintaan lintas-situs yang mengubah data (CSRF), tapi tetap ikut
    // saat pengguna membuka tautan ke aplikasi ini.
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(isHttps(request) ? ['Secure'] : []),
  ].join('; ');
}

// Permintaan yang mengubah data harus berasal dari situs ini sendiri (lapis kedua selain SameSite).
function isCrossSiteWrite(request: NextRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

async function proxyRequest(request: NextRequest, pathSegments: string[]): Promise<Response> {
  const path = pathSegments.join('/');
  const targetUrl = buildTargetUrl(pathSegments, request);
  const method = request.method;
  const contentType = request.headers.get('content-type') || '';
  const shouldSendBody = method !== 'GET' && method !== 'HEAD';
  const cacheable = isPubliclyCacheable(method, path);

  if (isCrossSiteWrite(request)) {
    return NextResponse.json({ message: 'Permintaan lintas situs ditolak.' }, { status: 403 });
  }

  const headers = new Headers(request.headers);
  headers.delete('host');
  // Token hanya boleh datang dari cookie HttpOnly — abaikan Authorization/Cookie buatan klien.
  headers.delete('authorization');
  headers.delete('cookie');
  headers.set('accept', 'application/json');
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    headers.set('authorization', `Bearer ${sessionToken}`);
  }

  let body: BodyInit | undefined;
  if (shouldSendBody) {
    if (contentType.includes('application/json')) {
      body = await request.text();
    } else {
      body = await request.arrayBuffer();
    }
  }

  try {
    const backendResponse = await fetch(targetUrl, {
      method,
      headers,
      body,
      ...(cacheable
        ? { next: { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS } }
        : { cache: 'no-store' as const }),
    });

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('content-length');

    if (cacheable) {
      responseHeaders.set(
        'cache-control',
        `public, max-age=${PUBLIC_CACHE_REVALIDATE_SECONDS}, stale-while-revalidate=60`,
      );
      responseHeaders.delete('pragma');
      responseHeaders.delete('expires');
    } else {
      responseHeaders.set('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      responseHeaders.set('pragma', 'no-cache');
      responseHeaders.set('expires', '0');
    }

    // Login berhasil: pindahkan token dari body ke cookie HttpOnly, lalu buang dari respons.
    if (method === 'POST' && LOGIN_PATHS.has(path) && backendResponse.ok) {
      const payload = (await backendResponse.json().catch(() => null)) as Record<string, unknown> | null;
      const token = payload && (payload.access_token ?? payload.token);
      if (payload && typeof token === 'string' && token) {
        delete payload.access_token;
        delete payload.token;
        responseHeaders.set('content-type', 'application/json');
        responseHeaders.append('set-cookie', sessionCookie(request, token, SESSION_MAX_AGE_SECONDS));
        return new Response(JSON.stringify(payload), {
          status: backendResponse.status,
          statusText: backendResponse.statusText,
          headers: responseHeaders,
        });
      }
    }

    // Logout, atau token ditolak backend (kedaluwarsa/dicabut): hapus cookie sesinya.
    if (sessionToken && (path === 'logout' || backendResponse.status === 401)) {
      responseHeaders.append('set-cookie', sessionCookie(request, '', 0));
    }

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        message: 'Gagal terhubung ke backend API.',
      },
      { status: 502 },
    );
  }
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, path || []);
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function OPTIONS(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}
