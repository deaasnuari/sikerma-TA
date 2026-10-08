<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IsiSnapNamaMitraTest extends TestCase
{
    use RefreshDatabase;

    /** @var string[] */
    private array $cadanganAwal = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->cadanganAwal = glob(storage_path('app/cadangan-isi-snap-nama-mitra-*.json')) ?: [];
    }

    protected function tearDown(): void
    {
        foreach (glob(storage_path('app/cadangan-isi-snap-nama-mitra-*.json')) ?: [] as $f) {
            if (! in_array($f, $this->cadanganAwal, true)) {
                @unlink($f);
            }
        }
        parent::tearDown();
    }

    private function dok(int $mitraId, string $nomor, array $o = []): DokumenKerjasama
    {
        $d = new DokumenKerjasama();
        $d->forceFill(array_merge([
            'no_permohonan' => 'PMH-'.$nomor, 'nomor_dokumen' => $nomor, 'nama_dokumen' => 'Dok', 'file' => $nomor.'.pdf',
            'status_siklus' => 'active', 'mitra_id' => $mitraId,
        ], $o))->save();

        return $d->fresh();
    }

    private function berkas(): string
    {
        $baru = array_values(array_diff(glob(storage_path('app/cadangan-isi-snap-nama-mitra-*.json')) ?: [], $this->cadanganAwal));
        $this->assertNotEmpty($baru);

        return end($baru);
    }

    public function test_hanya_isi_snap_kosong_tidak_menimpa_dan_rollback_memulihkan(): void
    {
        $a = MasterMitra::create(['nama_mitra' => 'NADHLATUL ULAMA', 'kategori_mitra' => 'DUDI', 'aktif' => true]);
        $b = MasterMitra::create(['nama_mitra' => 'PT Pegadaian Area Batam', 'kategori_mitra' => 'DUDI', 'aktif' => true]);
        $kosong = $this->dok($a->id, 'A1');
        $sampah = $this->dok($a->id, 'A2', ['dihapus_admin_pada' => now()]);
        $terisi = $this->dok($a->id, 'A3', ['snap_nama_mitra' => 'Nadhlatul Ulama']);
        $peg = $this->dok($b->id, 'B1');
        $lain = $this->dok($b->id, 'B2');

        $this->artisan('sikerma:isi-snap-nama-mitra', ['--mitra' => (string) $a->id, '--dokumen' => (string) $peg->id])->assertSuccessful();
        $this->assertNull($kosong->fresh()->snap_nama_mitra, 'pratinjau tidak mengubah');

        $this->artisan('sikerma:isi-snap-nama-mitra', ['--mitra' => (string) $a->id, '--dokumen' => (string) $peg->id, '--apply' => true])->assertSuccessful();
        $this->assertSame('NADHLATUL ULAMA', $kosong->fresh()->snap_nama_mitra);
        $this->assertSame('NADHLATUL ULAMA', $sampah->fresh()->snap_nama_mitra);
        $this->assertSame('Nadhlatul Ulama', $terisi->fresh()->snap_nama_mitra, 'snap terisi tidak ditimpa');
        $this->assertSame('PT Pegadaian Area Batam', $peg->fresh()->snap_nama_mitra);
        $this->assertNull($lain->fresh()->snap_nama_mitra, 'dokumen di luar daftar tidak disentuh');

        $berkas = $this->berkas();
        $peg->forceFill(['snap_nama_mitra' => 'Diubah orang lain'])->save();
        $this->artisan('sikerma:isi-snap-nama-mitra', ['--rollback' => $berkas, '--apply' => true])->assertSuccessful();
        $this->assertNull($kosong->fresh()->snap_nama_mitra);
        $this->assertNull($sampah->fresh()->snap_nama_mitra);
        $this->assertSame('Nadhlatul Ulama', $terisi->fresh()->snap_nama_mitra);
        $this->assertSame('Diubah orang lain', $peg->fresh()->snap_nama_mitra, 'snap yang sudah diubah orang lain tidak dikosongkan');
    }
}
