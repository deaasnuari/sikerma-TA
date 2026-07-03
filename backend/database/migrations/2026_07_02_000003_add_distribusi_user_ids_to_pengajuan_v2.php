<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            if (!Schema::hasColumn('pengajuan_v2', 'distribusi_user_ids')) {
                // Daftar id user internal yang di-"CC" oleh admin saat ACC, supaya
                // mereka bisa ditandai/diberi tahu ikut melihat dokumen final ini.
                $table->json('distribusi_user_ids')->nullable()->after('final_file_path');
            }
        });
    }

    public function down(): void
    {
        Schema::table('pengajuan_v2', function (Blueprint $table) {
            if (Schema::hasColumn('pengajuan_v2', 'distribusi_user_ids')) {
                $table->dropColumn('distribusi_user_ids');
            }
        });
    }
};
