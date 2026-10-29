<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Jurusan/prodi majemuk pada pengajuan & dokumen kerja sama disimpan di kolom JSON
 * unit_prodi_ids pada barisnya sendiri (id pertama = node utama = unit_prodi_id),
 * menggantikan tabel pivot pengajuan_unit_prodi & dokumen_kerjasama_unit_prodi.
 */
return new class extends Migration
{
    /** tabel induk => [tabel pivot, kolom FK pivot] */
    private const TABEL = [
        'pengajuan_v2' => ['pengajuan_unit_prodi', 'pengajuan_id'],
        'dokumen_kerjasama' => ['dokumen_kerjasama_unit_prodi', 'dokumen_kerjasama_id'],
    ];

    public function up(): void
    {
        foreach (self::TABEL as $induk => [$pivot, $fk]) {
            // Tabel ini sudah pernah dipindah (mis. oleh versi awal migration ini): lewati.
            if (Schema::hasColumn($induk, 'unit_prodi_ids') && ! Schema::hasTable($pivot)) {
                continue;
            }

            if (! Schema::hasColumn($induk, 'unit_prodi_ids')) {
                Schema::table($induk, function (Blueprint $table) {
                    $table->json('unit_prodi_ids')->nullable()->after('unit_prodi_id');
                });
            }

            $this->isiDariPivot($induk, $pivot, $fk);

            Schema::dropIfExists($pivot);
        }
    }

    public function down(): void
    {
        foreach (self::TABEL as $induk => [$pivot, $fk]) {
            Schema::create($pivot, function (Blueprint $table) use ($induk, $fk) {
                $table->id();
                $table->foreignId($fk)->constrained($induk)->cascadeOnDelete();
                $table->foreignId('unit_prodi_id')->constrained('master_unit_prodi')->cascadeOnDelete();
                $table->timestamps();

                $table->unique([$fk, 'unit_prodi_id']);
                $table->index('unit_prodi_id');
            });

            $this->isiPivotDariJson($induk, $pivot, $fk);

            Schema::table($induk, function (Blueprint $table) {
                $table->dropColumn('unit_prodi_ids');
            });
        }
    }

    private function isiDariPivot(string $induk, string $pivot, string $fk): void
    {
        $perInduk = Schema::hasTable($pivot)
            ? DB::table($pivot)->orderBy('id')->get()->groupBy($fk)
            : collect();

        DB::table($induk)
            ->whereNull('unit_prodi_ids')
            ->where(fn ($q) => $q->whereNotNull('unit_prodi_id')->orWhereIn('id', $perInduk->keys()->all()))
            ->orderBy('id')
            ->select(['id', 'unit_prodi_id'])
            ->chunkById(500, function ($rows) use ($induk, $perInduk) {
                foreach ($rows as $row) {
                    $ids = $perInduk->get($row->id, collect())->pluck('unit_prodi_id')->map(fn ($id) => (int) $id)->all();

                    // Node utama selalu di depan.
                    if ($row->unit_prodi_id !== null) {
                        array_unshift($ids, (int) $row->unit_prodi_id);
                    }
                    $ids = array_values(array_unique($ids));

                    if ($ids !== []) {
                        DB::table($induk)->where('id', $row->id)->update(['unit_prodi_ids' => json_encode($ids)]);
                    }
                }
            });
    }

    private function isiPivotDariJson(string $induk, string $pivot, string $fk): void
    {
        $now = now();

        DB::table($induk)
            ->whereNotNull('unit_prodi_ids')
            ->orderBy('id')
            ->select(['id', 'unit_prodi_ids'])
            ->chunkById(500, function ($rows) use ($pivot, $fk, $now) {
                foreach ($rows as $row) {
                    $ids = json_decode((string) $row->unit_prodi_ids, true) ?: [];

                    // Lewati id yang sudah tidak ada di master (JSON tidak punya foreign key).
                    foreach (DB::table('master_unit_prodi')->whereIn('id', $ids)->pluck('id') as $id) {
                        DB::table($pivot)->insert([
                            $fk => $row->id,
                            'unit_prodi_id' => $id,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                    }
                }
            });
    }
};
