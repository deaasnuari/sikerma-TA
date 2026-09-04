<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Unit kerja (master_unit_prodi) yang dimiliki user ber-role 'unit' — dipakai untuk
    // membatasi data pengajuan/dokumen kerjasama yang boleh dilihat ke unitnya saja
    // (lihat App\Services\StructuralAccessService). Nullable karena role selain 'unit'
    // tidak wajib mengisi ini.
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('unit_prodi_id')
                ->nullable()
                ->after('unit_kerja')
                ->constrained('master_unit_prodi')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('unit_prodi_id');
        });
    }
};
