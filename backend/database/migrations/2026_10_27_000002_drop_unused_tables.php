<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('master_perusahaan');
        Schema::dropIfExists('pengajuan_file_legacy_archive');
        Schema::dropIfExists('pengajuan_log_legacy_archive');
    }

    public function down(): void
    {
        // Tabel arsip/sisa lama dihapus permanen; tidak dibuat ulang.
    }
};
