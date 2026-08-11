import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BACKEND_BASE_URL = (process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

function buildTargetUrl(pathSegments: string[], request: NextRequest): string {
  const path = pathSegments.join('/');
  const queryString = request.nextUrl.search || '';

  return `${BACKEND_BASE_URL}/api/${path}${queryString}`;
}

async function proxyRequest(request: NextRequest, pathSegments: string[]): Promise<Response> {
  const targetUrl = buildTargetUrl(pathSegments, request);
  const method = request.method;
  const contentType = request.headers.get('content-type') || '';
  const shouldSendBody = method !== 'GET' && method !== 'HEAD';

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('accept', 'application/json');

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
      cache: 'no-store',
    });

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('transfer-encoding');
    responseHeaders.set('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    responseHeaders.set('pragma', 'no-cache');
    responseHeaders.set('expires', '0');

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
