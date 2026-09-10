<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\LaporanPelaksanaan;
use App\Models\Pengajuan;
use App\Models\PengajuanAktivitas;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Monev Triwulan di Rekap Data -> Detail Kerjasama: menggabungkan aktivitas dari Story
 * (pengajuan_aktivitas, dikelompokkan otomatis per triwulan dari tanggalnya) dengan
 * catatan Monev manual (laporan_pelaksanaan).
 *
 * Diikat ke DokumenKerjasama (bukan Pengajuan) karena itulah yang selalu tersedia untuk
 * setiap baris Detail Kerjasama — banyak dokumen (terutama data lama/import) TIDAK
 * punya `sumber_pengajuan_id`, jadi Monev manual harus tetap bisa diisi untuk dokumen
 * semacam itu (lihat test_monev_manual_tetap_bisa_diisi_tanpa_pengajuan_sumber).
 */
class PengajuanMonevTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function buatPengajuan(): Pengajuan
    {
        return Pengajuan::create([
            'nama_pengusul'     => 'Dr. Test',
            'judul_pengajuan'   => 'Kerja Sama Test',
            'jenis_dokumen'     => 'MOU',
            'status_pengajuan'  => 'menunggu',
            'ruang_lingkup_ids' => [],
        ]);
    }

    private function buatDokumen(?Pengajuan $sumberPengajuan = null): DokumenKerjasama
    {
        return DokumenKerjasama::create([
            'no_permohonan'         => $sumberPengajuan?->nomor_pengajuan ?? ('PMH-' . rand(1000, 9999)),
            'nomor_dokumen'         => '001/MOU.PL29/I/2026',
            'nama_dokumen'          => 'Dokumen Kerja Sama',
            'jenis_dokumen'         => 'MOU',
            'file'                  => 'pengajuan/2026/01/dokumen.pdf',
            'sumber_pengajuan_id'   => $sumberPengajuan?->id,
        ]);
    }

    public function test_monev_tanpa_auth_ditolak(): void
    {
        $dokumen = $this->buatDokumen();

        $response = $this->getJson("/api/dokumen-kerjasama/{$dokumen->id}/monev");

        $response->assertStatus(401);
    }

    public function test_monev_ditolak_untuk_bukan_admin(): void
    {
        $user    = User::factory()->create(['role' => 'internal']);
        $dokumen = $this->buatDokumen();

        $response = $this->actingAs($user)->getJson("/api/dokumen-kerjasama/{$dokumen->id}/monev");

        $response->assertStatus(403);
    }

    /**
     * Kasus paling penting: dokumen TANPA pengajuan sumber (mayoritas data rekap saat
     * ini) tetap harus bisa diisi Monev manualnya — sebelumnya fitur ini salah dikunci
     * ke pengajuan_id sehingga Monev tidak bisa diisi sama sekali untuk dokumen begini.
     */
    public function test_monev_manual_tetap_bisa_diisi_tanpa_pengajuan_sumber(): void
    {
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen(sumberPengajuan: null);

        $response = $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}/monev");
        $response->assertOk()->assertJsonPath('success', true)->assertJsonPath('data.pengajuan_id', null);

        $kirim = $this->actingAs($admin)->postJson('/api/laporan-pelaksanaan', [
            'dokumen_kerjasama_id' => $dokumen->id,
            'tahun'                => 2026,
            'triwulan'             => 2,
            'kegiatan'             => 'Catatan monitoring',
            'hasil'                => 'Hasil evaluasi',
            'kendala'              => 'Ada kendala teknis',
            'tindak_lanjut'        => 'Tindak lanjut disepakati',
        ]);
        $kirim->assertCreated()->assertJsonPath('success', true);

        $response = $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}/monev");
        $quarters = collect($response->json('data.quarters'));
        $triwulan2 = $quarters->firstWhere(fn ($q) => $q['tahun'] === 2026 && $q['triwulan'] === 2);

        $this->assertCount(0, $triwulan2['aktivitas']); // tidak ada Story karena tidak ada pengajuan sumber
        $this->assertCount(1, $triwulan2['monev']);
        $this->assertSame('Catatan monitoring', $triwulan2['monev'][0]['kegiatan']);
    }

    public function test_aktivitas_muncul_di_triwulan_yang_benar_sesuai_tanggal(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();
        $dokumen   = $this->buatDokumen($pengajuan);

        PengajuanAktivitas::create([
            'pengajuan_id'    => $pengajuan->id,
            'judul'           => 'Seminar Industri',
            'jenis_aktivitas' => 'Seminar',
            'tanggal'         => '2026-05-15', // Mei -> Triwulan II
            'status'          => 'selesai',
        ]);

        $response = $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}/monev");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.pengajuan_id', $pengajuan->id);

        $quarters = collect($response->json('data.quarters'));
        $triwulan2 = $quarters->firstWhere(fn ($q) => $q['tahun'] === 2026 && $q['triwulan'] === 2);

        $this->assertNotNull($triwulan2);
        $this->assertSame('Triwulan II (Apr-Jun)', $triwulan2['label']);
        $this->assertCount(1, $triwulan2['aktivitas']);
        $this->assertSame('Seminar Industri', $triwulan2['aktivitas'][0]['judul']);

        // Triwulan lain untuk tahun yang sama tetap ada (kosong), bukan hilang.
        $triwulan1 = $quarters->firstWhere(fn ($q) => $q['tahun'] === 2026 && $q['triwulan'] === 1);
        $this->assertNotNull($triwulan1);
        $this->assertCount(0, $triwulan1['aktivitas']);
    }

    public function test_ubah_tanggal_aktivitas_memindahkan_triwulan(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();
        $dokumen   = $this->buatDokumen($pengajuan);

        $aktivitas = PengajuanAktivitas::create([
            'pengajuan_id'    => $pengajuan->id,
            'judul'           => 'Seminar Industri',
            'jenis_aktivitas' => 'Seminar',
            'tanggal'         => '2026-05-15', // Triwulan II
            'status'          => 'selesai',
        ]);

        $aktivitas->update(['tanggal' => '2026-08-10']); // pindah ke Triwulan III

        $response = $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}/monev");
        $quarters = collect($response->json('data.quarters'));

        $triwulan2 = $quarters->firstWhere(fn ($q) => $q['tahun'] === 2026 && $q['triwulan'] === 2);
        $triwulan3 = $quarters->firstWhere(fn ($q) => $q['tahun'] === 2026 && $q['triwulan'] === 3);

        $this->assertCount(0, $triwulan2['aktivitas']);
        $this->assertCount(1, $triwulan3['aktivitas']);
        $this->assertSame('Seminar Industri', $triwulan3['aktivitas'][0]['judul']);
    }

    public function test_hapus_aktivitas_membuatnya_tidak_lagi_muncul_di_monev(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();
        $dokumen   = $this->buatDokumen($pengajuan);

        $aktivitas = PengajuanAktivitas::create([
            'pengajuan_id'    => $pengajuan->id,
            'judul'           => 'Seminar Industri',
            'jenis_aktivitas' => 'Seminar',
            'tanggal'         => '2026-05-15',
            'status'          => 'selesai',
        ]);

        $aktivitas->delete();

        $response = $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}/monev");
        $quarters = collect($response->json('data.quarters'));
        $triwulan2 = $quarters->firstWhere(fn ($q) => $q['tahun'] === 2026 && $q['triwulan'] === 2);

        $this->assertCount(0, $triwulan2['aktivitas']);
    }

    public function test_monev_manual_tersimpan_dan_terhitung_terpisah_dari_aktivitas(): void
    {
        $admin     = $this->admin();
        $pengajuan = $this->buatPengajuan();
        $dokumen   = $this->buatDokumen($pengajuan);

        PengajuanAktivitas::create([
            'pengajuan_id'    => $pengajuan->id,
            'judul'           => 'Kunjungan Industri',
            'jenis_aktivitas' => 'Kunjungan',
            'tanggal'         => '2026-05-20',
            'status'          => 'selesai',
        ]);

        LaporanPelaksanaan::create([
            'dokumen_kerjasama_id' => $dokumen->id,
            'tahun'                => 2026,
            'triwulan'             => 2,
            'kegiatan'             => 'Kegiatan berjalan sesuai rencana.',
            'hasil'                => 'Partisipasi mitra sangat baik.',
            'kendala'              => 'Jadwal sempat berbenturan.',
            'tindak_lanjut'        => 'Menjadwalkan kegiatan lanjutan.',
            'status'               => 'terkirim',
        ]);

        $response = $this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen->id}/monev");
        $quarters = collect($response->json('data.quarters'));
        $triwulan2 = $quarters->firstWhere(fn ($q) => $q['tahun'] === 2026 && $q['triwulan'] === 2);

        $this->assertCount(1, $triwulan2['aktivitas']);
        $this->assertCount(1, $triwulan2['monev']);
        $this->assertSame('Kegiatan berjalan sesuai rencana.', $triwulan2['monev'][0]['kegiatan']);
        $this->assertSame('Jadwal sempat berbenturan.', $triwulan2['monev'][0]['kendala']);
        $this->assertSame('Menjadwalkan kegiatan lanjutan.', $triwulan2['monev'][0]['tindak_lanjut']);
    }

    public function test_hapus_catatan_monev_manual_lewat_endpoint_laporan_pelaksanaan(): void
    {
        $admin   = $this->admin();
        $dokumen = $this->buatDokumen();

        $laporan = LaporanPelaksanaan::create([
            'dokumen_kerjasama_id' => $dokumen->id,
            'tahun'                => 2026,
            'triwulan'             => 3,
            'kegiatan'             => 'Catatan monitoring',
            'status'               => 'terkirim',
        ]);

        $response = $this->actingAs($admin)->deleteJson("/api/laporan-pelaksanaan/{$laporan->id}");
        $response->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseMissing('laporan_pelaksanaan', ['id' => $laporan->id]);
    }
}
