<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PublicEndpointTest extends TestCase
{
    use RefreshDatabase;

    // ------------------------------------------------------------------
    // Carousel Images (public GET)
    // ------------------------------------------------------------------

    public function test_carousel_images_dapat_diakses_tanpa_auth(): void
    {
        $response = $this->getJson('/api/carousel-images');

        $response->assertOk();
    }

    // ------------------------------------------------------------------
    // Public Unit Prodi
    // ------------------------------------------------------------------

    public function test_public_unit_prodi_dapat_diakses_tanpa_auth(): void
    {
        MasterUnitProdi::create([
            'jenis_node'    => 'unit',
            'kategori_unit' => 'jurusan',
            'nama'          => 'Teknik Informatika',
            'aktif'         => true,
        ]);

        $response = $this->getJson('/api/public/unit-prodi');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data.jurusan');
        $this->assertEquals('Teknik Informatika', $response->json('data.jurusan.0'));
        $this->assertCount(0, $response->json('data.prodi'));
        $this->assertCount(0, $response->json('data.unit'));
    }

    public function test_public_unit_prodi_hanya_tampilkan_yang_aktif(): void
    {
        MasterUnitProdi::create([
            'jenis_node' => 'unit',
            'kategori_unit' => 'jurusan',
            'nama' => 'Unit Aktif',
            'aktif' => true,
        ]);
        MasterUnitProdi::create([
            'jenis_node' => 'unit',
            'kategori_unit' => 'jurusan',
            'nama' => 'Unit Nonaktif',
            'aktif' => false,
        ]);

        $response = $this->getJson('/api/public/unit-prodi');

        $response->assertOk()->assertJsonCount(1, 'data.jurusan');
    }

    public function test_public_unit_prodi_dipisah_per_kategori(): void
    {
        MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Jurusan Teknik Informatika', 'aktif' => true]);
        MasterUnitProdi::create(['jenis_node' => 'prodi', 'nama' => 'D4 Teknik Informatika', 'aktif' => true]);
        MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'Bagian Kerjasama', 'aktif' => true]);

        $response = $this->getJson('/api/public/unit-prodi');

        $response->assertOk();
        $this->assertEquals(['Jurusan Teknik Informatika'], $response->json('data.jurusan'));
        $this->assertEquals(['D4 Teknik Informatika'], $response->json('data.prodi'));
        $this->assertEquals(['Bagian Kerjasama'], $response->json('data.unit'));
    }

    // ------------------------------------------------------------------
    // Public Kerjasama
    // ------------------------------------------------------------------

    public function test_public_kerjasama_dapat_diakses_tanpa_auth(): void
    {
        $response = $this->getJson('/api/public/kerjasama');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => ['data', 'total', 'per_page', 'current_page', 'last_page'],
            ]);
    }

    public function test_public_kerjasama_menampilkan_data(): void
    {
        $pengajuan = Pengajuan::create([
            'nomor_pengajuan'  => 'PMH-PUB-001',
            'nama_pengusul'    => 'Test',
            'judul_pengajuan'  => 'Test Publik',
            'jenis_dokumen'    => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
        ]);

        DokumenKerjasama::create([
            'no_permohonan' => $pengajuan->nomor_pengajuan,
            'nomor_dokumen' => 'PUB-001',
            'nama_dokumen'  => 'Dokumen Publik',
            'jenis_dokumen' => 'MOU',
            'file'          => 'test.pdf',
        ]);

        $response = $this->getJson('/api/public/kerjasama');

        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, $response->json('data.total'));
    }

    public function test_public_kerjasama_tidak_menampilkan_dokumen_yang_dihapus(): void
    {
        $base = ['jenis_dokumen' => 'MOU', 'file' => 't.pdf', 'nama_dokumen' => 'Dok'];
        DokumenKerjasama::create($base + ['no_permohonan' => 'PUB-A', 'nomor_dokumen' => 'PUB-A']);
        DokumenKerjasama::create($base + ['no_permohonan' => 'PUB-B', 'nomor_dokumen' => 'PUB-B', 'dihapus_admin_pada' => now()]);
        DokumenKerjasama::create($base + ['no_permohonan' => 'PUB-C', 'nomor_dokumen' => 'PUB-C', 'dihapus_user_pada' => now()]);

        $response = $this->getJson('/api/public/kerjasama');

        $response->assertOk();
        $this->assertSame(1, $response->json('data.total'));
    }

    public function test_public_stats_tidak_menghitung_dokumen_yang_dihapus(): void
    {
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Stat', 'kategori_mitra' => 'Industri', 'negara' => 'Jepang', 'aktif' => true]);
        $base = ['jenis_dokumen' => 'MOU', 'file' => 't.pdf', 'nama_dokumen' => 'Dok', 'mitra_id' => $mitra->id];
        DokumenKerjasama::create($base + ['no_permohonan' => 'ST-A', 'nomor_dokumen' => 'ST-A']);
        DokumenKerjasama::create($base + ['no_permohonan' => 'ST-B', 'nomor_dokumen' => 'ST-B', 'dihapus_admin_pada' => now()]);
        DokumenKerjasama::create($base + ['no_permohonan' => 'ST-C', 'nomor_dokumen' => 'ST-C', 'dihapus_user_pada' => now()]);

        $response = $this->getJson('/api/public/stats');

        $response->assertOk();
        $this->assertSame(1, $response->json('data.total'));
        $this->assertSame(1, $response->json('data.luar_negeri'));
        $this->assertSame(1, $response->json('data.dudi_internasional'));
    }

    public function test_public_kerjasama_per_page_maksimal_1000(): void
    {
        $response = $this->getJson('/api/public/kerjasama?per_page=9999');

        $response->assertOk();
        $this->assertLessThanOrEqual(1000, $response->json('data.per_page'));
    }

    // ------------------------------------------------------------------
    // Public Stats
    // ------------------------------------------------------------------

    public function test_public_stats_dapat_diakses_tanpa_auth(): void
    {
        $response = $this->getJson('/api/public/stats');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'total', 'dalam_negeri', 'luar_negeri',
                    'dudi_nasional', 'dudi_internasional',
                    'instansi_nasional', 'instansi_internasional',
                ],
            ]);
    }

    public function test_public_stats_total_kosong_saat_tidak_ada_data(): void
    {
        $response = $this->getJson('/api/public/stats');

        $response->assertOk();
        $this->assertEquals(0, $response->json('data.total'));
        $this->assertEquals(0, $response->json('data.luar_negeri'));
    }

    public function test_mitra_stats_dapat_diakses_tanpa_auth(): void
    {
        // Dipakai landing page publik juga (bukan cuma dashboard admin),
        // jadi harus bisa diakses tanpa login.
        $response = $this->getJson('/api/dokumen-kerjasama/stats/mitra');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'total', 'dalam_negeri', 'luar_negeri',
                    'dudi_nasional', 'dudi_internasional',
                    'instansi_nasional', 'instansi_internasional',
                ],
            ]);
    }

    public function test_public_stats_menghitung_luar_negeri_dengan_benar(): void
    {
        $mitraIndo = MasterMitra::create([
            'nama_mitra'    => 'PT Indonesia',
            'negara'        => 'Indonesia',
            'aktif'         => true,
        ]);
        $mitraLuar = MasterMitra::create([
            'nama_mitra'    => 'Japan Corp',
            'negara'        => 'Jepang',
            'aktif'         => true,
        ]);

        $pengajuan1 = Pengajuan::create([
            'nomor_pengajuan'  => 'PMH-STAT-001',
            'nama_pengusul'    => 'Test',
            'judul_pengajuan'  => 'Test',
            'jenis_dokumen'    => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
        ]);
        $pengajuan2 = Pengajuan::create([
            'nomor_pengajuan'  => 'PMH-STAT-002',
            'nama_pengusul'    => 'Test',
            'judul_pengajuan'  => 'Test',
            'jenis_dokumen'    => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
        ]);

        DokumenKerjasama::create([
            'no_permohonan' => $pengajuan1->nomor_pengajuan,
            'nomor_dokumen' => 'STAT-001',
            'nama_dokumen'  => 'Dok Indo',
            'jenis_dokumen' => 'MOU',
            'file'          => 'test.pdf',
            'mitra_id'      => $mitraIndo->id,
        ]);
        DokumenKerjasama::create([
            'no_permohonan' => $pengajuan2->nomor_pengajuan,
            'nomor_dokumen' => 'STAT-002',
            'nama_dokumen'  => 'Dok Jepang',
            'jenis_dokumen' => 'MOU',
            'file'          => 'test2.pdf',
            'mitra_id'      => $mitraLuar->id,
        ]);

        $response = $this->getJson('/api/public/stats');

        $response->assertOk();
        $this->assertEquals(2, $response->json('data.total'));
        $this->assertEquals(1, $response->json('data.luar_negeri'));
        $this->assertEquals(1, $response->json('data.dalam_negeri'));
    }

    // ------------------------------------------------------------------
    // OTP endpoints (no auth for send/verify)
    // ------------------------------------------------------------------

    public function test_kirim_otp_dapat_diakses_tanpa_auth(): void
    {
        $response = $this->postJson('/api/otp/send', [
            'name'                  => 'Test User',
            'institution_name'      => 'PT Test',
            'negara'                => 'Indonesia',
            'username'              => 'testuser123',
            'email'                 => 'test@example.com',
            'phone'                 => '081234567890',
            'position'              => 'Staf',
            'account_type'          => 'Industri',
            'password'              => 'Password@123',
            'password_confirmation' => 'Password@123',
        ]);

        // Endpoint accessible without auth — returns 200 on success or 422 on validation, never 401
        $this->assertNotEquals(401, $response->status());
        $response->assertJsonStructure(['message']);
    }
}
