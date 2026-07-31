<?php

namespace Tests\Feature;

use App\Models\MasterMitra;
use App\Models\MasterRuangLingkup;
use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PengajuanTest extends TestCase
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

    private function dataPengajuan(array $override = []): array
    {
        return array_merge([
            'nama_pengusul'    => 'Dr. Budi Santoso',
            'jabatan_pengusul' => 'Dosen',
            'email_pengusul'   => 'budi@polibatam.ac.id',
            'judul_pengajuan'  => 'Kerja Sama Pendidikan dan Penelitian',
            'jenis_dokumen'    => 'MOU',
            'kategori_pengajuan' => 'eksternal',
            'nama_mitra'       => 'PT Teknologi Maju',
        ], $override);
    }

    private function buatPengajuan(array $override = []): Pengajuan
    {
        return Pengajuan::create(array_merge([
            'nama_pengusul'    => 'Dr. Andi',
            'judul_pengajuan'  => 'Kerja Sama Penelitian',
            'jenis_dokumen'    => 'MOU',
            'status_pengajuan' => 'menunggu',
            'ruang_lingkup_ids' => [],
        ], $override));
    }

    // ------------------------------------------------------------------
    // index
    // ------------------------------------------------------------------

    public function test_daftar_pengajuan_berhasil(): void
    {
        $user = $this->internal();
        $this->buatPengajuan(['user_pengusul_id' => $user->id]);
        $this->buatPengajuan(['judul_pengajuan' => 'Kerja Sama Lain', 'user_pengusul_id' => $user->id]);

        $response = $this->actingAs($user)->getJson('/api/pengajuan');

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertGreaterThanOrEqual(2, count($response->json('data.data')));
    }

    public function test_filter_pengajuan_by_status(): void
    {
        $user = $this->internal();
        $this->buatPengajuan(['status_pengajuan' => 'menunggu']);
        $this->buatPengajuan(['status_pengajuan' => 'diproses']);

        $response = $this->actingAs($user)->getJson('/api/pengajuan?status_pengajuan=menunggu');

        $response->assertOk();
        foreach ($response->json('data.data') as $item) {
            $this->assertEquals('menunggu', $item['status_pengajuan']);
        }
    }

    public function test_filter_pengajuan_by_jenis_dokumen(): void
    {
        $user = $this->internal();
        $this->buatPengajuan(['jenis_dokumen' => 'MOU']);
        $this->buatPengajuan(['jenis_dokumen' => 'MOA']);

        $response = $this->actingAs($user)->getJson('/api/pengajuan?jenis_dokumen=MOU');

        $response->assertOk();
        foreach ($response->json('data.data') as $item) {
            $this->assertEquals('MOU', $item['jenis_dokumen']);
        }
    }

    public function test_cari_pengajuan_berhasil(): void
    {
        $user = $this->internal();
        $this->buatPengajuan(['judul_pengajuan' => 'Kerja Sama Pendidikan', 'user_pengusul_id' => $user->id]);
        $this->buatPengajuan(['judul_pengajuan' => 'Proyek Riset Bersama', 'user_pengusul_id' => $user->id]);

        $response = $this->actingAs($user)->getJson('/api/pengajuan?search=pendidikan');

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, count($response->json('data.data')));
    }

    public function test_daftar_pengajuan_tanpa_auth_ditolak(): void
    {
        $this->getJson('/api/pengajuan')->assertUnauthorized();
    }

    // ------------------------------------------------------------------
    // store
    // ------------------------------------------------------------------

    public function test_buat_pengajuan_berhasil(): void
    {
        $user = $this->internal();

        $response = $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan());

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.judul_pengajuan', 'Kerja Sama Pendidikan dan Penelitian');

        $this->assertDatabaseHas('pengajuan_v2', [
            'judul_pengajuan' => 'Kerja Sama Pendidikan dan Penelitian',
        ]);
    }

    public function test_buat_pengajuan_auto_generate_nomor_pmh(): void
    {
        $user = $this->internal();

        $response = $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan());

        $response->assertCreated();
        $nomor = $response->json('data.nomor_pengajuan');
        $this->assertStringStartsWith('PMH-', $nomor);
    }

    public function test_buat_pengajuan_auto_set_tahapan_awal(): void
    {
        $user = $this->internal();

        $response = $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan());

        $response->assertCreated();
        $this->assertEquals('Pengajuan Awal', $response->json('data.tahapan_stage'));
        $this->assertEquals('todo', $response->json('data.tahapan_group'));
    }

    public function test_buat_pengajuan_dengan_ruang_lingkup(): void
    {
        $user = $this->internal();
        $rl   = MasterRuangLingkup::create(['nama_ruang_lingkup' => 'Pendidikan', 'aktif' => true]);

        $response = $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan([
            'ruang_lingkup_ids' => [$rl->id],
        ]));

        $response->assertCreated();
        $ids = $response->json('data.ruang_lingkup_ids');
        $this->assertContains($rl->id, $ids);
    }

    public function test_buat_pengajuan_gagal_nama_pengusul_kosong(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan(['nama_pengusul' => '']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['nama_pengusul']);
    }

    public function test_buat_pengajuan_gagal_judul_kosong(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan(['judul_pengajuan' => '']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['judul_pengajuan']);
    }

    public function test_buat_pengajuan_gagal_jenis_dokumen_tidak_valid(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan(['jenis_dokumen' => 'PERJANJIAN']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['jenis_dokumen']);
    }

    public function test_buat_pengajuan_dengan_mitra_id(): void
    {
        $user  = $this->internal();
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Test', 'aktif' => true]);

        $response = $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan([
            'mitra_id' => $mitra->id,
        ]));

        $response->assertCreated();
        $this->assertEquals($mitra->id, $response->json('data.mitra_id'));
    }

    public function test_buat_pengajuan_tanpa_auth_ditolak(): void
    {
        $this->postJson('/api/pengajuan', $this->dataPengajuan())->assertUnauthorized();
    }

    // ------------------------------------------------------------------
    // show
    // ------------------------------------------------------------------

    public function test_tampil_pengajuan_berhasil(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan(['judul_pengajuan' => 'Kolaborasi Industri']);

        $response = $this->actingAs($user)->getJson("/api/pengajuan/{$pengajuan->id}");

        $response->assertOk()->assertJsonPath('data.judul_pengajuan', 'Kolaborasi Industri');
    }

    public function test_tampil_pengajuan_tidak_ditemukan(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->getJson('/api/pengajuan/9999')->assertNotFound();
    }

    // ------------------------------------------------------------------
    // update (admin only)
    // ------------------------------------------------------------------

    public function test_admin_dapat_update_pengajuan(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();

        $response = $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Judul Diperbarui',
            'jenis_dokumen'   => 'MOA',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.judul_pengajuan', 'Judul Diperbarui');
    }

    public function test_admin_dapat_update_status_ke_diproses(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan(['status_pengajuan' => 'menunggu']);

        $response = $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'diproses',
        ]);

        $response->assertOk();
        $this->assertEquals('diproses', $pengajuan->fresh()->status_pengajuan);
    }

    public function test_admin_dapat_update_status_ke_ditolak(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan(['status_pengajuan' => 'diproses']);

        $response = $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'ditolak',
            'catatan'          => 'Dokumen tidak lengkap',
        ]);

        $response->assertOk();
        $this->assertEquals('ditolak', $pengajuan->fresh()->status_pengajuan);
    }

    public function test_admin_dapat_update_status_ke_revisi(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan(['status_pengajuan' => 'diproses']);

        $response = $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'revisi',
            'catatan_revisi'   => 'Harap lampirkan dokumen pendukung',
        ]);

        $response->assertOk();
        $this->assertEquals('revisi', $pengajuan->fresh()->status_pengajuan);
    }

    public function test_update_pengajuan_ditolak_bukan_admin(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan();

        $this->actingAs($user)->putJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Diubah',
        ])->assertForbidden();
    }

    // ------------------------------------------------------------------
    // updateTahapan
    // ------------------------------------------------------------------

    public function test_update_tahapan_berhasil(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan([
            'tahapan_stage'   => 'Pengajuan Awal',
            'tahapan_group'   => 'todo',
            'tahapan_riwayat' => [['stage' => 'Pengajuan Awal', 'group' => 'todo']],
        ]);

        $response = $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}/tahapan", [
            'stage' => 'Review Dokumen',
            'group' => 'in_progress',
        ]);

        $response->assertOk()->assertJsonPath('data.tahapan_stage', 'Review Dokumen');
    }

    public function test_update_tahapan_gagal_group_tidak_valid(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan();

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}/tahapan", [
            'stage' => 'Review',
            'group' => 'belum_dimulai',
        ])->assertUnprocessable()->assertJsonValidationErrors(['group']);
    }

    public function test_riwayat_tahapan_terakumulasi(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan([
            'tahapan_stage'   => 'Pengajuan Awal',
            'tahapan_group'   => 'todo',
            'tahapan_riwayat' => [['stage' => 'Pengajuan Awal', 'group' => 'todo']],
        ]);

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}/tahapan", [
            'stage' => 'Review',
            'group' => 'in_progress',
        ])->assertOk();

        $riwayat = $pengajuan->fresh()->tahapan_riwayat;
        $this->assertCount(2, $riwayat);
    }

    // ------------------------------------------------------------------
    // destroy (admin only)
    // ------------------------------------------------------------------

    public function test_admin_dapat_hapus_pengajuan(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();

        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('pengajuan_v2', ['id' => $pengajuan->id]);
    }

    public function test_hapus_pengajuan_ditolak_bukan_admin(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan();

        $this->actingAs($user)->deleteJson("/api/pengajuan/{$pengajuan->id}")
            ->assertForbidden();
    }
}
