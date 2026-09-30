<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Kapan pengusul terakhir mengirim ulang pengajuan setelah diminta Revisi — dipakai admin
    // untuk menandai pengajuan "Sudah Direvisi" di Data Pengajuan.
    public function up(): void
    {
        if (! Schema::hasTable('pengajuan_v2') || Schema::hasColumn('pengajuan_v2', 'direvisi_pengusul_pada')) {
            return;
        }

        Schema::table('pengajuan_v2', function (Blueprint $table) {
            $table->timestamp('direvisi_pengusul_pada')->nullable();
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'direvisi_pengusul_pada')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->dropColumn('direvisi_pengusul_pada');
            });
        }
    }
};
