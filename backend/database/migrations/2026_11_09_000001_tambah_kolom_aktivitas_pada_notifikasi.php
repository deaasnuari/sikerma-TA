<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Melengkapi tabel notifikasi (satu baris per penerima, status baca independen per akun) dengan
    // informasi aktivitas: jenisnya, pelakunya, pengajuan terkait (untuk navigasi ke detail), dan kunci
    // anti-ganda supaya satu aktivitas tidak menghasilkan notifikasi kembar bagi penerima yang sama.
    public function up(): void
    {
        Schema::table('notifikasi', function (Blueprint $table) {
            $table->string('jenis_aktivitas', 60)->nullable()->after('kategori');
            $table->foreignId('actor_id')->nullable()->after('jenis_aktivitas')->constrained('users')->nullOnDelete();
            $table->foreignId('pengajuan_id')->nullable()->after('actor_id')->constrained('pengajuan_v2')->nullOnDelete();
            $table->string('kunci', 150)->nullable()->after('pengajuan_id');

            // NULL boleh berulang; kunci terisi hanya boleh satu kali per penerima.
            $table->unique(['user_id', 'kunci']);
            $table->index('pengajuan_id');
        });
    }

    public function down(): void
    {
        Schema::table('notifikasi', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'kunci']);
            $table->dropIndex(['pengajuan_id']);
            $table->dropConstrainedForeignId('pengajuan_id');
            $table->dropConstrainedForeignId('actor_id');
            $table->dropColumn(['jenis_aktivitas', 'kunci']);
        });
    }
};
