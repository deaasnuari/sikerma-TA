<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// No. Telepon mitra — field baru di "Informasi Mitra", terpisah dari telepon_mitra yang
// selama ini dipakai/dilabeli sebagai "WhatsApp Aktif / No. Telepon". Ditambahkan ke
// master_mitra (sumber utama) dan pengajuan_v2 (supaya tetap tercatat di riwayat pengajuan
// sebelum disetujui, sama seperti telepon_mitra).
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('master_mitra') && !Schema::hasColumn('master_mitra', 'no_telepon_mitra')) {
            Schema::table('master_mitra', function (Blueprint $table) {
                $table->string('no_telepon_mitra', 50)->nullable()->after('telepon_mitra');
            });
        }

        if (Schema::hasTable('pengajuan_v2') && !Schema::hasColumn('pengajuan_v2', 'no_telepon_mitra')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->string('no_telepon_mitra', 50)->nullable()->after('telepon_mitra');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('master_mitra') && Schema::hasColumn('master_mitra', 'no_telepon_mitra')) {
            Schema::table('master_mitra', function (Blueprint $table) {
                $table->dropColumn('no_telepon_mitra');
            });
        }

        if (Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'no_telepon_mitra')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->dropColumn('no_telepon_mitra');
            });
        }
    }
};
