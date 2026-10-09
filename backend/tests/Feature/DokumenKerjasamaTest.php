<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\DokumenLog;
use App\Models\MasterMitra;
use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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

    /**
     * status_efektif adalah field tunggal yang HARUS dipakai semua halaman (Rekap Data,
     * Monitoring, Status & Progres Kerjasama, Arsip Dokumen) untuk menghitung jumlah
     * Kadaluarsa — bukan status_siklus mentah, yang bisa basi (tersimpan 'active' padahal
     * tanggal_berakhir-nya sudah lewat karena tidak ada proses yang otomatis meng-update-nya).
     */
    public function test_index_menyertakan_status_efektif_yang_override_status_siklus_basi(): void
    {
        $user = $this->admin();

        $this->buatDokumen([
            'nomor_dokumen'   => 'BASI-001',
            'status_siklus'   => 'active', // sengaja dibiarkan basi
            'tanggal_berakhir' => now()->subMonth()->toDateString(),
        ]);
        $this->buatDokumen([
            'nomor_dokumen'   => 'MASIHAKTIF-001',
            'status_siklus'   => 'active',
            'tanggal_berakhir' => now()->addYear()->toDateString(),
        ]);

        $response = $this->actingAs($user)->getJson('/api/dokumen-kerjasama?per_page=50');
        $response->assertOk();

        $rows = collect($response->json('data.data'));
        $basi = $rows->firstWhere('nomor_dokumen', 'BASI-001');
        $masihAktif = $rows->firstWhere('nomor_dokumen', 'MASIHAKTIF-001');

        $this->assertSame('active', $basi['status_siklus']); // kolom mentah tidak diubah
        $this->assertSame('archived', $basi['status_efektif']); // tapi status efektifnya benar
        $this->assertSame('active', $masihAktif['status_efektif']);
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

        $dokumen->refresh();
        $this->assertEquals('archived', $dokumen->status_siklus);
        $this->assertEquals('Masa berlaku habis', $dokumen->alasan_arsip);
    }

    // Kerja sama yang TIDAK diperpanjang (ditandai admin di Monitoring): catatannya lewat
    // alasan_arsip (di atas), buktinya lewat upload-file dengan peran_berkas terpisah —
    // supaya beda dari "Bukti PDF" (dokumen final) yang sudah ada di tabel Arsip Dokumen.
    public function test_admin_dapat_upload_bukti_tidak_diperpanjang(): void
    {
        Storage::fake('public');
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'UPD-004']);

        $file = UploadedFile::fake()->create('bukti-tidak-diperpanjang.pdf', 100, 'application/pdf');

        $response = $this->actingAs($admin)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/upload-file", [
            'file'         => $file,
            'peran_berkas' => 'bukti_tidak_diperpanjang',
        ]);

        $response->assertOk()->assertJsonPath('data.peran_berkas', 'bukti_tidak_diperpanjang');

        $this->assertDatabaseHas('dokumen_file', [
            'dokumen_id'   => $dokumen->id,
            'peran_berkas' => 'bukti_tidak_diperpanjang',
        ]);

        // Harus ikut muncul lagi di index() (dipakai Rekap Data & Arsip Dokumen) — bukan
        // cuma tersimpan tapi tidak pernah dikirim balik ke frontend.
        $indexResponse = $this->actingAs($admin)->getJson('/api/dokumen-kerjasama');
        $indexResponse->assertOk();
        $peranList = collect($indexResponse->json('data.data'))
            ->firstWhere('id', $dokumen->id)['dokumen_files'] ?? [];
        $this->assertTrue(collect($peranList)->contains(fn ($f) => $f['peran_berkas'] === 'bukti_tidak_diperpanjang'));
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

    public function test_admin_hapus_dokumen_pindah_ke_sampah_bukan_permanen(): void
    {
        // "Hapus" oleh admin sekarang cuma memindahkan ke Sampah (soft delete) — barisnya
        // TETAP ada di database, cuma disembunyikan dari daftar kelola admin & pengguna lain.
        // Pembuatnya sendiri (internal/eksternal/kampus-LDAP) tetap bisa melihatnya di riwayat
        // dokumennya, sesuai desain dihapus_admin_pada di index().
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

        // Baris MASIH ada di database, cuma dihapus_admin_pada ke-isi.
        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
        $this->assertNotNull($dokumen->fresh()->dihapus_admin_pada);

        // Hilang dari daftar kelola admin.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $adminIds);

        // Pembuatnya sendiri tetap bisa melihatnya di riwayat dokumennya.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($dokumen->id, $pemilikIds);

        // Muncul di daftar Sampah admin.
        $trashIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama/trash/list?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($dokumen->id, $trashIds);
    }

    public function test_admin_hapus_dokumen_tidak_ikut_hapus_pengajuan_sumbernya(): void
    {
        // Kebalikan dari test_admin_hapus_pengajuan_tidak_ikut_hapus_dokumen_kerjasama_terkait:
        // hapus dari Rekap Data (dokumen kerjasama) oleh admin cuma memindahkan dokumennya ke
        // Sampah. Pengajuan sumbernya di Data Pengajuan TIDAK ikut terhapus — masing-masing
        // halaman punya tombol hapus sendiri-sendiri.
        $admin   = $this->admin();
        $pemilik = $this->internal();
        $pengajuanPemilik = $this->buatPengajuanDenganNomor('PMH-' . rand(100, 999));
        $pengajuanPemilik->update(['user_pengusul_id' => $pemilik->id]);
        $dokumen = $this->buatDokumen([
            'nomor_dokumen' => 'DEL-ADMIN-CASCADE',
            'no_permohonan' => $pengajuanPemilik->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuanPemilik->id,
            'dibuat_oleh_user_id' => $pemilik->id,
        ]);

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();

        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
        $this->assertDatabaseHas('pengajuan_v2', ['id' => $pengajuanPemilik->id]);
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
        // Internal/eksternal/kampus-LDAP juga punya tombol Hapus sendiri di Rekap Data mereka —
        // sama seperti admin, ini juga cuma soft delete (dihapus_user_pada), bukan hapus
        // permanen. Bedanya dari dihapus_admin_pada: ini cuma sembunyi dari akunnya sendiri,
        // admin tetap melihatnya untuk keperluan audit/rekap institusi.
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

        // Baris MASIH ada di database.
        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
        $this->assertNotNull($dokumen->fresh()->dihapus_user_pada);

        // Hilang dari daftar & detail milik pemiliknya sendiri.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $pemilikIds);
        $this->actingAs($pemilik)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertNotFound();

        // Admin tetap bisa melihatnya (di daftar biasa maupun detail) untuk audit.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($dokumen->id, $adminIds);
        $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();
    }

    public function test_hapus_dokumen_tidak_ikut_hapus_pengajuan_sumbernya(): void
    {
        // Kebalikan dari test_hapus_pengajuan_tidak_ikut_hapus_dokumen_kerjasama_terkait di
        // PengajuanTest: pemiliknya sendiri menghapus dari Rekap Data (dokumen kerjasama) cuma
        // memindahkan baris dokumen itu ke Sampah — pengajuan sumbernya di Data Pengajuan TIDAK
        // ikut terhapus.
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

        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
        $this->assertDatabaseHas('pengajuan_v2', ['id' => $pengajuanPemilik->id]);
    }

    private function dokumenMilik(User $pemilik): DokumenKerjasama
    {
        $pengajuan = $this->buatPengajuanDenganNomor('PMH-' . rand(100, 999));
        $pengajuan->update(['user_pengusul_id' => $pemilik->id]);

        return $this->buatDokumen([
            'no_permohonan' => $pengajuan->nomor_pengajuan,
            'sumber_pengajuan_id' => $pengajuan->id,
            'dibuat_oleh_user_id' => $pemilik->id,
            'tanggal_mulai' => '2024-01-01',
            'tanggal_berakhir' => '2026-12-31',
        ]);
    }

    private function payloadPerpanjangan(array $override = []): array
    {
        return array_merge([
            'tanggal_mulai_baru' => '2027-01-01',
            'tanggal_berakhir_baru' => '2029-12-31',
            'catatan_perpanjangan' => 'Lanjut kerja sama',
            'bukti_perpanjangan' => 'data:application/pdf;base64,' . base64_encode('%PDF-1.4 test'),
            'bukti_perpanjangan_nama' => 'perpanjangan.pdf',
        ], $override);
    }

    public function test_pemilik_dapat_ajukan_perpanjangan_dan_peran_ditentukan_server(): void
    {
        Storage::fake('public');
        $pemilik = $this->internal();
        $dokumen = $this->dokumenMilik($pemilik);

        // requester_role/notification_href dari klien diabaikan untuk non-admin.
        $this->actingAs($pemilik)->postJson(
            "/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan",
            $this->payloadPerpanjangan(['requester_role' => 'admin', 'notification_href' => '/x'])
        )->assertCreated()
            ->assertJsonPath('data.status', 'menunggu')
            ->assertJsonPath('data.requesterRole', 'internal')
            ->assertJsonPath('data.notificationHref', '/internal/rekap_data');

        // Pemilik hanya melihat permintaannya sendiri; admin melihat semuanya.
        $this->actingAs($pemilik)->getJson('/api/dokumen-kerjasama/perpanjangan/requests')
            ->assertOk()->assertJsonCount(1, 'data');
        $lain = $this->internal();
        $this->actingAs($lain)->getJson('/api/dokumen-kerjasama/perpanjangan/requests')
            ->assertOk()->assertJsonCount(0, 'data');

        // Keputusan tetap hanya di tangan admin.
        $logId = DokumenLog::where('dokumen_id', $dokumen->id)->value('id');
        $this->actingAs($pemilik)->patchJson("/api/dokumen-kerjasama/perpanjangan/{$logId}/status", ['status' => 'disetujui'])
            ->assertForbidden();
    }

    public function test_daftar_dokumen_menyertakan_berkas_pengajuan_final_dan_perpanjangan_tapi_tidak_lampiran_lain(): void
    {
        $dokumen = $this->dokumenMilik($this->internal());
        foreach (['pengajuan_awal', 'dokumen_final', 'dokumen_perpanjangan', 'lampiran'] as $peran) {
            \App\Models\DokumenFile::create([
                'dokumen_id' => $dokumen->id,
                'peran_berkas' => $peran,
                'nama_file' => "{$peran}.pdf",
                'path_file' => "{$peran}.pdf",
            ]);
        }

        $baris = collect($this->actingAs($this->admin())->getJson('/api/dokumen-kerjasama?per_page=200')->assertOk()->json('data.data'))
            ->firstWhere('id', $dokumen->id);

        $peran = collect($baris['dokumen_files'])->pluck('peran_berkas')->sort()->values()->all();
        $this->assertSame(['dokumen_final', 'dokumen_perpanjangan', 'pengajuan_awal'], $peran);
    }

    public function test_perpanjangan_disetujui_mengubah_ruang_lingkup_dokumen_dari_nama_ke_id(): void
    {
        Storage::fake('public');
        $pemilik = $this->internal();
        $dokumen = $this->dokumenMilik($pemilik);
        $idPenelitian = \Illuminate\Support\Facades\DB::table('master_ruang_lingkup')->insertGetId(['nama_ruang_lingkup' => 'Penelitian']);
        $idMagang = \Illuminate\Support\Facades\DB::table('master_ruang_lingkup')->insertGetId(['nama_ruang_lingkup' => 'Magang']);

        $this->actingAs($pemilik)->postJson(
            "/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan",
            $this->payloadPerpanjangan(['ruang_lingkup' => ['penelitian', 'Magang', 'Nama Tidak Ada']])
        )->assertCreated();
        $logId = DokumenLog::where('dokumen_id', $dokumen->id)->value('id');

        $this->actingAs($this->admin())->patchJson("/api/dokumen-kerjasama/perpanjangan/{$logId}/status", ['status' => 'disetujui'])
            ->assertOk();

        $ids = $dokumen->fresh()->ruang_lingkup_ids;
        $this->assertEqualsCanonicalizing([$idPenelitian, $idMagang], $ids, 'nama jadi ID master; nama yang tidak dikenal dibuang');
    }

    public function test_admin_dapat_hapus_permintaan_perpanjangan_dan_non_admin_ditolak(): void
    {
        Storage::fake('public');
        $pemilik = $this->internal();
        $dokumen = $this->dokumenMilik($pemilik);

        $this->actingAs($pemilik)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan", $this->payloadPerpanjangan())
            ->assertCreated();
        $logId = DokumenLog::where('dokumen_id', $dokumen->id)->value('id');

        // Pemilik dokumen bukan admin: tidak boleh menghapus.
        $this->actingAs($pemilik)->deleteJson("/api/dokumen-kerjasama/perpanjangan/{$logId}")->assertForbidden();
        $this->assertDatabaseHas('dokumen_log', ['id' => $logId]);

        $this->actingAs($this->admin())->deleteJson("/api/dokumen-kerjasama/perpanjangan/{$logId}")
            ->assertOk()->assertJsonPath('success', true);
        $this->assertDatabaseMissing('dokumen_log', ['id' => $logId]);
        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
    }

    public function test_hapus_perpanjangan_menolak_log_yang_bukan_perpanjangan(): void
    {
        $dokumen = $this->dokumenMilik($this->internal());
        $log = DokumenLog::create([
            'dokumen_id' => $dokumen->id,
            'tipe_log' => 'catatan',
            'judul_log' => 'bukan perpanjangan',
            'dibuat_pada' => now(),
        ]);

        $this->actingAs($this->admin())->deleteJson("/api/dokumen-kerjasama/perpanjangan/{$log->id}")->assertStatus(422);
        $this->assertDatabaseHas('dokumen_log', ['id' => $log->id]);
    }

    public function test_perpanjangan_disetujui_mengubah_tanggal_rekap_dan_masuk_story_aktivitas(): void
    {
        Storage::fake('public');
        $pemilik = $this->internal();
        $dokumen = $this->dokumenMilik($pemilik);

        $this->actingAs($pemilik)->postJson(
            "/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan",
            $this->payloadPerpanjangan()
        )->assertCreated();
        $logId = DokumenLog::where('dokumen_id', $dokumen->id)->value('id');

        // Ditolak -> tanggal tidak berubah, tidak ada aktivitas.
        $this->actingAs($this->admin())->patchJson("/api/dokumen-kerjasama/perpanjangan/{$logId}/status", ['status' => 'ditolak'])
            ->assertOk();
        $this->assertSame('2026-12-31', $dokumen->fresh()->tanggal_berakhir->toDateString());
        $this->assertDatabaseMissing('pengajuan_aktivitas', ['dokumen_kerjasama_id' => $dokumen->id]);

        // Permintaan baru lalu disetujui -> tanggal Rekap Data berubah & aktivitas tercatat.
        $this->actingAs($pemilik)->postJson(
            "/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan",
            $this->payloadPerpanjangan()
        )->assertCreated();
        $logBaru = DokumenLog::where('dokumen_id', $dokumen->id)->latest('id')->value('id');
        $this->actingAs($this->admin())->patchJson("/api/dokumen-kerjasama/perpanjangan/{$logBaru}/status", ['status' => 'disetujui'])
            ->assertOk();

        $fresh = $dokumen->fresh();
        $this->assertSame('2027-01-01', $fresh->tanggal_mulai->toDateString());
        $this->assertSame('2029-12-31', $fresh->tanggal_berakhir->toDateString());
        $this->assertDatabaseHas('pengajuan_aktivitas', [
            'dokumen_kerjasama_id' => $dokumen->id,
            'judul' => 'Perpanjangan Kerja Sama',
        ]);
    }

    public function test_perpanjangan_disetujui_untuk_dokumen_tanpa_pengajuan_sumber_tetap_masuk_aktivitas(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $dokumen = $this->buatDokumen([
            'tanggal_mulai' => '2024-01-01',
            'tanggal_berakhir' => '2026-12-31',
        ]);

        $this->actingAs($admin)->postJson(
            "/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan",
            $this->payloadPerpanjangan()
        )->assertCreated();
        $logId = DokumenLog::where('dokumen_id', $dokumen->id)->value('id');
        $this->actingAs($admin)->patchJson("/api/dokumen-kerjasama/perpanjangan/{$logId}/status", ['status' => 'disetujui'])
            ->assertOk();

        $this->assertDatabaseHas('pengajuan_aktivitas', [
            'dokumen_kerjasama_id' => $dokumen->id,
            'pengajuan_id' => null,
        ]);
    }

    public function test_perpanjangan_non_pemilik_ditolak_dan_dokumen_wajib_diunggah(): void
    {
        Storage::fake('public');
        $pemilik = $this->internal();
        $dokumen = $this->dokumenMilik($pemilik);

        $this->actingAs($this->internal())->postJson(
            "/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan",
            $this->payloadPerpanjangan()
        )->assertForbidden();

        $this->actingAs($pemilik)->postJson(
            "/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan",
            $this->payloadPerpanjangan(['bukti_perpanjangan' => null])
        )->assertUnprocessable();
    }

    public function test_perpanjangan_kedua_ditolak_selagi_yang_pertama_menunggu(): void
    {
        Storage::fake('public');
        $pemilik = $this->internal();
        $dokumen = $this->dokumenMilik($pemilik);
        $url = "/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan";

        $this->actingAs($pemilik)->postJson($url, $this->payloadPerpanjangan())->assertCreated();
        $this->actingAs($pemilik)->postJson($url, $this->payloadPerpanjangan())->assertUnprocessable();
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

    // ------------------------------------------------------------------
    // Sampah (trash): trashed / restore / destroyPermanent
    // ------------------------------------------------------------------

    public function test_trash_list_hanya_bisa_diakses_admin(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->getJson('/api/dokumen-kerjasama/trash/list')
            ->assertForbidden();
    }

    public function test_admin_dapat_memulihkan_dokumen_dari_sampah(): void
    {
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'RESTORE-001']);

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();
        $this->assertNotNull($dokumen->fresh()->dihapus_admin_pada);

        $this->actingAs($admin)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/restore")
            ->assertOk()->assertJsonPath('success', true);

        $dokumen->refresh();
        $this->assertNull($dokumen->dihapus_admin_pada);
        $this->assertNull($dokumen->dihapus_user_pada);

        // Muncul lagi di daftar normal, hilang dari Sampah.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertContains($dokumen->id, $adminIds);

        $trashIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama/trash/list?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $trashIds);
    }

    public function test_restore_ditolak_kalau_dokumen_tidak_di_sampah(): void
    {
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'RESTORE-002']);

        $this->actingAs($admin)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/restore")
            ->assertStatus(422);
    }

    public function test_restore_ditolak_bukan_admin(): void
    {
        $user    = $this->internal();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'RESTORE-003']);

        $this->actingAs($user)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/restore")
            ->assertForbidden();
    }

    public function test_admin_dapat_hapus_permanen_dokumen_yang_sudah_di_sampah(): void
    {
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'PERMANEN-001']);

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/permanent")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('dokumen_kerjasama', ['id' => $dokumen->id]);
    }

    public function test_hapus_permanen_ditolak_kalau_belum_di_sampah(): void
    {
        // Harus lewat Sampah dulu — tidak bisa langsung hapus permanen dari Rekap Data.
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'PERMANEN-002']);

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/permanent")
            ->assertStatus(422);

        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumen->id]);
    }

    public function test_hapus_permanen_ditolak_bukan_admin(): void
    {
        $user    = $this->internal();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'PERMANEN-003']);

        $this->actingAs($user)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/permanent")
            ->assertForbidden();
    }

    public function test_admin_tetap_bisa_unduh_dokumen_yang_ada_di_sampah(): void
    {
        // Fitur Sampah tidak ada gunanya kalau adminnya sendiri tidak bisa membuka file
        // dokumennya buat dipastikan isinya sebelum memulihkan/menghapus permanen — guardVisibility
        // (yang biasanya menyembunyikan file dokumen yang dihapus_admin_pada) HARUS dilewati
        // untuk admin.
        Storage::fake('public');
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'SAMPAH-FILE-001']);

        $file = UploadedFile::fake()->create('kontrak.pdf', 100, 'application/pdf');
        $upload = $this->actingAs($admin)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/upload-file", [
            'file' => $file,
        ])->assertOk();
        $fileId = $upload->json('data.id');

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();

        $this->actingAs($admin)
            ->get("/api/dokumen-kerjasama/{$dokumen->id}/documents/{$fileId}/download")
            ->assertOk();
    }

    public function test_mitra_stats_menghitung_mitra_unik_bukan_jumlah_dokumen(): void
    {
        $admin = $this->admin();

        // 1 mitra Indonesia non-DUDI (Instansi Dalam Negeri) dengan 3 dokumen berbeda —
        // harus tetap dihitung 1 kali walau dokumennya banyak.
        $mitraInstansi = MasterMitra::create([
            'nama_mitra'     => 'Universitas Test',
            'kategori_mitra' => 'Perguruan Tinggi',
            'negara'         => 'Indonesia',
            'aktif'          => true,
        ]);
        $this->buatDokumen(['nomor_dokumen' => 'STAT-001', 'mitra_id' => $mitraInstansi->id]);
        $this->buatDokumen(['nomor_dokumen' => 'STAT-002', 'mitra_id' => $mitraInstansi->id]);
        $this->buatDokumen(['nomor_dokumen' => 'STAT-003', 'mitra_id' => $mitraInstansi->id]);

        // 1 mitra DUDI luar negeri dengan 2 dokumen — kategori pakai label baru
        // "dudi luar negeri" & negara huruf kapital, untuk pastikan pencocokan
        // tidak hanya cocok ke label lama "Industri"/"Perusahaan".
        $mitraDudiLuar = MasterMitra::create([
            'nama_mitra'     => 'Global Industri Corp',
            'kategori_mitra' => 'dudi luar negeri',
            'negara'         => 'JAPAN',
            'aktif'          => true,
        ]);
        $this->buatDokumen(['nomor_dokumen' => 'STAT-004', 'mitra_id' => $mitraDudiLuar->id]);
        $this->buatDokumen(['nomor_dokumen' => 'STAT-005', 'mitra_id' => $mitraDudiLuar->id]);

        // 1 mitra DUDI dalam negeri TANPA dokumen kerjasama sama sekali —
        // tetap harus ikut dihitung karena sumbernya Data Kemitraan, bukan dokumen.
        MasterMitra::create([
            'nama_mitra'     => 'PT Belum Ada Dokumen',
            'kategori_mitra' => 'Swasta/Dunia Usaha dan Dunia Industri (DUDI)',
            'negara'         => 'indonesia',
            'aktif'          => true,
        ]);

        $response = $this->actingAs($admin)->getJson('/api/dokumen-kerjasama/stats/mitra');

        $response->assertOk()->assertJsonPath('success', true);

        // Total mitra = 3 (sama dengan jumlah baris di Data Kemitraan), walaupun total dokumen = 5.
        $this->assertEquals(3, $response->json('data.total'));
        $this->assertEquals(1, $response->json('data.instansi_nasional'));
        $this->assertEquals(0, $response->json('data.instansi_internasional'));
        $this->assertEquals(1, $response->json('data.dudi_nasional'));
        $this->assertEquals(1, $response->json('data.dudi_internasional'));
        $this->assertEquals(2, $response->json('data.dalam_negeri'));
        $this->assertEquals(1, $response->json('data.luar_negeri'));
    }

    public function test_mitra_stats_menghitung_apa_adanya_termasuk_nama_mitra_yang_duplikat(): void
    {
        // Data Kemitraan (frontend) sengaja TIDAK menggabungkan baris yang nama
        // mitranya sama — mitra yang terinput dobel tetap tampil sebagai baris
        // terpisah supaya admin bisa hapus manual satu-satu. Statistik harus
        // ikut hitung apa adanya (tidak dedup nama), supaya totalnya selalu
        // sama persis dengan jumlah baris yang tampil di Data Kemitraan.
        $admin = $this->admin();

        MasterMitra::create([
            'nama_mitra'     => 'PT Feen Marine',
            'kategori_mitra' => 'Perguruan Tinggi',
            'negara'         => 'Indonesia',
            'aktif'          => true,
        ]);
        MasterMitra::create([
            'nama_mitra'     => '  pt feen marine  ', // sama, cuma beda kapitalisasi & ada spasi
            'kategori_mitra' => 'Perguruan Tinggi',
            'negara'         => 'Indonesia',
            'aktif'          => true,
        ]);
        MasterMitra::create([
            'nama_mitra'     => 'PT Lain Sendirian',
            'kategori_mitra' => 'Perguruan Tinggi',
            'negara'         => 'Indonesia',
            'aktif'          => true,
        ]);

        $response = $this->actingAs($admin)->getJson('/api/dokumen-kerjasama/stats/mitra');

        $response->assertOk();
        // 3 baris di master_mitra -> total statistik juga 3, sama persis
        // (nama yang kebetulan sama TIDAK digabung).
        $this->assertEquals(3, $response->json('data.total'));
        $this->assertEquals(3, $response->json('data.instansi_nasional'));
    }

    public function test_mitra_stats_ikut_turun_saat_mitra_dihapus_dari_data_kemitraan(): void
    {
        $admin = $this->admin();

        $mitra = MasterMitra::create([
            'nama_mitra'     => 'PT Akan Dihapus',
            'kategori_mitra' => 'Perguruan Tinggi',
            'negara'         => 'Indonesia',
            'aktif'          => true,
        ]);

        $before = $this->actingAs($admin)->getJson('/api/dokumen-kerjasama/stats/mitra')->json('data.total');

        $mitra->delete();

        $after = $this->actingAs($admin)->getJson('/api/dokumen-kerjasama/stats/mitra')->json('data.total');

        $this->assertEquals($before - 1, $after);
    }

    public function test_mitra_stats_dalam_luar_negeri_ikut_tingkat_perusahaan_bukan_negara(): void
    {
        // "Dalam Negeri"/"Luar Negeri" harus ikut kartu "Nasional/Lokal" &
        // "Internasional/Multinasional" di Data Kemitraan (field
        // tingkat_perusahaan), BUKAN field negara — keduanya bisa beda:
        // mitra berkantor di Indonesia tapi berskala Internasional tetap
        // dihitung "Luar Negeri" di sini.
        $admin = $this->admin();

        MasterMitra::create([
            'nama_mitra'         => 'PT Skala Internasional Tapi Di Indonesia',
            'kategori_mitra'     => 'Perguruan Tinggi',
            'negara'             => 'Indonesia',
            'tingkat_perusahaan' => 'Internasional',
            'aktif'              => true,
        ]);
        MasterMitra::create([
            'nama_mitra'         => 'PT Skala Nasional',
            'kategori_mitra'     => 'Perguruan Tinggi',
            'negara'             => 'Indonesia',
            'tingkat_perusahaan' => 'Nasional',
            'aktif'              => true,
        ]);
        MasterMitra::create([
            'nama_mitra'         => 'PT Belum Diisi Tingkatnya',
            'kategori_mitra'     => 'Perguruan Tinggi',
            'negara'             => 'Jepang', // tingkat_perusahaan null -> fallback ke negara
            'aktif'              => true,
        ]);

        $response = $this->actingAs($admin)->getJson('/api/dokumen-kerjasama/stats/mitra');

        $response->assertOk();
        $this->assertEquals(3, $response->json('data.total'));
        // Luar Negeri = 2: yang tingkat "Internasional" (walau negara Indonesia)
        // + yang fallback ke negara (Jepang).
        $this->assertEquals(2, $response->json('data.luar_negeri'));
        $this->assertEquals(1, $response->json('data.dalam_negeri'));
    }

    public function test_mitra_stats_mengelompokkan_per_kategori_sesuai_urutan_filter_data_kemitraan(): void
    {
        $admin = $this->admin();

        // Sengaja dibuat urutan input acak & ada kategori di luar daftar filter + kategori kosong.
        foreach ([
            'dudi dalam negeri', 'Pemerintahan', 'Perguruan Tinggi', 'Perguruan Tinggi',
            'Kategori Aneh', null,
        ] as $i => $kategori) {
            MasterMitra::create([
                'nama_mitra'     => "Mitra {$i}",
                'kategori_mitra' => $kategori,
                'aktif'          => true,
            ]);
        }

        $kategori = $this->actingAs($admin)->getJson('/api/dokumen-kerjasama/stats/mitra')
            ->assertOk()->json('data.kategori');

        // Urutan = urutan dropdown Kategori di Data Kemitraan, lalu sisanya di belakang.
        $this->assertSame([
            ['label' => 'Perguruan Tinggi', 'value' => 2],
            ['label' => 'Pemerintahan', 'value' => 1],
            ['label' => 'dudi dalam negeri', 'value' => 1],
            ['label' => 'Belum diisi', 'value' => 1],
            ['label' => 'Kategori Aneh', 'value' => 1],
        ], array_map(fn ($row) => ['label' => $row['label'], 'value' => $row['value']], $kategori));

        // Jumlah semua potongan = total mitra.
        $this->assertSame(6, array_sum(array_column($kategori, 'value')));
    }

    // ------------------------------------------------------------------
    // structural access (Ketua Jurusan/Ketua Prodi/Kepala Unit) — role di DB
    // tetap 'internal', cerminan dari test yang sama di PengajuanTest.
    // ------------------------------------------------------------------

    private function mockCivitasStruktur(array $jurusan = [], array $prodi = [], array $unit = []): void
    {
        $this->mock(\App\Services\CivitasStructureService::class, function ($mock) use ($jurusan, $prodi, $unit) {
            $mock->shouldReceive('getJurusan')->andReturn($jurusan);
            $mock->shouldReceive('getProgramStudi')->andReturn($prodi);
            $mock->shouldReceive('getUnit')->andReturn($unit);
        });
    }

    public function test_dokumen_kerjasama_internal_ditolak_bukan_pemilik(): void
    {
        // Sebelumnya endpoint ini cuma cek kepemilikan untuk dokumen yang sudah
        // dihapus — dokumen normal bisa dibuka siapa saja yang login.
        $pemilik  = $this->internal();
        $penyusup = $this->internal();
        $this->mockCivitasStruktur();
        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'OWN-001', 'dibuat_oleh_user_id' => $pemilik->id]);

        $this->actingAs($penyusup)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertStatus(404);
        $this->actingAs($pemilik)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();
    }

    public function test_ketua_jurusan_melihat_dokumen_kerjasama_jurusan_dan_prodi_di_bawahnya(): void
    {
        $jurusanTI = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Informatika', 'aktif' => true]);
        $prodiTI   = MasterUnitProdi::create(['jenis_node' => 'prodi', 'parent_id' => $jurusanTI->id, 'nama' => 'D3 Teknik Informatika', 'aktif' => true]);
        $jurusanTM = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Mesin', 'aktif' => true]);

        $kajur = $this->internal();
        $kajur->update(['nik' => '221316']);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur(jurusan: [[
            'ID_JURUSAN' => '1', 'NAMA_JURUSAN' => 'TEKNIK INFORMATIKA', 'NAMA_JURUSAN_INGGRIS' => '-',
            'NIK_KAJUR' => '221316', 'NAMA_KAJUR' => 'Budi Santoso',
        ]]);

        $a = $this->buatDokumen(['nomor_dokumen' => 'A-001', 'dibuat_oleh_user_id' => $pemilikLain->id, 'unit_prodi_id' => $jurusanTI->id]);
        $b = $this->buatDokumen(['nomor_dokumen' => 'B-001', 'dibuat_oleh_user_id' => $pemilikLain->id, 'unit_prodi_id' => $prodiTI->id]);
        $c = $this->buatDokumen(['nomor_dokumen' => 'C-001', 'dibuat_oleh_user_id' => $pemilikLain->id, 'unit_prodi_id' => $jurusanTM->id]);

        $response = $this->actingAs($kajur)->getJson('/api/dokumen-kerjasama?per_page=50');
        $response->assertOk();
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($a->id, $ids);
        $this->assertContains($b->id, $ids);
        $this->assertNotContains($c->id, $ids);

        $this->actingAs($kajur)->getJson("/api/dokumen-kerjasama/{$a->id}")->assertOk();
        $this->actingAs($kajur)->getJson("/api/dokumen-kerjasama/{$c->id}")->assertStatus(404);
    }

    // Sebelumnya index() cuma membatasi role internal/unit/jurusan/prodi — role 'external'
    // tidak ikut dibatasi sama sekali, jadi mitra eksternal bisa lihat SEMUA dokumen
    // kerjasama se-institusi lewat Rekap Data/Story & Aktivitas/Monitoring (sama seperti
    // admin). Ini menutup celah itu: eksternal cuma boleh lihat dokumen dari pengajuan
    // miliknya sendiri.
    public function test_eksternal_hanya_melihat_dokumen_kerjasama_miliknya_sendiri(): void
    {
        $pemilik = User::factory()->create(['role' => 'external']);
        $lain = User::factory()->create(['role' => 'external']);

        $pengajuanMilik = Pengajuan::create([
            'nomor_pengajuan' => 'PMH-EXT-001',
            'nama_pengusul' => 'Mitra A',
            'judul_pengajuan' => 'Kerja Sama A',
            'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $pemilik->id,
        ]);
        $pengajuanLain = Pengajuan::create([
            'nomor_pengajuan' => 'PMH-EXT-002',
            'nama_pengusul' => 'Mitra B',
            'judul_pengajuan' => 'Kerja Sama B',
            'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $lain->id,
        ]);

        $dokMilik = $this->buatDokumen(['nomor_dokumen' => 'EXT-A-001', 'sumber_pengajuan_id' => $pengajuanMilik->id]);
        $dokLain = $this->buatDokumen(['nomor_dokumen' => 'EXT-B-001', 'sumber_pengajuan_id' => $pengajuanLain->id]);

        $response = $this->actingAs($pemilik)->getJson('/api/dokumen-kerjasama?per_page=50');
        $response->assertOk();
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($dokMilik->id, $ids);
        $this->assertNotContains($dokLain->id, $ids);
    }

    public function test_eksternal_yang_di_cc_ikut_melihat_dokumen_kerjasama(): void
    {
        $pemilik = User::factory()->create(['role' => 'external']);
        $userCc = User::factory()->create(['role' => 'external']);

        $pengajuan = Pengajuan::create([
            'nomor_pengajuan' => 'PMH-EXT-003',
            'nama_pengusul' => 'Mitra C',
            'judul_pengajuan' => 'Kerja Sama C',
            'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $pemilik->id,
            'distribusi_user_ids' => [$userCc->id],
        ]);

        $dokumen = $this->buatDokumen(['nomor_dokumen' => 'EXT-C-001', 'sumber_pengajuan_id' => $pengajuan->id]);

        $response = $this->actingAs($userCc)->getJson('/api/dokumen-kerjasama?per_page=50');
        $response->assertOk();
        $ids = collect($response->json('data.data'))->pluck('id')->all();

        $this->assertContains($dokumen->id, $ids);
    }
}
