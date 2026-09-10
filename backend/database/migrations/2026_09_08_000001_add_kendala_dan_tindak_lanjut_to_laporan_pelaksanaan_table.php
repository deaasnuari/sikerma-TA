<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Melengkapi laporan_pelaksanaan supaya bisa dipakai sebagai catatan Monev manual
     * (Catatan Monitoring = kolom `kegiatan`, Hasil Evaluasi = kolom `hasil` yang sudah
     * ada) dari Rekap Data -> Detail Kerjasama -> Monev Triwulan, tanpa bikin tabel baru.
     */
    public function up(): void
    {
        Schema::table('laporan_pelaksanaan', function (Blueprint $table) {
            if (!Schema::hasColumn('laporan_pelaksanaan', 'kendala')) {
                $table->text('kendala')->nullable()->after('hasil');
            }

            if (!Schema::hasColumn('laporan_pelaksanaan', 'tindak_lanjut')) {
                $table->text('tindak_lanjut')->nullable()->after('kendala');
            }
        });
    }

    public function down(): void
    {
        Schema::table('laporan_pelaksanaan', function (Blueprint $table) {
            if (Schema::hasColumn('laporan_pelaksanaan', 'tindak_lanjut')) {
                $table->dropColumn('tindak_lanjut');
            }
            if (Schema::hasColumn('laporan_pelaksanaan', 'kendala')) {
                $table->dropColumn('kendala');
            }
        });
    }
};
