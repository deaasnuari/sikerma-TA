<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pembeda catatan privat admin vs catatan yang boleh dilihat pengusul.
 *
 * Kolom baru NOT NULL DEFAULT false: SEMUA catatan yang sudah ada otomatis tetap privat (isinya tidak
 * disentuh). Hanya catatan baru yang ditandai admin "untuk pengusul" yang terlihat oleh pemilik pengajuan.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('catatan_admin', 'untuk_pengusul')) {
            return;
        }

        Schema::table('catatan_admin', function (Blueprint $table) {
            $table->boolean('untuk_pengusul')->default(false)->after('teks');
            $table->index(['pengajuan_id', 'untuk_pengusul']);
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('catatan_admin', 'untuk_pengusul')) {
            return;
        }

        Schema::table('catatan_admin', function (Blueprint $table) {
            $table->dropIndex(['pengajuan_id', 'untuk_pengusul']);
            $table->dropColumn('untuk_pengusul');
        });
    }
};
