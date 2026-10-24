<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dokumen pendukung Inisiasi (PDF, bisa lebih dari satu per kegiatan), terpisah dari inisiasi_foto
 * karena aturan formatnya berbeda dan tampilannya berupa daftar berkas, bukan galeri.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inisiasi_dokumen', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inisiasi_id')->constrained('inisiasi')->cascadeOnDelete();
            $table->string('path_file', 500);
            $table->string('nama_asli', 255)->nullable();
            $table->unsignedBigInteger('ukuran')->nullable();
            $table->unsignedInteger('urutan')->default(0);
            $table->timestamps();

            $table->index('inisiasi_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inisiasi_dokumen');
    }
};
