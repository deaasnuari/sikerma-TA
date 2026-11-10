<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Email mitra dari form pengajuan disimpan di pengajuan itu sendiri (tidak menyentuh Data Kemitraan).
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('pengajuan_v2') && ! Schema::hasColumn('pengajuan_v2', 'email_mitra')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->string('email_mitra', 255)->nullable()->after('no_telepon_mitra');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'email_mitra')) {
            Schema::table('pengajuan_v2', function (Blueprint $table) {
                $table->dropColumn('email_mitra');
            });
        }
    }
};
