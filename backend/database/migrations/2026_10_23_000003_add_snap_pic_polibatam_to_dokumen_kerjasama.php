<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot PIC Polibatam di dokumen_kerjasama (sama seperti snap_* lain), supaya PIC tetap
 * tampil di Rekap Data walau pengajuan sumbernya dihapus. Dokumen yang sudah ada diisi dari
 * pengajuan sumbernya.
 */
return new class extends Migration
{
    private const KOLOM = [
        'snap_pic_polibatam_nama' => 200,
        'snap_pic_polibatam_jabatan' => 150,
        'snap_pic_polibatam_email' => 255,
        'snap_pic_polibatam_whatsapp' => 50,
    ];

    public function up(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            foreach (self::KOLOM as $nama => $panjang) {
                if (! Schema::hasColumn('dokumen_kerjasama', $nama)) {
                    $table->string($nama, $panjang)->nullable();
                }
            }
        });

        DB::table('pengajuan_v2')
            ->whereNotNull('pic_polibatam_nama')
            ->orderBy('id')
            ->select(['id', 'pic_polibatam_nama', 'pic_polibatam_jabatan', 'pic_polibatam_email', 'pic_polibatam_whatsapp'])
            ->chunkById(200, function ($rows) {
                foreach ($rows as $row) {
                    DB::table('dokumen_kerjasama')->where('sumber_pengajuan_id', $row->id)->update([
                        'snap_pic_polibatam_nama' => $row->pic_polibatam_nama,
                        'snap_pic_polibatam_jabatan' => $row->pic_polibatam_jabatan,
                        'snap_pic_polibatam_email' => $row->pic_polibatam_email,
                        'snap_pic_polibatam_whatsapp' => $row->pic_polibatam_whatsapp,
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('dokumen_kerjasama', function (Blueprint $table) {
            $ada = array_values(array_filter(array_keys(self::KOLOM), fn ($k) => Schema::hasColumn('dokumen_kerjasama', $k)));
            if ($ada) {
                $table->dropColumn($ada);
            }
        });
    }
};
