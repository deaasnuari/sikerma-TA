<?php

// Sebelumnya tidak ada file ini sehingga memakai bawaan framework: semua asal ('*') diizinkan.
// Sekarang dibatasi ke asal frontend saja (CORS_ALLOWED_ORIGINS). Frontend Next.js memanggil API
// lewat proxy server (app/api/backend), jadi di production biasanya cukup asal frontend itu.
return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000'))))),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    'exposed_headers' => ['Content-Disposition'],
    'max_age' => 600,
    'supports_credentials' => false,
];
