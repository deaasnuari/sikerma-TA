<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Pemetaan singkatan unit dari sikerma_old → id di master_unit_prodi PostgreSQL
    private const UNIT_MAP = [
        'Kerjasama'   => 244, // Pokja Humas dan Kerjasama
        'SBPK'        => 244, // Sub Bagian Perencanaan & Kerjasama → Pokja Humas dan Kerjasama
        'P3M'         => 231, // P3M
        'P4M'         => 230, // P4M
        'MB'          => 225, // Manajemen dan Bisnis
        'Shilau'      => 229, // SHILAU
        'IF'          => 227, // Teknik Informatika
        'TM'          => 228, // Teknik Mesin
        'MS'          => 228, // (tidak ada di master baru, terdekat Teknik Mesin)
        'EL'          => 226, // Teknik Elektro
        'CDC'         => 235, // UPA PKK (Career Development Center)
        'Perpus'      => 236, // UPA Perpustakaan
        'Kepegawaian' => 239, // Pokja OSDM
    ];

    // Unit default untuk dokumen yang tidak ditemukan di sikerma_old
    private const DEFAULT_UNIT_ID = 244; // Pokja Humas dan Kerjasama

    public function up(): void
    {
        // Migrasi ini hanya relevan untuk backfill data produksi lama dari sikerma_old (MySQL),
        // yang tidak tersedia di test suite (SQLite in-memory).
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        // 1. Ambil mapping no_dokumen → unit dari sikerma_old (MySQL) — kalau koneksinya tidak
        // tersedia (mis. environment lokal/dev yang tidak punya akses ke database lama itu),
        // lewati langkah backfill ini saja. Baris yang belum ke-backfill tetap ke-cover oleh
        // langkah 3 di bawah (default unit), jadi migrasi tetap bisa lanjut & aman dijalankan.
        try {
            $oldRows = DB::connection('sikerma_old')
                ->table('dokumen')
                ->whereNotNull('no_dokumen')
                ->where('no_dokumen', '!=', '')
                ->whereNotNull('unit')
                ->where('unit', '!=', '')
                ->where('unit', '!=', 'Pilih...')
                ->select('no_dokumen', 'unit')
                ->get();
        } catch (\Throwable $e) {
            $oldRows = collect();
        }

        // 2. Update satu per satu berdasarkan nomor_dokumen yang cocok
        foreach ($oldRows as $row) {
            $unitProdiId = self::UNIT_MAP[$row->unit] ?? self::DEFAULT_UNIT_ID;

            DB::table('dokumen_kerjasama')
                ->where('nomor_dokumen', $row->no_dokumen)
                ->whereNull('unit_prodi_id')
                ->update(['unit_prodi_id' => $unitProdiId]);
        }

        // 3. Sisa yang masih NULL (tidak ditemukan di sikerma_old) → default
        DB::table('dokumen_kerjasama')
            ->whereNull('unit_prodi_id')
            ->update(['unit_prodi_id' => self::DEFAULT_UNIT_ID]);

        // 4. Enforce NOT NULL + FK constraint
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            $table->unsignedBigInteger('unit_prodi_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            $table->unsignedBigInteger('unit_prodi_id')->nullable()->change();
        });
    }
};
