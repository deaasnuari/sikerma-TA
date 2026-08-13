<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Supaya laporan pelaksanaan bisa dikelompokkan ke "Hasil Monitoring
     * Triwulan 1-4 (Jan-Mar/Apr-Jun/Jul-Sep/Okt-Des)" seperti di rekap Excel
     * dosen — sebelumnya laporan cuma tercatat lewat created_at tanpa
     * periode triwulan/tahun yang eksplisit.
     */
    public function up(): void
    {
        Schema::table('laporan_pelaksanaan', function (Blueprint $table) {
            if (!Schema::hasColumn('laporan_pelaksanaan', 'tahun')) {
                $table->unsignedSmallInteger('tahun')->nullable()->after('hasil');
            }

            if (!Schema::hasColumn('laporan_pelaksanaan', 'triwulan')) {
                $table->unsignedTinyInteger('triwulan')->nullable()->after('tahun');
            }

            $table->index(['tahun', 'triwulan']);
        });
    }

    public function down(): void
    {
        Schema::table('laporan_pelaksanaan', function (Blueprint $table) {
            $table->dropIndex(['tahun', 'triwulan']);

            if (Schema::hasColumn('laporan_pelaksanaan', 'triwulan')) {
                $table->dropColumn('triwulan');
            }
            if (Schema::hasColumn('laporan_pelaksanaan', 'tahun')) {
                $table->dropColumn('tahun');
            }
        });
    }
};
