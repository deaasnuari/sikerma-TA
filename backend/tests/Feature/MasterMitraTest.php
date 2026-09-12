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
}
