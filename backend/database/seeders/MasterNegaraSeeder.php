<?php

namespace Database\Seeders;

use App\Models\MasterNegara;
use Illuminate\Database\Seeder;

class MasterNegaraSeeder extends Seeder
{
    /**
     * Daftar negara bawaan yang dulu di-hardcode di frontend (defaultNegaraOptions di
     * AjukanKerjasamaForm/TambahDokumenModal) — dipindahkan ke sini supaya jadi baris
     * sungguhan di tabel master_negara (punya id, bisa di-Tambah/Edit/Hapus admin lewat
     * halaman Data Pengajuan), bukan lagi daftar dummy yang cuma hidup di kode frontend.
     */
    private const NEGARA_BAWAAN = [
        'Indonesia',
        'Malaysia',
        'Singapura',
        'Amerika Serikat',
        'Jepang',
        'Korea Selatan',
        'Australia',
        'Jerman',
        'Belanda',
        'Inggris',
        'Tiongkok',
        'Taiwan',
        'Prancis',
        'Filipina',
        'Vietnam',
        'Palestina',
    ];

    public function run(): void
    {
        foreach (self::NEGARA_BAWAAN as $nama) {
            MasterNegara::firstOrCreate(
                ['nama_negara' => $nama],
                ['aktif' => true]
            );
        }
    }
}
