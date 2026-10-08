<?php

namespace Tests\Feature;

use App\Models\MasterMitra;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UbahKodeMitraTest extends TestCase
{
    use RefreshDatabase;

    /** @var string[] */
    private array $cadanganAwal = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->cadanganAwal = glob(storage_path('app/cadangan-ubah-kode-mitra-*.json')) ?: [];
    }

    protected function tearDown(): void
    {
        foreach (glob(storage_path('app/cadangan-ubah-kode-mitra-*.json')) ?: [] as $f) {
            if (! in_array($f, $this->cadanganAwal, true)) {
                @unlink($f);
            }
        }
        parent::tearDown();
    }

    private function mitra(string $nama, ?string $kode = null): MasterMitra
    {
        return MasterMitra::create(['nama_mitra' => $nama, 'kategori_mitra' => 'DUDI', 'kode_mitra' => $kode, 'aktif' => true]);
    }

    private function berkas(): string
    {
        $baru = array_values(array_diff(glob(storage_path('app/cadangan-ubah-kode-mitra-*.json')) ?: [], $this->cadanganAwal));
        $this->assertNotEmpty($baru);

        return end($baru);
    }

    public function test_pratinjau_tidak_mengubah_apa_pun(): void
    {
        $a = $this->mitra('Nongsa Digital Park', '234');
        $b = $this->mitra('POBO SOCCER');

        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:,{$b->id}:PTP15"])->assertSuccessful();

        $this->assertSame('234', $a->fresh()->kode_mitra);
        $this->assertNull($b->fresh()->kode_mitra);
        $this->assertSame([], array_diff(glob(storage_path('app/cadangan-ubah-kode-mitra-*.json')) ?: [], $this->cadanganAwal));
    }

    public function test_apply_mengosongkan_dan_mengisi_kode(): void
    {
        $a = $this->mitra('Nongsa Digital Park', '234');
        $b = $this->mitra('POBO SOCCER');

        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:,{$b->id}:PTP15", '--apply' => true])->assertSuccessful();

        $this->assertNull($a->fresh()->kode_mitra);
        $this->assertSame('PTP15', $b->fresh()->kode_mitra);
    }

    public function test_kode_yang_dipakai_mitra_lain_menolak_seluruh_perubahan(): void
    {
        $a = $this->mitra('Nongsa Digital Park', '234');
        $b = $this->mitra('POBO SOCCER');
        $this->mitra('PT Pobos Pradi Jaya (Pobo Soccer)', 'PTP15');

        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:,{$b->id}:PTP15", '--apply' => true])->assertFailed();

        $this->assertSame('234', $a->fresh()->kode_mitra, 'perubahan lain yang valid pun tidak diterapkan sebagian');
        $this->assertNull($b->fresh()->kode_mitra);
    }

    public function test_dua_mitra_boleh_bertukar_kode_dalam_satu_set(): void
    {
        $a = $this->mitra('A', 'AA1');
        $b = $this->mitra('B', 'BB2');

        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:BB2,{$b->id}:AA1", '--apply' => true])->assertSuccessful();

        $this->assertSame('BB2', $a->fresh()->kode_mitra);
        $this->assertSame('AA1', $b->fresh()->kode_mitra);
    }

    public function test_input_tidak_valid_ditolak(): void
    {
        $a = $this->mitra('A', 'AA1');
        $b = $this->mitra('B');

        foreach ([
            '',                                         // kosong
            "{$a->id}-PTP15",                           // format salah
            "{$a->id}:X1,{$a->id}:X2",                  // id dobel
            "{$a->id}:ZZ1,{$b->id}:ZZ1",                // kode dobel dalam --set
            '999999:ZZ1',                               // mitra tidak ada
            "{$a->id}:".str_repeat('X', 21),            // > 20 karakter
        ] as $opsi) {
            $this->artisan('sikerma:ubah-kode-mitra', ['--set' => $opsi, '--apply' => true])->assertFailed();
        }

        $this->assertSame('AA1', $a->fresh()->kode_mitra);
        $this->assertNull($b->fresh()->kode_mitra);
    }

    public function test_pengaman_kode_lama_menolak_seluruh_perubahan_bila_ada_yang_tidak_cocok(): void
    {
        $a = $this->mitra('A', 'AA1');
        $b = $this->mitra('B');

        // b diharapkan berkode 'ZZ9' padahal kosong -> daftar basi, semuanya ditolak (a pun tidak berubah).
        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:AA2@AA1,{$b->id}:BB1@ZZ9", '--apply' => true])->assertFailed();

        $this->assertSame('AA1', $a->fresh()->kode_mitra);
        $this->assertNull($b->fresh()->kode_mitra);
    }

    public function test_pengaman_kode_lama_lolos_bila_cocok_termasuk_kosong_dan_pertukaran(): void
    {
        $a = $this->mitra('A', 'AA1');
        $b = $this->mitra('B', 'BB2');
        $c = $this->mitra('C');

        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:BB2@AA1,{$b->id}:AA1@BB2,{$c->id}:CC3@", '--apply' => true])->assertSuccessful();

        $this->assertSame('BB2', $a->fresh()->kode_mitra);
        $this->assertSame('AA1', $b->fresh()->kode_mitra);
        $this->assertSame('CC3', $c->fresh()->kode_mitra);
    }

    public function test_kode_di_luar_pola_hanya_peringatan_bukan_penolakan(): void
    {
        $a = $this->mitra('A');

        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:abc-12", '--apply' => true])->assertSuccessful();

        $this->assertSame('abc-12', $a->fresh()->kode_mitra);
    }

    public function test_tidak_ada_perubahan_bila_kode_sudah_sama(): void
    {
        $a = $this->mitra('A', 'AA1');

        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:AA1", '--apply' => true])->assertSuccessful();

        $this->assertSame([], array_diff(glob(storage_path('app/cadangan-ubah-kode-mitra-*.json')) ?: [], $this->cadanganAwal));
    }

    public function test_rollback_mengembalikan_kode_lama_dan_pratinjau_tidak_mengubah(): void
    {
        $a = $this->mitra('Nongsa Digital Park', '234');
        $b = $this->mitra('POBO SOCCER');
        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:,{$b->id}:PTP15", '--apply' => true])->assertSuccessful();
        $berkas = $this->berkas();

        $this->artisan('sikerma:ubah-kode-mitra', ['--rollback' => $berkas])->assertSuccessful();
        $this->assertNull($a->fresh()->kode_mitra, 'pratinjau rollback tidak mengubah');

        $this->artisan('sikerma:ubah-kode-mitra', ['--rollback' => $berkas, '--apply' => true])->assertSuccessful();
        $this->assertSame('234', $a->fresh()->kode_mitra);
        $this->assertNull($b->fresh()->kode_mitra);
    }

    public function test_rollback_ditolak_bila_kode_lama_sudah_dipakai_mitra_lain(): void
    {
        $a = $this->mitra('Nongsa Digital Park', '234');
        $this->artisan('sikerma:ubah-kode-mitra', ['--set' => "{$a->id}:", '--apply' => true])->assertSuccessful();
        $berkas = $this->berkas();
        $this->mitra('Pemegang Baru', '234');

        $this->artisan('sikerma:ubah-kode-mitra', ['--rollback' => $berkas, '--apply' => true])->assertFailed();

        $this->assertNull($a->fresh()->kode_mitra);
    }

    public function test_rollback_menolak_berkas_asing(): void
    {
        $path = storage_path('app/cadangan-ubah-kode-mitra-asing.json');
        file_put_contents($path, json_encode(['perintah' => 'lain']));

        try {
            $this->artisan('sikerma:ubah-kode-mitra', ['--rollback' => $path, '--apply' => true])->assertFailed();
            $this->artisan('sikerma:ubah-kode-mitra', ['--rollback' => storage_path('app/tidak-ada.json')])->assertFailed();
        } finally {
            @unlink($path);
        }
    }
}
