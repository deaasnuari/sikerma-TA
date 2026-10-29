<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Satu pengajuan/dokumen boleh memuat beberapa jenis (MoU + MoA sekaligus):
 *  - jenis_dokumen tetap jenis utama; jenis_dokumen_list menyimpan daftar lengkapnya (NULL = hanya jenis utama).
 *  - tiap berkas (pengajuan_file / dokumen_file) boleh diberi jenis_dokumen supaya di detail terlihat
 *    berkas mana MoU dan mana MoA (NULL = tidak dibedakan).
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['pengajuan_v2', 'dokumen_kerjasama'] as $tabel) {
            if (! Schema::hasColumn($tabel, 'jenis_dokumen_list')) {
                Schema::table($tabel, fn (Blueprint $t) => $t->json('jenis_dokumen_list')->nullable()->after('jenis_dokumen'));
            }
        }

        foreach (['pengajuan_file', 'dokumen_file'] as $tabel) {
            if (! Schema::hasColumn($tabel, 'jenis_dokumen')) {
                Schema::table($tabel, fn (Blueprint $t) => $t->string('jenis_dokumen', 20)->nullable()->after('peran_berkas'));
            }
        }
    }

    public function down(): void
    {
        foreach (['pengajuan_v2', 'dokumen_kerjasama'] as $tabel) {
            if (Schema::hasColumn($tabel, 'jenis_dokumen_list')) {
                Schema::table($tabel, fn (Blueprint $t) => $t->dropColumn('jenis_dokumen_list'));
            }
        }

        foreach (['pengajuan_file', 'dokumen_file'] as $tabel) {
            if (Schema::hasColumn($tabel, 'jenis_dokumen')) {
                Schema::table($tabel, fn (Blueprint $t) => $t->dropColumn('jenis_dokumen'));
            }
        }
    }
};
