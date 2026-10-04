<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use App\Models\MasterUnitProdi;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SambungMitraYatimTest extends TestCase
{
    use RefreshDatabase;

    private function dokumenTanpaMitra(string $nomor, array $override = []): DokumenKerjasama
    {
        return DokumenKerjasama::create(array_merge([
            'no_permohonan' => 'PMH-' . fake()->unique()->numerify('#####'),
            'nomor_dokumen' => $nomor,
            'nama_dokumen'  => 'Dok',
            'file'          => 'x.pdf',
            'status_siklus' => 'active',
            'unit_prodi_id' => MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'TI '.$nomor, 'aktif' => true])->id,
            'mitra_id'      => null,
        ], $override));
    }

    public function test_dokumen_tanpa_mitra_disambung_ke_mitra_yang_namanya_cocok(): void
    {
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Revolusi Cita Edukasi', 'aktif' => true]);
        $dok = $this->dokumenTanpaMitra('D-1', ['snap_nama_mitra' => 'PT. Revolusi Cita Edukasi']);

        $this->artisan('sikerma:sambung-mitra-yatim')->assertSuccessful();
        $this->assertNull($dok->fresh()->mitra_id, 'pratinjau tidak boleh mengubah data');

        $this->artisan('sikerma:sambung-mitra-yatim', ['--apply' => true])->assertSuccessful();
        $this->assertSame($mitra->id, $dok->fresh()->mitra_id);
    }

    public function test_yang_cocok_hanya_karena_typo_tidak_disambung_kecuali_diminta(): void
    {
        $mitra = MasterMitra::create(['nama_mitra' => 'Politeknik Negeri Lhokseumawe', 'aktif' => true]);
        $dok = $this->dokumenTanpaMitra('D-2', ['snap_nama_mitra' => 'Politeknik Negeri Lhoseumawe']);

        $this->artisan('sikerma:sambung-mitra-yatim', ['--apply' => true])->assertSuccessful();
        $this->assertNull($dok->fresh()->mitra_id);

        $this->artisan('sikerma:sambung-mitra-yatim', ['--apply' => true, '--termasuk-typo' => true])->assertSuccessful();
        $this->assertSame($mitra->id, $dok->fresh()->mitra_id);
    }

    public function test_nama_tanpa_mitra_yang_cocok_dan_dokumen_yang_sudah_tersambung_tidak_disentuh(): void
    {
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Ada', 'aktif' => true]);
        $lain = MasterMitra::create(['nama_mitra' => 'PT Lain', 'aktif' => true]);
        $tidakCocok = $this->dokumenTanpaMitra('D-3', ['snap_nama_mitra' => 'Rotary Club Batam']);
        $sudahTersambung = $this->dokumenTanpaMitra('D-4', ['snap_nama_mitra' => 'PT Ada', 'mitra_id' => $lain->id]);

        $this->artisan('sikerma:sambung-mitra-yatim', ['--apply' => true])->assertSuccessful();

        $this->assertNull($tidakCocok->fresh()->mitra_id);
        $this->assertSame($lain->id, $sudahTersambung->fresh()->mitra_id);
        $this->assertNotSame($mitra->id, $sudahTersambung->fresh()->mitra_id);
    }
}
