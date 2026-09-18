<?php
// fungsi untuk ambil struktur Jurusan/Program Studi/Unit (beserta Kajur/KPS/Kepala Unit)
// dari Civitas API (UPA TIK) — dipakai untuk menentukan jabatan struktural user internal.
namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CivitasStructureService
{
    private string $baseUrl;
    private string $apiKey;
    private string $secret;

    /**
     * Struktur jarang berubah — tapi jangan sampai basi kalau ada pergantian jabatan.
     * Sempat 300s; dinaikkan ke 30 menit karena tiap cache miss memicu hit ke Civitas API
     * (timeout 15s) untuk SETIAP request list Pengajuan/Dokumen/Aktivitas dari user
     * internal/unit/jurusan/prodi — 300s bikin ini kejadian berkali-kali per jam di traffic
     * ramai dan terasa lag begitu API kampusnya lambat.
     */
    private const CACHE_TTL_SECONDS = 1800;

    public function __construct()
    {
        $this->baseUrl = rtrim((string) config('services.civitas.base_url'), '/');
        $this->apiKey = (string) config('services.civitas.api_key');
        $this->secret = (string) config('services.civitas.secret');
    }

    /**
     * @return array<int, array{ID_JURUSAN: string, NAMA_JURUSAN: string, NAMA_JURUSAN_INGGRIS: string, NIK_KAJUR: ?string, NAMA_KAJUR: ?string}>
     */
    public function getJurusan(): array
    {
        return Cache::remember('civitas:struktur:jurusan', self::CACHE_TTL_SECONDS, function () {
            return $this->fetch('/api/sikerma/jurusan');
        });
    }

    /**
     * @return array<int, array{ID_PROGRAM_STUDI: string, JENJANG: string, NAMA_PROGRAM_STUDI: string, NAMA_PROGRAM_STUDI_INGGRIS: string, NIK_KPS: ?string, NAMA_KPS: ?string}>
     */
    public function getProgramStudi(): array
    {
        return Cache::remember('civitas:struktur:program-studi', self::CACHE_TTL_SECONDS, function () {
            return $this->fetch('/api/sikerma/program-studi');
        });
    }

    /**
     * Baris yang sebenarnya representasi Jurusan (nama diawali "JURUSAN ") sengaja dibuang —
     * jabatan itu sudah tercakup lewat getJurusan()/NIK_KAJUR, supaya Kajur tidak juga
     * terdeteksi dobel sebagai "Kepala Unit" untuk unit bernama "JURUSAN ...".
     *
     * @return array<int, array{ID_UNIT: string, NAMA_UNIT: string, NIK_KEPALA_UNIT: ?string, NAMA_KEPALA_UNIT: ?string}>
     */
    public function getUnit(): array
    {
        return Cache::remember('civitas:struktur:unit', self::CACHE_TTL_SECONDS, function () {
            $rows = $this->fetch('/api/sikerma/unit');

            return array_values(array_filter($rows, function ($row) {
                $nama = strtoupper(trim((string) ($row['NAMA_UNIT'] ?? '')));

                return !str_starts_with($nama, 'JURUSAN ');
            }));
        });
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function fetch(string $path): array
    {
        try {
            $timestamp = (string) time();
            $canonicalPath = '/civitas'.$path;
            $bodyHash = hash('sha256', '');
            $payload = implode("\n", ['GET', $canonicalPath, $timestamp, $bodyHash]);
            $signature = hash_hmac('sha256', $payload, $this->secret);

            $response = Http::withoutVerifying()->withHeaders([
                'X-API-KEY' => $this->apiKey,
                'X-TIMESTAMP' => $timestamp,
                'X-SIGNATURE' => $signature,
            ])->timeout(15)->get($this->baseUrl.$path);

            $body = $response->json();

            if (!$response->successful() || !($body['status'] ?? false)) {
                Log::warning('CivitasStructureService: gagal ambil struktur', [
                    'path' => $path,
                    'status' => $response->status(),
                ]);

                return [];
            }

            return is_array($body['data'] ?? null) ? $body['data'] : [];
        } catch (\Throwable $e) {
            // Kalau Civitas API down/timeout, jangan sampai ikut menjatuhkan halaman
            // pengajuan/rekap — cukup fallback ke "tidak ada jabatan struktural terdeteksi"
            // (dosen biasa), bukan malah membuka akses lebih luas.
            Log::warning('CivitasStructureService: exception saat ambil struktur', [
                'path' => $path,
                'message' => $e->getMessage(),
            ]);

            return [];
        }
    }
}
