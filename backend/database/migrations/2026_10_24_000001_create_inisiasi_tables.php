<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Inisiasi: dokumentasi kegiatan awal/penjajakan kerja sama dengan mitra, sebelum menjadi kerja sama
 * resmi atau berita kerja sama. Berdiri sendiri; berita_kerjasama_id disiapkan (tanpa FK, tabel berita
 * belum ada) supaya nanti bisa dihubungkan tanpa mewajibkan relasi sejak awal.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inisiasi', function (Blueprint $table) {
            $table->id();
            $table->date('tanggal_kegiatan');
            $table->string('judul', 255);
            $table->string('nama_mitra', 255);
            $table->text('deskripsi');
            $table->unsignedBigInteger('berita_kerjasama_id')->nullable();
            $table->foreignId('dibuat_oleh_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('tanggal_kegiatan');
        });

        // Unit terlibat: dipilih dari master unit/prodi (unit_prodi_id) atau diketik bebas (unit_prodi_id null).
        Schema::create('inisiasi_unit', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inisiasi_id')->constrained('inisiasi')->cascadeOnDelete();
            $table->foreignId('unit_prodi_id')->nullable()->constrained('master_unit_prodi')->nullOnDelete();
            $table->string('nama', 200);
            $table->timestamps();

            $table->index('inisiasi_id');
        });

        Schema::create('inisiasi_peserta', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inisiasi_id')->constrained('inisiasi')->cascadeOnDelete();
            $table->string('nama', 200);
            $table->timestamps();

            $table->index('inisiasi_id');
        });

        Schema::create('inisiasi_foto', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inisiasi_id')->constrained('inisiasi')->cascadeOnDelete();
            $table->string('path_file', 500);
            $table->string('nama_asli', 255)->nullable();
            $table->unsignedInteger('urutan')->default(0);
            $table->timestamps();

            $table->index('inisiasi_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inisiasi_foto');
        Schema::dropIfExists('inisiasi_peserta');
        Schema::dropIfExists('inisiasi_unit');
        Schema::dropIfExists('inisiasi');
    }
};
