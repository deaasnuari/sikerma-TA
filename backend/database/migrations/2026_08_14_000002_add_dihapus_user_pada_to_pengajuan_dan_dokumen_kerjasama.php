<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Internal/eksternal/kampus-LDAP sekarang juga punya tombol Hapus sendiri di Rekap Data / Daftar
// Kerjasama mereka — tapi cuma untuk data milik mereka sendiri, dan sifatnya cuma menyembunyikan
// dari tampilan mereka sendiri (mirror dari dihapus_admin_pada): admin tetap bisa lihat semuanya
// untuk keperluan audit/rekap institusi, apapun yang disembunyikan pemiliknya dari akunnya sendiri.
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('pengajuan_v2') && !Schema::hasColumn('pengajuan_v2', 'dihapus_user_pada')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->timestamp('dihapus_user_pada')->nullable()->after('dihapus_admin_pada');
            });
        }

        if (Schema::hasTable('dokumen_kerjasama') && !Schema::hasColumn('dokumen_kerjasama', 'dihapus_user_pada')) {
            Schema::table('dokumen_kerjasama', function (Blueprint $table) {
                $table->timestamp('dihapus_user_pada')->nullable()->after('dihapus_admin_pada');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'dihapus_user_pada')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->dropColumn('dihapus_user_pada');
            });
        }

        if (Schema::hasTable('dokumen_kerjasama') && Schema::hasColumn('dokumen_kerjasama', 'dihapus_user_pada')) {
            Schema::table('dokumen_kerjasama', function (Blueprint $table) {
                $table->dropColumn('dihapus_user_pada');
            });
        }
    }
};
