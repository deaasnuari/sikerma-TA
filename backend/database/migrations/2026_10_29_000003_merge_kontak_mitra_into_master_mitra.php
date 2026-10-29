<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tabel kontak_mitra (kontak tambahan mitra) digabung ke master_mitra sebagai kolom JSON kontak_tambahan:
 * [{id, user_id, nama, jabatan, email, telepon}, ...]. Baris kontak_mitra yang hanya salinan kontak utama
 * mitra (nama sama dan tidak membawa email lain) tidak dipindahkan, karena kontak utamanya sudah ada.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('master_mitra', 'kontak_tambahan')) {
            Schema::table('master_mitra', fn (Blueprint $t) => $t->json('kontak_tambahan')->nullable());
        }

        if (Schema::hasTable('kontak_mitra')) {
            $this->pindahkanKontak();
            Schema::drop('kontak_mitra');
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('kontak_mitra')) {
            Schema::create('kontak_mitra', function (Blueprint $table) {
                $table->id();
                $table->foreignId('mitra_id')->constrained('master_mitra')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('nama', 200);
                $table->string('jabatan', 120)->nullable();
                $table->string('email', 255)->nullable();
                $table->string('telepon', 50)->nullable();
                $table->timestamps();
            });
        }

        $now = now();
        DB::table('master_mitra')->whereNotNull('kontak_tambahan')->orderBy('id')->select(['id', 'kontak_tambahan'])
            ->chunkById(200, function ($rows) use ($now) {
                foreach ($rows as $row) {
                    foreach (json_decode((string) $row->kontak_tambahan, true) ?: [] as $kontak) {
                        $userId = $kontak['user_id'] ?? null;
                        DB::table('kontak_mitra')->insert([
                            'mitra_id' => $row->id,
                            'user_id' => $userId && DB::table('users')->where('id', $userId)->exists() ? $userId : null,
                            'nama' => $kontak['nama'] ?? '-',
                            'jabatan' => $kontak['jabatan'] ?? null,
                            'email' => $kontak['email'] ?? null,
                            'telepon' => $kontak['telepon'] ?? null,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                    }
                }
            });

        if (Schema::hasColumn('master_mitra', 'kontak_tambahan')) {
            Schema::table('master_mitra', fn (Blueprint $t) => $t->dropColumn('kontak_tambahan'));
        }
    }

    private function pindahkanKontak(): void
    {
        $utama = DB::table('master_mitra')->get(['id', 'nama_kontak_utama', 'email_kontak_utama'])->keyBy('id');

        $perMitra = [];
        foreach (DB::table('kontak_mitra')->orderBy('id')->get() as $baris) {
            $mitra = $utama->get($baris->mitra_id);
            if (! $mitra) {
                continue;
            }

            $email = strtolower(trim((string) $baris->email));
            $email = in_array($email, ['', '-'], true) ? '' : $email;
            $namaSamaDenganUtama = mb_strtolower(trim((string) $baris->nama)) === mb_strtolower(trim((string) $mitra->nama_kontak_utama));
            $emailSamaDenganUtama = $email !== '' && $email === strtolower(trim((string) $mitra->email_kontak_utama));

            // Salinan kontak utama (tidak membawa informasi baru): tidak dipindahkan.
            if ($emailSamaDenganUtama || ($namaSamaDenganUtama && $email === '')) {
                continue;
            }

            $perMitra[$baris->mitra_id][] = [
                'id' => count($perMitra[$baris->mitra_id] ?? []) + 1,
                'user_id' => $baris->user_id,
                'nama' => $baris->nama,
                'jabatan' => $baris->jabatan,
                'email' => $email !== '' ? $email : null,
                'telepon' => $baris->telepon,
            ];
        }

        foreach ($perMitra as $mitraId => $daftar) {
            DB::table('master_mitra')->where('id', $mitraId)->update(['kontak_tambahan' => json_encode($daftar)]);
        }
    }
};
