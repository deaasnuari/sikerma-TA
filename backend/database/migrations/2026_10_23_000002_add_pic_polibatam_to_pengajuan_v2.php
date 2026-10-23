<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Kontak person (PIC) dari pihak Polibatam, terpisah dari PIC mitra: orang yang mengajukan
    // dari internal (atau ditunjuk admin) dan akan dihubungi soal kerja sama ini.
    private const KOLOM = [
        'pic_polibatam_nama' => 200,
        'pic_polibatam_jabatan' => 150,
        'pic_polibatam_email' => 255,
        'pic_polibatam_whatsapp' => 50,
    ];

    public function up(): void
    {
        if (! Schema::hasTable('pengajuan_v2')) {
            return;
        }

        Schema::table('pengajuan_v2', function (Blueprint $table) {
            foreach (self::KOLOM as $nama => $panjang) {
                if (! Schema::hasColumn('pengajuan_v2', $nama)) {
                    $table->string($nama, $panjang)->nullable();
                }
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('pengajuan_v2')) {
            return;
        }

        Schema::table('pengajuan_v2', function (Blueprint $table) {
            $ada = array_values(array_filter(array_keys(self::KOLOM), fn ($k) => Schema::hasColumn('pengajuan_v2', $k)));
            if ($ada) {
                $table->dropColumn($ada);
            }
        });
    }
};
