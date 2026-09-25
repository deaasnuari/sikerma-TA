<?php

use App\Services\MasterMitraResolver;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Kontak tambahan per mitra: setiap akun eksternal yang mendaftar atas nama
 * instansi yang sudah ada di Data Kemitraan dicatat di sini, bukan membuat
 * baris master_mitra baru. Kontak utama tetap di kolom *_kontak_utama.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kontak_mitra', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mitra_id')->constrained('master_mitra')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('nama', 200);
            $table->string('jabatan', 120)->nullable();
            $table->string('email', 255)->nullable();
            $table->string('telepon', 50)->nullable();
            $table->timestamps();

            $table->index(['mitra_id', 'email']);
        });

        $this->backfillFromExistingUsers();
    }

    public function down(): void
    {
        Schema::dropIfExists('kontak_mitra');
    }

    /**
     * Akun eksternal yang sudah terdaftar sebelum tabel ini ada: kalau instansinya
     * cocok dengan mitra tapi bukan kontak utamanya, masukkan sebagai kontak.
     */
    private function backfillFromExistingUsers(): void
    {
        $mitraByKey = [];
        foreach (DB::table('master_mitra')->orderBy('id')->get(['id', 'nama_mitra', 'email_kontak_utama']) as $mitra) {
            $key = MasterMitraResolver::normalize($mitra->nama_mitra);
            if ($key !== '' && ! isset($mitraByKey[$key])) {
                $mitraByKey[$key] = $mitra;
            }
        }

        $now = now();
        $users = DB::table('users')
            ->where('role', 'external')
            ->whereNotNull('institution_name')
            ->orderBy('id')
            ->get(['id', 'name', 'email', 'phone', 'position', 'institution_name']);

        foreach ($users as $user) {
            $mitra = $mitraByKey[MasterMitraResolver::normalize($user->institution_name)] ?? null;
            $email = strtolower(trim((string) $user->email));
            if (! $mitra || $email === strtolower(trim((string) $mitra->email_kontak_utama))) {
                continue;
            }

            DB::table('kontak_mitra')->insert([
                'mitra_id' => $mitra->id,
                'user_id' => $user->id,
                'nama' => $user->name,
                'jabatan' => $user->position,
                'email' => $email,
                'telepon' => $user->phone,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
};
