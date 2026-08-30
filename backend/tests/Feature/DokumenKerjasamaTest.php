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
        // "Hapus" oleh admin sekarang hapus PERMANEN dari database (bukan cuma disembunyikan) —
        // hilang dari semua orang termasuk pembuatnya sendiri.
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

        // Baris sudah benar-benar hilang dari database.
        $this->assertDatabaseMissing('dokumen_kerjasama', ['id' => $dokumen->id]);

        // Hilang dari daftar kelola admin.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $adminIds);

        // Sekarang hapus admin sungguhan hilang permanen, jadi pembuatnya sendiri pun sudah
        // tidak bisa melihatnya lagi di daftar maupun detail.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $pemilikIds);
        $this->actingAs($pemilik)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertNotFound();

        // Akun pembuatnya sendiri (login/profil) tidak ikut tersentuh sama sekali.
        $this->assertDatabaseHas('users', ['id' => $pemilik->id, 'email' => $pemilik->email]);
    }

    public function test_admin_hapus_dokumen_tidak_ikut_hapus_pengajuan_sumbernya(): void
    {
        // Kebalikan dari test_admin_hapus_pengajuan_tidak_ikut_hapus_dokumen_kerjasama_terkait:
        // hapus dari Rekap Data (dokumen kerjasama) oleh admin cuma hapus permanen dokumennya
        // saja. Pengajuan sumbernya di Data Pengajuan TIDAK ikut terhapus — masing-masing
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

        $this->assertDatabaseMissing('dokumen_kerjasama', ['id' => $dokumen->id]);
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
        // sama seperti admin sekarang, ini hapus PERMANEN dari database, hilang dari semua orang
        // termasuk admin.
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

        // Baris sudah benar-benar hilang dari database.
        $this->assertDatabaseMissing('dokumen_kerjasama', ['id' => $dokumen->id]);

        // Hilang dari daftar & detail milik pemiliknya sendiri.
        $pemilikIds = collect($this->actingAs($pemilik)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $pemilikIds);
        $this->actingAs($pemilik)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertNotFound();

        // Hilang juga dari admin — hapus sekarang permanen buat siapa saja yang menghapus.
        $adminIds = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?per_page=100')->json('data.data'))
            ->pluck('id');
        $this->assertNotContains($dokumen->id, $adminIds);
        $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertNotFound();
    }

    public function test_hapus_dokumen_tidak_ikut_hapus_pengajuan_sumbernya(): void
    {
        // Kebalikan dari test_hapus_pengajuan_tidak_ikut_hapus_dokumen_kerjasama_terkait di
        // PengajuanTest: pemiliknya sendiri menghapus dari Rekap Data (dokumen kerjasama) cuma
        // menghapus baris dokumen itu saja — pengajuan sumbernya di Data Pengajuan TIDAK ikut
        // terhapus.
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

        $this->assertDatabaseMissing('dokumen_kerjasama', ['id' => $dokumen->id]);
        $this->assertDatabaseHas('pengajuan_v2', ['id' => $pengajuanPemilik->id]);
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
        $kajur->update(['name' => 'Budi Santoso']);
        $pemilikLain = $this->internal();

        $this->mockCivitasStruktur(jurusan: [[
            'ID_JURUSAN' => '1', 'NAMA_JURUSAN' => 'TEKNIK INFORMATIKA', 'NAMA_JURUSAN_INGGRIS' => '-',
            'ID_KAJUR' => '123', 'NAMA_KAJUR' => 'Budi Santoso',
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
}
