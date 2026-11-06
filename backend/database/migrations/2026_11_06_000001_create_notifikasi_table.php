<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Notifikasi lonceng yang disimpan di server per pengguna, supaya sampai ke perangkat mana pun
    // (sebelumnya hanya tersimpan di localStorage browser yang dipakai admin).
    public function up(): void
    {
        Schema::create('notifikasi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('judul');
            $table->text('pesan');
            $table->string('dari', 100)->default('Sistem');
            $table->string('href')->nullable();
            $table->string('kategori', 20)->default('info'); // approval | comment | reminder | info
            $table->timestamp('dibaca_pada')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'dibaca_pada']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifikasi');
    }
};
