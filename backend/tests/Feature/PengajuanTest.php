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
        // "Hapus" oleh admin sekarang hapus PERMANEN dari database (bukan cuma disembunyikan) —
        // hilang dari semua orang termasuk pemiliknya sendiri.
        $admin     = $this->admin();
        $pemilik   = $this->internal();
        $lainnya   = $this->internal();
        $pengajuan = $this->buatPengajuan(['user_pengusul_id' => $pemilik->id]);

        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")
            ->assertOk()->assertJsonPath('success', true);

        // Baris sudah benar-benar hilang dari database.
        $this->assertDatabaseMissing('pengajuan_v2', ['id' => $pengajuan->id]);

        // Hilang dari daftar kelola admin.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuan->id, $adminIds);

        // Hilang juga dari pengguna internal lain yang tidak terkait.
        $lainnyaIds = collect($this->actingAs($lainnya)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuan->id, $lainnyaIds);

        // Sekarang hapus admin sungguhan hilang permanen, jadi pemiliknya sendiri pun sudah
        // tidak bisa melihatnya lagi di daftar maupun detail.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuan->id, $pemilikIds);
        $this->actingAs($pemilik)->getJson("/api/pengajuan/{$pengajuan->id}")->assertNotFound();

        // Akun pemiliknya sendiri (login/profil) tidak ikut tersentuh sama sekali.
        $this->assertDatabaseHas('users', ['id' => $pemilik->id, 'email' => $pemilik->email]);
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
        // Beda dari test_hapus_pengajuan_ikut_sembunyikan_dokumen_kerjasama_terkait (yang itu
        // soal pemilik menghapus miliknya sendiri, TETAP cascade menyembunyikan) — di sini admin
        // menghapus dari Data Pengajuan itu murni hapus permanen pengajuannya saja. Rekap Data
        // (dokumen_kerjasama) TIDAK ikut terhapus; masing-masing halaman punya tombol hapus
        // sendiri-sendiri.
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

        $this->assertDatabaseMissing('pengajuan_v2', ['id' => $pengajuan->id]);

        // Dokumen kerjasama-nya tetap ada di Rekap Data, tidak ikut terhapus.
        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
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
}
