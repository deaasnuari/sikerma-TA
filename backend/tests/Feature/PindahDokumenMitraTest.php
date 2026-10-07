<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use App\Models\Pengajuan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PindahDokumenMitraTest extends TestCase
{
    use RefreshDatabase;

    /** @var string[] */
    private array $cadanganAwal = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->cadanganAwal = glob(storage_path('app/cadangan-pindah-dokumen-mitra-*.json')) ?: [];
    }

    protected function tearDown(): void
    {
        foreach (glob(storage_path('app/cadangan-pindah-dokumen-mitra-*.json')) ?: [] as $f) {
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

    private function dok(?int $mitraId, string $nomor, array $o = []): DokumenKerjasama
    {
        $d = new DokumenKerjasama();
        $d->forceFill(array_merge([
            'no_permohonan' => 'PMH-'.$nomor, 'nomor_dokumen' => $nomor, 'nama_dokumen' => 'Dok', 'file' => $nomor.'.pdf',
            'status_siklus' => 'active', 'mitra_id' => $mitraId,
        ], $o))->save();

        return $d->fresh();
    }

    private function pengajuan(?int $mitraId, string $nomor): Pengajuan
    {
        return Pengajuan::create([
            'nomor_pengajuan' => $nomor, 'nama_pengusul' => 'Dr. Test', 'judul_pengajuan' => 'KS', 'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'disetujui', 'ruang_lingkup_ids' => [], 'mitra_id' => $mitraId,
        ]);
    }

    private function berkas(): string
    {
        $baru = array_values(array_diff(glob(storage_path('app/cadangan-pindah-dokumen-mitra-*.json')) ?: [], $this->cadanganAwal));
        $this->assertNotEmpty($baru);

        return end($baru);
    }

    public function test_pratinjau_tidak_mengubah_apa_pun(): void
    {
        $asal = $this->mitra('Campur');
        $tujuan = $this->mitra('ITS', 'I12');
        $d = $this->dok($asal->id, 'D-1');

        $this->artisan('sikerma:pindah-dokumen-mitra', ['--dokumen' => "{$d->id}:{$tujuan->id}@{$asal->id}"])->assertSuccessful();

        $this->assertSame($asal->id, $d->fresh()->mitra_id);
        $this->assertSame([], array_diff(glob(storage_path('app/cadangan-pindah-dokumen-mitra-*.json')) ?: [], $this->cadanganAwal));
    }

    public function test_apply_memindahkan_hanya_yang_dipilih_dan_tidak_menghapus_mitra_asal(): void
    {
        $asal = $this->mitra('Campur');
        $its = $this->mitra('ITS', 'I12');
        $alumni = $this->dok($asal->id, 'D-ALUMNI');
        $itsDok = $this->dok($asal->id, 'D-ITS');
        $peng = $this->pengajuan($asal->id, 'P-1');

        $this->artisan('sikerma:pindah-dokumen-mitra', ['--dokumen' => "{$itsDok->id}:{$its->id}@{$asal->id}", '--apply' => true])->assertSuccessful();

        $this->assertSame($its->id, $itsDok->fresh()->mitra_id);
        $this->assertSame($asal->id, $alumni->fresh()->mitra_id, 'dokumen lain milik mitra asal tidak ikut pindah');
        $this->assertSame($asal->id, $peng->fresh()->mitra_id);
        $this->assertNotNull(MasterMitra::find($asal->id));
    }

    public function test_dokumen_di_sampah_dan_pengajuan_ikut_bisa_dipindah(): void
    {
        $asal = $this->mitra('Campur');
        $tujuan = $this->mitra('Sabah', 'LU02');
        $sampah = $this->dok($asal->id, 'D-S', ['dihapus_admin_pada' => now()]);
        $peng = $this->pengajuan($asal->id, 'P-S');

        $this->artisan('sikerma:pindah-dokumen-mitra', [
            '--dokumen' => "{$sampah->id}:{$tujuan->id}", '--pengajuan' => "{$peng->id}:{$tujuan->id}@{$asal->id}", '--apply' => true,
        ])->assertSuccessful();

        $this->assertSame($tujuan->id, $sampah->fresh()->mitra_id);
        $this->assertSame($tujuan->id, $peng->fresh()->mitra_id);
    }

    public function test_pengaman_mitra_asal_menolak_seluruh_perintah(): void
    {
        $a = $this->mitra('A');
        $b = $this->mitra('B');
        $tujuan = $this->mitra('Tujuan');
        $milikA = $this->dok($a->id, 'D-A');
        $milikB = $this->dok($b->id, 'D-B');

        // $milikB ternyata milik B, bukan A: seluruh perintah ditolak, $milikA pun tidak dipindah.
        $this->artisan('sikerma:pindah-dokumen-mitra', [
            '--dokumen' => "{$milikA->id}:{$tujuan->id}@{$a->id},{$milikB->id}:{$tujuan->id}@{$a->id}", '--apply' => true,
        ])->assertFailed();

        $this->assertSame($a->id, $milikA->fresh()->mitra_id);
        $this->assertSame($b->id, $milikB->fresh()->mitra_id);
    }

    public function test_input_tidak_valid_ditolak(): void
    {
        $a = $this->mitra('A');
        $d = $this->dok($a->id, 'D-1');

        foreach ([
            ['--dokumen' => ''],                                          // tidak ada yang diisi
            ['--dokumen' => "{$d->id}-{$a->id}"],                         // format salah
            ['--dokumen' => "{$d->id}:{$a->id},{$d->id}:{$a->id}"],      // dobel
            ['--dokumen' => '999999:'.$a->id],                            // dokumen tidak ada
            ['--dokumen' => "{$d->id}:999999"],                           // mitra tujuan tidak ada
        ] as $opsi) {
            $this->artisan('sikerma:pindah-dokumen-mitra', $opsi + ['--apply' => true])->assertFailed();
        }

        $this->assertSame($a->id, $d->fresh()->mitra_id);
    }

    public function test_sudah_di_tujuan_dilewati_tanpa_cadangan(): void
    {
        $a = $this->mitra('A');
        $d = $this->dok($a->id, 'D-1');

        $this->artisan('sikerma:pindah-dokumen-mitra', ['--dokumen' => "{$d->id}:{$a->id}", '--apply' => true])->assertSuccessful();

        $this->assertSame([], array_diff(glob(storage_path('app/cadangan-pindah-dokumen-mitra-*.json')) ?: [], $this->cadanganAwal));
    }

    public function test_rollback_pratinjau_dulu_lalu_mengembalikan_mitra_lama(): void
    {
        $asal = $this->mitra('Campur');
        $tujuan = $this->mitra('ITS', 'I12');
        $d = $this->dok($asal->id, 'D-1');
        $p = $this->pengajuan($asal->id, 'P-1');
        $this->artisan('sikerma:pindah-dokumen-mitra', ['--dokumen' => "{$d->id}:{$tujuan->id}", '--pengajuan' => "{$p->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();
        $berkas = $this->berkas();

        $this->artisan('sikerma:pindah-dokumen-mitra', ['--rollback' => $berkas])->assertSuccessful();
        $this->assertSame($tujuan->id, $d->fresh()->mitra_id, 'pratinjau rollback tidak mengubah');

        $this->artisan('sikerma:pindah-dokumen-mitra', ['--rollback' => $berkas, '--apply' => true])->assertSuccessful();
        $this->assertSame($asal->id, $d->fresh()->mitra_id);
        $this->assertSame($asal->id, $p->fresh()->mitra_id);
    }

    public function test_rollback_menolak_berkas_asing_dan_mitra_asal_yang_sudah_hilang(): void
    {
        $asing = storage_path('app/cadangan-pindah-dokumen-mitra-asing.json');
        file_put_contents($asing, json_encode(['perintah' => 'lain']));
        try {
            $this->artisan('sikerma:pindah-dokumen-mitra', ['--rollback' => $asing, '--apply' => true])->assertFailed();
            $this->artisan('sikerma:pindah-dokumen-mitra', ['--rollback' => storage_path('app/tidak-ada.json')])->assertFailed();
        } finally {
            @unlink($asing);
        }

        $asal = $this->mitra('Campur');
        $tujuan = $this->mitra('ITS');
        $d = $this->dok($asal->id, 'D-1');
        $this->artisan('sikerma:pindah-dokumen-mitra', ['--dokumen' => "{$d->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();
        $berkas = $this->berkas();
        $asal->delete(); // mitra asal dihapus setelahnya (mis. digabung) -> rollback tidak boleh menaruh dokumen ke id yatim

        $this->artisan('sikerma:pindah-dokumen-mitra', ['--rollback' => $berkas, '--apply' => true])->assertFailed();
        $this->assertSame($tujuan->id, $d->fresh()->mitra_id);
    }
}
