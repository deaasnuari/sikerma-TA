<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('laporan_pelaksanaan', function (Blueprint $table) {
            $table->id();

            // Relasi ke pengajuan (dipakai untuk menampilkan laporan di Story Aktivitas,
            // yang dikelompokkan per mitra lewat pengajuan) dan/atau dokumen kerjasama.
            // Nullable & independen karena tidak semua sumber (internal/eksternal/admin)
            // punya kedua id ini sekaligus saat mengirim laporan.
            $table->foreignId('pengajuan_id')->nullable()->constrained('pengajuan_v2')->nullOnDelete();
            $table->foreignId('dokumen_kerjasama_id')->nullable()->constrained('dokumen_kerjasama')->nullOnDelete();

            // Snapshot agar tetap tampil benar meski data sumbernya berubah/terhapus.
            $table->string('nomor_dokumen')->nullable();
            $table->string('nama_mitra')->nullable();
            $table->string('jenis_dokumen', 10)->nullable();

            $table->string('judul_kerjasama')->nullable();
            $table->string('referensi_kerjasama')->nullable();
            $table->string('unit_pengaju')->nullable();
            $table->text('kegiatan')->nullable();
            $table->text('capaian')->nullable();
            $table->text('hasil')->nullable();
            $table->string('tautan_dokumentasi')->nullable();

            $table->string('nama_penanggung_jawab')->nullable();
            $table->string('nip_penanggung_jawab')->nullable();
            $table->string('jabatan_mengetahui')->nullable();
            $table->string('nama_mengetahui')->nullable();
            $table->string('nip_mengetahui')->nullable();

            $table->string('file_path')->nullable();
            $table->string('file_nama')->nullable();
            $table->string('file_mime_type')->nullable();
            $table->unsignedBigInteger('file_ukuran_bytes')->nullable();

            $table->string('status', 20)->default('terkirim');

            $table->foreignId('dikirim_oleh_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('dikirim_oleh_role', 20)->nullable();

            $table->timestamps();

            $table->index(['pengajuan_id']);
            $table->index(['dokumen_kerjasama_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('laporan_pelaksanaan');
    }
};
