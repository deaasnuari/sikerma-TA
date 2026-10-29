<?php

namespace Tests\Feature;

use App\Models\DokumenFile;
use App\Models\DokumenKerjasama;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DokumenBerkasSatuPerSatuTest extends TestCase
{
    use RefreshDatabase;

    private function dokumenDenganBerkas(array $nama = ['a.pdf', 'b.pdf', 'c.pdf']): DokumenKerjasama
    {
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen' => 'BRK-001/MOU', 'no_permohonan' => 'PMH-700', 'nama_dokumen' => 'Dokumen Berkas',
            'jenis_dokumen' => 'MOU', 'file' => 'pengajuan/'.$nama[0],
        ]);

        foreach ($nama as $n) {
            DokumenFile::create(['dokumen_id' => $dokumen->id, 'peran_berkas' => 'dokumen_final', 'nama_file' => $n, 'path_file' => 'pengajuan/'.$n]);
        }

        return $dokumen;
    }

    public function test_hapus_satu_berkas_tidak_menyentuh_berkas_lain(): void
    {
        $admin = User::factory()->admin()->create();
        $dokumen = $this->dokumenDenganBerkas();
        $b = $dokumen->dokumenFiles()->where('nama_file', 'b.pdf')->firstOrFail();

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/documents/{$b->id}")
            ->assertOk()->assertJsonPath('success', true);

        $this->assertEqualsCanonicalizing(['a.pdf', 'c.pdf'], $dokumen->dokumenFiles()->pluck('nama_file')->all());
        $this->assertSame('pengajuan/a.pdf', $dokumen->fresh()->file, 'berkas utama tidak berubah');
    }

    public function test_menghapus_berkas_utama_mengalihkan_tautan_utama_ke_berkas_tersisa(): void
    {
        $admin = User::factory()->admin()->create();
        $dokumen = $this->dokumenDenganBerkas(['a.pdf', 'b.pdf']);
        $a = $dokumen->dokumenFiles()->where('nama_file', 'a.pdf')->firstOrFail();

        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/documents/{$a->id}")->assertOk();

        $this->assertSame('pengajuan/b.pdf', $dokumen->fresh()->file);
    }

    public function test_hapus_berkas_milik_dokumen_lain_ditolak_dan_hanya_admin(): void
    {
        $admin = User::factory()->admin()->create();
        $dokumen = $this->dokumenDenganBerkas(['a.pdf']);
        $lain = DokumenKerjasama::create([
            'nomor_dokumen' => 'BRK-002/MOU', 'no_permohonan' => 'PMH-701', 'nama_dokumen' => 'Lain',
            'jenis_dokumen' => 'MOU', 'file' => 'x.pdf',
        ]);
        $berkasLain = DokumenFile::create(['dokumen_id' => $lain->id, 'peran_berkas' => 'dokumen_final', 'nama_file' => 'x.pdf', 'path_file' => 'pengajuan/x.pdf']);

        // Berkas milik dokumen lain tidak boleh dihapus lewat URL dokumen ini.
        $this->actingAs($admin)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/documents/{$berkasLain->id}")->assertNotFound();
        $this->assertDatabaseHas('dokumen_file', ['id' => $berkasLain->id]);

        $berkas = $dokumen->dokumenFiles()->firstOrFail();
        $this->actingAs(User::factory()->create(['role' => 'internal']))
            ->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/documents/{$berkas->id}")->assertForbidden();
        $this->assertDatabaseHas('dokumen_file', ['id' => $berkas->id]);
    }

    public function test_upload_dengan_tambah_tidak_menghapus_berkas_lama_dan_tanpa_tambah_menggantikan(): void
    {
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $dokumen = $this->dokumenDenganBerkas(['a.pdf', 'b.pdf']);

        $this->actingAs($admin)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/upload-file", [
            'file' => UploadedFile::fake()->create('baru.pdf', 10, 'application/pdf'),
            'peran_berkas' => 'dokumen_final',
            'tambah' => 1,
        ])->assertOk();

        $this->assertEqualsCanonicalizing(['a.pdf', 'b.pdf', 'baru.pdf'], $dokumen->dokumenFiles()->pluck('nama_file')->all());

        // Perilaku lama tetap untuk pemanggil lain (mis. Monitoring): tanpa "tambah" semua berkas sejenis diganti.
        $this->actingAs($admin)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/upload-file", [
            'file' => UploadedFile::fake()->create('pengganti.pdf', 10, 'application/pdf'),
            'peran_berkas' => 'dokumen_final',
        ])->assertOk();

        $this->assertSame(['pengganti.pdf'], $dokumen->dokumenFiles()->pluck('nama_file')->all());
    }
}
