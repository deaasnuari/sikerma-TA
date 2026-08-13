<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    //tabel manfaat dan luaran_kerja_sama ditambahkan ke tabel pengajuan_v2
    public function up(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            if (!Schema::hasColumn('pengajuan_v2', 'manfaat')) {
                $table->text('manfaat')->nullable()->after('deskripsi_pengajuan');
            }

            if (!Schema::hasColumn('pengajuan_v2', 'luaran_kerja_sama')) {
                $table->text('luaran_kerja_sama')->nullable()->after('manfaat');
            }
        });
    }

    public function down(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            if (Schema::hasColumn('pengajuan_v2', 'luaran_kerja_sama')) {
                $table->dropColumn('luaran_kerja_sama');
            }
            if (Schema::hasColumn('pengajuan_v2', 'manfaat')) {
                $table->dropColumn('manfaat');
            }
        });
    }
};
