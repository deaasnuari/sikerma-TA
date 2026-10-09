<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
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

    public function test_daftar_pengajuan_internal_tidak_termasuk_punya_user_lain(): void
    {
        $user     = $this->internal();
        $userLain = $this->internal();
        $this->buatPengajuan(['judul_pengajuan' => 'Punya Sendiri', 'user_pengusul_id' => $user->id]);
        $this->buatPengajuan(['judul_pengajuan' => 'Punya Orang Lain', 'user_pengusul_id' => $userLain->id]);

        $response = $this->actingAs($user)->getJson('/api/pengajuan');

        $response->assertOk();
        $judulList = collect($response->json('data.data'))->pluck('judul_pengajuan');
        $this->assertContains('Punya Sendiri', $judulList);
        $this->assertNotContains('Punya Orang Lain', $judulList);
    }

    public function test_daftar_pengajuan_external_dibatasi_ke_milik_sendiri(): void
    {
        $user     = User::factory()->create(['role' => 'external']);
        $userLain = User::factory()->create(['role' => 'external']);
        $this->buatPengajuan([
            'judul_pengajuan' => 'Punya Mitra Sendiri',
            'user_pengusul_id' => $user->id,
            'kategori_pengajuan' => 'eksternal',
        ]);
        $this->buatPengajuan([
            'judul_pengajuan' => 'Punya Mitra Lain',
            'user_pengusul_id' => $userLain->id,
            'kategori_pengajuan' => 'eksternal',
        ]);

        $response = $this->actingAs($user)->getJson('/api/pengajuan');

        $response->assertOk();
        $judulList = collect($response->json('data.data'))->pluck('judul_pengajuan');
        $this->assertContains('Punya Mitra Sendiri', $judulList);
        $this->assertNotContains('Punya Mitra Lain', $judulList);
    }

    public function test_daftar_pengajuan_external_terlihat_untuk_user_yang_di_cc(): void
    {
        $pemilik = User::factory()->create(['role' => 'external']);
        $userCc  = User::factory()->create(['role' => 'external']);
        $pengajuan = $this->buatPengajuan([
            'judul_pengajuan' => 'Kerja Sama Di-CC',
            'user_pengusul_id' => $pemilik->id,
        ]);
        $pengajuan->forceFill(['distribusi_user_ids' => [$userCc->id]])->save();

        $response = $this->actingAs($userCc)->getJson('/api/pengajuan');

        $response->assertOk();
        $this->assertContains('Kerja Sama Di-CC', collect($response->json('data.data'))->pluck('judul_pengajuan'));
    }

    public function test_daftar_pengajuan_admin_tetap_lihat_semua(): void
    {
        $admin    = $this->admin();
        $internal = $this->internal();
        $external = User::factory()->create(['role' => 'external']);
        $this->buatPengajuan(['judul_pengajuan' => 'Punya Internal', 'user_pengusul_id' => $internal->id]);
        $this->buatPengajuan(['judul_pengajuan' => 'Punya External', 'user_pengusul_id' => $external->id]);

        $response = $this->actingAs($admin)->getJson('/api/pengajuan');

        $response->assertOk();
        $judulList = collect($response->json('data.data'))->pluck('judul_pengajuan');
        $this->assertContains('Punya Internal', $judulList);
        $this->assertContains('Punya External', $judulList);
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

    public function test_buat_pengajuan_dengan_no_telepon_mitra_tersimpan_dan_sinkron_ke_master_mitra(): void
    {
        $user = $this->internal();

        $response = $this->actingAs($user)->postJson('/api/pengajuan', $this->dataPengajuan([
            'whatsapp_mitra'    => '081298765432', // WhatsApp
            'no_telepon_mitra' => '0778469858',   // No. Telepon terpisah
        ]));

        $response->assertCreated()
            ->assertJsonPath('data.whatsapp_mitra', '081298765432')
            ->assertJsonPath('data.no_telepon_mitra', '0778469858');

        $this->assertDatabaseHas('pengajuan_v2', [
            'whatsapp_mitra'    => '081298765432',
            'no_telepon_mitra' => '0778469858',
        ]);

        $mitraId = $response->json('data.mitra_id');
        $this->assertNotNull($mitraId);
        $this->assertDatabaseHas('master_mitra', [
            'id'               => $mitraId,
            'no_telepon_mitra' => '0778469858',
        ]);
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
        $pengajuan = $this->buatPengajuan(['judul_pengajuan' => 'Kolaborasi Industri', 'user_pengusul_id' => $user->id]);

        $response = $this->actingAs($user)->getJson("/api/pengajuan/{$pengajuan->id}");

        $response->assertOk()->assertJsonPath('data.judul_pengajuan', 'Kolaborasi Industri');
    }

    public function test_tampil_pengajuan_internal_ditolak_bukan_pemilik(): void
    {
        // Sebelumnya endpoint ini tidak punya pengecekan kepemilikan sama sekali —
        // user internal mana pun bisa buka detail pengajuan siapa saja asal tahu ID-nya.
        // Ini memastikan celah itu sudah tertutup, konsisten dengan filter di index().
        $pemilik   = $this->internal();
        $penyusup  = $this->internal();
        $pengajuan = $this->buatPengajuan(['judul_pengajuan' => 'Punya Orang Lain', 'user_pengusul_id' => $pemilik->id]);

        $response = $this->actingAs($penyusup)->getJson("/api/pengajuan/{$pengajuan->id}");

        $response->assertStatus(404);
    }

    public function test_tampil_pengajuan_internal_boleh_lihat_yang_di_cc(): void
    {
        $pemilik = $this->internal();
        $dicc    = $this->internal();
        $pengajuan = $this->buatPengajuan([
            'judul_pengajuan' => 'Di-CC ke user lain',
            'user_pengusul_id' => $pemilik->id,
            'distribusi_user_ids' => [$dicc->id],
        ]);

        $response = $this->actingAs($dicc)->getJson("/api/pengajuan/{$pengajuan->id}");

        $response->assertOk();
    }

    public function test_tampil_pengajuan_admin_dan_pimpinan_tetap_bisa_lihat_semua(): void
    {
        $admin = $this->admin();
        $pimpinan = User::factory()->create(['role' => 'pimpinan']);
        $pemilik = $this->internal();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $pemilik->id]);

        $this->actingAs($admin)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
        $this->actingAs($pimpinan)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
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

    public function test_update_dengan_token_updated_at_terbaru_berhasil_dan_mengembalikan_token_baru(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();

        $response = $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", [
            'updated_at'      => $pengajuan->fresh()->updated_at->toISOString(),
            'judul_pengajuan' => 'Judul Admin A',
        ]);

        $response->assertOk()->assertJsonPath('data.judul_pengajuan', 'Judul Admin A');
        $this->assertNotNull($response->json('data.updated_at'));
    }

    public function test_update_dengan_token_kedaluwarsa_ditolak_409_dan_tidak_menimpa(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();

        // Kedua admin membuka form di waktu yang sama -> memegang token yang sama.
        $tokenAwal = $pengajuan->fresh()->updated_at->toISOString();

        // Waktu berjalan; admin A menyimpan lebih dulu.
        $this->travel(5)->seconds();
        $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", [
            'updated_at'      => $tokenAwal,
            'judul_pengajuan' => 'Judul Admin A',
        ])->assertOk();

        // Admin B masih memegang token lama.
        $this->travel(5)->seconds();
        $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", [
            'updated_at'      => $tokenAwal,
            'judul_pengajuan' => 'Judul Admin B',
        ])->assertStatus(409)->assertJsonPath('conflict', true);

        $this->assertSame('Judul Admin A', $pengajuan->fresh()->judul_pengajuan);
    }

    public function test_review_status_dengan_token_kedaluwarsa_ditolak_409(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();
        $tokenAwal = $pengajuan->fresh()->updated_at->toISOString();

        $this->travel(5)->seconds();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'updated_at'       => $tokenAwal,
            'status_pengajuan' => 'ditolak',
        ])->assertOk();

        // Admin lain masih memegang token lama dan mencoba menyetujui.
        $this->travel(5)->seconds();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'updated_at'       => $tokenAwal,
            'status_pengajuan' => 'diproses',
        ])->assertStatus(409);

        $this->assertSame('ditolak', $pengajuan->fresh()->status_pengajuan);
    }

    public function test_update_tanpa_token_tetap_berjalan_seperti_sebelumnya(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();

        $this->travel(5)->seconds();
        $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", ['judul_pengajuan' => 'Satu'])->assertOk();
        $this->travel(5)->seconds();
        $this->actingAs($admin)->putJson("/api/pengajuan/{$pengajuan->id}", ['judul_pengajuan' => 'Dua'])->assertOk();

        $this->assertSame('Dua', $pengajuan->fresh()->judul_pengajuan);
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

    public function test_pemilik_dapat_perbaiki_pengajuan_revisi_dan_status_kembali_menunggu(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan([
            'user_pengusul_id' => $user->id,
            'status_pengajuan' => 'revisi',
            'catatan_revisi'   => 'Lengkapi tanggal berakhir',
        ]);

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Judul Sudah Diperbaiki',
        ])->assertOk();

        $pengajuan->refresh();
        $this->assertSame('Judul Sudah Diperbaiki', $pengajuan->judul_pengajuan);
        $this->assertSame('menunggu', $pengajuan->status_pengajuan);
        $this->assertNotNull($pengajuan->direvisi_pengusul_pada);
        // Catatan revisi admin tetap tersimpan sebagai jejak.
        $this->assertSame('Lengkapi tanggal berakhir', $pengajuan->catatan_revisi);
        $this->assertDatabaseHas('pengajuan_log', [
            'pengajuan_id' => $pengajuan->id,
            'status_lama'  => 'revisi',
            'status_baru'  => 'menunggu',
        ]);
    }

    public function test_pemilik_eksternal_dapat_kirim_ulang_perbaikan_revisi(): void
    {
        $user      = User::factory()->create(['role' => 'external']);
        $pengajuan = $this->buatPengajuan([
            'user_pengusul_id'   => $user->id,
            'kategori_pengajuan' => 'eksternal',
            'status_pengajuan'   => 'revisi',
        ]);

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Perbaikan dari Mitra',
        ])->assertOk();

        $pengajuan->refresh();
        $this->assertSame('Perbaikan dari Mitra', $pengajuan->judul_pengajuan);
        $this->assertSame('menunggu', $pengajuan->status_pengajuan);
        $this->assertNotNull($pengajuan->direvisi_pengusul_pada);
    }

    public function test_pemilik_dapat_ubah_pengajuan_menunggu_tanpa_ubah_status(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $user->id, 'status_pengajuan' => 'menunggu']);

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Judul Baru',
        ])->assertOk();

        $pengajuan->refresh();
        $this->assertSame('Judul Baru', $pengajuan->judul_pengajuan);
        $this->assertSame('menunggu', $pengajuan->status_pengajuan);
        $this->assertNull($pengajuan->direvisi_pengusul_pada);
    }

    public function test_pemilik_tidak_bisa_ubah_pengajuan_yang_sedang_diproses(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $user->id, 'status_pengajuan' => 'diproses']);

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Coba Ubah',
        ])->assertStatus(422);

        $this->assertSame('Kerja Sama Penelitian', $pengajuan->fresh()->judul_pengajuan);
    }

    public function test_pemilik_tidak_bisa_menyetujui_pengajuannya_sendiri(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $user->id, 'status_pengajuan' => 'revisi']);

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'disetujui',
            'catatan_revisi'   => 'dihapus',
            'nomor_pengajuan'  => 'PMH-PALSU',
        ])->assertOk();

        $pengajuan->refresh();
        $this->assertSame('menunggu', $pengajuan->status_pengajuan);
        $this->assertNotSame('PMH-PALSU', $pengajuan->nomor_pengajuan);
        $this->assertSame(0, DokumenKerjasama::where('sumber_pengajuan_id', $pengajuan->id)->count());
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
        // Hapus oleh admin hanya menyembunyikan dari admin & pengguna lain — pengusulnya sendiri
        // (internal/eksternal) tetap melihat pengajuannya.
        $admin     = $this->admin();
        $pemilik   = $this->internal();
        $lainnya   = $this->internal();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $pemilik->id]);

        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")
            ->assertOk()->assertJsonPath('success', true);

        // Baris masih ada di database, cuma ditandai dihapus admin.
        $this->assertNotNull($pengajuan->fresh()->dihapus_admin_pada);

        // Hilang dari daftar kelola admin.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuan->id, $adminIds);
        $this->actingAs($admin)->getJson("/api/pengajuan/{$pengajuan->id}")->assertNotFound();

        // Hilang juga dari pengguna internal lain yang tidak terkait.
        $lainnyaIds = collect($this->actingAs($lainnya)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuan->id, $lainnyaIds);

        // Pemiliknya tetap melihat pengajuannya di daftar maupun detail.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($pengajuan->id, $pemilikIds);
        $this->actingAs($pemilik)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
    }

    public function test_admin_hapus_pengajuan_eksternal_tetap_terlihat_oleh_mitra(): void
    {
        $admin     = $this->admin();
        $mitra     = User::factory()->create(['role' => 'external']);
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $mitra->id, 'kategori_pengajuan' => 'eksternal']);

        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        $mitraIds = collect($this->actingAs($mitra)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($pengajuan->id, $mitraIds);
    }

    public function test_admin_hapus_pengajuan_eksternal_yang_sudah_diacc_tetap_ada_di_mitra(): void
    {
        $admin = $this->admin();
        $mitra = User::factory()->create(['role' => 'external']);

        foreach (['disetujui', 'final_approved'] as $status) {
            $pengajuan = $this->buatPengajuan([
                'user_pengusul_id'   => $mitra->id,
                'kategori_pengajuan' => 'eksternal',
                'status_pengajuan'   => $status,
            ]);

            $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

            // Tetap ada di database dan tetap tampil di Daftar Kerjasama mitra, lengkap dengan statusnya.
            $this->assertDatabaseHas('pengajuan_v2', ['id' => $pengajuan->id, 'status_pengajuan' => $status]);
            $mitraRows = collect($this->actingAs($mitra)->getJson('/api/pengajuan?per_page=100')->json('data.data'));
            $this->assertContains($pengajuan->id, $mitraRows->pluck('id'));
            $this->actingAs($mitra)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
        }
    }

    public function test_admin_hapus_pengajuan_dan_rekap_internal_yang_sudah_diacc_tetap_ada_di_internal(): void
    {
        $admin    = $this->admin();
        $internal = $this->internal();
        $unit     = MasterUnitProdi::create(['nama' => 'Jurusan Uji Internal', 'jenis_node' => 'unit']);
        $pengajuan = $this->buatPengajuan([
            'user_pengusul_id'   => $internal->id,
            'kategori_pengajuan' => 'internal',
            'status_pengajuan'   => 'final_approved',
            'nomor_pengajuan'    => 'PMH-INT-ACC-001',
        ]);
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen'       => 'INT-ACC-001/MOU.PL29/IX/2026',
            'nama_dokumen'        => 'Dokumen Internal ACC',
            'jenis_dokumen'       => 'MOU',
            'no_permohonan'       => $pengajuan->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuan->id,
            'unit_prodi_id'       => $unit->id,
            'file'                => 'pengajuan/2026/09/int-acc.pdf',
        ]);

        // Admin menghapus dari Data Pengajuan dan dari Rekap Data.
        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();

        // Internal tetap melihat pengajuannya (Data Pengajuan) ...
        $pengajuanIds = collect($this->actingAs($internal)->getJson('/api/pengajuan?per_page=100')->json('data.data'))->pluck('id');
        $this->assertContains($pengajuan->id, $pengajuanIds);

        // ... dan dokumen kerjasamanya (Rekap Data).
        $this->actingAs($internal)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();
    }

    public function test_mitra_eksternal_hapus_pengajuannya_sendiri_hanya_menyembunyikan_dari_akunnya(): void
    {
        $mitra     = User::factory()->create(['role' => 'external']);
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $mitra->id, 'kategori_pengajuan' => 'eksternal', 'status_pengajuan' => 'ditolak']);

        $this->actingAs($mitra)->deleteJson("/api/pengajuan/{$pengajuan->id}")
            ->assertOk()->assertJsonPath('success', true);

        // Barisnya tetap ada (untuk audit admin), hanya tersembunyi dari mitra.
        $this->assertDatabaseHas('pengajuan_v2', ['id' => $pengajuan->id]);
        $this->assertNotNull($pengajuan->fresh()->dihapus_user_pada);
        $this->actingAs($mitra)->getJson("/api/pengajuan/{$pengajuan->id}")->assertNotFound();
        $this->actingAs($this->admin())->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
    }

    public function test_mitra_eksternal_boleh_menyembunyikan_pengajuan_yang_sudah_disetujui_tanpa_menghapus_barisnya(): void
    {
        $mitra     = User::factory()->create(['role' => 'external']);
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $mitra->id, 'kategori_pengajuan' => 'eksternal', 'status_pengajuan' => 'disetujui']);

        $this->actingAs($mitra)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        $this->assertDatabaseHas('pengajuan_v2', ['id' => $pengajuan->id]);
        $this->assertNotNull($pengajuan->fresh()->dihapus_user_pada);
        $this->assertSame('disetujui', $pengajuan->fresh()->status_pengajuan, 'statusnya tidak berubah');
    }

    public function test_mitra_eksternal_tidak_bisa_hapus_pengajuan_milik_orang_lain(): void
    {
        $mitra     = User::factory()->create(['role' => 'external']);
        $lain      = User::factory()->create(['role' => 'external']);
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $lain->id, 'kategori_pengajuan' => 'eksternal', 'status_pengajuan' => 'menunggu']);

        $this->actingAs($mitra)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertForbidden();
        $this->assertDatabaseHas('pengajuan_v2', ['id' => $pengajuan->id, 'dihapus_user_pada' => null]);
    }

    public function test_admin_hapus_pengajuan_buatan_admin_dihapus_permanen(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $admin->id]);

        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        $this->assertDatabaseMissing('pengajuan_v2', ['id' => $pengajuan->id]);
    }

    public function test_admin_hapus_pengajuan_buatan_sendiri_tidak_muncul_balik_ke_admin(): void
    {
        // Pengecualian "pemilik tetap lihat" HANYA untuk akun non-admin (internal/eksternal/
        // kampus-LDAP). Kalau admin menghapus pengajuan yang dia buat sendiri, jangan sampai
        // pengajuan itu tetap nampak balik ke admin yang sama gara-gara dianggap "pemiliknya".
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $admin->id]);

        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        $adminIds = collect($this->actingAs($admin)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuan->id, $adminIds);
        $this->actingAs($admin)->getJson("/api/pengajuan/{$pengajuan->id}")->assertNotFound();
    }

    public function test_pemilik_internal_dapat_hapus_pengajuan_miliknya_sendiri(): void
    {
        // Internal/eksternal/kampus-LDAP juga punya tombol Hapus sendiri di Rekap
        // Data/Daftar Kerjasama mereka — sama seperti admin sekarang, ini hapus PERMANEN dari
        // database, hilang dari semua orang termasuk admin.
        $admin     = $this->admin();
        $pemilik   = $this->internal();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $pemilik->id]);

        $this->actingAs($pemilik)->deleteJson("/api/pengajuan/{$pengajuan->id}")
            ->assertOk()->assertJsonPath('success', true);

        // Baris sudah benar-benar hilang dari database.
        $this->assertDatabaseMissing('pengajuan_v2', ['id' => $pengajuan->id]);

        // Hilang dari daftar & detail milik pemiliknya sendiri.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuan->id, $pemilikIds);
        $this->actingAs($pemilik)->getJson("/api/pengajuan/{$pengajuan->id}")->assertNotFound();

        // Hilang juga dari admin — hapus sekarang permanen buat siapa saja yang menghapus.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuan->id, $adminIds);
        $this->actingAs($admin)->getJson("/api/pengajuan/{$pengajuan->id}")->assertNotFound();

        // Akun pemiliknya sendiri (login/profil) tidak ikut tersentuh sama sekali.
        $this->assertDatabaseHas('users', ['id' => $pemilik->id, 'email' => $pemilik->email]);
    }

    public function test_hapus_pengajuan_tidak_ikut_hapus_dokumen_kerjasama_terkait(): void
    {
        // Pemiliknya sendiri (internal/eksternal/kampus-LDAP) menghapus pengajuannya lewat Data
        // Pengajuan/Daftar Kerjasama cuma menghapus baris pengajuan itu saja — dokumen
        // kerjasama terkait di Rekap Data TIDAK ikut terhapus, karena masing-masing halaman
        // punya tombol hapus sendiri-sendiri (sama seperti sisi admin).
        $pemilik = $this->internal();
        $unit    = MasterUnitProdi::create(['nama' => 'Jurusan Uji', 'jenis_node' => 'unit']);
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $pemilik->id, 'nomor_pengajuan' => 'PMH-CASCADE-001']);
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen' => 'CASCADE-001/MOU.PL29/I/2026',
            'nama_dokumen' => 'Dokumen Cascade Test',
            'jenis_dokumen' => 'MOU',
            'no_permohonan' => $pengajuan->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuan->id,
            'unit_prodi_id' => $unit->id,
            'file' => 'pengajuan/2026/01/cascade.pdf',
        ]);

        $this->actingAs($pemilik)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        $this->assertDatabaseMissing('pengajuan_v2', ['id' => $pengajuan->id]);
        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
    }

    public function test_admin_hapus_pengajuan_tidak_ikut_hapus_dokumen_kerjasama_terkait(): void
    {
        // Admin menghapus dari Data Pengajuan = menyembunyikan pengajuannya dari admin saja.
        // Rekap Data (dokumen_kerjasama) TIDAK ikut terhapus; masing-masing halaman punya tombol
        // hapus sendiri-sendiri.
        $admin   = $this->admin();
        $pemilik = $this->internal();
        $unit    = MasterUnitProdi::create(['nama' => 'Jurusan Uji Admin', 'jenis_node' => 'unit']);
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $pemilik->id, 'nomor_pengajuan' => 'PMH-ADMIN-CASCADE-001']);
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen' => 'ADMIN-CASCADE-001/MOU.PL29/I/2026',
            'nama_dokumen' => 'Dokumen Admin Cascade Test',
            'jenis_dokumen' => 'MOU',
            'no_permohonan' => $pengajuan->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuan->id,
            'unit_prodi_id' => $unit->id,
            'file' => 'pengajuan/2026/01/admin-cascade.pdf',
        ]);

        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        // Pengajuan tetap ada untuk pengusulnya, hanya disembunyikan dari admin.
        $this->assertNotNull($pengajuan->fresh()->dihapus_admin_pada);

        // Dokumen kerjasama-nya tetap ada di Rekap Data, tidak ikut terhapus / disembunyikan.
        $this->assertDatabaseHas('dokumen_kerjasama', [
            'id' => $dokumen->id,
            'sumber_pengajuan_id' => $pengajuan->id,
            'dihapus_admin_pada' => null,
        ]);
    }

    public function test_hapus_pengajuan_ditolak_bukan_pemilik_dan_bukan_admin(): void
    {
        $penyusup  = $this->internal();
        $pemilik   = $this->internal();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $pemilik->id]);

        $this->actingAs($penyusup)->deleteJson("/api/pengajuan/{$pengajuan->id}")
            ->assertForbidden();
    }

    public function test_hapus_pengajuan_ditolak_bukan_admin(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuan();

        $this->actingAs($user)->deleteJson("/api/pengajuan/{$pengajuan->id}")
            ->assertForbidden();
    }

    // ------------------------------------------------------------------
    // structural access (Ketua Jurusan/Ketua Prodi/Kepala Unit) — role di DB
    // tetap 'internal', ini cuma scope tambahan berdasarkan StructuralAccessService.
    // ------------------------------------------------------------------

    private function mockCivitasStruktur(array $jurusan = [], array $prodi = [], array $unit = []): void
    {
        $this->mock(\App\Services\CivitasStructureService::class, function ($mock) use ($jurusan, $prodi, $unit) {
            $mock->shouldReceive('getJurusan')->andReturn($jurusan);
            $mock->shouldReceive('getProgramStudi')->andReturn($prodi);
            $mock->shouldReceive('getUnit')->andReturn($unit);
        });
    }

    public function test_ketua_jurusan_melihat_pengajuan_jurusan_dan_prodi_di_bawahnya_tapi_bukan_jurusan_lain(): void
    {
        $jurusanTI = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Informatika', 'aktif' => true]);
        $prodiTI   = MasterUnitProdi::create(['jenis_node' => 'prodi', 'parent_id' => $jurusanTI->id, 'nama' => 'D3 Teknik Informatika', 'aktif' => true]);
        $jurusanTM = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Mesin', 'aktif' => true]);

        $kajur = $this->internal();
        $kajur->update(['nik' => '221316']);

        $this->mockCivitasStruktur(jurusan: [[
            'ID_JURUSAN' => '1', 'NAMA_JURUSAN' => 'TEKNIK INFORMATIKA', 'NAMA_JURUSAN_INGGRIS' => '-',
            'NIK_KAJUR' => '221316', 'NAMA_KAJUR' => 'Budi Santoso',
        ]]);

        $pemilikLain = $this->internal();
        $a = $this->buatPengajuan(['judul_pengajuan' => 'A - langsung di jurusan', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $jurusanTI->id]);
        $b = $this->buatPengajuan(['judul_pengajuan' => 'B - di prodi bawah jurusan', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $prodiTI->id]);
        $c = $this->buatPengajuan(['judul_pengajuan' => 'C - jurusan lain', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $jurusanTM->id]);

        $response = $this->actingAs($kajur)->getJson('/api/pengajuan?per_page=50');
        $response->assertOk();
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($a->id, $ids);
        $this->assertContains($b->id, $ids);
        $this->assertNotContains($c->id, $ids);

        // show() harus ikut aturan yang sama.
        $this->actingAs($kajur)->getJson("/api/pengajuan/{$a->id}")->assertOk();
        $this->actingAs($kajur)->getJson("/api/pengajuan/{$b->id}")->assertOk();
        $this->actingAs($kajur)->getJson("/api/pengajuan/{$c->id}")->assertStatus(404);
    }

    public function test_dosen_biasa_tidak_ikut_melihat_pengajuan_dosen_lain_walau_prodi_sama(): void
    {
        // Skenario 1 di spec: dosen yang BUKAN pejabat struktural cuma boleh lihat
        // pengajuan miliknya sendiri, walau dosen lain di prodi yang sama.
        $prodi = MasterUnitProdi::create(['jenis_node' => 'prodi', 'nama' => 'D3 Teknik Informatika', 'aktif' => true]);

        $dosenA = $this->internal();
        $dosenA->update(['name' => 'Dosen A']);
        $dosenB = $this->internal();

        $this->mockCivitasStruktur(); // tidak ada jabatan struktural apa pun

        $pengajuanA = $this->buatPengajuan(['judul_pengajuan' => 'Punya Dosen A', 'user_pengusul_id' => $dosenA->id, 'unit_prodi_id' => $prodi->id]);
        $pengajuanB = $this->buatPengajuan(['judul_pengajuan' => 'Punya Dosen B', 'user_pengusul_id' => $dosenB->id, 'unit_prodi_id' => $prodi->id]);

        $response = $this->actingAs($dosenA)->getJson('/api/pengajuan?per_page=50');
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($pengajuanA->id, $ids);
        $this->assertNotContains($pengajuanB->id, $ids);
    }

    public function test_ketua_prodi_melihat_pengajuan_prodinya_saja(): void
    {
        // Skenario 3 di spec: Siti (KPS Teknik Informatika) boleh lihat pengajuan
        // Prodi Teknik Informatika, tapi tidak boleh lihat Prodi Mekatronika.
        $prodiTI  = MasterUnitProdi::create(['jenis_node' => 'prodi', 'nama' => 'D3 Teknik Informatika', 'aktif' => true]);
        $prodiMek = MasterUnitProdi::create(['jenis_node' => 'prodi', 'nama' => 'Sarjana Terapan Teknik Mekatronika', 'aktif' => true]);

        $kps = $this->internal();
        $kps->update(['nik' => '221317']);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur(prodi: [[
            'ID_PROGRAM_STUDI' => '10', 'JENJANG' => 'D3', 'NAMA_PROGRAM_STUDI' => 'TEKNIK INFORMATIKA',
            'NAMA_PROGRAM_STUDI_INGGRIS' => '-', 'NIK_KPS' => '221317', 'NAMA_KPS' => 'Siti Aminah',
        ]]);

        $a = $this->buatPengajuan(['judul_pengajuan' => 'A - Prodi TI', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $prodiTI->id]);
        $b = $this->buatPengajuan(['judul_pengajuan' => 'B - Prodi TI juga', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $prodiTI->id]);
        $c = $this->buatPengajuan(['judul_pengajuan' => 'C - Prodi Mekatronika', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $prodiMek->id]);

        $response = $this->actingAs($kps)->getJson('/api/pengajuan?per_page=50');
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($a->id, $ids);
        $this->assertContains($b->id, $ids);
        $this->assertNotContains($c->id, $ids);
    }

    public function test_kepala_unit_melihat_pengajuan_unitnya_saja(): void
    {
        // Skenario 4 di spec: Agus (Kepala UPA TIK) boleh lihat pengajuan UPA TIK,
        // tapi tidak boleh lihat unit lain.
        $upaTik = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA TIK', 'aktif' => true]);
        $upaLain = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA Perpustakaan', 'aktif' => true]);

        $kepalaUnit = $this->internal();
        $kepalaUnit->update(['nik' => '221318']);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur(unit: [[
            'ID_UNIT' => '18', 'NAMA_UNIT' => 'UPA TIK', 'NIK_KEPALA_UNIT' => '221318', 'NAMA_KEPALA_UNIT' => 'Agus Prasetyo',
        ]]);

        $a = $this->buatPengajuan(['judul_pengajuan' => 'A - UPA TIK', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $upaTik->id]);
        $b = $this->buatPengajuan(['judul_pengajuan' => 'B - Unit lain', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $upaLain->id]);

        $response = $this->actingAs($kepalaUnit)->getJson('/api/pengajuan?per_page=50');
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($a->id, $ids);
        $this->assertNotContains($b->id, $ids);
    }

    public function test_unit_bernama_jurusan_tidak_membuat_kajur_dobel_terdeteksi_sebagai_kepala_unit(): void
    {
        // Temuan nyata dari data Civitas: Jurusan ikut nyempil di daftar Unit (nama
        // diawali "JURUSAN "). CivitasStructureService::getUnit() sudah membuang baris
        // ini — pastikan Kajur tidak salah dianggap Kepala Unit karena baris itu.
        $jurusanTI = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Informatika', 'aktif' => true]);

        $kajur = $this->internal();
        $kajur->update(['nik' => '115143']);

        $this->mockCivitasStruktur(
            jurusan: [[
                'ID_JURUSAN' => '9', 'NAMA_JURUSAN' => 'TEKNIK INFORMATIKA', 'NAMA_JURUSAN_INGGRIS' => '-',
                'NIK_KAJUR' => '115143', 'NAMA_KAJUR' => 'Ahmad Hamim Thohari',
            ]],
        );

        $access = app(\App\Services\StructuralAccessService::class)->getUserStructuralAccess($kajur->fresh());

        $this->assertEquals('ketua_jurusan', $access['structural_position']);
        $this->assertEquals($jurusanTI->id, $access['jurusan_id']);
        $this->assertNull($access['unit_id']);
    }

    public function test_kepala_unit_role_unit_tetap_terdeteksi_via_nik_bukan_cuma_role_internal(): void
    {
        // Role 'unit' juga dipakai admin untuk sebagian akun struktural (bukan cuma
        // 'internal') — deteksi Kajur/KPS/Kepala Unit berdasarkan NIK harus tetap jalan
        // biarpun role-nya 'unit', bukan 'internal'.
        $upaTik = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA TIK', 'aktif' => true]);
        $upaLain = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA Perpustakaan', 'aktif' => true]);

        $kepalaUnit = User::factory()->create(['role' => 'unit', 'nik' => '221318']);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur(unit: [[
            'ID_UNIT' => '18', 'NAMA_UNIT' => 'UPA TIK', 'NIK_KEPALA_UNIT' => '221318', 'NAMA_KEPALA_UNIT' => 'Agus Prasetyo',
        ]]);

        $a = $this->buatPengajuan(['judul_pengajuan' => 'A - UPA TIK', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $upaTik->id]);
        $b = $this->buatPengajuan(['judul_pengajuan' => 'B - Unit lain', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $upaLain->id]);

        $response = $this->actingAs($kepalaUnit)->getJson('/api/pengajuan?per_page=50');
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($a->id, $ids);
        $this->assertNotContains($b->id, $ids);
    }

    public function test_role_unit_tanpa_jabatan_struktural_hanya_lihat_pengajuan_sendiri(): void
    {
        // Sebelum perbaikan ini, role 'unit' TIDAK kena filter kepemilikan sama sekali
        // di index()/show() — bisa lihat SEMUA pengajuan siapa pun (seperti admin).
        // Ini regression guard supaya celah itu tidak balik lagi.
        $prodi = MasterUnitProdi::create(['jenis_node' => 'prodi', 'nama' => 'D3 Teknik Informatika', 'aktif' => true]);

        $userUnit = User::factory()->create(['role' => 'unit', 'nik' => '999888']);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur(); // tidak ada jabatan struktural apa pun

        $pengajuanSendiri = $this->buatPengajuan(['judul_pengajuan' => 'Punya sendiri', 'user_pengusul_id' => $userUnit->id, 'unit_prodi_id' => $prodi->id]);
        $pengajuanOrang = $this->buatPengajuan(['judul_pengajuan' => 'Punya orang lain', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $prodi->id]);

        $response = $this->actingAs($userUnit)->getJson('/api/pengajuan?per_page=50');
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($pengajuanSendiri->id, $ids);
        $this->assertNotContains($pengajuanOrang->id, $ids);

        $this->actingAs($userUnit)->getJson("/api/pengajuan/{$pengajuanOrang->id}")->assertStatus(404);
    }

    public function test_user_unit_yang_di_assign_admin_melihat_pengajuan_unitnya_walau_bukan_kepala_unit_resmi(): void
    {
        // Beda dari test_kepala_unit_role_unit_tetap_terdeteksi_via_nik_bukan_cuma_role_internal:
        // di sini user role 'unit' BUKAN Kepala Unit resmi (NIK-nya tidak cocok data Civitas
        // sama sekali) — dia cuma akun yang di-assign admin lewat Manajemen User
        // (users.unit_prodi_id) untuk mewakili sebuah unit kerja. Tetap harus dapat scope
        // ke unitnya, bukan cuma lihat punya sendiri.
        $unitA = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA TIK', 'aktif' => true]);
        $unitB = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA Perpustakaan', 'aktif' => true]);

        $userUnitA = User::factory()->create(['role' => 'unit', 'unit_prodi_id' => $unitA->id]);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur(); // tidak ada jabatan struktural resmi apa pun

        $a = $this->buatPengajuan(['judul_pengajuan' => 'A - Unit A', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $unitA->id]);
        $b = $this->buatPengajuan(['judul_pengajuan' => 'B - Unit B', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $unitB->id]);

        $response = $this->actingAs($userUnitA)->getJson('/api/pengajuan?per_page=50');
        $response->assertOk();
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($a->id, $ids);
        $this->assertNotContains($b->id, $ids);

        $this->actingAs($userUnitA)->getJson("/api/pengajuan/{$a->id}")->assertOk();
        $this->actingAs($userUnitA)->getJson("/api/pengajuan/{$b->id}")->assertStatus(404);
    }

    public function test_user_unit_yang_di_assign_admin_tidak_bisa_bypass_scope_lewat_query_param(): void
    {
        $unitA = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA TIK', 'aktif' => true]);
        $unitB = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA Perpustakaan', 'aktif' => true]);

        $userUnitA = User::factory()->create(['role' => 'unit', 'unit_prodi_id' => $unitA->id]);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur();

        $b = $this->buatPengajuan(['judul_pengajuan' => 'B - Unit B', 'user_pengusul_id' => $pemilikLain->id, 'unit_prodi_id' => $unitB->id]);

        $response = $this->actingAs($userUnitA)->getJson("/api/pengajuan?per_page=50&unit_prodi_id={$unitB->id}");
        $response->assertOk();
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertNotContains($b->id, $ids);
    }

    public function test_admin_yang_assign_unit_kepada_kepala_unit_resmi_tidak_mengubah_hasil_deteksi_nik(): void
    {
        // NIK-match tetap prioritas di atas unit_prodi_id yang di-assign admin — kalau
        // orangnya memang Kepala Unit resmi (NIK cocok), assignment admin (kalau ada &
        // beda) tidak menggantikan/mempersempit scope dari deteksi NIK.
        $unitResmi = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA TIK', 'aktif' => true]);

        $kepalaUnit = User::factory()->create(['role' => 'unit', 'nik' => '221318', 'unit_prodi_id' => $unitResmi->id]);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur(unit: [[
            'ID_UNIT' => '18', 'NAMA_UNIT' => 'UPA TIK', 'NIK_KEPALA_UNIT' => '221318', 'NAMA_KEPALA_UNIT' => 'Agus Prasetyo',
        ]]);

        $access = app(\App\Services\StructuralAccessService::class)->getUserStructuralAccess($kepalaUnit->fresh());

        $this->assertEquals('kepala_unit', $access['structural_position']);
        $this->assertEquals($unitResmi->id, $access['unit_id']);
    }

    // ------------------------------------------------------------------
    // Distribusi (CC) kandidat — Kajur/Kaprodi dari Civitas, termasuk yang
    // belum pernah login ke SIKERMA (belum ada baris users).
    // ------------------------------------------------------------------

    public function test_distribusi_kandidat_gabungkan_yang_sudah_login_dan_yang_belum(): void
    {
        $admin = $this->admin();
        $kajurSudahLogin = User::factory()->create(['role' => 'jurusan', 'nik' => '111111', 'name' => 'Kajur Lama']);

        $this->mockCivitasStruktur(
            jurusan: [[
                'ID_JURUSAN' => '1', 'NAMA_JURUSAN' => 'Teknik Informatika',
                'NIK_KAJUR' => '111111', 'NAMA_KAJUR' => 'Kajur Lama',
            ]],
            prodi: [[
                'ID_PROGRAM_STUDI' => '2', 'NAMA_PROGRAM_STUDI' => 'D4 Teknik Informatika',
                'NIK_KPS' => '222222', 'NAMA_KPS' => 'Kaprodi Baru',
            ]],
        );

        $response = $this->actingAs($admin)->getJson('/api/distribusi-kandidat');
        $response->assertOk();

        $data = collect($response->json('data'));
        $sudahLogin = $data->firstWhere('nik', '111111');
        $belumLogin = $data->firstWhere('nik', '222222');

        $this->assertEquals($kajurSudahLogin->id, $sudahLogin['id']);
        $this->assertTrue($sudahLogin['sudah_terdaftar']);

        $this->assertNull($belumLogin['id']);
        $this->assertFalse($belumLogin['sudah_terdaftar']);
        $this->assertEquals('Kaprodi Baru', $belumLogin['nama']);
    }

    public function test_distribusi_kandidat_ditolak_bukan_admin(): void
    {
        $this->mockCivitasStruktur();
        $this->actingAs($this->internal())->getJson('/api/distribusi-kandidat')->assertStatus(403);
    }

    public function test_distribusi_kandidat_termasuk_kepala_unit_dari_civitas(): void
    {
        $admin = $this->admin();

        $this->mockCivitasStruktur(unit: [[
            'ID_UNIT' => '18', 'NAMA_UNIT' => 'KELOMPOK KERJA HUMAS DAN KERJASAMA',
            'NIK_KEPALA_UNIT' => '210084', 'NAMA_KEPALA_UNIT' => 'RIDWAN PURWANTO',
        ]]);

        $response = $this->actingAs($admin)->getJson('/api/distribusi-kandidat');
        $response->assertOk();

        $kepalaUnit = collect($response->json('data'))->firstWhere('nik', '210084');

        $this->assertNotNull($kepalaUnit);
        $this->assertNull($kepalaUnit['id']);
        $this->assertFalse($kepalaUnit['sudah_terdaftar']);
        $this->assertEquals('kepala_unit', $kepalaUnit['jabatan']);
        $this->assertEquals('RIDWAN PURWANTO', $kepalaUnit['nama']);
    }

    public function test_provision_distribusi_user_kepala_unit_membuat_role_unit(): void
    {
        $admin = $this->admin();

        $response = $this->actingAs($admin)->postJson('/api/distribusi-kandidat/provision', [
            'nik' => '210084',
            'nama' => 'RIDWAN PURWANTO',
            'jabatan' => 'kepala_unit',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('users', [
            'nik' => '210084',
            'name' => 'RIDWAN PURWANTO',
            'role' => 'unit',
        ]);
    }

    public function test_provision_distribusi_user_membuat_akun_baru(): void
    {
        $admin = $this->admin();

        $response = $this->actingAs($admin)->postJson('/api/distribusi-kandidat/provision', [
            'nik' => '333333',
            'nama' => 'Kaprodi Ditambahkan',
            'jabatan' => 'ketua_prodi',
        ]);

        $response->assertOk();
        $newId = $response->json('data.id');

        $this->assertDatabaseHas('users', [
            'id' => $newId,
            'nik' => '333333',
            'name' => 'Kaprodi Ditambahkan',
            'role' => 'prodi',
            'auth_provider' => 'ldap',
        ]);
    }

    public function test_provision_distribusi_user_reuse_akun_yang_sama_by_nik_tidak_dobel(): void
    {
        $admin = $this->admin();
        $existing = User::factory()->create(['nik' => '444444', 'role' => 'internal']);

        $response = $this->actingAs($admin)->postJson('/api/distribusi-kandidat/provision', [
            'nik' => '444444',
            'nama' => 'Nama Beda',
            'jabatan' => 'ketua_jurusan',
        ]);

        $response->assertOk();
        $this->assertEquals($existing->id, $response->json('data.id'));
        $this->assertEquals(1, User::where('nik', '444444')->count());
    }

    public function test_provision_distribusi_user_ditolak_bukan_admin(): void
    {
        $this->actingAs($this->internal())->postJson('/api/distribusi-kandidat/provision', [
            'nik' => '555555',
            'nama' => 'Coba Provision',
            'jabatan' => 'ketua_jurusan',
        ])->assertStatus(403);
    }
}
