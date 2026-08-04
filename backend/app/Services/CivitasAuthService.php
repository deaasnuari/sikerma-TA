<?php
//fungsi untuk login akun LDAP/DOKPOL/Learning Polibatam lewat Civitas API (UPA TIK)
namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class CivitasAuthService
{
    private string $baseUrl;
    private string $apiKey;
    private string $secret;

    public function __construct()
    {
        $this->baseUrl = rtrim((string) config('services.civitas.base_url'), '/');
        $this->apiKey = (string) config('services.civitas.api_key');
        $this->secret = (string) config('services.civitas.secret');
    }

    /**
     * Login akun LDAP/DOKPOL/Learning Polibatam lewat Civitas API (UPA TIK).
     *
     * @return array<string, mixed> data pegawai + token dari Civitas
     *
     * @throws RuntimeException jika kredensial salah atau API tidak bisa dihubungi
     */
    public function loginStaff(string $username, string $password): array
    {
        $path = '/api/auth/login-staff';
        $body = ['username' => $username, 'password' => $password];

        $response = Http::withHeaders($this->signedHeaders('POST', $path, $body))
            ->timeout(15)
            ->post($this->baseUrl.$path, $body);

        $payload = $response->json();

        if (! $response->successful() || ! ($payload['status'] ?? false)) {
            $message = $payload['message'] ?? 'Gagal terhubung ke layanan akun kampus.';

            throw new RuntimeException($message);
        }

        return $payload['data'] ?? [];
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, string>
     */
    private function signedHeaders(string $method, string $path, array $body): array
    {
        $timestamp = (string) time();
        $canonicalPath = '/civitas'.$path;
        $bodyString = $this->encodeBody($body);
        $bodyHash = hash('sha256', $bodyString);

        $payload = implode("\n", [$method, $canonicalPath, $timestamp, $bodyHash]);
        $signature = hash_hmac('sha256', $payload, $this->secret);

        return [
            'X-API-KEY' => $this->apiKey,
            'X-TIMESTAMP' => $timestamp,
            'X-SIGNATURE' => $signature,
        ];
    }

    /**
     * ksort + http_build_query gaya PHP, skip nilai array/object, sesuai kontrak HMAC Civitas.
     *
     * @param  array<string, mixed>  $body
     */
    private function encodeBody(array $body): string
    {
        ksort($body);

        $parts = [];
        foreach ($body as $key => $value) {
            if (is_array($value)) {
                continue;
            }
            $parts[] = urlencode((string) $key).'='.urlencode((string) $value);
        }

        return implode('&', $parts);
    }
}
