<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dokumen_log', function (Blueprint $table) {
            if (!Schema::hasColumn('dokumen_log', 'bukti_perpanjangan_nama')) {
                // Nama asli file yang diupload user, dipakai agar unduhan dokumen perpanjangan
                // tidak memakai nama acak hasil penyimpanan (lihat persistDataUrlFile()).
                $table->string('bukti_perpanjangan_nama', 255)->nullable()->after('bukti_perpanjangan');
            }
        });
    }

    public function down(): void
    {
        Schema::table('dokumen_log', function (Blueprint $table) {
            if (Schema::hasColumn('dokumen_log', 'bukti_perpanjangan_nama')) {
                $table->dropColumn('bukti_perpanjangan_nama');
            }
        });
    }
};
