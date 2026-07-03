<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            $table->string('snap_jenis_mitra', 150)->nullable()->after('snap_email_pengusul');
            $table->string('snap_tingkat_perusahaan', 50)->nullable()->after('snap_jenis_mitra');
        });
    }

    public function down(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            $table->dropColumn(['snap_jenis_mitra', 'snap_tingkat_perusahaan']);
        });
    }
};
