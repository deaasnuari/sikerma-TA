<?php

namespace Tests\Feature;

use App\Models\MasterMitra;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MasterMitraTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function internal(): User
    {
        return User::factory()->create(['role' => 'internal']);
    }

    private function buatMitra(array $override = []): MasterMitra
    {
        return MasterMitra::create(array_merge([
            'nama_mitra'    => 'PT Maju Bersama',
            'kategori_mitra' => 'Industri',
            'negara'        => 'Indonesia',
            'aktif'         => true,
        ], $override));
    }

    private function dataMitra(array $override = []): array
    {
        return array_merge([
            'nama_mitra'    => 'PT Teknologi Nusantara',
            'kategori_mitra' => 'Industri',
            'negara'        => 'Indonesia',
            'aktif'         => true,
        ], $override);
    }

    // ------------------------------------------------------------------
    // index
    // ------------------------------------------------------------------

    public function test_daftar_mitra_berhasil(): void
    {
        $admin = $this->admin();
        $this->buatMitra(['nama_mitra' => 'PT Alpha']);
        $this->buatMitra(['nama_mitra' => 'PT Beta']);

        $response = $this->actingAs($admin)->getJson('/api/master/mitra');

        $response->assertOk()->assertJsonPath('success', true)->assertJsonCount(2, 'data');
    }

    public function test_filter_mitra_by_kategori(): void
    {
        $admin = $this->admin();
        $this->buatMitra(['nama_mitra' => 'PT Alpha', 'kategori_mitra' => 'Industri']);
        $this->buatMitra(['nama_mitra' => 'Universitas X', 'kategori_mitra' => 'Perguruan Tinggi']);

        $response = $this->actingAs($admin)->getJson('/api/master/mitra?kategori_mitra=Industri');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals('PT Alpha', $response->json('data.0.nama_mitra'));
    }

    public function test_filter_mitra_by_negara(): void
    {
        $admin = $this->admin();
        $this->buatMitra(['nama_mitra' => 'PT Lokal', 'negara' => 'Indonesia']);
        $this->buatMitra(['nama_mitra' => 'Global Inc', 'negara' => 'USA']);

        $response = $this->actingAs($admin)->getJson('/api/master/mitra?negara=Indonesia');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals('PT Lokal', $response->json('data.0.nama_mitra'));
    }

    public function test_cari_mitra_berhasil(): void
    {
        $admin = $this->admin();
        $this->buatMitra(['nama_mitra' => 'PT Maju Jaya']);
        $this->buatMitra(['nama_mitra' => 'CV Sejahtera']);

        $response = $this->actingAs($admin)->getJson('/api/master/mitra?search=maju');

        $response->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_filter_mitra_aktif(): void
    {
        $admin = $this->admin();
        $this->buatMitra(['nama_mitra' => 'PT Aktif', 'aktif' => true]);
        $this->buatMitra(['nama_mitra' => 'PT Nonaktif', 'aktif' => false]);

        $response = $this->actingAs($admin)->getJson('/api/master/mitra?aktif=1');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals('PT Aktif', $response->json('data.0.nama_mitra'));
    }

    // ------------------------------------------------------------------
    // store
    // ------------------------------------------------------------------

    public function test_admin_dapat_buat_mitra(): void
    {
        $admin = $this->admin();

        $response = $this->actingAs($admin)->postJson('/api/master/mitra', $this->dataMitra());

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.nama_mitra', 'PT Teknologi Nusantara');

        $this->assertDatabaseHas('master_mitra', ['nama_mitra' => 'PT Teknologi Nusantara']);
    }

    public function test_buat_mitra_dengan_data_lengkap(): void
    {
        $admin = $this->admin();

        $payload = $this->dataMitra([
            'website'              => 'https://example.com',
            'alamat'               => 'Jl. Sudirman No. 1',
            'email_mitra'          => 'info@example.com',
            'whatsapp_mitra'        => '0811111111',
            'nama_kontak_utama'    => 'Budi',
            'jabatan_kontak_utama' => 'Direktur',
            'email_kontak_utama'   => 'budi@example.com',
            'telepon_kontak_utama' => '0822222222',
        ]);

        $response = $this->actingAs($admin)->postJson('/api/master/mitra', $payload);

        $response->assertCreated()->assertJsonPath('data.nama_kontak_utama', 'Budi');
    }

    public function test_buat_mitra_dengan_no_telepon_terpisah_dari_whatsapp(): void
    {
        $admin = $this->admin();

        $payload = $this->dataMitra([
            'whatsapp_mitra'    => '081211112222', // WhatsApp
            'no_telepon_mitra' => '0778469858',   // No. Telepon kantor
        ]);

        $response = $this->actingAs($admin)->postJson('/api/master/mitra', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.whatsapp_mitra', '081211112222')
            ->assertJsonPath('data.no_telepon_mitra', '0778469858');

        $this->assertDatabaseHas('master_mitra', [
            'nama_mitra'       => 'PT Teknologi Nusantara',
            'whatsapp_mitra'    => '081211112222',
            'no_telepon_mitra' => '0778469858',
        ]);
    }

    public function test_buat_mitra_gagal_tanpa_nama(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/master/mitra', ['kategori_mitra' => 'Industri'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['nama_mitra']);
    }

    public function test_buat_mitra_gagal_email_tidak_valid(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/master/mitra', $this->dataMitra([
            'email_mitra' => 'bukan-email',
        ]))->assertUnprocessable()->assertJsonValidationErrors(['email_mitra']);
    }

    public function test_buat_mitra_ditolak_bukan_admin(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->postJson('/api/master/mitra', $this->dataMitra())
            ->assertForbidden();
    }

    // ------------------------------------------------------------------
    // show
    // ------------------------------------------------------------------

    public function test_tampil_mitra_berhasil(): void
    {
        $admin = $this->admin();
        $mitra = $this->buatMitra(['nama_mitra' => 'PT Tampilin']);

        $this->actingAs($admin)->getJson("/api/master/mitra/{$mitra->id}")
            ->assertOk()->assertJsonPath('data.nama_mitra', 'PT Tampilin');
    }

    // ------------------------------------------------------------------
    // update
    // ------------------------------------------------------------------

    public function test_admin_dapat_update_mitra(): void
    {
        $admin = $this->admin();
        $mitra = $this->buatMitra(['nama_mitra' => 'PT Lama']);

        $response = $this->actingAs($admin)->putJson("/api/master/mitra/{$mitra->id}", [
            'nama_mitra' => 'PT Baru',
        ]);

        $response->assertOk()->assertJsonPath('data.nama_mitra', 'PT Baru');
        $this->assertDatabaseHas('master_mitra', ['nama_mitra' => 'PT Baru']);
    }

    public function test_update_mitra_ditolak_bukan_admin(): void
    {
        $user  = $this->internal();
        $mitra = $this->buatMitra();

        $this->actingAs($user)->putJson("/api/master/mitra/{$mitra->id}", ['nama_mitra' => 'PT Baru'])
            ->assertForbidden();
    }

    // ------------------------------------------------------------------
    // destroy
    // ------------------------------------------------------------------

    public function test_admin_dapat_hapus_mitra(): void
    {
        $admin = $this->admin();
        $mitra = $this->buatMitra(['nama_mitra' => 'PT Hapus']);

        $this->actingAs($admin)->deleteJson("/api/master/mitra/{$mitra->id}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('master_mitra', ['id' => $mitra->id]);
    }

    public function test_hapus_mitra_ditolak_bukan_admin(): void
    {
        $user  = $this->internal();
        $mitra = $this->buatMitra();

        $this->actingAs($user)->deleteJson("/api/master/mitra/{$mitra->id}")
            ->assertForbidden();
    }

    public function test_admin_dapat_ubah_tambah_dan_hapus_kontak_tambahan(): void
    {
        $mitra = $this->buatMitra();
        $diubah = $mitra->kontak()->create(['nama' => 'Budi', 'email' => 'budi@x.id']);
        $dihapus = $mitra->kontak()->create(['nama' => 'Citra', 'email' => 'citra@x.id']);
        $mitraLain = $this->buatMitra(['nama_mitra' => 'CV Lain']);
        $milikLain = $mitraLain->kontak()->create(['nama' => 'Dodi']);

        $this->actingAs($this->admin())->putJson("/api/master/mitra/{$mitra->id}", [
            'kontak' => [
                ['id' => $diubah->id, 'nama' => 'Budi Santoso', 'jabatan' => 'HRD', 'email' => 'BUDI@x.id', 'telepon' => '0811'],
                ['nama' => 'Eka', 'email' => 'eka@x.id'],
                // id milik mitra lain tidak boleh ikut terubah; diperlakukan sebagai kontak baru.
                ['id' => $milikLain->id, 'nama' => 'Fani'],
            ],
        ])->assertOk()->assertJsonCount(3, 'data.kontak');

        $this->assertDatabaseHas('kontak_mitra', ['id' => $diubah->id, 'nama' => 'Budi Santoso', 'jabatan' => 'HRD', 'email' => 'budi@x.id']);
        $this->assertDatabaseMissing('kontak_mitra', ['id' => $dihapus->id]);
        $this->assertDatabaseHas('kontak_mitra', ['mitra_id' => $mitra->id, 'nama' => 'Eka']);
        $this->assertDatabaseHas('kontak_mitra', ['id' => $milikLain->id, 'mitra_id' => $mitraLain->id, 'nama' => 'Dodi']);
        $this->assertDatabaseHas('kontak_mitra', ['mitra_id' => $mitra->id, 'nama' => 'Fani']);
    }

    public function test_update_tanpa_field_kontak_tidak_mengubah_kontak_tambahan(): void
    {
        $mitra = $this->buatMitra();
        $mitra->kontak()->create(['nama' => 'Budi']);

        $this->actingAs($this->admin())->putJson("/api/master/mitra/{$mitra->id}", ['negara' => 'Jepang'])->assertOk();

        $this->assertSame(1, $mitra->kontak()->count());
    }

    public function test_kontak_tambahan_wajib_punya_nama(): void
    {
        $mitra = $this->buatMitra();

        $this->actingAs($this->admin())->putJson("/api/master/mitra/{$mitra->id}", [
            'kontak' => [['nama' => '', 'email' => 'x@x.id']],
        ])->assertUnprocessable()->assertJsonValidationErrors('kontak.0.nama');
    }

    public function test_tambah_mitra_ditolak_kalau_namanya_sama_dengan_yang_sudah_ada(): void
    {
        $admin = $this->admin();
        $ada = $this->buatMitra(['nama_mitra' => 'PT Bank Mandiri (Persero) Tbk', 'kode_mitra' => 'BA03']);

        // Beda huruf besar/kecil, titik, dan badan usaha tetap dianggap sama.
        foreach (['PT. Bank Mandiri', 'bank mandiri', 'PT BANK MANDIRI (PERSERO) TBK'] as $nama) {
            $this->actingAs($admin)->postJson('/api/master/mitra', $this->dataMitra(['nama_mitra' => $nama]))
                ->assertStatus(422)
                ->assertJsonPath('errors.nama_mitra.0', 'Nama mitra sudah ada: PT Bank Mandiri (Persero) Tbk')
                ->assertJsonPath('data.mitra_id', $ada->id);
        }

        $this->assertSame(1, MasterMitra::count());
    }

    public function test_tambah_mitra_dengan_nama_berbeda_tetap_boleh(): void
    {
        $admin = $this->admin();
        $this->buatMitra(['nama_mitra' => 'SMK Negeri 1 Batam']);

        // Nomor berbeda = sekolah lain.
        $this->actingAs($admin)->postJson('/api/master/mitra', $this->dataMitra(['nama_mitra' => 'SMK Negeri 3 Batam']))
            ->assertCreated();
    }

    public function test_ubah_nama_mitra_jadi_sama_dengan_mitra_lain_ditolak_tapi_edit_lain_boleh(): void
    {
        $admin = $this->admin();
        $a = $this->buatMitra(['nama_mitra' => 'PT Alpha Jaya']);
        $b = $this->buatMitra(['nama_mitra' => 'PT Beta Sentosa']);

        $this->actingAs($admin)->putJson("/api/master/mitra/{$b->id}", ['nama_mitra' => 'pt. alpha jaya'])
            ->assertStatus(422);
        $this->assertSame('PT Beta Sentosa', $b->fresh()->nama_mitra);

        // Menyimpan ulang dengan nama sendiri / mengubah kolom lain tidak diblokir.
        $this->actingAs($admin)->putJson("/api/master/mitra/{$b->id}", ['nama_mitra' => 'PT Beta Sentosa', 'negara' => 'Malaysia'])
            ->assertOk();
        $this->actingAs($admin)->putJson("/api/master/mitra/{$a->id}", ['negara' => 'Singapura'])
            ->assertOk();
    }

    public function test_cek_nama_memberi_tahu_mitra_yang_sudah_ada(): void
    {
        $admin = $this->admin();
        $ada = $this->buatMitra(['nama_mitra' => 'PT Bank Mandiri (Persero) Tbk', 'kode_mitra' => 'BA03']);

        $this->actingAs($admin)->getJson('/api/master/mitra/cek-nama?nama=' . urlencode('PT. Bank Mandiri'))
            ->assertOk()
            ->assertJsonPath('data.ada', true)
            ->assertJsonPath('data.mitra.id', $ada->id)
            ->assertJsonPath('data.mitra.kode_mitra', 'BA03');

        $this->actingAs($admin)->getJson('/api/master/mitra/cek-nama?nama=' . urlencode('PT Lain Sekali'))
            ->assertOk()->assertJsonPath('data.ada', false);

        // Mitra yang sedang diedit tidak dihitung bentrok dengan dirinya sendiri.
        $this->actingAs($admin)->getJson("/api/master/mitra/cek-nama?nama=" . urlencode('PT Bank Mandiri') . "&except_id={$ada->id}")
            ->assertOk()->assertJsonPath('data.ada', false);
    }

    public function test_cek_nama_hanya_untuk_admin(): void
    {
        $this->actingAs($this->internal())->getJson('/api/master/mitra/cek-nama?nama=PT+Apa')->assertForbidden();
    }

    public function test_cek_nama_memberi_peringatan_mirip_tanpa_memblokir_penyimpanan(): void
    {
        $admin = $this->admin();
        $ada = $this->buatMitra(['nama_mitra' => 'PT Samsung Electronics Batam']);

        $this->actingAs($admin)->getJson('/api/master/mitra/cek-nama?nama=Samsung')
            ->assertOk()
            ->assertJsonPath('data.ada', false)
            ->assertJsonPath('data.mirip.0.id', $ada->id);

        // Mirip hanya peringatan: server tetap mau menyimpan.
        $this->actingAs($admin)->postJson('/api/master/mitra', $this->dataMitra(['nama_mitra' => 'Samsung']))
            ->assertCreated();
    }

    public function test_cari_menemukan_mitra_walau_nama_belum_lengkap_atau_salah_ketik(): void
    {
        $admin = $this->admin();
        $ada = $this->buatMitra(['nama_mitra' => 'PT Infineon Technologies Batam', 'kode_mitra' => 'PTI01']);
        $this->buatMitra(['nama_mitra' => 'Universitas Jambi']);

        foreach (['infi', 'Infineon', 'infineon batam', 'infinion', 'technologies infineon'] as $ketikan) {
            $res = $this->actingAs($admin)->getJson('/api/master/mitra/cari?q=' . urlencode($ketikan))->assertOk();
            $this->assertSame($ada->id, $res->json('data.0.id'), "tidak ditemukan untuk ketikan: {$ketikan}");
            $this->assertSame('PTI01', $res->json('data.0.kode_mitra'));
        }

        // Yang tidak berkaitan tidak ikut muncul.
        $res = $this->actingAs($admin)->getJson('/api/master/mitra/cari?q=' . urlencode('infineon'))->assertOk();
        $this->assertSame(1, $res->json('total'));

        $this->actingAs($admin)->getJson('/api/master/mitra/cari?q=' . urlencode('zzzzzz'))
            ->assertOk()->assertJsonPath('total', 0);
    }

    public function test_cari_hanya_untuk_admin(): void
    {
        $this->actingAs($this->internal())->getJson('/api/master/mitra/cari?q=infineon')->assertForbidden();
    }
}

