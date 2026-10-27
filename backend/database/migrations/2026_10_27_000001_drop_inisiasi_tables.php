<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fitur Inisiasi dihapus: lepas kolom inisiasi_id dari pengajuan_v2 lalu buang tabel-tabelnya.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('pengajuan_v2', 'inisiasi_id')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->dropConstrainedForeignId('inisiasi_id');
            });
        }

        Schema::dropIfExists('inisiasi_dokumen');
        Schema::dropIfExists('inisiasi_foto');
        Schema::dropIfExists('inisiasi_peserta');
        Schema::dropIfExists('inisiasi_unit');
        Schema::dropIfExists('inisiasi');
    }

    public function down(): void
    {
        // Tidak dapat dikembalikan: data Inisiasi sudah dibuang.
    }
};
