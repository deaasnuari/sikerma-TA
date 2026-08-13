<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    //tabel manfaat dan luaran_kerja_sama ditambahkan ke tabel dokumen_kerjasama
    public function up(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            if (!Schema::hasColumn('dokumen_kerjasama', 'manfaat')) {
                $table->text('manfaat')->nullable()->after('judul_dokumen');
            }

            if (!Schema::hasColumn('dokumen_kerjasama', 'luaran_kerja_sama')) {
                $table->text('luaran_kerja_sama')->nullable()->after('manfaat');
            }
        });
    }

    public function down(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            if (Schema::hasColumn('dokumen_kerjasama', 'luaran_kerja_sama')) {
                $table->dropColumn('luaran_kerja_sama');
            }
            if (Schema::hasColumn('dokumen_kerjasama', 'manfaat')) {
                $table->dropColumn('manfaat');
            }
        });
    }
};
