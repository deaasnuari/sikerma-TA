<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * kode_perusahaan dihapus dari master_mitra: kolom itu tidak pernah terisi dan fungsinya (pembeda tiap
 * mitra) sudah dipegang kode_mitra.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('master_mitra', 'kode_perusahaan')) {
            return;
        }

        // Constraint unik dan index pada kolom ini harus lepas dulu (wajib di SQLite, aman di Postgres).
        foreach (Schema::getIndexes('master_mitra') as $index) {
            if ($index['primary'] || ! in_array('kode_perusahaan', $index['columns'], true)) {
                continue;
            }
            Schema::table('master_mitra', fn (Blueprint $t) => $index['unique']
                ? $t->dropUnique($index['name'])
                : $t->dropIndex($index['name']));
        }

        Schema::table('master_mitra', fn (Blueprint $t) => $t->dropColumn('kode_perusahaan'));
    }

    public function down(): void
    {
        if (Schema::hasColumn('master_mitra', 'kode_perusahaan')) {
            return;
        }

        Schema::table('master_mitra', function (Blueprint $t) {
            $t->string('kode_perusahaan', 20)->nullable()->unique();
        });
    }
};
