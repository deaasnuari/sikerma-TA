<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Satu pengajuan/dokumen kerja sama boleh melibatkan lebih dari satu jurusan/prodi.
 *
 * Kolom unit_prodi_id lama TIDAK dihapus: ia tetap menyimpan unit/prodi "utama" (yang
 * pertama dipilih) supaya nomor dokumen, akses struktural, dan konsumen lama tetap jalan.
 * Daftar lengkapnya ada di dua tabel pivot ini. Data lama di-backfill dari unit_prodi_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pengajuan_unit_prodi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pengajuan_id')->constrained('pengajuan_v2')->cascadeOnDelete();
            $table->foreignId('unit_prodi_id')->constrained('master_unit_prodi')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['pengajuan_id', 'unit_prodi_id']);
            $table->index('unit_prodi_id');
        });

        Schema::create('dokumen_kerjasama_unit_prodi', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dokumen_kerjasama_id')->constrained('dokumen_kerjasama')->cascadeOnDelete();
            $table->foreignId('unit_prodi_id')->constrained('master_unit_prodi')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['dokumen_kerjasama_id', 'unit_prodi_id']);
            $table->index('unit_prodi_id');
        });

        $this->backfill('pengajuan_v2', 'pengajuan_unit_prodi', 'pengajuan_id');
        $this->backfill('dokumen_kerjasama', 'dokumen_kerjasama_unit_prodi', 'dokumen_kerjasama_id');
    }

    public function down(): void
    {
        Schema::dropIfExists('dokumen_kerjasama_unit_prodi');
        Schema::dropIfExists('pengajuan_unit_prodi');
    }

    private function backfill(string $sumber, string $pivot, string $fk): void
    {
        $now = now();

        DB::table($sumber)
            ->whereNotNull('unit_prodi_id')
            ->orderBy('id')
            ->select(['id', 'unit_prodi_id'])
            ->chunkById(500, function ($rows) use ($pivot, $fk, $now) {
                DB::table($pivot)->insert($rows->map(fn ($row) => [
                    $fk => $row->id,
                    'unit_prodi_id' => $row->unit_prodi_id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all());
            });
    }
};
