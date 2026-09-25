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
}
