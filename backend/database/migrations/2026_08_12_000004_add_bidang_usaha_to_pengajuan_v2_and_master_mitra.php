<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Bidang Usaha" (sektor industri mitra: Manufaktur, Start Up, Pendidikan, dst.) adalah
     * konsep yang beda dari "Jenis Mitra" (kategori_mitra/jenis_mitra: Pemerintahan, Perguruan
     * Tinggi, Swasta/DUDI, dst.) yang sudah ada — makanya butuh kolom terpisah, bukan reuse.
     */
    public function up(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            if (!Schema::hasColumn('pengajuan_v2', 'bidang_usaha')) {
                $table->string('bidang_usaha', 150)->nullable()->after('jenis_mitra');
            }
        });

        Schema::table('master_mitra', function (Blueprint $table) {
            if (!Schema::hasColumn('master_mitra', 'bidang_usaha')) {
                $table->string('bidang_usaha', 150)->nullable()->after('kategori_mitra');
            }
        });
    }

    public function down(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            if (Schema::hasColumn('pengajuan_v2', 'bidang_usaha')) {
                $table->dropColumn('bidang_usaha');
            }
        });

        Schema::table('master_mitra', function (Blueprint $table) {
            if (Schema::hasColumn('master_mitra', 'bidang_usaha')) {
                $table->dropColumn('bidang_usaha');
            }
        });
    }
};
