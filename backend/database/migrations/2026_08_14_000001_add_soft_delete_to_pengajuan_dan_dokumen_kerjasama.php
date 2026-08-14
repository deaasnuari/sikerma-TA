<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Sebelumnya "Hapus" oleh admin di Data Pengajuan / Rekap Data langsung menghapus baris dari
// database (hard delete) — akibatnya data ikut hilang juga dari riwayat akun internal/eksternal/
// kampus-LDAP yang mengajukannya sendiri, dan akun user itu jadi kehilangan jejak pengajuan yang
// pernah mereka buat. Sekarang "Hapus" oleh admin cuma menyembunyikan dari daftar kelola admin
// (dan dari pengguna lain) lewat kolom timestamp ini — pemilik aslinya (user_pengusul_id /
// dibuat_oleh_user_id) tetap bisa melihat pengajuan/dokumennya sendiri seperti biasa.
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('pengajuan_v2') && !Schema::hasColumn('pengajuan_v2', 'dihapus_admin_pada')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->timestamp('dihapus_admin_pada')->nullable()->after('updated_at');
            });
        }

        if (Schema::hasTable('dokumen_kerjasama') && !Schema::hasColumn('dokumen_kerjasama', 'dihapus_admin_pada')) {
            Schema::table('dokumen_kerjasama', function (Blueprint $table) {
                $table->timestamp('dihapus_admin_pada')->nullable()->after('updated_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'dihapus_admin_pada')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->dropColumn('dihapus_admin_pada');
            });
        }

        if (Schema::hasTable('dokumen_kerjasama') && Schema::hasColumn('dokumen_kerjasama', 'dihapus_admin_pada')) {
            Schema::table('dokumen_kerjasama', function (Blueprint $table) {
                $table->dropColumn('dihapus_admin_pada');
            });
        }
    }
};
