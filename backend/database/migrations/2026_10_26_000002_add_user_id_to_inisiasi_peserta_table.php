<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Peserta Inisiasi yang dipilih dari kandidat (Ketua Jurusan/Prodi/Kepala Unit) tertaut ke akunnya
 * (user_id) = di-CC: pengguna itu ikut melihat inisiasi di menu Inisiasi internal. Peserta tanpa
 * user_id hanyalah nama biasa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inisiasi_peserta', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->after('nama')->constrained('users')->nullOnDelete();
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('inisiasi_peserta', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
