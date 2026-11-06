<?php

namespace App\Services;

use App\Models\Notifikasi;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Membuat notifikasi lonceng di server. Kegagalan membuat notifikasi tidak boleh menggagalkan aksi
 * utama (simpan pengajuan, keputusan perpanjangan, dsb.), jadi semua error hanya dicatat di log.
 */
class NotifikasiService
{
    public static function kirim(?int $userId, string $judul, string $pesan, ?string $href = null, string $kategori = 'info', string $dari = 'Sistem'): void
    {
        if (! $userId) {
            return;
        }

        try {
            Notifikasi::create([
                'user_id' => $userId,
                'judul' => $judul,
                'pesan' => $pesan,
                'dari' => $dari,
                'href' => $href,
                'kategori' => $kategori,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Gagal membuat notifikasi: '.$e->getMessage());
        }
    }

    /** Kirim ke semua admin, kecuali pelaku aksi itu sendiri. */
    public static function kirimKeAdmin(string $judul, string $pesan, ?string $href = null, string $kategori = 'info', ?int $kecualiUserId = null, string $dari = 'Sistem'): void
    {
        try {
            User::query()
                ->whereIn('role', ['admin', 'admin-humas'])
                ->when($kecualiUserId, fn ($q) => $q->where('id', '!=', $kecualiUserId))
                ->pluck('id')
                ->each(fn ($id) => self::kirim((int) $id, $judul, $pesan, $href, $kategori, $dari));
        } catch (\Throwable $e) {
            Log::warning('Gagal membuat notifikasi untuk admin: '.$e->getMessage());
        }
    }

    /** Kirim ke satu pengguna, kecuali bila dia sendiri pelakunya. */
    public static function kirimKePengguna(?int $userId, ?int $kecualiUserId, string $judul, string $pesan, ?string $href = null, string $kategori = 'info', string $dari = 'Admin'): void
    {
        if (! $userId || ($kecualiUserId && $userId === $kecualiUserId)) {
            return;
        }

        self::kirim($userId, $judul, $pesan, $href, $kategori, $dari);
    }

    /** Halaman tujuan sesuai peran penerima. $jenis: 'pengajuan' atau 'rekap'. */
    public static function hrefUntuk(?int $userId, string $jenis = 'pengajuan'): string
    {
        $role = strtolower((string) User::query()->whereKey($userId)->value('role'));

        return match (true) {
            in_array($role, ['external', 'eksternal'], true) => '/eksternal/daftar_kerjasama',
            in_array($role, ['admin', 'admin-humas'], true) => $jenis === 'rekap' ? '/admin/rekap_data' : '/admin/data_pengajuan',
            $role === 'pimpinan' => '/pimpinan/daftar_kerjasama',
            default => $jenis === 'rekap' ? '/internal/rekap_data' : '/internal/data_pengajuan',
        };
    }
}
