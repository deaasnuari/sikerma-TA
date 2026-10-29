<?php

namespace Tests\Feature;

use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MasterUnitProdiTest extends TestCase
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

    private function buatJurusan(string $nama = 'Teknik Informatika'): MasterUnitProdi
    {
        return MasterUnitProdi::create([
            'jenis_node'    => 'unit',
            'kategori_unit' => 'jurusan',
            'nama'          => $nama,
            'aktif'         => true,
        ]);
    }

    private function buatProdi(int $parentId, string $nama = 'D3 Teknik Informatika'): MasterUnitProdi
    {
        return MasterUnitProdi::create([
            'parent_id'  => $parentId,
            'jenis_node' => 'prodi',
            'nama'       => $nama,
            'aktif'      => true,
        ]);
    }

    private function buatUnitKerja(string $nama = 'P3M'): MasterUnitProdi
    {
        return MasterUnitProdi::create([
            'jenis_node'    => 'unit',
            'kategori_unit' => 'unit_kerja',
            'nama'          => $nama,
            'aktif'         => true,
        ]);
    }

    // ------------------------------------------------------------------
    // public endpoint (no auth)
    // ------------------------------------------------------------------

    public function test_public_units_bisa_diakses_tanpa_auth(): void
    {
        $this->buatJurusan('Teknik Informatika');
        $this->buatJurusan('Teknik Elektro');

        $response = $this->getJson('/api/public/unit-prodi');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data.jurusan');
    }

    public function test_public_units_hanya_yang_aktif(): void
    {
        $this->buatJurusan('Aktif');
        MasterUnitProdi::create([
            'jenis_node'    => 'unit',
            'kategori_unit' => 'jurusan',
            'nama'          => 'Nonaktif',
            'aktif'         => false,
        ]);

        $response = $this->getJson('/api/public/unit-prodi');

        $response->assertOk()->assertJsonCount(1, 'data.jurusan');
        $this->assertEquals('Aktif', $response->json('data.jurusan.0'));
    }

    public function test_public_units_dipisah_per_kategori(): void
    {
        $jurusan = $this->buatJurusan('Teknik Informatika');
        $this->buatProdi($jurusan->id, 'D3 Teknik Informatika');
        $this->buatUnitKerja('P3M');

        $response = $this->getJson('/api/public/unit-prodi');

        $response->assertOk();
        $this->assertEquals(['Teknik Informatika'], $response->json('data.jurusan'));
        $this->assertEquals(['D3 Teknik Informatika'], $response->json('data.prodi'));
        $this->assertEquals(['P3M'], $response->json('data.unit'));
    }

    // ------------------------------------------------------------------
    // tree
    // ------------------------------------------------------------------

    public function test_tree_menampilkan_hierarki(): void
    {
        $admin   = $this->admin();
        $jurusan = $this->buatJurusan('Teknik Informatika');
        $this->buatProdi($jurusan->id, 'D3 TI');

        $response = $this->actingAs($admin)->getJson('/api/master/unit-prodi/tree');

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertNotEmpty($response->json('data'));
    }

    public function test_tree_menyembunyikan_alias_tersembunyi(): void
    {
        $admin = $this->admin();
        MasterUnitProdi::create([
            'jenis_node'    => 'unit',
            'kategori_unit' => 'jurusan',
            'nama'          => 'EL',
            'aktif'         => true,
        ]);
        $this->buatJurusan('Teknik Sipil');

        $response = $this->actingAs($admin)->getJson('/api/master/unit-prodi/tree');

        $names = collect($response->json('data'))->pluck('nama');
        $this->assertFalse($names->contains('EL'));
        $this->assertTrue($names->contains('Teknik Sipil'));
    }

    // ------------------------------------------------------------------
    // index
    // ------------------------------------------------------------------

    public function test_daftar_unit_prodi_berhasil(): void
    {
        $admin = $this->admin();
        $this->buatJurusan('Teknik Informatika');
        $this->buatUnitKerja('P3M');

        $response = $this->actingAs($admin)->getJson('/api/master/unit-prodi');

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertGreaterThanOrEqual(2, count($response->json('data')));
    }

    public function test_filter_by_jenis_node(): void
    {
        $admin = $this->admin();
        $jurusan = $this->buatJurusan();
        $this->buatProdi($jurusan->id);

        $response = $this->actingAs($admin)->getJson('/api/master/unit-prodi?jenis_node=prodi');

        $response->assertOk();
        foreach ($response->json('data') as $item) {
            $this->assertEquals('prodi', $item['jenis_node']);
        }
    }

    // ------------------------------------------------------------------
    // store
    // ------------------------------------------------------------------

    public function test_admin_dapat_buat_unit_jurusan(): void
    {
        $admin = $this->admin();

        $response = $this->actingAs($admin)->postJson('/api/master/unit-prodi', [
            'jenis_node'    => 'unit',
            'kategori_unit' => 'jurusan',
            'nama'          => 'Teknik Sipil',
            'aktif'         => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.nama', 'Teknik Sipil');

        $this->assertDatabaseHas('master_unit_prodi', ['nama' => 'Teknik Sipil']);
    }

    public function test_admin_dapat_buat_prodi_dengan_parent(): void
    {
        $admin   = $this->admin();
        $jurusan = $this->buatJurusan('Teknik Mesin');

        $response = $this->actingAs($admin)->postJson('/api/master/unit-prodi', [
            'parent_id'  => $jurusan->id,
            'jenis_node' => 'prodi',
            'nama'       => 'D3 Teknik Mesin',
            'aktif'      => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.parent_id', $jurusan->id);
    }

    public function test_buat_unit_gagal_tanpa_nama(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/master/unit-prodi', ['jenis_node' => 'unit'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['nama']);
    }

    public function test_buat_unit_gagal_jenis_node_tidak_valid(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/master/unit-prodi', [
            'jenis_node' => 'departemen',
            'nama'       => 'Test',
        ])->assertUnprocessable()->assertJsonValidationErrors(['jenis_node']);
    }

    public function test_buat_unit_ditolak_bukan_admin(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->postJson('/api/master/unit-prodi', [
            'jenis_node' => 'unit',
            'nama'       => 'Unit Baru',
        ])->assertForbidden();
    }

    // ------------------------------------------------------------------
    // show
    // ------------------------------------------------------------------

    public function test_tampil_unit_berhasil(): void
    {
        $admin = $this->admin();
        $unit  = $this->buatJurusan('Teknik Kimia');

        $this->actingAs($admin)->getJson("/api/master/unit-prodi/{$unit->id}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseHas('master_unit_prodi', ['id' => $unit->id, 'nama' => 'Teknik Kimia']);
    }

    // ------------------------------------------------------------------
    // update
    // ------------------------------------------------------------------

    public function test_admin_dapat_update_unit(): void
    {
        $admin = $this->admin();
        $unit  = $this->buatJurusan('Teknik Lama');

        $response = $this->actingAs($admin)->putJson("/api/master/unit-prodi/{$unit->id}", [
            'nama' => 'Teknik Baru',
        ]);

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertDatabaseHas('master_unit_prodi', ['id' => $unit->id, 'nama' => 'Teknik Baru']);
    }

    public function test_admin_dapat_update_kode_dan_nama_prodi(): void
    {
        $admin   = $this->admin();
        $jurusan = $this->buatJurusan();
        $prodi   = $this->buatProdi($jurusan->id, 'D3 Lama');

        $this->actingAs($admin)->putJson("/api/master/unit-prodi/{$prodi->id}", [
            'kode' => 'XY',
            'nama' => 'D3 Baru',
        ])->assertOk()->assertJsonPath('data.id', $prodi->id);

        $this->assertDatabaseHas('master_unit_prodi', ['id' => $prodi->id, 'kode' => 'XY', 'nama' => 'D3 Baru']);
    }

    // ------------------------------------------------------------------
    // destroy
    // ------------------------------------------------------------------

    public function test_admin_dapat_hapus_prodi(): void
    {
        $admin   = $this->admin();
        $jurusan = $this->buatJurusan();
        $prodi   = $this->buatProdi($jurusan->id, 'D3 Hapus');

        $this->actingAs($admin)->deleteJson("/api/master/unit-prodi/{$prodi->id}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('master_unit_prodi', ['id' => $prodi->id]);
    }

    public function test_hapus_jurusan_juga_hapus_prodi_di_bawahnya(): void
    {
        $admin   = $this->admin();
        $jurusan = $this->buatJurusan('Jurusan Hapus');
        $prodi   = $this->buatProdi($jurusan->id, 'Prodi Di Bawah');

        $this->actingAs($admin)->deleteJson("/api/master/unit-prodi/{$jurusan->id}")
            ->assertOk();

        $this->assertDatabaseMissing('master_unit_prodi', ['id' => $jurusan->id]);
        $this->assertDatabaseMissing('master_unit_prodi', ['id' => $prodi->id]);
    }

    public function test_hapus_unit_kerja_gagal_jika_ada_anak(): void
    {
        $admin     = $this->admin();
        $unitKerja = $this->buatUnitKerja('Unit Dengan Anak');
        $this->buatProdi($unitKerja->id, 'Anak Unit');

        $this->actingAs($admin)->deleteJson("/api/master/unit-prodi/{$unitKerja->id}")
            ->assertStatus(422);
    }

    private function buatPengajuanDenganUnit(array $unitIds): Pengajuan
    {
        $pengajuan = Pengajuan::create([
            'nama_pengusul'     => 'Dr. Andi',
            'judul_pengajuan'   => 'Kerja Sama Penelitian',
            'jenis_dokumen'     => 'MOU',
            'status_pengajuan'  => 'menunggu',
            'ruang_lingkup_ids' => [],
        ]);
        $pengajuan->syncUnitProdi($unitIds);

        return $pengajuan;
    }

    public function test_hapus_prodi_ditolak_bila_dipakai_pengajuan(): void
    {
        $admin     = $this->admin();
        $jurusan   = $this->buatJurusan();
        $prodi     = $this->buatProdi($jurusan->id, 'D3 Dipakai Pengajuan');
        $prodiLain = $this->buatProdi($jurusan->id, 'D3 Lain');
        // Prodi bukan unit utama (urutan kedua) pun harus tetap menahan penghapusan.
        $this->buatPengajuanDenganUnit([$prodiLain->id, $prodi->id]);

        $this->actingAs($admin)->deleteJson("/api/master/unit-prodi/{$prodi->id}")
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Tidak bisa dihapus: masih dipakai 1 pengajuan. Atau pindahkan pengajuannya ke prodi/unit lain, atau nonaktifkan saja.']);

        $this->assertDatabaseHas('master_unit_prodi', ['id' => $prodi->id]);
    }

    public function test_hapus_jurusan_ditolak_bila_prodi_di_bawahnya_dipakai_pengajuan(): void
    {
        $admin   = $this->admin();
        $jurusan = $this->buatJurusan('Jurusan Dipakai');
        $prodi   = $this->buatProdi($jurusan->id, 'Prodi Dipakai');
        $this->buatPengajuanDenganUnit([$prodi->id]);

        $this->actingAs($admin)->deleteJson("/api/master/unit-prodi/{$jurusan->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('master_unit_prodi', ['id' => $jurusan->id]);
        $this->assertDatabaseHas('master_unit_prodi', ['id' => $prodi->id]);
    }

    public function test_hapus_prodi_boleh_bila_pengajuan_memakai_prodi_lain(): void
    {
        $admin     = $this->admin();
        $jurusan   = $this->buatJurusan();
        $prodi     = $this->buatProdi($jurusan->id, 'D3 Bebas');
        $prodiLain = $this->buatProdi($jurusan->id, 'D3 Dipakai');
        $this->buatPengajuanDenganUnit([$prodiLain->id]);

        $this->actingAs($admin)->deleteJson("/api/master/unit-prodi/{$prodi->id}")
            ->assertOk();

        $this->assertDatabaseMissing('master_unit_prodi', ['id' => $prodi->id]);
    }

    public function test_hapus_unit_ditolak_bukan_admin(): void
    {
        $user = $this->internal();
        $unit = $this->buatJurusan();

        $this->actingAs($user)->deleteJson("/api/master/unit-prodi/{$unit->id}")
            ->assertForbidden();
    }
}
