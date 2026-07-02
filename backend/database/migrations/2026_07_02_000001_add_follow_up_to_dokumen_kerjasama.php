<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            if (!Schema::hasColumn('dokumen_kerjasama', 'follow_up')) {
                $table->text('follow_up')->nullable()->after('keterangan');
            }
        });
    }

    public function down(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            if (Schema::hasColumn('dokumen_kerjasama', 'follow_up')) {
                $table->dropColumn('follow_up');
            }
        });
    }
};
