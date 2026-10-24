<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * PATCH /api/dokumen-kerjasama/{id}/nilai — mengisi Nilai Kerja Sama di Rekap Data. Admin untuk semua
 * dokumen; akun internal hanya untuk dokumen miliknya / dalam cakupan struktural yang dia pimpin.
 */
class DokumenNilaiTest extends TestCase
{
    use RefreshDatabase;

    private function internal(): User
    {
        return User::factory()->create(['role' => 'internal']);
    }

    private function mockCivitasStruktur(array $jurusan = []): void
    {
        $this->mock(\App\Services\CivitasStructureService::class, function ($mock) use ($jurusan) {
            $mock->shouldReceive('getJurusan')->andReturn($jurusan);
            $mock->shouldReceive('getProgramStudi')->andReturn([]);
            $mock->shouldReceive('getUnit')->andReturn([]);
        });
    }

    private function buatDokumen(array $override = []): DokumenKerjasama
    {
        $nomor = 'PMH-'.random_int(1000, 9999);
        $pengajuan = Pengajuan::create([
            'nomor_pengajuan' => $nomor,
            'nama_pengusul' => 'Dr. Test',
            'judul_pengajuan' => 'Kerja Sama Test',
            'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'disetujui',
            'ruang_lingkup_ids' => [],
        ]);

        return DokumenKerjasama::create(array_merge([
            'no_permohonan' => $nomor,
            'sumber_pengajuan_id' => $pengajuan->id,
            'nomor_dokumen' => 'NIL-'.random_int(1000, 9999),
            'nama_dokumen' => 'Dokumen Kerja Sama',
            'jenis_dokumen' => 'MOU',
            'file' => 'pengajuan/2026/01/dokumen.pdf',
        ], $override));
    }

