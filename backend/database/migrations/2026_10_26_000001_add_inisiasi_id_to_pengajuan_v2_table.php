<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pengajuan boleh menandai dirinya sebagai tindak lanjut dari satu Inisiasi (opsional), sehingga
 * status tindak lanjut Inisiasi bisa dihitung dari pengajuan yang menunjuknya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            $table->foreignId('inisiasi_id')
                ->nullable()
                ->after('mitra_id')
                ->constrained('inisiasi')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            $table->dropConstrainedForeignId('inisiasi_id');
        });
    }
};
