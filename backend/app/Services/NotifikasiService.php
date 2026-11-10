<?php

namespace App\Services;

use App\Models\Notifikasi;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Membuat notifikasi lonceng di server.
 *
 * Dua mekanisme distribusi:
 *  - ADMIN = broadcast berdasarkan peran: satu baris notifikasi untuk SETIAP akun admin aktif, dengan status
 *    baca masing-masing (membaca di satu akun tidak mengubah akun lain). Admin baru tidak menerima notifikasi lama.
 *  - INTERNAL / EXTERNAL / PIMPINAN = personal berdasarkan user_id penerima (pemilik pengajuan), bukan peran.
 *
 * $meta (opsional): 'jenis' (jenis aktivitas), 'actor' (id pelaku), 'pengajuan' (id pengajuan terkait),
 * 'kunci' (anti-ganda: pasangan penerima+kunci hanya dibuat sekali).
 *
 * Kegagalan membuat notifikasi tidak boleh menggagalkan aksi utama, jadi semua error hanya dicatat di log.
 */
class NotifikasiService
{
    /** Peran yang dihitung sebagai "Internal" (termasuk peran civitas hasil deteksi otomatis). */
    private const PERAN_INTERNAL = ['internal', 'unit', 'jurusan', 'prodi'];

    private const PERAN_EKSTERNAL = ['external', 'eksternal'];

    public static function kirim(?int $userId, string $judul, string $pesan, ?string $href = null, string $kategori = 'info', string $dari = 'Sistem', array $meta = []): void
    {
        if (! $userId) {
            return;
        }

        try {
            $nilai = [
                'judul' => $judul,
                'pesan' => $pesan,
                'dari' => $dari,
                'href' => $href,
                'kategori' => $kategori,
                'jenis_aktivitas' => $meta['jenis'] ?? null,
                'actor_id' => $meta['actor'] ?? null,
                'pengajuan_id' => $meta['pengajuan'] ?? null,
            ];

            if (! empty($meta['kunci'])) {
                // Idempoten: pengulangan (retry) dengan kunci yang sama tidak membuat notifikasi baru.
                Notifikasi::firstOrCreate(['user_id' => $userId, 'kunci' => $meta['kunci']], $nilai);
            } else {
                Notifikasi::create($nilai + ['user_id' => $userId]);
            }
        } catch (\Throwable $e) {
            Log::warning('Gagal membuat notifikasi: '.$e->getMessage());
        }
    }

    /** ID semua akun admin aktif. */
    public static function idAdmin(?int $kecualiUserId = null): array
    {
        return User::query()
            ->whereIn('role', ['admin', 'admin-humas'])
            ->where(fn ($q) => $q->whereNull('approval_status')->orWhereNotIn('approval_status', ['rejected', 'pending']))
            ->when($kecualiUserId, fn ($q) => $q->where('id', '!=', $kecualiUserId))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** Broadcast ke SEMUA admin aktif (bisa mengecualikan pelaku). Status baca tiap akun terpisah. */
    public static function kirimKeAdmin(string $judul, string $pesan, ?string $href = null, string $kategori = 'info', ?int $kecualiUserId = null, string $dari = 'Sistem', array $meta = []): void
    {
        try {
            foreach (self::idAdmin($kecualiUserId) as $id) {
                self::kirim($id, $judul, $pesan, $href, $kategori, $dari, $meta);
            }
        } catch (\Throwable $e) {
            Log::warning('Gagal membuat notifikasi untuk admin: '.$e->getMessage());
        }
    }

    /** Personal: kirim ke satu pengguna, kecuali bila dia sendiri pelakunya. */
    public static function kirimKePengguna(?int $userId, ?int $kecualiUserId, string $judul, string $pesan, ?string $href = null, string $kategori = 'info', string $dari = 'Admin', array $meta = []): void
    {
        if (! $userId || ($kecualiUserId && $userId === $kecualiUserId)) {
            return;
        }

        self::kirim($userId, $judul, $pesan, $href, $kategori, $dari, $meta);
    }

    public static function adalahInternal(?User $user): bool
    {
        return $user && in_array(strtolower((string) $user->role), self::PERAN_INTERNAL, true);
    }

    public static function adalahEksternal(?User $user): bool
    {
        return $user && in_array(strtolower((string) $user->role), self::PERAN_EKSTERNAL, true);
    }

    /** "Internal" / "External" untuk dicantumkan di pesan notifikasi admin. */
    public static function labelPengusul(?User $user): string
    {
        return self::adalahEksternal($user) ? 'External' : 'Internal';
    }

    /** Sebutan pelaku di pesan: "Admin Nama", "Nama (Internal)", atau "Nama (External)". */
    public static function sebutPelaku(?User $user): string
    {
        $nama = trim((string) ($user?->name ?? ''));
        if ($user && in_array(strtolower((string) $user->role), ['admin', 'admin-humas'], true)) {
            return 'Admin'.($nama !== '' ? ' '.$nama : '');
        }

        return ($nama !== '' ? $nama.' ' : '').'('.self::labelPengusul($user).')';
    }

    /**
     * Catat aksi yang baru dilakukan pengguna Internal di lonceng miliknya sendiri (riwayat aktivitas),
     * misalnya menghapus pengajuan. Tidak melakukan apa pun untuk peran lain.
     */
    public static function catatAksiInternal(?User $pelaku, string $judul, string $pesan, string $href, string $kategori = 'info', array $meta = []): void
    {
        if (! self::adalahInternal($pelaku)) {
            return;
        }

        self::kirim((int) $pelaku->id, $judul, $pesan, $href, $kategori, 'Sistem', $meta + ['actor' => (int) $pelaku->id]);
    }

    /**
     * Konfirmasi untuk pengusul (Internal ATAU External) atas aksinya sendiri: pengajuan terkirim dan revisi terkirim.
     */
    public static function catatAksiPengusul(?User $pelaku, string $judul, string $pesan, string $kategori = 'info', array $meta = []): void
    {
        if (! self::adalahInternal($pelaku) && ! self::adalahEksternal($pelaku)) {
            return;
        }

        self::kirim((int) $pelaku->id, $judul, $pesan, self::hrefUntuk((int) $pelaku->id), $kategori, 'Sistem', $meta + ['actor' => (int) $pelaku->id]);
    }

    /** Halaman tujuan sesuai peran penerima. $jenis: 'pengajuan' atau 'rekap'. */
    public static function hrefUntuk(?int $userId, string $jenis = 'pengajuan'): string
    {
        $role = strtolower((string) User::query()->whereKey($userId)->value('role'));

        return match (true) {
            in_array($role, self::PERAN_EKSTERNAL, true) => '/eksternal/daftar_kerjasama',
            in_array($role, ['admin', 'admin-humas'], true) => $jenis === 'rekap' ? '/admin/rekap_data' : '/admin/data_pengajuan',
            $role === 'pimpinan' => '/pimpinan/daftar_kerjasama',
            default => $jenis === 'rekap' ? '/internal/rekap_data' : '/internal/data_pengajuan',
        };
    }
}
