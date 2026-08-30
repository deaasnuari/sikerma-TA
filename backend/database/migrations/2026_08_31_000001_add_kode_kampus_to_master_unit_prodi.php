<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Kolom baru buat simpan ID_JURUSAN / ID_PROGRAM_STUDI / ID_UNIT dari API struktur
     * kampus (Civitas) — SENGAJA dipisah dari kolom `kode` yang sudah ada, karena `kode`
     * sekarang sudah dipakai untuk kode singkat internal SIKERMA sendiri (mis. "IF01",
     * "MB01") yang maknanya beda dan sudah dipakai fitur lain. Additive & nullable —
     * tidak mengubah/menghapus data existing.
     */
    public function up(): void
    {
        Schema::table('master_unit_prodi', function (Blueprint $table) {
            if (!Schema::hasColumn('master_unit_prodi', 'kode_kampus')) {
                $table->string('kode_kampus', 30)->nullable()->after('kode');
                $table->index('kode_kampus');
            }
        });
    }

    public function down(): void
    {
        Schema::table('master_unit_prodi', function (Blueprint $table) {
            if (Schema::hasColumn('master_unit_prodi', 'kode_kampus')) {
                $table->dropIndex(['kode_kampus']);
                $table->dropColumn('kode_kampus');
            }
        });
    }
};
