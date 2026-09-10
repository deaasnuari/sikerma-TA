<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Jejak pengiriman notifikasi pengingat masa berlaku kerja sama (dikirim otomatis
    // oleh command sikerma:kirim-reminder-kerjasama yang dijadwalkan harian). Satu baris
    // per (dokumen, jenis reminder, tanggal_berakhir yang berlaku saat itu) — kunci unik
    // ini yang mencegah kirim dobel, sekaligus membuat siklus reminder berulang otomatis
    // kalau dokumen diperpanjang (tanggal_berakhir berubah => kombinasi baru => boleh kirim lagi).
    public function up(): void
    {
        Schema::create('notifikasi_kerjasama', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dokumen_kerjasama_id')
                ->constrained('dokumen_kerjasama')
                ->cascadeOnDelete();
            $table->string('jenis'); // reminder-3bulan | reminder-1bulan | urgent
            // tanggal_berakhir dokumen saat notifikasi dibuat. Nullable: notifikasi yang
            // dikirim manual dari halaman Monitoring bisa untuk dokumen yang belum bertanggal.
            $table->date('tanggal_berakhir_acuan')->nullable();
            $table->string('email_tujuan')->nullable();
            $table->string('status')->default('terkirim'); // terkirim | gagal | dilewati
            $table->text('keterangan')->nullable(); // alasan gagal / dilewati
            $table->timestamp('dikirim_pada')->nullable();
            $table->timestamps();

            $table->unique(['dokumen_kerjasama_id', 'jenis', 'tanggal_berakhir_acuan'], 'notif_kerjasama_unik');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifikasi_kerjasama');
    }
};
