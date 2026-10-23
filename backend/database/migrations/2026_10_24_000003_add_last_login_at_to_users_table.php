<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Kapan akun terakhir berhasil login. Dipakai Manajemen User untuk membedakan akun yang benar-benar
 * pernah login dari akun "titipan" yang dibuat otomatis saat memilih Kajur/Kaprodi/Kepala Unit sebagai
 * Distribusi CC (belum pernah login, emailnya placeholder @no-email.sikerma.local).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'last_login_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->timestamp('last_login_at')->nullable();
            });
        }

        // Akun titipan yang ternyata sudah pernah login sebelum kolom ini ada: tandai dari token loginnya.
        // (Akun biasa tidak perlu diisi; hanya akun titipan yang disaring berdasarkan kolom ini.)
        if (Schema::hasTable('personal_access_tokens')) {
            $pernahLogin = DB::table('personal_access_tokens')
                ->where('tokenable_type', 'App\\Models\\User')
                ->groupBy('tokenable_id')
                ->selectRaw('tokenable_id, MIN(created_at) as pertama')
                ->get();

            foreach ($pernahLogin as $baris) {
                DB::table('users')
                    ->where('id', $baris->tokenable_id)
                    ->whereNull('last_login_at')
                    ->update(['last_login_at' => $baris->pertama]);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'last_login_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('last_login_at');
            });
        }
    }
};
