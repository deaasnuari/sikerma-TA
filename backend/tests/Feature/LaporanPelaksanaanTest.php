<?php

namespace Tests\Feature;

use App\Models\LaporanPelaksanaan;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LaporanPelaksanaanTest extends TestCase
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
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $ownerId,
        ]);

        if ($distribusiUserIds !== []) {
            $pengajuan->forceFill(['distribusi_user_ids' => $distribusiUserIds])->save();
        }

        return $pengajuan;
    }

    private function buatLaporan(int $pengajuanId, array $override = []): LaporanPelaksanaan
    {
        return LaporanPelaksanaan::create(array_merge([
            'pengajuan_id' => $pengajuanId,
            'judul_kerjasama' => 'Laporan Test',
            'kegiatan' => 'Kegiatan test',
            'status' => 'terkirim',
        ], $override));
    }

    // ------------------------------------------------------------------
    // index
    // ------------------------------------------------------------------

    public function test_daftar_laporan_tanpa_auth_ditolak(): void
    {
        $this->getJson('/api/laporan-pelaksanaan')->assertUnauthorized();
    }

    public function test_daftar_laporan_hanya_milik_sendiri(): void
    {
        $user     = $this->user();
        $userLain = $this->user();
        $pengajuanSendiri = $this->buatPengajuan(ownerId: $user->id);
        $pengajuanOrang   = $this->buatPengajuan(ownerId: $userLain->id);

        $this->buatLaporan($pengajuanSendiri->id, ['judul_kerjasama' => 'Punya Sendiri']);
        $this->buatLaporan($pengajuanOrang->id, ['judul_kerjasama' => 'Punya Orang Lain']);

        $response = $this->actingAs($user)->getJson(
            "/api/laporan-pelaksanaan?pengajuan_ids={$pengajuanSendiri->id},{$pengajuanOrang->id}"
        );

        $response->assertOk();
        $judulList = collect($response->json('data'))->pluck('judul_kerjasama');
        $this->assertContains('Punya Sendiri', $judulList);
        $this->assertNotContains('Punya Orang Lain', $judulList);
    }

    public function test_daftar_laporan_terlihat_untuk_user_yang_di_cc(): void
    {
        $pemilik = $this->user();
        $userCc  = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $pemilik->id, distribusiUserIds: [$userCc->id]);
        $this->buatLaporan($pengajuan->id, ['judul_kerjasama' => 'Laporan CC']);

        $response = $this->actingAs($userCc)->getJson("/api/laporan-pelaksanaan?pengajuan_ids={$pengajuan->id}");

        $response->assertOk();
        $this->assertContains('Laporan CC', collect($response->json('data'))->pluck('judul_kerjasama'));
    }

    public function test_daftar_laporan_tanpa_filter_dibatasi_ke_milik_sendiri(): void
    {
        $user     = $this->user();
        $userLain = $this->user();
        $pengajuanSendiri = $this->buatPengajuan(ownerId: $user->id);
        $pengajuanOrang   = $this->buatPengajuan(ownerId: $userLain->id);

        $this->buatLaporan($pengajuanSendiri->id, ['judul_kerjasama' => 'Punya Sendiri']);
        $this->buatLaporan($pengajuanOrang->id, ['judul_kerjasama' => 'Punya Orang Lain']);

        // Tanpa parameter pengajuan_ids sama sekali.
        $response = $this->actingAs($user)->getJson('/api/laporan-pelaksanaan');

        $response->assertOk();
        $judulList = collect($response->json('data'))->pluck('judul_kerjasama');
        $this->assertContains('Punya Sendiri', $judulList);
        $this->assertNotContains('Punya Orang Lain', $judulList);
    }

    public function test_admin_bisa_lihat_semua_laporan(): void
    {
        $admin    = $this->user('admin');
        $userLain = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $userLain->id);
        $this->buatLaporan($pengajuan->id, ['judul_kerjasama' => 'Laporan Siapapun']);

        $response = $this->actingAs($admin)->getJson('/api/laporan-pelaksanaan');

        $response->assertOk();
        $this->assertContains('Laporan Siapapun', collect($response->json('data'))->pluck('judul_kerjasama'));
    }

    private function buatDokumen(?int $dibuatOlehUserId = null): \App\Models\DokumenKerjasama
    {
        $unit = \App\Models\MasterUnitProdi::create([
            'jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'TI ' . fake()->unique()->numerify('##'), 'aktif' => true,
        ]);

        return \App\Models\DokumenKerjasama::create([
            'no_permohonan'       => 'PMH-' . fake()->unique()->numerify('#####'),
            'nomor_dokumen'       => 'DOK-' . fake()->unique()->numerify('###'),
            'nama_dokumen'        => 'Dok',
            'file'                => 'x.pdf',
            'status_siklus'       => 'active',
            'unit_prodi_id'       => $unit->id,
            'dibuat_oleh_user_id' => $dibuatOlehUserId,
        ]);
    }

    public function test_filter_dokumen_kerjasama_ids_bukan_admin_hanya_dokumen_yang_boleh_dilihat(): void
    {
        $user = $this->user();
        $dokumenOrangLain = $this->buatDokumen(dibuatOlehUserId: $this->user()->id);
        LaporanPelaksanaan::create(['dokumen_kerjasama_id' => $dokumenOrangLain->id, 'judul_kerjasama' => 'Rahasia', 'status' => 'terkirim']);

        $this->actingAs($user)->getJson('/api/laporan-pelaksanaan?dokumen_kerjasama_ids=' . $dokumenOrangLain->id)
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_pembuat_dokumen_bisa_kirim_dan_lihat_laporan_lewat_dokumen_kerjasama_id(): void
    {
        // Story & Aktivitas internal mengirim laporan dengan dokumen_kerjasama_id saja (tanpa pengajuan_id).
        $user = $this->user();
        $dokumen = $this->buatDokumen(dibuatOlehUserId: $user->id);

        $this->actingAs($user)->postJson('/api/laporan-pelaksanaan', [
            'dokumen_kerjasama_id' => $dokumen->id,
            'judul_kerjasama' => 'Laporan Dokumen',
            'kegiatan' => 'Kegiatan berjalan',
        ])->assertCreated();

        $this->actingAs($user)->getJson('/api/laporan-pelaksanaan?dokumen_kerjasama_ids=' . $dokumen->id)
            ->assertOk()
            ->assertJsonPath('data.0.judul_kerjasama', 'Laporan Dokumen');
    }

    public function test_kirim_laporan_ditolak_untuk_dokumen_di_sampah_admin(): void
    {
        $user = $this->user();
        $dokumen = $this->buatDokumen(dibuatOlehUserId: $user->id);
        $dokumen->forceFill(['dihapus_admin_pada' => now()])->save();

        $this->actingAs($user)->postJson('/api/laporan-pelaksanaan', [
            'dokumen_kerjasama_id' => $dokumen->id,
            'kegiatan' => 'Tidak akan terlihat admin',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Kerja sama ini sudah dihapus oleh admin, sehingga tidak bisa menerima data baru. Silakan hubungi admin kampus.');

        $this->assertDatabaseMissing('laporan_pelaksanaan', ['dokumen_kerjasama_id' => $dokumen->id]);
    }

    public function test_kirim_laporan_lewat_dokumen_kerjasama_id_ditolak_untuk_bukan_pemilik(): void
    {
        $dokumen = $this->buatDokumen(dibuatOlehUserId: $this->user()->id);

        $this->actingAs($this->user())->postJson('/api/laporan-pelaksanaan', [
            'dokumen_kerjasama_id' => $dokumen->id,
            'kegiatan' => 'Bukan punyaku',
        ])->assertForbidden();
    }

    // ------------------------------------------------------------------
    // store
    // ------------------------------------------------------------------

    public function test_kirim_laporan_tanpa_auth_ditolak(): void
    {
        $pengajuan = $this->buatPengajuan();

        $this->postJson('/api/laporan-pelaksanaan', ['pengajuan_id' => $pengajuan->id])
            ->assertUnauthorized();
    }

    public function test_kirim_laporan_berhasil_untuk_pemilik(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);

        $response = $this->actingAs($user)->postJson('/api/laporan-pelaksanaan', [
            'pengajuan_id' => $pengajuan->id,
            'judul_kerjasama' => 'Laporan Baru',
            'kegiatan' => 'Kegiatan berjalan lancar',
        ]);

        $response->assertCreated()->assertJsonPath('success', true);
        $this->assertDatabaseHas('laporan_pelaksanaan', [
            'pengajuan_id' => $pengajuan->id,
            'judul_kerjasama' => 'Laporan Baru',
        ]);
    }

    public function test_kirim_laporan_gagal_tanpa_pengajuan_atau_dokumen(): void
    {
        $user = $this->user();

        $this->actingAs($user)->postJson('/api/laporan-pelaksanaan', ['kegiatan' => 'Tanpa relasi apapun'])
            ->assertUnprocessable();
    }

    public function test_kirim_laporan_ditolak_untuk_bukan_pemilik(): void
    {
        $pemilik      = $this->user();
        $bukanPemilik = $this->user();
        $pengajuan    = $this->buatPengajuan(ownerId: $pemilik->id);

        $this->actingAs($bukanPemilik)->postJson('/api/laporan-pelaksanaan', [
            'pengajuan_id' => $pengajuan->id,
            'judul_kerjasama' => 'Laporan Palsu',
        ])->assertForbidden();

        $this->assertDatabaseMissing('laporan_pelaksanaan', ['judul_kerjasama' => 'Laporan Palsu']);
    }

    public function test_kirim_laporan_ditolak_untuk_user_yang_cuma_di_cc(): void
    {
        $pemilik = $this->user();
        $userCc  = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $pemilik->id, distribusiUserIds: [$userCc->id]);

        // CC boleh lihat (lihat test_daftar_laporan_terlihat_untuk_user_yang_di_cc) tapi tidak boleh kirim.
        $this->actingAs($userCc)->postJson('/api/laporan-pelaksanaan', [
            'pengajuan_id' => $pengajuan->id,
            'judul_kerjasama' => 'Laporan Dari CC',
        ])->assertForbidden();
    }

    public function test_admin_bisa_kirim_laporan_untuk_pengajuan_siapapun(): void
    {
        $admin     = $this->user('admin');
        $userLain  = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $userLain->id);

        $this->actingAs($admin)->postJson('/api/laporan-pelaksanaan', [
            'pengajuan_id' => $pengajuan->id,
            'judul_kerjasama' => 'Laporan Dari Admin',
        ])->assertCreated();
    }

    // ------------------------------------------------------------------
    // destroy (admin only)
    // ------------------------------------------------------------------

    public function test_hapus_laporan_ditolak_bukan_admin(): void
    {
        $user      = $this->user();
        $pengajuan = $this->buatPengajuan(ownerId: $user->id);
        $laporan   = $this->buatLaporan($pengajuan->id);

        $this->actingAs($user)->deleteJson("/api/laporan-pelaksanaan/{$laporan->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('laporan_pelaksanaan', ['id' => $laporan->id]);
    }

    public function test_hapus_laporan_berhasil_untuk_admin(): void
    {
        $admin     = $this->user('admin');
        $pengajuan = $this->buatPengajuan();
        $laporan   = $this->buatLaporan($pengajuan->id);

        $this->actingAs($admin)->deleteJson("/api/laporan-pelaksanaan/{$laporan->id}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('laporan_pelaksanaan', ['id' => $laporan->id]);
    }
}