    public function test_tanpa_login_ditolak(): void
    {
        $dokumen = $this->buatDokumen();

        $this->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => 'Rp 1'])->assertUnauthorized();
    }

    public function test_admin_mengisi_nilai_dokumen_mana_pun(): void
    {
        $dokumen = $this->buatDokumen();

        $this->actingAs(User::factory()->admin()->create())
            ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => '  Rp 50.000.000  '])
            ->assertOk()
            ->assertJsonPath('data.nilai_kerjasama', 'Rp 50.000.000');

        $this->assertSame('Rp 50.000.000', $dokumen->fresh()->nilai_kerjasama);
    }

    public function test_internal_pemilik_mengisi_dan_mengosongkan_nilai(): void
    {
        $pemilik = $this->internal();
        $this->mockCivitasStruktur();
        $dokumen = $this->buatDokumen(['dibuat_oleh_user_id' => $pemilik->id]);

        $this->actingAs($pemilik)
            ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => 'USD 5,000'])
            ->assertOk();
        $this->assertSame('USD 5,000', $dokumen->fresh()->nilai_kerjasama);

        $this->actingAs($pemilik)
            ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => '   '])
            ->assertOk();
        $this->assertNull($dokumen->fresh()->nilai_kerjasama);
    }

    public function test_internal_pemilik_lewat_pengajuan_sumber_juga_boleh(): void
    {
        $pengusul = $this->internal();
        $this->mockCivitasStruktur();
        $dokumen = $this->buatDokumen();
        $dokumen->pengajuan->forceFill(['user_pengusul_id' => $pengusul->id])->save();

        $this->actingAs($pengusul)
            ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => 'Rp 10 juta'])
            ->assertOk();
    }

    public function test_internal_bukan_pemilik_dan_di_luar_cakupan_ditolak(): void
    {
        $pemilik = $this->internal();
        $penyusup = $this->internal();
        $this->mockCivitasStruktur();
        $dokumen = $this->buatDokumen(['dibuat_oleh_user_id' => $pemilik->id]);

        $this->actingAs($penyusup)
            ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => 'Rp 1'])
            ->assertNotFound();

        $this->assertNull($dokumen->fresh()->nilai_kerjasama);
    }

    public function test_ketua_jurusan_hanya_untuk_dokumen_dalam_cakupannya(): void
    {
        $jurusanTI = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Informatika', 'aktif' => true]);
        $prodiTI = MasterUnitProdi::create(['jenis_node' => 'prodi', 'parent_id' => $jurusanTI->id, 'nama' => 'D3 Teknik Informatika', 'aktif' => true]);
        $jurusanTM = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Mesin', 'aktif' => true]);

        $kajur = $this->internal();
        $kajur->update(['nik' => '221316']);
        $this->mockCivitasStruktur([[
            'ID_JURUSAN' => '1', 'NAMA_JURUSAN' => 'TEKNIK INFORMATIKA', 'NAMA_JURUSAN_INGGRIS' => '-',
            'NIK_KAJUR' => '221316', 'NAMA_KAJUR' => 'Budi Santoso',
        ]]);

        $dalamJurusan = $this->buatDokumen(['unit_prodi_id' => $jurusanTI->id]);
        $dalamProdi = $this->buatDokumen(['unit_prodi_id' => $prodiTI->id]);
        $luar = $this->buatDokumen(['unit_prodi_id' => $jurusanTM->id]);

        $this->actingAs($kajur)->patchJson("/api/dokumen-kerjasama/{$dalamJurusan->id}/nilai", ['nilai_kerjasama' => 'A'])->assertOk();
        $this->actingAs($kajur)->patchJson("/api/dokumen-kerjasama/{$dalamProdi->id}/nilai", ['nilai_kerjasama' => 'B'])->assertOk();
        $this->actingAs($kajur)->patchJson("/api/dokumen-kerjasama/{$luar->id}/nilai", ['nilai_kerjasama' => 'C'])->assertNotFound();

        $this->assertSame('A', $dalamJurusan->fresh()->nilai_kerjasama);
        $this->assertSame('B', $dalamProdi->fresh()->nilai_kerjasama);
        $this->assertNull($luar->fresh()->nilai_kerjasama);
    }

    public function test_yang_hanya_di_cc_tidak_boleh_mengubah(): void
    {
        $dicc = $this->internal();
        $this->mockCivitasStruktur();
        $dokumen = $this->buatDokumen();
        $dokumen->pengajuan->forceFill(['distribusi_user_ids' => [$dicc->id]])->save();

        $this->actingAs($dicc)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();
        $this->actingAs($dicc)
            ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => 'Rp 1'])
            ->assertForbidden();

        $this->assertNull($dokumen->fresh()->nilai_kerjasama);
    }

    public function test_internal_tidak_bisa_mengisi_dokumen_yang_sudah_dihapus(): void
    {
        $pemilik = $this->internal();
        $this->mockCivitasStruktur();
        $dokumen = $this->buatDokumen(['dibuat_oleh_user_id' => $pemilik->id]);
        $dokumen->forceFill(['dihapus_user_pada' => now()])->save();

        $this->actingAs($pemilik)
            ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => 'Rp 1'])
            ->assertNotFound();
    }

    public function test_eksternal_dan_pimpinan_tidak_boleh(): void
    {
        $dokumen = $this->buatDokumen();

        foreach (['external', 'pimpinan'] as $role) {
            $this->actingAs(User::factory()->create(['role' => $role]))
                ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => 'Rp 1'])
                ->assertForbidden();
        }

        $this->assertNull($dokumen->fresh()->nilai_kerjasama);
    }

    public function test_nilai_terlalu_panjang_ditolak(): void
    {
        $dokumen = $this->buatDokumen();

        $this->actingAs(User::factory()->admin()->create())
            ->patchJson("/api/dokumen-kerjasama/{$dokumen->id}/nilai", ['nilai_kerjasama' => str_repeat('1', 256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['nilai_kerjasama']);
    }
}
