<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Header keamanan untuk semua respons API. API ini hanya melayani JSON/berkas — tidak ada halaman
 * HTML — jadi aman dikunci ketat: tidak boleh di-iframe, browser tidak boleh menebak tipe isi
 * (mencegah berkas unggahan dijalankan sebagai HTML/script), dan tidak ada referrer yang bocor.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        // sandbox: kalau berkas HTML/SVG unggahan dibuka langsung dari API, skripnya tidak jalan.
        $response->headers->set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");

        return $response;
    }
}
