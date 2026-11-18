<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Permintaan dari browser lewat proxy Next.js (frontend/app/api/backend), yang mengirim IP asli
        // pengunjung di X-Forwarded-For. Percayai header itu HANYA dari alamat proxy (default: localhost),
        // supaya $request->ip() — dipakai pembatas per-IP login/OTP — berisi IP pengunjung, bukan IP
        // server Next. Hanya X-Forwarded-For yang dipercaya; Host/Proto dari klien tetap diabaikan.
        $middleware->trustProxies(
            at: array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1,::1'))))),
            headers: Request::HEADER_X_FORWARDED_FOR,
        );


        // Header keamanan di semua respons API + pembatas laju umum (limiter 'api', lihat AppServiceProvider).
        $middleware->api(append: [\App\Http\Middleware\SecurityHeaders::class]);
        $middleware->throttleApi('api');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
