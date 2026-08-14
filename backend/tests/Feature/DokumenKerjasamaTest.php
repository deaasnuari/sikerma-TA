<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DokumenKerjasamaTest extends TestCase
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

    private function buatPengajuanDenganNomor(string $nomor = 'PMH-001'): Pengajuan
    {
        return Pengajuan::create([
            'nomor_pengajuan'  => $nomor,
            'nama_pengusul'    => 'Dr. Test',
            'judul_pengajuan'  => 'Kerja Sama Test',
            'jenis_dokumen'    => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
        ]);
    }

    private function buatDokumen(array $override = []): DokumenKerjasama
    {
        $pengajuan = $this->buatPengajuanDenganNomor('PMH-' . rand(100, 999));

        return DokumenKerjasama::create(array_merge([
            'no_permohonan' => $pengajuan->nomor_pengajuan,
            'nomor_dokumen' => '001/MOU.PL29/I/2026',
            'nama_dokumen'  => 'Dokumen Kerja Sama',
            'jenis_dokumen' => 'MOU',
            'file'          => 'pengajuan/2026/01/dokumen.pdf',
        ], $override));
    }

    private function dataDokumen(string $noPengajuan, array $override = []): array
    {
        return array_merge([
            'no_permohonan' => $noPengajuan,
            'nomor_dokumen' => '002/MOU.PL29/II/2026',
            'nama_dokumen'  => 'MOU Kerja Sama Pendidikan',
            'jenis_dokumen' => 'MOU',
            'file'          => 'pengajuan/2026/01/mou.pdf',
        ], $override);
    }

    // ------------------------------------------------------------------
    // public endpoints (no auth)
    // ------------------------------------------------------------------

    public function test_public_stats_berhasil_tanpa_auth(): void
    {
        $response = $this->getJson('/api/public/stats');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => [
                'total', 'dalam_negeri', 'luar_negeri',
                'dudi_nasional', 'dudi_internasional',
                'instansi_nasional', 'instansi_internasional',
            ]]);
    }

    public function test_public_stats_mengembalikan_angka_benar(): void
    {
        $response = $this->getJson('/api/public/stats');

        $response->assertOk();
        $this->assertEquals(0, $response->json('data.total'));
    }

    public function test_public_index_berhasil_tanpa_auth(): void
    {
        $response = $this->getJson('/api/public/kerjasama');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => ['data', 'total', 'per_page', 'current_page', 'last_page']]);
    }

    // ------------------------------------------------------------------
    // index (auth required)
    // ------------------------------------------------------------------

    public function test_daftar_dokumen_berhasil(): void
    {
        $user = $this->admin();
        $this->buatDokumen(['nomor_dokumen' => '001/MOU.PL29/I/2026-A']);
        $this->buatDokumen(['nomor_dokumen' => '001/MOU.PL29/I/2026-B']);

        $response = $this->actingAs($user)->getJson('/api/dokumen-kerjasama');

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertGreaterThanOrEqual(2, $response->json('data.total'));
    }

    public function test_filter_dokumen_by_jenis(): void
    {
        $user = $this->admin();
        $pengajuan1 = $this->buatPengajuanDenganNomor('PMH-200');
        $pengajuan2 = $this->buatPengajuanDenganNomor('PMH-201');

        DokumenKerjasama::create([
            'no_permohonan' => $pengajuan1->nomor_pengajuan,
            'nomor_dokumen' => 'MOU-001',
            'nama_dokumen'  => 'MOU Test',
            'jenis_dokumen' => 'MOU',
            'file'          => 'test.pdf',
        ]);
        DokumenKerjasama::create([
            'no_permohonan' => $pengajuan2->nomor_pengajuan,
            'nomor_dokumen' => 'MOA-001',
            'nama_dokumen'  => 'MOA Test',
            'jenis_dokumen' => 'MOA',
            'file'          => 'test2.pdf',
        ]);

        $response = $this->actingAs($user)->getJson('/api/dokumen-kerjasama?jenis_dokumen=MOU');

        $response->assertOk();
        foreach ($response->json('data.data') as $item) {
            $this->assertEquals('MOU', $item['jenis_dokumen']);
        }
    }

    public function test_filter_dokumen_by_status_siklus(): void
    {
        $user = $this->admin();
        $this->buatDokumen(['nomor_dokumen' => 'AKTIF-001', 'status_siklus' => 'active']);
        $this->buatDokumen(['nomor_dokumen' => 'ARSIP-001', 'status_siklus' => 'archived']);

        $response = $this->actingAs($user)->getJson('/api/dokumen-kerjasama?status_siklus=active');

        $response->assertOk();
        foreach ($response->json('data.data') as $item) {
            $this->assertEquals('active', $item['status_siklus']);
        }
    }

    public function test_cari_dokumen_berhasil(): void
    {
        $user = $this->admin();
        $this->buatDokumen([
            'nomor_dokumen' => 'CARI-001',
            'nama_dokumen'  => 'MOU Kerja Sama Spesifik',
        ]);

        $response = $this->actingAs($user)->getJson('/api/dokumen-kerjasama?search=spesifik');

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, $response->json('data.total'));
    }

    public function test_daftar_dokumen_tanpa_auth_ditolak(): void
    {
        $this->getJson('/api/dokumen-kerjasama')->assertUnauthorized();
    }

    // ------------------------------------------------------------------
    // show
    // ------------------------------------------------------------------

    public function test_tampil_dokumen_berhasil(): void
    {
        $user    = $this->admin();
        $dokumen = $this->buatDokumen(['nama_dokumen' => 'Dokumen Tampil', 'nomor_dokumen' => 'SHOW-001']);

        $response = $this->actingAs($user)->getJson("/api/dokumen-kerjasama/{$dokumen->id}");

        $response->assertOk()->assertJsonPath('data.nama_dokumen', 'Dokumen Tampil');
    }

    public function test_tampil_dokumen_tidak_ditemukan(): void
    {
        $user = $this->admin();

        $this->actingAs($user)->getJson('/api/dokumen-kerjasama/9999')->assertNotFound();
    }

    // ------------------------------------------------------------------
    // store (admin only)
    // ------------------------------------------------------------------

    public function test_admin_dapat_buat_dokumen(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuanDenganNomor('PMH-300');

        $response = $this->actingAs($admin)->postJson('/api/dokumen-kerjasama', $this->dataDokumen($pengajuan->nomor_pengajuan));

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.nama_dokumen', 'MOU Kerja Sama Pendidikan');

        $this->assertDatabaseHas('dokumen_kerjasama', ['nomor_dokumen' => '002/MOU.PL29/II/2026']);
    }

    public function test_buat_dokumen_gagal_nomor_duplikat(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuanDenganNomor('PMH-301');

        DokumenKerjasama::create([
            'no_permohonan' => $pengajuan->nomor_pengajuan,
            'nomor_dokumen' => 'DUPLIKAT-001',
            'nama_dokumen'  => 'Duplikat',
            'jenis_dokumen' => 'MOU',
            'file'          => 'test.pdf',
        ]);

        $pengajuan2 = $this->buatPengajuanDenganNomor('PMH-302');

        $this->actingAs($admin)->postJson('/api/dokumen-kerjasama', $this->dataDokumen($pengajuan2->nomor_pengajuan, [
            'nomor_dokumen' => 'DUPLIKAT-001',
        ]))->assertUnprocessable()->assertJsonValidationErrors(['nomor_dokumen']);
    }

    public function test_buat_dokumen_gagal_no_permohonan_tidak_ada(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/dokumen-kerjasama', $this->dataDokumen('PMH-TIDAK-ADA'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['no_permohonan']);
    }

    public function test_buat_dokumen_gagal_field_wajib_kosong(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/dokumen-kerjasama', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['nomor_dokumen', 'no_permohonan', 'nama_dokumen', 'jenis_dokumen', 'file']);
    }

    public function test_buat_dokumen_ditolak_bukan_admin(): void
    {
        $user      = $this->internal();
        $pengajuan = $this->buatPengajuanDenganNomor('PMH-400');

        $this->actingAs($user)->postJson('/api/dokumen-kerjasama', $this->dataDokumen($pengajuan->nomor_pengajuan))
            ->assertForbidden();
    }

    // ------------------------------------------------------------------
    // update
    // ------------------------------------------------------------------

    public function test_admin_dapat_update_dokumen(): void
    {
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'UPD-001']);

        $response = $this->actingAs($admin)->putJson("/api/dokumen-kerjasama/{$dokumen->id}", [
            'nama_dokumen' => 'Nama Diperbarui',
        ]);

        $response->assertOk()->assertJsonPath('data.nama_dokumen', 'Nama Diperbarui');
    }

    public function test_admin_dapat_update_status_siklus(): void
    {
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'UPD-002', 'status_siklus' => 'active']);

        $this->actingAs($admin)->putJson("/api/dokumen-kerjasama/{$dokumen->id}", [
            'status_siklus' => 'archived',
            'alasan_arsip'  => 'Masa berlaku habis',
        ])->assertOk();

        $this->assertEquals('archived', $dokumen->fresh()->status_siklus);
    }

    public function test_update_dokumen_ditolak_bukan_admin(): void
    {
        $user    = $this->internal();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'UPD-003']);

        $this->actingAs($user)->putJson("/api/dokumen-kerjasama/{$dokumen->id}", [
            'nama_dokumen' => 'Tidak Boleh',
        ])->assertForbidden();
    }

    // ------------------------------------------------------------------
    // destroy
    // ------------------------------------------------------------------

    public function test_admin_dapat_hapus_dokumen(): void
    {
        // "Hapus" oleh admin adalah soft delete: baris tetap ada di database (supaya akun
        // internal/eksternal/kampus-LDAP pembuatnya tidak kehilangan riwayat dokumennya sendiri),
        // tapi disembunyikan dari daftar kelola admin & pengguna lain.
        $admin   = $this->admin();
        $pemilik = $this->internal();
        $pengajuanPemilik = $this->buatPengajuanDenganNomor('PMH-' . rand(100, 999));
        $pengajuanPemilik->update(['user_pengusul_id' => $pemilik->id]);
        $dokumen = $this->buatDokumen([
            'nomor_dokumen' => 'DEL-001',
            'no_permohonan' => $pengajuanPemilik->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuanPemilik->id,
            'dibuat_oleh_user_id' => $pemilik->id,
        ]);

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")
            ->assertOk()->assertJsonPath('success', true);

        // Baris masih ada di database, cuma ditandai dihapus.
        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
        $this->assertNotNull($dokumen->fresh()->dihapus_admin_pada);

        // Hilang dari daftar kelola admin.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $adminIds);

        // TAPI pembuatnya sendiri tetap bisa melihat dokumennya di daftar & detail.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($dokumen->id, $pemilikIds);
        $this->actingAs($pemilik)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();

        // Akun pembuatnya sendiri (login/profil) tidak ikut tersentuh sama sekali.
        $this->assertDatabaseHas('users', ['id' => $pemilik->id, 'email' => $pemilik->email]);
    }

    public function test_hapus_dokumen_ditolak_bukan_admin(): void
    {
        $user    = $this->internal();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'DEL-002']);

        $this->actingAs($user)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")
            ->assertForbidden();
    }

    public function test_pemilik_internal_dapat_hapus_dokumen_miliknya_sendiri(): void
    {
        // Internal/eksternal/kampus-LDAP sekarang juga punya tombol Hapus sendiri di Rekap Data
        // mereka — kebalikan dari hapus admin: cuma hilang dari akunnya sendiri, admin tetap bisa
        // lihat (buat audit/rekap institusi).
        $admin   = $this->admin();
        $pemilik = $this->internal();
        $pengajuanPemilik = $this->buatPengajuanDenganNomor('PMH-' . rand(100, 999));
        $pengajuanPemilik->update(['user_pengusul_id' => $pemilik->id]);
        $dokumen = $this->buatDokumen([
            'nomor_dokumen' => 'DEL-003',
            'no_permohonan' => $pengajuanPemilik->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuanPemilik->id,
            'dibuat_oleh_user_id' => $pemilik->id,
        ]);

        $this->actingAs($pemilik)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
        $this->assertNotNull($dokumen->fresh()->dihapus_user_pada);
        $this->assertNull($dokumen->fresh()->dihapus_admin_pada);

        // Hilang dari daftar & detail milik pemiliknya sendiri.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $pemilikIds);
        $this->actingAs($pemilik)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertNotFound();

        // TAPI admin tetap bisa melihatnya.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($dokumen->id, $adminIds);
        $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();
    }

    public function test_hapus_dokumen_ikut_sembunyikan_pengajuan_sumbernya(): void
    {
        // Kebalikan dari cascade di PengajuanTest: hapus dari Rekap Data (dokumen kerjasama)
        // harus ikut menyembunyikan pengajuan sumbernya juga di Data Pengajuan — kalau tidak,
        // dokumennya hilang dari Rekap Data tapi pengajuannya tetap kelihatan di Data Pengajuan
        // seolah belum dihapus, padahal keduanya kerjasama yang sama.
        $admin   = $this->admin();
        $pemilik = $this->internal();
        $pengajuanPemilik = $this->buatPengajuanDenganNomor('PMH-' . rand(100, 999));
        $pengajuanPemilik->update(['user_pengusul_id' => $pemilik->id]);
        $dokumen = $this->buatDokumen([
            'nomor_dokumen' => 'DEL-005',
            'no_permohonan' => $pengajuanPemilik->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuanPemilik->id,
            'dibuat_oleh_user_id' => $pemilik->id,
        ]);

        $this->actingAs($pemilik)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();

        $this->assertNotNull($pengajuanPemilik->fresh()->dihapus_user_pada);

        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($pengajuanPemilik->id, $pemilikIds);

        $adminIds = collect($this->actingAs($admin)->getJson('/api/pengajuan?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($pengajuanPemilik->id, $adminIds);
    }

    public function test_hapus_dokumen_ditolak_bukan_pemilik_dan_bukan_admin(): void
    {
        $penyusup = $this->internal();
        $pemilik  = $this->internal();
        $pengajuanPemilik = $this->buatPengajuanDenganNomor('PMH-' . rand(100, 999));
        $pengajuanPemilik->update(['user_pengusul_id' => $pemilik->id]);
        $dokumen = $this->buatDokumen([
            'nomor_dokumen' => 'DEL-004',
            'no_permohonan' => $pengajuanPemilik->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuanPemilik->id,
            'dibuat_oleh_user_id' => $pemilik->id,
        ]);

        $this->actingAs($penyusup)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")
            ->assertForbidden();
    }
}
