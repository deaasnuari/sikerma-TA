<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Aktivitas Story kini bisa menempel LANGSUNG ke dokumen_kerjasama, bukan cuma ke
     * pengajuan_v2 — supaya halaman "Story & Aktivitas" (admin) yang sumbernya Rekap Data
     * bisa mencatat aktivitas untuk SEMUA kerja sama, termasuk 86% dokumen lama yang
     * tidak punya sumber_pengajuan_id. `pengajuan_id` dibuat nullable; minimal salah satu
     * dari (pengajuan_id, dokumen_kerjasama_id) wajib terisi — divalidasi di controller.
     */
    public function up(): void
    {
        Schema::table('pengajuan_aktivitas', function (Blueprint $table) {
            $table->foreignId('dokumen_kerjasama_id')
                ->nullable()
                ->after('pengajuan_id')
                ->constrained('dokumen_kerjasama')
                ->cascadeOnDelete();
            $table->index(['dokumen_kerjasama_id', 'tanggal']);
        });

        Schema::table('pengajuan_aktivitas', function (Blueprint $table) {
            $table->unsignedBigInteger('pengajuan_id')->nullable()->change();
        });

        // Backfill: sambungkan aktivitas lama ke dokumen kerja sama yang berasal dari
        // pengajuan yang sama, biar tetap muncul di grouping berbasis dokumen.
        $driver = DB::connection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement(<<<'SQL'
                UPDATE pengajuan_aktivitas pa
                SET dokumen_kerjasama_id = dk.id
                FROM dokumen_kerjasama dk
                WHERE dk.sumber_pengajuan_id = pa.pengajuan_id
                  AND pa.dokumen_kerjasama_id IS NULL
            SQL);
        } else {
            DB::statement(<<<'SQL'
                UPDATE pengajuan_aktivitas
                SET dokumen_kerjasama_id = (
                    SELECT dk.id FROM dokumen_kerjasama dk
                    WHERE dk.sumber_pengajuan_id = pengajuan_aktivitas.pengajuan_id
                    LIMIT 1
                )
                WHERE dokumen_kerjasama_id IS NULL
                  AND pengajuan_id IS NOT NULL
            SQL);
        }
    }

    public function down(): void
    {
        Schema::table('pengajuan_aktivitas', function (Blueprint $table) {
            $table->dropConstrainedForeignId('dokumen_kerjasama_id');
        });

        Schema::table('pengajuan_aktivitas', function (Blueprint $table) {
            $table->unsignedBigInteger('pengajuan_id')->nullable(false)->change();
        });
    }
};
