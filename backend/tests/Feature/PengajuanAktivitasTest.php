<?php

namespace Tests\Feature;

use App\Models\Pengajuan;
use App\Models\PengajuanAktivitas;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PengajuanAktivitasTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role = 'internal'): User
    {
        return User::factory()->create(['role' => $role]);
    }

    /**
     * @param int|null $ownerId  user_pengusul_id pemilik pengajuan (null = tanpa pemilik)
     * @param int[] $distribusiUserIds  daftar user id yang di-CC admin
     */
    private function buatPengajuan(?int $ownerId = null, array $distribusiUserIds = []): Pengajuan
    {
        $pengajuan = Pengajuan::create([
            'nama_pengusul'    => 'Dr. Test',
            'judul_pengajuan'  => 'Kerja Sama Test',
            'jenis_dokumen'    => 'MOU',
            'status_pengajuan' => 'menunggu',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $ownerId,
        ]);

        if ($distribusiUserIds !== []) {
            // distribusi_user_ids sengaja tidak masuk $fillable model, jadi di-set langsung.
            $pengajuan->forceFill(['distribusi_user_ids' => $distribusiUserIds])->save();
        }

        return $pengajuan;
    }

    private function dataAktivitas(int $pengajuanId, array $override = []): array
    {
        return array_merge([
            'pengajuan_id'    => $pengajuanId,
            'judul'           => 'Workshop Kolaborasi',
            'jenis_aktivitas' => 'Workshop',
            'tanggal'         => '2026-07-01',
            'status'          => 'direncanakan',
        ], $override);
    }

    // ------------------------------------------------------------------
    // index
    // ------------------------------------------------------------------

    public function test_daftar_aktivitas_berhasil(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);

        PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id, ['judul' => 'Aktivitas 1']));
        PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id, ['judul' => 'Aktivitas 2']));

        $response = $this->actingAs($user)->getJson('/api/pengajuan-aktivitas');

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertCount(2, $response->json('data'));
    }

    public function test_filter_aktivitas_by_pengajuan_id(): void
    {
        $user       = $this->user();
        $pengajuan1 = $this->buatPengajuan(ownerId: $user->id);
        $pengajuan2 = $this->buatPengajuan(ownerId: $user->id);

        PengajuanAktivitas::create($this->dataAktivitas($pengajuan1->id, ['judul' => 'Akt P1']));
        PengajuanAktivitas::create($this->dataAktivitas($pengajuan2->id, ['judul' => 'Akt P2']));

        $response = $this->actingAs($user)->getJson("/api/pengajuan-aktivitas?pengajuan_id={$pengajuan1->id}");

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals('Akt P1', $response->json('data.0.judul'));
    }

    public function test_daftar_aktivitas_tanpa_auth_ditolak(): void
    {
        $this->getJson('/api/pengajuan-aktivitas')->assertUnauthorized();
    }

    public function test_daftar_aktivitas_tidak_termasuk_punya_user_lain(): void
    {
        $user      = $this->user();
        $userLain  = $this->user();
        $pengajuanSendiri = $this->buatPengajuan(ownerId: $user->id);
        $pengajuanOrang   = $this->buatPengajuan(ownerId: $userLain->id);

        PengajuanAktivitas::create($this->dataAktivitas($pengajuanSendiri->id, ['judul' => 'Punya Sendiri']));
        PengajuanAktivitas::create($this->dataAktivitas($pengajuanOrang->id, ['judul' => 'Punya Orang Lain']));

        $response = $this->actingAs($user)->getJson('/api/pengajuan-aktivitas');

        $response->assertOk();
        $judulList = collect($response->json('data'))->pluck('judul');
        $this->assertContains('Punya Sendiri', $judulList);
        $this->assertNotContains('Punya Orang Lain', $judulList);
    }

    public function test_daftar_aktivitas_terlihat_untuk_user_yang_di_cc(): void
    {
        $pemilik = $this->user();
        $userCc  = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $pemilik->id, distribusiUserIds: [$userCc->id]);

        PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id, ['judul' => 'Aktivitas CC']));

        $response = $this->actingAs($userCc)->getJson('/api/pengajuan-aktivitas');

        $response->assertOk();
        $this->assertContains('Aktivitas CC', collect($response->json('data'))->pluck('judul'));
    }

    public function test_admin_bisa_lihat_semua_aktivitas(): void
    {
        $admin    = $this->user('admin');
        $userLain = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $userLain->id);

        PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id, ['judul' => 'Aktivitas Siapapun']));

        $response = $this->actingAs($admin)->getJson('/api/pengajuan-aktivitas');

        $response->assertOk();
        $this->assertContains('Aktivitas Siapapun', collect($response->json('data'))->pluck('judul'));
    }

    // ------------------------------------------------------------------
    // store
    // ------------------------------------------------------------------

    public function test_buat_aktivitas_berhasil(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);

        $response = $this->actingAs($user)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas($pengajuan->id));

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.judul', 'Workshop Kolaborasi');

        $this->assertDatabaseHas('pengajuan_aktivitas', [
            'pengajuan_id' => $pengajuan->id,
            'judul'        => 'Workshop Kolaborasi',
        ]);
    }

    public function test_buat_aktivitas_dengan_semua_field(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);

        $response = $this->actingAs($user)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas($pengajuan->id, [
            'jumlah_peserta' => 50,
            'deskripsi'      => 'Workshop intensif selama dua hari',
            'pic_polibatam'  => 'Dr. Budi',
            'pic_mitra'      => 'John Doe',
            'status'         => 'berlangsung',
        ]));

        $response->assertCreated();
        $this->assertEquals(50, $response->json('data.jumlah_peserta'));
        $this->assertEquals('berlangsung', $response->json('data.status'));
    }

    public function test_buat_aktivitas_gagal_pengajuan_tidak_ditemukan(): void
    {
        $user = $this->user();

        $this->actingAs($user)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas(9999))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['pengajuan_id']);
    }

    public function test_buat_aktivitas_gagal_judul_kosong(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);

        $this->actingAs($user)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas($pengajuan->id, ['judul' => '']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['judul']);
    }

    public function test_buat_aktivitas_gagal_status_tidak_valid(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);

        $this->actingAs($user)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas($pengajuan->id, ['status' => 'batal']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);
    }

    public function test_buat_aktivitas_gagal_tanggal_tidak_valid(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);

        $this->actingAs($user)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas($pengajuan->id, ['tanggal' => 'bukan-tanggal']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['tanggal']);
    }

    public function test_buat_aktivitas_ditolak_untuk_bukan_pemilik(): void
    {
        $pemilik    = $this->user();
        $bukanPemilik = $this->user();
        $pengajuan  = $this->buatPengajuan(ownerId: $pemilik->id);

        $this->actingAs($bukanPemilik)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas($pengajuan->id))
            ->assertForbidden();

        $this->assertDatabaseMissing('pengajuan_aktivitas', ['pengajuan_id' => $pengajuan->id]);
    }

    public function test_buat_aktivitas_ditolak_untuk_user_yang_cuma_di_cc(): void
    {
        $pemilik = $this->user();
        $userCc  = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $pemilik->id, distribusiUserIds: [$userCc->id]);

        // User yang di-CC boleh LIHAT (dites di test_daftar_aktivitas_terlihat_untuk_user_yang_di_cc)
        // tapi tidak boleh menambah aktivitas.
        $this->actingAs($userCc)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas($pengajuan->id))
            ->assertForbidden();
    }

    public function test_admin_bisa_buat_aktivitas_untuk_pengajuan_siapapun(): void
    {
        $admin     = $this->user('admin');
        $userLain  = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $userLain->id);

        $this->actingAs($admin)->postJson('/api/pengajuan-aktivitas', $this->dataAktivitas($pengajuan->id))
            ->assertCreated();
    }

    // ------------------------------------------------------------------
    // update
    // ------------------------------------------------------------------

    public function test_update_aktivitas_berhasil(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);
        $aktivitas = PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id));

        $response = $this->actingAs($user)->putJson("/api/pengajuan-aktivitas/{$aktivitas->id}", $this->dataAktivitas($pengajuan->id, [
            'judul'  => 'Workshop Diperbarui',
            'status' => 'selesai',
        ]));

        $response->assertOk()
            ->assertJsonPath('data.judul', 'Workshop Diperbarui')
            ->assertJsonPath('data.status', 'selesai');
    }

    public function test_update_aktivitas_tanpa_auth_ditolak(): void
    {
        $pengajuan = $this->buatPengajuan();
        $aktivitas = PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id));

        $this->putJson("/api/pengajuan-aktivitas/{$aktivitas->id}", $this->dataAktivitas($pengajuan->id))
            ->assertUnauthorized();
    }

    public function test_update_aktivitas_ditolak_untuk_bukan_pemilik(): void
    {
        $pemilik      = $this->user();
        $bukanPemilik = $this->user();
        $pengajuan    = $this->buatPengajuan(ownerId: $pemilik->id);
        $aktivitas    = PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id));

        $this->actingAs($bukanPemilik)->putJson("/api/pengajuan-aktivitas/{$aktivitas->id}", $this->dataAktivitas($pengajuan->id, [
            'judul' => 'Coba Ubah Punya Orang',
        ]))->assertForbidden();

        $this->assertDatabaseHas('pengajuan_aktivitas', ['id' => $aktivitas->id, 'judul' => 'Workshop Kolaborasi']);
    }

    public function test_update_aktivitas_ditolak_untuk_user_yang_cuma_di_cc(): void
    {
        $pemilik = $this->user();
        $userCc  = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $pemilik->id, distribusiUserIds: [$userCc->id]);
        $aktivitas = PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id));

        $this->actingAs($userCc)->putJson("/api/pengajuan-aktivitas/{$aktivitas->id}", $this->dataAktivitas($pengajuan->id, [
            'judul' => 'Coba Ubah Walau Cuma CC',
        ]))->assertForbidden();
    }

    // ------------------------------------------------------------------
    // destroy
    // ------------------------------------------------------------------

    public function test_hapus_aktivitas_berhasil(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);
        $aktivitas = PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id));

        $this->actingAs($user)->deleteJson("/api/pengajuan-aktivitas/{$aktivitas->id}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('pengajuan_aktivitas', ['id' => $aktivitas->id]);
    }

    public function test_hapus_aktivitas_tidak_ditemukan(): void
    {
        $user = $this->user();

        $this->actingAs($user)->deleteJson('/api/pengajuan-aktivitas/9999')
            ->assertNotFound();
    }

    public function test_hapus_aktivitas_ditolak_untuk_bukan_pemilik(): void
    {
        $pemilik      = $this->user();
        $bukanPemilik = $this->user();
        $pengajuan    = $this->buatPengajuan(ownerId: $pemilik->id);
        $aktivitas    = PengajuanAktivitas::create($this->dataAktivitas($pengajuan->id));

        $this->actingAs($bukanPemilik)->deleteJson("/api/pengajuan-aktivitas/{$aktivitas->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('pengajuan_aktivitas', ['id' => $aktivitas->id]);
    }

    // ------------------------------------------------------------------
    // structural access (Ketua Jurusan/Ketua Prodi/Kepala Unit) — cerminan dari
    // test yang sama di PengajuanTest, supaya "Story & Aktivitas" (endpoint ini)
    // konsisten dengan Data Pengajuan.
    // ------------------------------------------------------------------

    private function mockCivitasStruktur(array $jurusan = [], array $prodi = [], array $unit = []): void
    {
        $this->mock(\App\Services\CivitasStructureService::class, function ($mock) use ($jurusan, $prodi, $unit) {
            $mock->shouldReceive('getJurusan')->andReturn($jurusan);
            $mock->shouldReceive('getProgramStudi')->andReturn($prodi);
            $mock->shouldReceive('getUnit')->andReturn($unit);
        });
    }

    public function test_kepala_unit_melihat_aktivitas_dari_pengajuan_dalam_unitnya(): void
    {
        $upaTik = \App\Models\MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA TIK', 'aktif' => true]);
        $unitLain = \App\Models\MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA Perpustakaan', 'aktif' => true]);

        $kepalaUnit = $this->user();
        $kepalaUnit->update(['name' => 'Agus Prasetyo']);
        $pemilikLain = $this->user();

        $this->mockCivitasStruktur(unit: [[
            'ID_UNIT' => '18', 'NAMA_UNIT' => 'UPA TIK', 'ID_KEPALA_UNIT' => '789', 'NAMA_KEPALA_UNIT' => 'Agus Prasetyo',
        ]]);

        $pengajuanDalamUnit = Pengajuan::create([
            'nama_pengusul' => 'Dr. Test', 'judul_pengajuan' => 'Dalam Unit', 'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'menunggu', 'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $upaTik->id,
        ]);
        $pengajuanUnitLain = Pengajuan::create([
            'nama_pengusul' => 'Dr. Test', 'judul_pengajuan' => 'Unit Lain', 'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'menunggu', 'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $unitLain->id,
        ]);

        $aktivitasDalamUnit = PengajuanAktivitas::create($this->dataAktivitas($pengajuanDalamUnit->id, ['judul' => 'Aktivitas Dalam Unit']));
        $aktivitasUnitLain = PengajuanAktivitas::create($this->dataAktivitas($pengajuanUnitLain->id, ['judul' => 'Aktivitas Unit Lain']));

        $response = $this->actingAs($kepalaUnit)->getJson('/api/pengajuan-aktivitas');
        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($aktivitasDalamUnit->id, $ids);
        $this->assertNotContains($aktivitasUnitLain->id, $ids);
    }
}
