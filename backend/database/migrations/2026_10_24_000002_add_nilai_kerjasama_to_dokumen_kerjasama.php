<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nilai kerja sama (hasil/dana dari kerja sama yang berjalan) diisi admin di detail Rekap Data.
 * Sengaja berupa teks bebas, bukan angka, agar bisa ditulis dengan mata uang apa pun (Rp, USD, dst.).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('dokumen_kerjasama', 'nilai_kerjasama')) {
            Schema::table('dokumen_kerjasama', function (Blueprint $table) {
                $table->string('nilai_kerjasama', 255)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('dokumen_kerjasama', 'nilai_kerjasama')) {
            Schema::table('dokumen_kerjasama', function (Blueprint $table) {
                $table->dropColumn('nilai_kerjasama');
            });
        }
    }
};
