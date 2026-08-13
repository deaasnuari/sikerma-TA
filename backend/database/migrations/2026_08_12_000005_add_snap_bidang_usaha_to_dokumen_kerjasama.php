<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            if (!Schema::hasColumn('dokumen_kerjasama', 'snap_bidang_usaha')) {
                $table->string('snap_bidang_usaha', 150)->nullable()->after('snap_jenis_mitra');
            }
        });
    }

    public function down(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            if (Schema::hasColumn('dokumen_kerjasama', 'snap_bidang_usaha')) {
                $table->dropColumn('snap_bidang_usaha');
            }
        });
    }
};
