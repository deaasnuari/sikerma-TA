<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\KontakMitra;
use App\Models\MasterMitra;
use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GabungMitraGandaTest extends TestCase
{
    use RefreshDatabase;

    /** @var string[] berkas cadangan yang sudah ada sebelum tes (jangan dihapus). */
    private array $cadanganAwal = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->cadanganAwal = $this->semuaCadangan();
    }

    /** @return string[] */
    private function semuaCadangan(): array
    {
        return array_merge(
            glob(storage_path('app/cadangan-gabung-mitra-*.json')) ?: [],
            glob(storage_path('app/cadangan-pulihkan-mitra-*.json')) ?: [],
        );
    }

    protected function tearDown(): void
    {
        // Tes --apply menulis cadangan ke storage/app sungguhan; bersihkan yang dibuat tes ini.
        foreach ($this->semuaCadangan() as $f) {
            if (! in_array($f, $this->cadanganAwal, true)) {
                @unlink($f);
            }
        }
        parent::tearDown();
    }

    private function berkasCadangan(): string
    {
        $baru = array_values(array_diff(glob(storage_path('app/cadangan-gabung-mitra-*.json')) ?: [], $this->cadanganAwal));
        $this->assertNotEmpty($baru, 'berkas cadangan tidak dibuat');

        return end($baru);
    }

    private function unitId(): int
    {
        return MasterUnitProdi::create([
            'jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'TI', 'aktif' => true,
        ])->id;
    }

    private function mitra(array $override = []): MasterMitra
    {
        return MasterMitra::create(array_merge([
            'nama_mitra' => 'PT Contoh', 'kategori_mitra' => 'DUDI', 'aktif' => true,
        ], $override));
    }

    private function dokumenUntukMitra(int $mitraId, string $nomor): DokumenKerjasama
    {
        return DokumenKerjasama::create([
            'no_permohonan' => 'PMH-' . fake()->unique()->numerify('#####'),
            'nomor_dokumen' => $nomor,
            'nama_dokumen'  => 'Dok',
            'file'          => 'x.pdf',
            'status_siklus' => 'active',
            'unit_prodi_id' => $this->unitId(),
            'mitra_id'      => $mitraId,
        ]);
    }

    private function pengajuanUntukMitra(int $mitraId, string $nomor): Pengajuan
    {
        return Pengajuan::create([
            'nomor_pengajuan' => $nomor,
            'nama_pengusul'   => 'Dr. Test',
            'judul_pengajuan' => 'KS',
            'jenis_dokumen'   => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
            'mitra_id'        => $mitraId,
        ]);
    }

    public function test_baris_ber_kode_dipilih_jadi_induk_walau_kurang_dipakai(): void
    {
        $lama = $this->mitra(['nama_mitra' => 'PT Ade Mestakung Abadi']); // tanpa kode, banyak dipakai
        $berkode = $this->mitra(['nama_mitra' => ' PT Ade Mestakung Abadi', 'kode_mitra' => 'PTA01']);
        $dok = $this->dokumenUntukMitra($lama->id, 'D-1');
        $peng = $this->pengajuanUntukMitra($lama->id, 'P-1');

        $this->artisan('sikerma:gabung-mitra-ganda --apply')->assertSuccessful();

        $this->assertDatabaseMissing('master_mitra', ['id' => $lama->id]);
        $this->assertSame($berkode->id, $dok->fresh()->mitra_id);
        $this->assertSame($berkode->id, $peng->fresh()->mitra_id);
        $this->assertSame(1, MasterMitra::count());
    }

    public function test_field_kosong_di_induk_diisi_dari_duplikat(): void
    {
        $induk = $this->mitra(['nama_mitra' => 'PT Feen Marine', 'kode_mitra' => 'PTF01', 'email_mitra' => null]);
        $this->mitra(['nama_mitra' => 'PT Feen Marine ', 'email_mitra' => 'feen@contoh.co.id', 'whatsapp_mitra' => '0812']);

        $this->artisan('sikerma:gabung-mitra-ganda --apply')->assertSuccessful();

        $this->assertSame(1, MasterMitra::count());
        $this->assertDatabaseHas('master_mitra', [
            'id' => $induk->id, 'kode_mitra' => 'PTF01',
            'email_mitra' => 'feen@contoh.co.id', 'whatsapp_mitra' => '0812',
        ]);
    }

    public function test_grup_tanpa_kode_induk_dipilih_yang_paling_dipakai(): void
    {
        $dipakai = $this->mitra(['nama_mitra' => 'LIPROK ECOFRENDLY']);
        $kosong  = $this->mitra(['nama_mitra' => 'LIPROK ECOFRENDLY']);
        $peng = $this->pengajuanUntukMitra($dipakai->id, 'P-2');

        $this->artisan('sikerma:gabung-mitra-ganda --apply')->assertSuccessful();

        $this->assertDatabaseMissing('master_mitra', ['id' => $kosong->id]);
        $this->assertSame($dipakai->id, $peng->fresh()->mitra_id);
    }

    public function test_tiga_baris_dalam_satu_grup_semua_digabung(): void
    {
        $this->mitra(['nama_mitra' => 'PT. CLADTEK BIMETAL MANUFACTURING']);
        $this->mitra(['nama_mitra' => 'PT. CLADTEK BI-METAL MANUFACTURING']);
        $this->mitra(['nama_mitra' => 'PT Cladtek Bi-Metal Manufacturing', 'kode_mitra' => 'PTC05']);

        $this->artisan('sikerma:gabung-mitra-ganda --apply')->assertSuccessful();

        $this->assertSame(1, MasterMitra::count());
        $this->assertDatabaseHas('master_mitra', ['kode_mitra' => 'PTC05']);
    }

    public function test_dry_run_tidak_mengubah_apa_pun(): void
    {
        $a = $this->mitra(['nama_mitra' => 'PT Sama']);
        $b = $this->mitra(['nama_mitra' => 'PT  Sama']);

        $this->artisan('sikerma:gabung-mitra-ganda')->assertSuccessful();

        $this->assertSame(2, MasterMitra::count());
        $this->assertDatabaseHas('master_mitra', ['id' => $a->id]);
        $this->assertDatabaseHas('master_mitra', ['id' => $b->id]);
    }

    public function test_mitra_tidak_ganda_tidak_tersentuh(): void
    {
        $x = $this->mitra(['nama_mitra' => 'PT Unik Satu']);
        $y = $this->mitra(['nama_mitra' => 'PT Unik Dua']);

        $this->artisan('sikerma:gabung-mitra-ganda --apply')->assertSuccessful();

        $this->assertSame(2, MasterMitra::count());
        $this->assertDatabaseHas('master_mitra', ['id' => $x->id]);
        $this->assertDatabaseHas('master_mitra', ['id' => $y->id]);
    }

    public function test_idempotent_jalan_kedua_kali_jadi_no_op(): void
    {
        $this->mitra(['nama_mitra' => 'PT Dobel']);
        $this->mitra(['nama_mitra' => 'PT Dobel ']);

        $this->artisan('sikerma:gabung-mitra-ganda --apply')->assertSuccessful();
        $this->assertSame(1, MasterMitra::count());

        $this->artisan('sikerma:gabung-mitra-ganda --apply')
            ->expectsOutputToContain('Tidak ada mitra ganda')
            ->assertSuccessful();
        $this->assertSame(1, MasterMitra::count());
    }

    public function test_kontak_dari_duplikat_dipindah_ke_induk_sebagai_kontak_tambahan(): void
    {
        $induk = $this->mitra(['kode_mitra' => 'M-1', 'nama_kontak_utama' => 'Sari', 'email_kontak_utama' => 'sari@x.id']);
        $dup = $this->mitra([
            'nama_mitra' => 'PT. Contoh', 'nama_kontak_utama' => 'Budi', 'jabatan_kontak_utama' => 'HRD',
            'email_kontak_utama' => 'budi@x.id', 'telepon_kontak_utama' => '0811',
        ]);
        $dup->kontak()->create(['nama' => 'Citra', 'email' => 'citra@x.id']);
        // Email sama dengan kontak utama induk: tidak dicatat dobel.
        $dup->kontak()->create(['nama' => 'Sari Lagi', 'email' => 'SARI@x.id']);

        $this->artisan('sikerma:gabung-mitra-ganda --apply')->assertSuccessful();

        $this->assertSame(1, MasterMitra::count());
        $this->assertSame('Sari', $induk->fresh()->nama_kontak_utama);
        $this->assertEqualsCanonicalizing(
            ['budi@x.id', 'citra@x.id'],
            KontakMitra::where('mitra_id', $induk->id)->pluck('email')->all(),
        );
        $this->assertDatabaseHas('kontak_mitra', ['mitra_id' => $induk->id, 'nama' => 'Budi', 'jabatan' => 'HRD', 'telepon' => '0811']);
        $this->assertSame(2, KontakMitra::count());
    }

    // ------------------------------------------------------------------
    // Mode --pasangan=hapus:tujuan dan --rollback
    // ------------------------------------------------------------------

    public function test_pratinjau_pasangan_tidak_mengubah_apa_pun(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'PT Archasindo Marine Automation']);
        $hapus = $this->mitra(['nama_mitra' => 'PT Archasindo', 'kode_mitra' => 'PTA09']);
        $this->dokumenUntukMitra($hapus->id, 'D-1');

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}"])->assertSuccessful();

        $this->assertSame(2, MasterMitra::count());
        $this->assertSame([], array_diff(glob(storage_path('app/cadangan-gabung-mitra-*.json')) ?: [], $this->cadanganAwal));
    }

    public function test_pasangan_menggabung_nama_yang_tidak_cocok_otomatis_dan_membawa_kode_dok_pengajuan_dan_pic(): void
    {
        // Nama sengaja berbeda jauh: pencocokan nama otomatis tidak akan menganggapnya sama.
        $tujuan = $this->mitra(['nama_mitra' => 'POBO SOCCER (PT POBOS PRADI JAYA)']);
        $hapus = $this->mitra([
            'nama_mitra' => 'POBI SPORTSWEAR', 'kode_mitra' => 'PB01',
            'nama_kontak_utama' => 'Andi', 'email_kontak_utama' => 'andi@pobi.id',
        ]);
        $dok = $this->dokumenUntukMitra($hapus->id, 'D-1');
        $peng = $this->pengajuanUntukMitra($hapus->id, 'P-1');

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();

        $this->assertDatabaseMissing('master_mitra', ['id' => $hapus->id]);
        $this->assertSame($tujuan->id, $dok->fresh()->mitra_id);
        $this->assertSame($tujuan->id, $peng->fresh()->mitra_id);
        $tujuan = $tujuan->fresh();
        $this->assertSame('PB01', $tujuan->kode_mitra, 'kolom kosong di tujuan diisi dari yang dihapus');
        $this->assertSame('Andi', $tujuan->nama_kontak_utama, 'PIC ikut pindah');
        $this->assertSame('POBO SOCCER (PT POBOS PRADI JAYA)', $tujuan->nama_mitra, 'nama tujuan tidak berubah');
    }

    public function test_tanpa_backfill_kontak_tidak_menyalin_kontak_utama_tapi_kolom_lain_dan_dokumen_tetap_pindah(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'Institut Teknologi Batam', 'kode_mitra' => 'IN05']);
        $hapus = $this->mitra([
            'nama_mitra' => 'Perpustakaan Institute Teknologi Batam', 'website' => 'perpus.example.id',
            'nama_kontak_utama' => 'Andi', 'jabatan_kontak_utama' => 'Pustakawan',
            'email_kontak_utama' => 'andi@perpus.id', 'telepon_kontak_utama' => '0778',
        ]);
        $dok = $this->dokumenUntukMitra($hapus->id, 'D-1');
        $peng = $this->pengajuanUntukMitra($hapus->id, 'P-1');

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--tanpa-backfill-kontak' => true])->assertSuccessful();
        $this->assertDatabaseHas('master_mitra', ['id' => $hapus->id]);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--tanpa-backfill-kontak' => true, '--apply' => true])->assertSuccessful();

        $this->assertDatabaseMissing('master_mitra', ['id' => $hapus->id]);
        $this->assertSame($tujuan->id, $dok->fresh()->mitra_id);
        $this->assertSame($tujuan->id, $peng->fresh()->mitra_id);
        $tujuan = $tujuan->fresh();
        $this->assertNull($tujuan->nama_kontak_utama);
        $this->assertNull($tujuan->jabatan_kontak_utama);
        $this->assertNull($tujuan->email_kontak_utama);
        $this->assertNull($tujuan->telepon_kontak_utama);
        $this->assertSame(0, \App\Models\KontakMitra::where('mitra_id', $tujuan->id)->count(), 'PIC utama tidak dijadikan kontak tambahan');
        $this->assertSame('perpus.example.id', $tujuan->website, 'kolom non-kontak tetap di-backfill');
    }

    public function test_tanpa_backfill_mematikan_semua_backfill_termasuk_website_dan_kode_tapi_memindahkan_dokumen(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'Universitas Diponegoro', 'kode_mitra' => 'UN09']);
        $hapus = $this->mitra([
            'nama_mitra' => 'Sekolah Vokasi Universitas Diponegoro', 'website' => 'vokasi.example.ac.id', 'alamat' => 'Semarang',
            'nama_kontak_utama' => 'Budi', 'email_kontak_utama' => 'budi@vokasi.id',
        ]);
        $dok = $this->dokumenUntukMitra($hapus->id, 'D-1');

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--tanpa-backfill' => true, '--apply' => true])->assertSuccessful();

        $this->assertDatabaseMissing('master_mitra', ['id' => $hapus->id]);
        $this->assertSame($tujuan->id, $dok->fresh()->mitra_id);
        $tujuan = $tujuan->fresh();
        $this->assertNull($tujuan->website);
        $this->assertNull($tujuan->alamat);
        $this->assertNull($tujuan->nama_kontak_utama);
        $this->assertSame('UN09', $tujuan->kode_mitra);
        $this->assertSame(0, \App\Models\KontakMitra::where('mitra_id', $tujuan->id)->count());
    }

    public function test_pasangan_tidak_menimpa_kolom_tujuan_yang_sudah_terisi(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'Universitas Internasional Batam', 'kode_mitra' => 'UN11', 'kategori_mitra' => 'Perguruan Tinggi']);
        $hapus = $this->mitra(['nama_mitra' => 'Perpustakaan UIB', 'kode_mitra' => 'P10', 'kategori_mitra' => 'Lain']);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();

        $tujuan = $tujuan->fresh();
        $this->assertSame('UN11', $tujuan->kode_mitra);
        $this->assertSame('Perguruan Tinggi', $tujuan->kategori_mitra);
    }

    public function test_dua_mitra_dihapus_ke_satu_tujuan_dan_dokumen_di_sampah_ikut_pindah(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'ITAEWON KBOBA & TERAWATER']);
        $a = $this->mitra(['nama_mitra' => 'Itaewon K-Boba']);
        $b = $this->mitra(['nama_mitra' => 'ITAEWON-K']);
        $dokA = $this->dokumenUntukMitra($a->id, 'D-1');
        $dokB = $this->dokumenUntukMitra($b->id, 'D-2');
        $dokB->forceFill(['dihapus_admin_pada' => now()])->save(); // salinan yang sudah di Sampah

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$a->id}:{$tujuan->id},{$b->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();

        $this->assertSame(1, MasterMitra::count());
        $this->assertSame($tujuan->id, $dokA->fresh()->mitra_id);
        $this->assertSame($tujuan->id, $dokB->fresh()->mitra_id);
    }

    public function test_pasangan_yang_tidak_valid_ditolak_seluruhnya_tanpa_mengubah_data(): void
    {
        $a = $this->mitra(['nama_mitra' => 'Alfa']);
        $b = $this->mitra(['nama_mitra' => 'Bravo']);
        $c = $this->mitra(['nama_mitra' => 'Charlie']);

        foreach ([
            "{$a->id}:{$a->id}",                      // ke dirinya sendiri
            "{$a->id}:{$b->id},{$b->id}:{$c->id}",    // berantai (b jadi hapus sekaligus tujuan)
            "{$a->id}:{$b->id},{$a->id}:{$c->id}",    // a dihapus dua kali
            "{$a->id}:999999",                        // tujuan tidak ada
            "{$a->id}-{$b->id}",                      // format salah
        ] as $opsi) {
            $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => $opsi, '--apply' => true])->assertFailed();
        }

        $this->assertSame(3, MasterMitra::count());
    }

    public function test_rollback_menghidupkan_lagi_mitra_dan_mengembalikan_semuanya(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'PT Cicor Panatec', 'kode_mitra' => 'PTC04']);
        $hapus = $this->mitra([
            'nama_mitra' => 'PT. Cicor', 'kode_mitra' => 'ZZ',
            'nama_kontak_utama' => 'Dewi', 'email_kontak_utama' => 'dewi@cicor.id',
        ]);
        $hapus->kontak()->create(['nama' => 'Eko', 'email' => 'eko@cicor.id']);
        $kontakLama = KontakMitra::where('mitra_id', $hapus->id)->first();
        $dok = $this->dokumenUntukMitra($hapus->id, 'D-1');
        $peng = $this->pengajuanUntukMitra($hapus->id, 'P-1');
        $tujuanAwal = $tujuan->fresh()->only(['nama_kontak_utama', 'email_kontak_utama', 'kode_mitra']);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();
        $this->assertDatabaseMissing('master_mitra', ['id' => $hapus->id]);
        $this->assertSame($tujuan->id, $dok->fresh()->mitra_id);
        $this->assertTrue(KontakMitra::where('mitra_id', $tujuan->id)->exists());

        // Pemetaan di berkas cadangan harus berkunci id mitra yang dihapus (bukan daftar tanpa kunci).
        $cadangan = json_decode((string) file_get_contents($this->berkasCadangan()), true);
        $this->assertSame([$hapus->id => $tujuan->id], $cadangan['pemetaan_ke_induk']);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $this->berkasCadangan(), '--apply' => true])->assertSuccessful();

        $hidup = MasterMitra::find($hapus->id);
        $this->assertNotNull($hidup, 'mitra dihidupkan lagi dengan id aslinya');
        $this->assertSame('PT. Cicor', $hidup->nama_mitra);
        $this->assertSame('ZZ', $hidup->kode_mitra);
        $this->assertSame($hapus->id, $dok->fresh()->mitra_id);
        $this->assertSame($hapus->id, $peng->fresh()->mitra_id);
        $this->assertSame($tujuanAwal, $tujuan->fresh()->only(['nama_kontak_utama', 'email_kontak_utama', 'kode_mitra']), 'kolom tujuan yang di-backfill kembali seperti semula');
        $this->assertSame(0, KontakMitra::where('mitra_id', $tujuan->id)->count(), 'kontak tambahan di tujuan dibuang');
        $this->assertSame($hapus->id, (int) KontakMitra::find($kontakLama->id)->mitra_id, 'kontak lama kembali ke mitra asalnya');
    }

    public function test_kode_mitra_unik_disalin_ke_tujuan_tanpa_bentrok_dan_rollback_mengembalikannya(): void
    {
        // kode_mitra unik: tujuan kosong, yang dihapus berkode -> kode pindah ke tujuan (apply),
        // lalu kembali ke baris asalnya (rollback), tanpa melanggar unique di kedua arah.
        $tujuan = $this->mitra(['nama_mitra' => 'Itaewon K-Boba Utama']);
        $hapus = $this->mitra(['nama_mitra' => 'Itaewon K-Boba', 'kode_mitra' => 'UM03']);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();
        $this->assertSame('UM03', $tujuan->fresh()->kode_mitra);
        $this->assertDatabaseMissing('master_mitra', ['id' => $hapus->id]);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $this->berkasCadangan(), '--apply' => true])->assertSuccessful();
        $this->assertNull($tujuan->fresh()->kode_mitra);
        $this->assertSame('UM03', MasterMitra::find($hapus->id)->kode_mitra);
    }

    public function test_rollback_tanpa_apply_hanya_pratinjau_dan_tidak_mengubah_apa_pun(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'Universitas Internasional Batam', 'kode_mitra' => 'UN11']);
        $hapus = $this->mitra(['nama_mitra' => 'Perpustakaan UIB', 'kode_mitra' => 'P10']);
        $dok = $this->dokumenUntukMitra($hapus->id, 'D-1');
        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();
        $berkas = $this->berkasCadangan();
        $jumlahCadangan = count(glob(storage_path('app/cadangan-pulihkan-mitra-*.json')) ?: []);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $berkas])->assertSuccessful();

        $this->assertDatabaseMissing('master_mitra', ['id' => $hapus->id]);
        $this->assertSame($tujuan->id, $dok->fresh()->mitra_id);
        $this->assertCount($jumlahCadangan, glob(storage_path('app/cadangan-pulihkan-mitra-*.json')) ?: []);
    }

    public function test_pemulihan_sebagian_hanya_mengembalikan_mitra_yang_dipilih(): void
    {
        $induk = $this->mitra(['nama_mitra' => 'Universitas Internasional Batam', 'kode_mitra' => 'UN11']);
        $perpus = $this->mitra(['nama_mitra' => 'Perpustakaan UIB', 'kode_mitra' => 'P10', 'kategori_mitra' => 'Perguruan Tinggi']);
        $lain = $this->mitra(['nama_mitra' => 'PT Cicor Panatec']);
        $dupLain = $this->mitra(['nama_mitra' => 'PT. Cicor', 'kode_mitra' => 'ZZ9']);
        $dokPerpus = $this->dokumenUntukMitra($perpus->id, 'D-1');
        $pengPerpus = $this->pengajuanUntukMitra($perpus->id, 'P-1');
        $dokLain = $this->dokumenUntukMitra($dupLain->id, 'D-2');

        $this->artisan('sikerma:gabung-mitra-ganda', [
            '--pasangan' => "{$perpus->id}:{$induk->id},{$dupLain->id}:{$lain->id}", '--apply' => true,
        ])->assertSuccessful();
        $this->assertSame('ZZ9', $lain->fresh()->kode_mitra, 'kode PT. Cicor ikut tersalin ke tujuannya');

        $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $this->berkasCadangan(), '--hanya' => (string) $perpus->id, '--apply' => true])->assertSuccessful();

        // Yang dipilih kembali seperti semula...
        $hidup = MasterMitra::find($perpus->id);
        $this->assertNotNull($hidup);
        $this->assertSame('P10', $hidup->kode_mitra);
        $this->assertSame($perpus->id, $dokPerpus->fresh()->mitra_id);
        $this->assertSame($perpus->id, $pengPerpus->fresh()->mitra_id);
        $this->assertSame('UN11', $induk->fresh()->kode_mitra, 'induk yang tidak diisi apa pun tetap utuh');
        // ...sedangkan pasangan lain di berkas yang sama TIDAK disentuh.
        $this->assertDatabaseMissing('master_mitra', ['id' => $dupLain->id]);
        $this->assertSame($lain->id, $dokLain->fresh()->mitra_id);
        $this->assertSame('ZZ9', $lain->fresh()->kode_mitra);
        $this->assertNotEmpty(glob(storage_path('app/cadangan-pulihkan-mitra-*.json')));
    }

    public function test_pemulihan_sebagian_mengembalikan_kolom_induk_yang_diisi_dari_mitra_itu_saja(): void
    {
        $induk = $this->mitra(['nama_mitra' => 'Itaewon K-Boba Utama']);
        $a = $this->mitra(['nama_mitra' => 'Itaewon K-Boba', 'kode_mitra' => 'UM03']);
        $b = $this->mitra(['nama_mitra' => 'ITAEWON-K', 'website' => 'itaewon.id']);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$a->id}:{$induk->id},{$b->id}:{$induk->id}", '--apply' => true])->assertSuccessful();
        $induk = $induk->fresh();
        $this->assertSame('UM03', $induk->kode_mitra);
        $this->assertSame('itaewon.id', $induk->website);

        // Pulihkan hanya $b: kolom yang berasal dari $a (kode UM03) tidak boleh ikut dikembalikan.
        $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $this->berkasCadangan(), '--hanya' => (string) $b->id, '--apply' => true])->assertSuccessful();

        $induk = $induk->fresh();
        $this->assertSame('UM03', $induk->kode_mitra);
        $this->assertNull($induk->website, 'website berasal dari mitra yang dipulihkan, jadi dikembalikan ke kosong');
        $this->assertNotNull(MasterMitra::find($b->id));
        $this->assertNull(MasterMitra::find($a->id));
    }

    public function test_pemulihan_sebagian_menolak_id_yang_tidak_ada_di_cadangan(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'Tujuan']);
        $hapus = $this->mitra(['nama_mitra' => 'Dihapus']);
        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();

        $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $this->berkasCadangan(), '--hanya' => '999999', '--apply' => true])->assertFailed();
        $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $this->berkasCadangan(), '--hanya' => 'abc', '--apply' => true])->assertFailed();

        $this->assertDatabaseMissing('master_mitra', ['id' => $hapus->id]);
    }

    public function test_pemulihan_dibatalkan_bila_kode_mitra_yang_dihidupkan_bentrok(): void
    {
        $tujuan = $this->mitra(['nama_mitra' => 'Tujuan']);
        $hapus = $this->mitra(['nama_mitra' => 'Dihapus', 'kode_mitra' => 'AB1']);
        $this->artisan('sikerma:gabung-mitra-ganda', ['--pasangan' => "{$hapus->id}:{$tujuan->id}", '--apply' => true])->assertSuccessful();
        // Setelah digabung, kode AB1 sudah ada di tujuan; admin lalu memberikan AB1 ke mitra lain.
        $tujuan->forceFill(['kode_mitra' => null])->save();
        $this->mitra(['nama_mitra' => 'Pemegang Baru', 'kode_mitra' => 'AB1']);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $this->berkasCadangan(), '--hanya' => (string) $hapus->id, '--apply' => true])->assertFailed();

        $this->assertDatabaseMissing('master_mitra', ['id' => $hapus->id]);
    }

    public function test_rollback_menolak_berkas_yang_bukan_cadangan_atau_versi_lama(): void
    {
        $asing = storage_path('app/cadangan-gabung-mitra-asing.json');
        $lama = storage_path('app/cadangan-gabung-mitra-versi-lama.json');
        file_put_contents($asing, json_encode(['perintah' => 'lain']));
        file_put_contents($lama, json_encode(['perintah' => 'sikerma:gabung-mitra-ganda', 'mitra_dihapus' => []]));

        try {
            $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $asing])->assertFailed();
            $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => $lama])->assertFailed();
            $this->artisan('sikerma:gabung-mitra-ganda', ['--rollback' => storage_path('app/tidak-ada.json')])->assertFailed();
        } finally {
            @unlink($asing);
            @unlink($lama);
        }
    }
}
