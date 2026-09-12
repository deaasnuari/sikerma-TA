<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// telepon_mitra sebenarnya selalu diisi & dipakai sebagai nomor WhatsApp aktif mitra (dipakai
// buat link chat WhatsApp), bukan telepon biasa — sekarang ada kolom terpisah no_telepon_mitra
// untuk telepon kantor/kabel. Supaya nama kolomnya tidak lagi membingungkan (dua-duanya
// kelihatan seperti "nomor telepon"), telepon_mitra di-rename jadi whatsapp_mitra.
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('master_mitra') && Schema::hasColumn('master_mitra', 'telepon_mitra') && !Schema::hasColumn('master_mitra', 'whatsapp_mitra')) {
            Schema::table('master_mitra', function (Blueprint $table) {
                $table->renameColumn('telepon_mitra', 'whatsapp_mitra');
            });
        }

        if (Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'telepon_mitra') && !Schema::hasColumn('pengajuan_v2', 'whatsapp_mitra')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->renameColumn('telepon_mitra', 'whatsapp_mitra');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('master_mitra') && Schema::hasColumn('master_mitra', 'whatsapp_mitra') && !Schema::hasColumn('master_mitra', 'telepon_mitra')) {
            Schema::table('master_mitra', function (Blueprint $table) {
                $table->renameColumn('whatsapp_mitra', 'telepon_mitra');
            });
        }

        if (Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'whatsapp_mitra') && !Schema::hasColumn('pengajuan_v2', 'telepon_mitra')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->renameColumn('whatsapp_mitra', 'telepon_mitra');
            });
        }
    }
};
