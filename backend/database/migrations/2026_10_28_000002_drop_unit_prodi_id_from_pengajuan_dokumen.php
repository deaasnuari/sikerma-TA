<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * unit_prodi_id (satu unit utama) dihapus dari pengajuan_v2 & dokumen_kerjasama: semuanya sudah
 * ada di unit_prodi_ids (id pertama = unit utama). users.unit_prodi_id TIDAK disentuh.
 */
return new class extends Migration
{
    private const TABEL = ['pengajuan_v2', 'dokumen_kerjasama'];

    public function up(): void
    {
        foreach (self::TABEL as $tabel) {
            if (! Schema::hasColumn($tabel, 'unit_prodi_id')) {
                continue;
            }

            // Jaring pengaman: baris yang cuma punya unit_prodi_id (belum masuk JSON) dipindahkan dulu.
            DB::table($tabel)
                ->whereNull('unit_prodi_ids')
                ->whereNotNull('unit_prodi_id')
                ->orderBy('id')
                ->select(['id', 'unit_prodi_id'])
                ->chunkById(500, function ($rows) use ($tabel) {
                    foreach ($rows as $row) {
                        DB::table($tabel)->where('id', $row->id)->update([
                            'unit_prodi_ids' => json_encode([(int) $row->unit_prodi_id]),
                        ]);
                    }
                });

            // Index & foreign key yang memakai kolom ini harus lepas dulu (wajib di SQLite, aman di Postgres).
            foreach (Schema::getForeignKeys($tabel) as $fk) {
                if (in_array('unit_prodi_id', $fk['columns'], true)) {
                    // SQLite hanya bisa lewat daftar kolom; Postgres/MySQL lewat nama constraint sebenarnya.
                    $target = DB::getDriverName() === 'sqlite' ? $fk['columns'] : $fk['name'];
                    Schema::table($tabel, fn (Blueprint $t) => $t->dropForeign($target));
                }
            }
            foreach (Schema::getIndexes($tabel) as $index) {
                if (! $index['primary'] && in_array('unit_prodi_id', $index['columns'], true)) {
                    Schema::table($tabel, fn (Blueprint $t) => $t->dropIndex($index['name']));
                }
            }

            Schema::table($tabel, fn (Blueprint $t) => $t->dropColumn('unit_prodi_id'));
        }
    }

    public function down(): void
    {
        foreach (self::TABEL as $tabel) {
            Schema::table($tabel, function (Blueprint $t) {
                $t->foreignId('unit_prodi_id')->nullable()->after('id')->constrained('master_unit_prodi')->nullOnDelete();
                $t->index('unit_prodi_id');
            });

            DB::table($tabel)
                ->whereNotNull('unit_prodi_ids')
                ->orderBy('id')
                ->select(['id', 'unit_prodi_ids'])
                ->chunkById(500, function ($rows) use ($tabel) {
                    foreach ($rows as $row) {
                        $ids = json_decode((string) $row->unit_prodi_ids, true) ?: [];
                        $utama = $ids[0] ?? null;

                        if ($utama !== null && DB::table('master_unit_prodi')->where('id', $utama)->exists()) {
                            DB::table($tabel)->where('id', $row->id)->update(['unit_prodi_id' => $utama]);
                        }
                    }
                });
        }
    }
};
