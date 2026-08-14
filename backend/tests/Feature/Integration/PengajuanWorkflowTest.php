<?php

namespace Tests\Feature\Integration;

use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use App\Models\MasterRuangLingkup;
use App\Models\MasterUnitProdi;
use App\Models\OtpCode;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Integration test yang mensimulasikan alur kerja nyata dari registrasi
 * pengguna hingga pengelolaan pengajuan kerja sama oleh admin.
 */
class PengajuanWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->admin()->create([
            'name'     => 'Admin SIKERMA',
            'email'    => 'admin@polibatam.ac.id',
            'username' => 'adminsikerma',
        ]);
    }

    // ------------------------------------------------------------------
    // Alur 1: Registrasi → Login → Logout
    // ------------------------------------------------------------------

    public function test_alur_registrasi_dan_login_mitra_berhasil(): void
    {
        Mail::fake();

        // 1. Registrasi akun mitra eksternal
        $registerResponse = $this->postJson('/api/register', [
            'name'                  => 'Budi Santoso',
            'institution_name'      => 'PT Teknologi Maju',
            'negara'                => 'Indonesia',
            'username'              => 'budisantoso',
            'email'                 => 'budi@ptmaju.com',
            'phone'                 => '08123456789',
            'position'              => 'Direktur',
            'account_type'          => 'Industri',
            'role'                  => 'external',
            'password'              => 'Password@123',
            'password_confirmation' => 'Password@123',
        ]);

        $registerResponse->assertCreated()
            ->assertJsonPath('user.role', 'external')
            ->assertJsonPath('user.approval_status', 'active');

        $this->assertDatabaseHas('users', ['email' => 'budi@ptmaju.com']);
        // Registrasi mitra otomatis membuat data di master_mitra
        $this->assertDatabaseHas('master_mitra', ['nama_mitra' => 'PT Teknologi Maju']);

        // 2. Login dengan akun yang baru dibuat
        $loginResponse = $this->postJson('/api/login', [
            'email'    => 'budi@ptmaju.com',
            'password' => 'Password@123',
            'role'     => 'external',
        ]);

        $loginResponse->assertOk()
            ->assertJsonStructure(['access_token', 'user'])
            ->assertJsonPath('user.email', 'budi@ptmaju.com');

        $token = $loginResponse->json('access_token');

        // 3. Akses endpoint /me dengan token
        $this->withToken($token)->getJson('/api/me')
            ->assertOk()->assertJsonPath('user.email', 'budi@ptmaju.com');

        // 4. Logout
        $this->withToken($token)->postJson('/api/logout')
            ->assertOk()->assertJsonFragment(['message' => 'Logout berhasil.']);

        // 5. Token sudah dihapus dari database setelah logout
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    // ------------------------------------------------------------------
    // Alur 2: Admin Setup Master Data
    // ------------------------------------------------------------------

    public function test_admin_dapat_setup_master_data_lengkap(): void
    {
        // Buat negara
        $negara = $this->actingAs($this->admin)->postJson('/api/master/negara', [
            'nama_negara' => 'Jepang',
            'aktif'       => true,
        ]);
        $negara->assertCreated();

        // Buat mitra
        $mitra = $this->actingAs($this->admin)->postJson('/api/master/mitra', [
            'nama_mitra'    => 'Kyoto University',
            'kategori_mitra' => 'Perguruan Tinggi',
            'negara'        => 'Jepang',
            'email_mitra'   => 'intl@kyoto.ac.jp',
            'aktif'         => true,
        ]);
        $mitra->assertCreated();
        $mitraId = $mitra->json('data.id');

        // Buat unit/prodi
        $jurusan = $this->actingAs($this->admin)->postJson('/api/master/unit-prodi', [
            'jenis_node'    => 'unit',
            'kategori_unit' => 'jurusan',
            'nama'          => 'Teknik Informatika',
            'aktif'         => true,
        ]);
        $jurusan->assertCreated();
        $jurusanId = $jurusan->json('data.id');

        $prodi = $this->actingAs($this->admin)->postJson('/api/master/unit-prodi', [
            'parent_id'  => $jurusanId,
            'jenis_node' => 'prodi',
            'nama'       => 'D4 Teknik Informatika',
            'aktif'      => true,
        ]);
        $prodi->assertCreated();

        // Buat ruang lingkup
        $ruangLingkup = $this->actingAs($this->admin)->postJson('/api/master/ruang-lingkup', [
            'nama_ruang_lingkup' => 'Pendidikan dan Pelatihan',
            'aktif'              => true,
        ]);
        $ruangLingkup->assertCreated();
        $rlId = $ruangLingkup->json('data.id');

        // Verifikasi semua data tersimpan
        $this->assertDatabaseHas('master_negara', ['nama_negara' => 'Jepang']);
        $this->assertDatabaseHas('master_mitra', ['nama_mitra' => 'Kyoto University']);
        $this->assertDatabaseHas('master_unit_prodi', ['nama' => 'Teknik Informatika']);
        $this->assertDatabaseHas('master_unit_prodi', ['nama' => 'D4 Teknik Informatika', 'parent_id' => $jurusanId]);
        $this->assertDatabaseHas('master_ruang_lingkup', ['nama_ruang_lingkup' => 'Pendidikan dan Pelatihan']);
    }

    // ------------------------------------------------------------------
    // Alur 3: Pengajuan Kerja Sama Penuh
    // ------------------------------------------------------------------

    public function test_alur_pengajuan_dari_buat_hingga_diproses_admin(): void
    {
        // Setup master data
        $mitra = MasterMitra::create([
            'nama_mitra' => 'Universitas Partner',
            'kategori_mitra' => 'Perguruan Tinggi',
            'aktif' => true,
        ]);
        $jurusan = MasterUnitProdi::create([
            'jenis_node'    => 'unit',
            'kategori_unit' => 'jurusan',
            'nama'          => 'Teknik Elektro',
            'aktif'         => true,
        ]);
        $rl = MasterRuangLingkup::create([
            'nama_ruang_lingkup' => 'Penelitian Bersama',
            'aktif'              => true,
        ]);

        $internal = User::factory()->create(['role' => 'internal']);

        // 1. User internal membuat pengajuan
        $buatResponse = $this->actingAs($internal)->postJson('/api/pengajuan', [
            'nama_pengusul'      => 'Dr. Rahmat',
            'jabatan_pengusul'   => 'Dosen Senior',
            'email_pengusul'     => 'rahmat@polibatam.ac.id',
            'whatsapp_pengusul'  => '081234567890',
            'unit_prodi_id'      => $jurusan->id,
            'mitra_id'           => $mitra->id,
            'nama_mitra'         => 'Universitas Partner',
            'judul_pengajuan'    => 'MOU Penelitian AI Bersama',
            'deskripsi_pengajuan' => 'Kerja sama di bidang kecerdasan buatan',
            'jenis_dokumen'      => 'MOU',
            'kategori_pengajuan' => 'eksternal',
            'ruang_lingkup_ids'  => [$rl->id],
            'tanggal_mulai'      => '2026-07-01',
            'tanggal_berakhir'   => '2029-06-30',
        ]);

        $buatResponse->assertCreated();
        $pengajuanId = $buatResponse->json('data.id');
        $nomorPMH    = $buatResponse->json('data.nomor_pengajuan');

        // Verifikasi pengajuan tercreate dengan benar
        $this->assertStringStartsWith('PMH-', $nomorPMH);
        $pengajuanDb = Pengajuan::find($pengajuanId);
        $this->assertEquals('menunggu', $pengajuanDb->status_pengajuan);
        $this->assertEquals('Pengajuan Awal', $buatResponse->json('data.tahapan_stage'));

        // 2. Admin melihat daftar pengajuan
        $listResponse = $this->actingAs($this->admin)->getJson('/api/pengajuan?status_pengajuan=menunggu');

        $listResponse->assertOk();
        $found = collect($listResponse->json('data.data'))->first(fn ($p) => $p['id'] === $pengajuanId);
        $this->assertNotNull($found, 'Pengajuan seharusnya muncul di daftar');

        // 3. Admin mengubah status ke diproses
        $prosesResponse = $this->actingAs($this->admin)->putJson("/api/pengajuan/{$pengajuanId}", [
            'status_pengajuan' => 'diproses',
        ]);

        $prosesResponse->assertOk();
        $this->assertEquals('diproses', $prosesResponse->json('data.status_pengajuan'));

        // 4. Admin menambahkan catatan
        $catatanResponse = $this->actingAs($this->admin)->postJson('/api/catatan-admin', [
            'pengajuan_id' => $pengajuanId,
            'teks'         => 'Dokumen perlu dilengkapi dengan surat rekomendasi dari pimpinan.',
        ]);

        $catatanResponse->assertCreated();
        $catatanId = $catatanResponse->json('data.id');

        // 5. Admin update tahapan
        $tahapanResponse = $this->actingAs($this->admin)->patchJson("/api/pengajuan/{$pengajuanId}/tahapan", [
            'stage' => 'Review Dokumen',
            'group' => 'in_progress',
        ]);

        $tahapanResponse->assertOk()->assertJsonPath('data.tahapan_stage', 'Review Dokumen');

        // 6. Admin menolak pengajuan dengan catatan revisi
        $tolakResponse = $this->actingAs($this->admin)->putJson("/api/pengajuan/{$pengajuanId}", [
            'status_pengajuan' => 'revisi',
            'catatan_revisi'   => 'Harap tambahkan dokumen bukti kolaborasi sebelumnya',
        ]);

        $tolakResponse->assertOk();
        $this->assertEquals('revisi', $tolakResponse->json('data.status_pengajuan'));

        // 7. Verifikasi state akhir
        $pengajuanFinal = Pengajuan::find($pengajuanId);
        $this->assertEquals('revisi', $pengajuanFinal->status_pengajuan);
        $this->assertNotNull($pengajuanFinal->catatan_revisi);

        $this->assertDatabaseHas('catatan_admin', [
            'id'           => $catatanId,
            'pengajuan_id' => $pengajuanId,
        ]);
    }

    // ------------------------------------------------------------------
    // Alur 4: Pengajuan dengan Aktivitas
    // ------------------------------------------------------------------

    public function test_alur_pengajuan_dengan_aktivitas(): void
    {
        $internal  = User::factory()->create(['role' => 'internal']);
        $pengajuan = Pengajuan::create([
            'nama_pengusul'    => 'Dr. Siti',
            'judul_pengajuan'  => 'MOU Penelitian Lingkungan',
            'jenis_dokumen'    => 'MOA',
            'status_pengajuan' => 'diproses',
            'ruang_lingkup_ids' => [],
            // Pemilik pengajuan harus sama dengan user yang menambah/mengubah
            // aktivitas di bawah, sesuai aturan kepemilikan pada endpoint ini.
            'user_pengusul_id' => $internal->id,
        ]);

        // Tambah aktivitas
        $akt1 = $this->actingAs($internal)->postJson('/api/pengajuan-aktivitas', [
            'pengajuan_id'    => $pengajuan->id,
            'judul'           => 'Kick-off Meeting',
            'jenis_aktivitas' => 'Rapat',
            'tanggal'         => '2026-07-15',
            'status'          => 'direncanakan',
        ]);
        $akt1->assertCreated();

        $akt2 = $this->actingAs($internal)->postJson('/api/pengajuan-aktivitas', [
            'pengajuan_id'    => $pengajuan->id,
            'judul'           => 'Seminar Bersama',
            'jenis_aktivitas' => 'Seminar',
            'tanggal'         => '2026-08-01',
            'jumlah_peserta'  => 100,
            'status'          => 'direncanakan',
        ]);
        $akt2->assertCreated();
        $akt2Id = $akt2->json('data.id');

        // Update status aktivitas pertama
        $this->actingAs($internal)->putJson("/api/pengajuan-aktivitas/{$akt1->json('data.id')}", [
            'pengajuan_id'    => $pengajuan->id,
            'judul'           => 'Kick-off Meeting',
            'jenis_aktivitas' => 'Rapat',
            'tanggal'         => '2026-07-15',
            'status'          => 'selesai',
        ])->assertOk()->assertJsonPath('data.status', 'selesai');

        // Verifikasi list aktivitas
        $listAktivitas = $this->actingAs($internal)->getJson("/api/pengajuan-aktivitas?pengajuan_id={$pengajuan->id}");
        $listAktivitas->assertOk()->assertJsonCount(2, 'data');

        // Hapus aktivitas kedua
        $this->actingAs($internal)->deleteJson("/api/pengajuan-aktivitas/{$akt2Id}")
            ->assertOk();

        // Verifikasi hanya satu aktivitas tersisa
        $this->actingAs($internal)->getJson("/api/pengajuan-aktivitas?pengajuan_id={$pengajuan->id}")
            ->assertOk()->assertJsonCount(1, 'data');
    }

    // ------------------------------------------------------------------
    // Alur 5: Manajemen User oleh Admin
    // ------------------------------------------------------------------

    public function test_admin_dapat_kelola_user_penuh(): void
    {
        // Admin buat user baru
        $createResponse = $this->actingAs($this->admin)->postJson('/api/admin/users', [
            'name'             => 'Staff Baru',
            'institution_name' => 'Polibatam',
            'username'         => 'staffbaru',
            'email'            => 'staff@polibatam.ac.id',
            'phone'            => '08111111111',
            'position'         => 'Staf',
            'role'             => 'internal',
            'approval_status'  => 'active',
            'password'         => 'Password@123',
        ]);

        $createResponse->assertCreated();
        $userId = $createResponse->json('user.id');

        // Admin update data user
        $this->actingAs($this->admin)->putJson("/api/admin/users/{$userId}", [
            'name'             => 'Staff Update',
            'institution_name' => 'Polibatam',
            'username'         => 'staffbaru',
            'email'            => 'staff@polibatam.ac.id',
            'phone'            => '08111111111',
        ])->assertOk()->assertJsonPath('user.name', 'Staff Update');

        // Admin ubah approval status
        $this->actingAs($this->admin)->patchJson("/api/admin/users/{$userId}/approval-status", [
            'approval_status' => 'pending',
        ])->assertOk()->assertJsonPath('user.approval_status', 'pending');

        // Admin hapus user
        $this->actingAs($this->admin)->deleteJson("/api/admin/users/{$userId}")
            ->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $userId]);
    }

    // ------------------------------------------------------------------
    // Alur 6: OTP Flow - Reset Password
    // ------------------------------------------------------------------

    public function test_alur_reset_password_via_otp(): void
    {
        Mail::fake();

        // User yang ingin reset password (pakai role yang login lokal, bukan lewat LDAP)
        $user = User::factory()->create([
            'email'    => 'resetme@test.com',
            'password' => Hash::make('OldPassword@123'),
            'role'     => 'external',
        ]);

        // 1. Request reset password
        $forgotResponse = $this->postJson('/api/forgot-password', [
            'email' => 'resetme@test.com',
        ]);
        $forgotResponse->assertOk()->assertJsonStructure(['message']);

        // 2. Ambil OTP dari database
        $otpRecord = OtpCode::where('email', 'resetme@test.com')->first();
        $this->assertNotNull($otpRecord);
        $otp = $otpRecord->otp;

        // 3. Reset password dengan OTP
        $resetResponse = $this->postJson('/api/reset-password', [
            'email'                 => 'resetme@test.com',
            'otp'                   => $otp,
            'password'              => 'NewPassword@456',
            'password_confirmation' => 'NewPassword@456',
        ]);
        $resetResponse->assertOk()->assertJsonStructure(['message']);

        // 4. Login dengan password baru
        $loginNew = $this->postJson('/api/login', [
            'email'    => 'resetme@test.com',
            'password' => 'NewPassword@456',
            'role'     => $user->role,
        ]);
        $loginNew->assertOk()->assertJsonStructure(['access_token']);

        // 5. Login dengan password lama harus gagal
        $loginOld = $this->postJson('/api/login', [
            'email'    => 'resetme@test.com',
            'password' => 'OldPassword@123',
            'role'     => $user->role,
        ]);
        $loginOld->assertUnprocessable();
    }

    // ------------------------------------------------------------------
    // Alur 7: Dokumen Kerjasama CRUD
    // ------------------------------------------------------------------

    public function test_admin_dapat_kelola_dokumen_kerjasama_penuh(): void
    {
        // Setup
        $pengajuan = Pengajuan::create([
            'nomor_pengajuan'  => 'PMH-DK-001',
            'nama_pengusul'    => 'Dr. Test DK',
            'judul_pengajuan'  => 'Test DK',
            'jenis_dokumen'    => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
        ]);

        // Buat dokumen
        $buatResponse = $this->actingAs($this->admin)->postJson('/api/dokumen-kerjasama', [
            'no_permohonan' => $pengajuan->nomor_pengajuan,
            'nomor_dokumen' => 'INT-001/MOU.PL29/VI/2026',
            'nama_dokumen'  => 'MOU Integrasi Test',
            'jenis_dokumen' => 'MOU',
            'file'          => 'pengajuan/2026/06/mou.pdf',
            'status_siklus' => 'active',
        ]);
        $buatResponse->assertCreated();
        $dokumenId = $buatResponse->json('data.id');

        // Update dokumen
        $this->actingAs($this->admin)->putJson("/api/dokumen-kerjasama/{$dokumenId}", [
            'nama_dokumen' => 'MOU Integrasi Updated',
        ])->assertOk()->assertJsonPath('data.nama_dokumen', 'MOU Integrasi Updated');

        // Arsipkan dokumen
        $this->actingAs($this->admin)->putJson("/api/dokumen-kerjasama/{$dokumenId}", [
            'status_siklus' => 'archived',
            'alasan_arsip'  => 'Masa berlaku telah habis',
        ])->assertOk();

        $this->assertEquals('archived', DokumenKerjasama::find($dokumenId)->status_siklus);

        // Hapus dokumen — soft delete: baris tetap ada supaya riwayat pemiliknya tidak hilang,
        // tapi ditandai dihapus & hilang dari daftar kelola admin (lihat DokumenKerjasamaTest
        // untuk pengecekan detail visibilitasnya).
        $this->actingAs($this->admin)->deleteJson("/api/dokumen-kerjasama/{$dokumenId}")
            ->assertOk();

        $this->assertDatabaseHas('dokumen_kerjasama', ['id' => $dokumenId]);
        $this->assertNotNull(DokumenKerjasama::find($dokumenId)->dihapus_admin_pada);

        $adminIds = collect($this->actingAs($this->admin)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumenId, $adminIds);
    }
}
