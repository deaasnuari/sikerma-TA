<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * foreignId()->constrained() menambah FK constraint tapi TIDAK otomatis membuat index di
 * SQLite/Postgres (beda dari MySQL InnoDB) — kolom-kolom ini sering difilter langsung
 * (scoping per role, pencarian) di PengajuanController/DokumenKerjasamaController/
 * PengajuanAktivitasController tapi sebelumnya full table scan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            if (!$this->indexExists('pengajuan_v2', 'pengajuan_v2_user_pengusul_id_index')) {
                $table->index('user_pengusul_id');
            }
            if (!$this->indexExists('pengajuan_v2', 'pengajuan_v2_unit_prodi_id_index')) {
                $table->index('unit_prodi_id');
            }
            if (!$this->indexExists('pengajuan_v2', 'pengajuan_v2_mitra_id_index')) {
                $table->index('mitra_id');
            }
            if (!$this->indexExists('pengajuan_v2', 'pengajuan_v2_status_pengajuan_index')) {
                $table->index('status_pengajuan');
            }
        });

        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            if (!$this->indexExists('dokumen_kerjasama', 'dokumen_kerjasama_sumber_pengajuan_id_index')) {
                $table->index('sumber_pengajuan_id');
            }
            if (!$this->indexExists('dokumen_kerjasama', 'dokumen_kerjasama_dibuat_oleh_user_id_index')) {
                $table->index('dibuat_oleh_user_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            if ($this->indexExists('pengajuan_v2', 'pengajuan_v2_user_pengusul_id_index')) {
                $table->dropIndex('pengajuan_v2_user_pengusul_id_index');
            }
            if ($this->indexExists('pengajuan_v2', 'pengajuan_v2_unit_prodi_id_index')) {
                $table->dropIndex('pengajuan_v2_unit_prodi_id_index');
            }
            if ($this->indexExists('pengajuan_v2', 'pengajuan_v2_mitra_id_index')) {
                $table->dropIndex('pengajuan_v2_mitra_id_index');
            }
            if ($this->indexExists('pengajuan_v2', 'pengajuan_v2_status_pengajuan_index')) {
                $table->dropIndex('pengajuan_v2_status_pengajuan_index');
            }
        });

        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            if ($this->indexExists('dokumen_kerjasama', 'dokumen_kerjasama_sumber_pengajuan_id_index')) {
                $table->dropIndex('dokumen_kerjasama_sumber_pengajuan_id_index');
            }
            if ($this->indexExists('dokumen_kerjasama', 'dokumen_kerjasama_dibuat_oleh_user_id_index')) {
                $table->dropIndex('dokumen_kerjasama_dibuat_oleh_user_id_index');
            }
        });
    }

    private function indexExists(string $table, string $indexName): bool
    {
        return collect(Schema::getIndexes($table))->contains(fn ($index) => $index['name'] === $indexName);
    }
};
