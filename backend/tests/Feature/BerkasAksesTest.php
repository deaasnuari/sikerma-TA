<?php

namespace Tests\Feature;

use App\Models\Pengajuan;
use App\Models\PengajuanFile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BerkasAksesTest extends TestCase
{
    use RefreshDatabase;

    private function siapkanBerkas(User $pemilik): string
    {
        Storage::fake('public');
        $path = 'pengajuan/2026/01/rahasia-abc123.pdf';
        Storage::disk('public')->put($path, 'isi-rahasia');

        $pengajuan = Pengajuan::create([
            'nama_pengusul' => 'Dr. Test', 'judul_pengajuan' => 'Test', 'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'menunggu', 'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $pemilik->id,
        ]);
        PengajuanFile::create([
            'pengajuan_id' => $pengajuan->id, 'path_file' => $path, 'nama_file' => 'rahasia.pdf',
        ]);

        return $path;
    }

    public function test_tanpa_login_ditolak(): void
    {
        $this->getJson('/api/berkas?path=pengajuan/2026/01/x.pdf')->assertStatus(401);
    }

    public function test_pemilik_dan_admin_boleh_membuka_berkas_pengajuan(): void
    {
        $pemilik = User::factory()->create(['role' => 'external']);
        $path = $this->siapkanBerkas($pemilik);

        $this->actingAs($pemilik)->get('/api/berkas?path='.$path)->assertOk();
        $this->actingAs(User::factory()->admin()->create())->get('/api/berkas?path=storage/'.$path)->assertOk();
    }

    public function test_pengguna_lain_tidak_boleh_membuka_berkas_pengajuan_orang(): void
    {
        $path = $this->siapkanBerkas(User::factory()->create(['role' => 'external']));
        $orangLain = User::factory()->create(['role' => 'external']);

        $this->actingAs($orangLain)->getJson('/api/berkas?path='.$path)->assertStatus(404);
    }

    public function test_path_traversal_dan_berkas_tak_terdaftar_ditolak(): void
    {
        $admin = User::factory()->admin()->create();
        Storage::fake('public');
        Storage::disk('public')->put('pengajuan/a.pdf', 'x');

        $this->actingAs($admin)->getJson('/api/berkas?path=../.env')->assertStatus(404);
        $this->actingAs($admin)->getJson('/api/berkas?path=pengajuan/../../.env')->assertStatus(404);

        $biasa = User::factory()->create(['role' => 'internal']);
        // berkas ada di disk tapi tidak terdaftar di record mana pun -> hanya admin
        $this->actingAs($biasa)->getJson('/api/berkas?path=pengajuan/a.pdf')->assertStatus(404);
    }
}
