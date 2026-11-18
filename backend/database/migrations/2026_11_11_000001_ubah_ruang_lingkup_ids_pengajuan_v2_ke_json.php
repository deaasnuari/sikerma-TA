<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Database yang dulu dibuat dari schema_v2_simplified.sql menyimpan pengajuan_v2.ruang_lingkup_ids sebagai
 * BIGINT[], sedangkan migration create_pengajuan_v2 dan cast model Pengajuan ('array') memakai JSON.
 * Akibatnya insert pengajuan baru gagal ("malformed array literal: \"[]\""). Samakan ke JSON; database
 * yang kolomnya sudah JSON tidak tersentuh.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! $this->kolomBertipeArray()) {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS idx_pengajuan_v2_ruang_lingkup_gin');
        DB::statement('ALTER TABLE pengajuan_v2 ALTER COLUMN ruang_lingkup_ids DROP DEFAULT');
        DB::statement("ALTER TABLE pengajuan_v2 ALTER COLUMN ruang_lingkup_ids TYPE json USING COALESCE(to_json(ruang_lingkup_ids), '[]'::json)");
        DB::statement("ALTER TABLE pengajuan_v2 ALTER COLUMN ruang_lingkup_ids SET DEFAULT '[]'::json");
    }

    public function down(): void
    {
        // Tidak dikembalikan ke BIGINT[]: skema resmi (migration) memang JSON.
    }

    private function kolomBertipeArray(): bool
    {
        if (DB::getDriverName() !== 'pgsql') {
            return false;
        }

        $kolom = DB::selectOne(
            "SELECT udt_name FROM information_schema.columns WHERE table_name = 'pengajuan_v2' AND column_name = 'ruang_lingkup_ids'"
        );

        return $kolom !== null && $kolom->udt_name === '_int8';
    }
};
