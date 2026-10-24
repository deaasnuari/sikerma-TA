<?php

namespace Tests\Feature;

use App\Models\Inisiasi;
use App\Models\InisiasiDokumen;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class InisiasiDokumenTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function pdf(string $nama = 'dokumen.pdf', int $kb = 1): UploadedFile
    {
        return UploadedFile::fake()->create($nama, $kb, 'application/pdf');
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'tanggal_kegiatan' => '2026-10-10',
            'judul' => 'Kunjungan Penjajakan ke Mitra',
            'nama_mitra' => 'PT Teknologi Maju',
            'deskripsi' => 'Pembahasan awal rencana kerja sama riset.',
        ], $override);
    }

    private function buat(): Inisiasi
    {
        return Inisiasi::create($this->payload());
    }

    public function test_tambah_inisiasi_dengan_beberapa_dokumen_pdf(): void
    {
        $response = $this->actingAs($this->admin())->post('/api/inisiasi', $this->payload([
            'dokumens' => [$this->pdf('notulen.pdf'), $this->pdf('proposal.pdf', 500)],
        ]), ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonCount(2, 'data.dokumens')
            ->assertJsonPath('data.dokumens.0.nama_asli', 'notulen.pdf')
            ->assertJsonPath('data.dokumens.1.nama_asli', 'proposal.pdf');

        $this->assertSame(2, InisiasiDokumen::count());
        foreach (InisiasiDokumen::all() as $dokumen) {
            $this->assertStringStartsWith('inisiasi/dokumen/', $dokumen->path_file);
            Storage::disk('public')->assertExists($dokumen->path_file);
            $this->assertGreaterThan(0, $dokumen->ukuran);
        }
    }

    public function test_dokumen_bersifat_opsional(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/inisiasi', $this->payload())
            ->assertCreated()
            ->assertJsonCount(0, 'data.dokumens');
    }

    public function test_dokumen_tepat_10_mb_diterima_dan_lebih_ditolak(): void
    {
        $admin = $this->actingAs($this->admin());

        $admin->post('/api/inisiasi', $this->payload(['dokumens' => [$this->pdf('pas.pdf', 10240)]]), ['Accept' => 'application/json'])
            ->assertCreated();

        $respons = $admin->post('/api/inisiasi', $this->payload(['dokumens' => [$this->pdf('besar.pdf', 10241)]]), ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['dokumens.0']);
        $this->assertSame('Ukuran tiap dokumen maksimal 10 MB.', $respons->json('errors')['dokumens.0'][0]);

        $this->assertSame(1, Inisiasi::count());
    }

    public function test_hanya_pdf_yang_diterima(): void
    {
        $admin = $this->actingAs($this->admin());

        $admin->post('/api/inisiasi', $this->payload([
            'dokumens' => [UploadedFile::fake()->createWithContent('dokumen.docx', 'bukan pdf')],
        ]), ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['dokumens.0']);

        $this->assertSame(0, Inisiasi::count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_maksimal_10_dokumen_per_kegiatan(): void
    {
        $admin = $this->actingAs($this->admin());

        $sebelas = array_map(fn ($i) => $this->pdf("d{$i}.pdf"), range(1, 11));
        $admin->post('/api/inisiasi', $this->payload(['dokumens' => $sebelas]), ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['dokumens']);

        $sepuluh = array_map(fn ($i) => $this->pdf("d{$i}.pdf"), range(1, 10));
        $admin->post('/api/inisiasi', $this->payload(['dokumens' => $sepuluh]), ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonCount(10, 'data.dokumens');
    }

    public function test_edit_menambah_dan_menghapus_dokumen(): void
    {
        $admin = $this->actingAs($this->admin());
        $id = $admin->post('/api/inisiasi', $this->payload(['dokumens' => [$this->pdf('lama1.pdf'), $this->pdf('lama2.pdf')]]), ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');

        $lama = InisiasiDokumen::orderBy('id')->get();
        $pathDihapus = $lama[0]->path_file;
        $pathTetap = $lama[1]->path_file;

        $admin->post("/api/inisiasi/{$id}", $this->payload([
            '_method' => 'PATCH',
            'hapus_dokumen_ids' => [$lama[0]->id],
            'dokumens' => [$this->pdf('baru.pdf')],
        ]), ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonCount(2, 'data.dokumens')
            ->assertJsonPath('data.dokumens.0.nama_asli', 'lama2.pdf')
            ->assertJsonPath('data.dokumens.1.nama_asli', 'baru.pdf');

        Storage::disk('public')->assertMissing($pathDihapus);
        Storage::disk('public')->assertExists($pathTetap);
        $this->assertSame(2, InisiasiDokumen::count());
    }

    public function test_edit_tanpa_kirim_dokumen_tidak_menghapus_dokumen_lama(): void
    {
        $admin = $this->actingAs($this->admin());
        $id = $admin->post('/api/inisiasi', $this->payload(['dokumens' => [$this->pdf('a.pdf')]]), ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');

        $admin->patchJson("/api/inisiasi/{$id}", $this->payload(['judul' => 'Judul baru']))
            ->assertOk()->assertJsonCount(1, 'data.dokumens');
    }

    public function test_edit_melebihi_batas_10_dokumen_ditolak_dan_tidak_mengubah_data(): void
    {
        $admin = $this->actingAs($this->admin());
        $id = $admin->post('/api/inisiasi', $this->payload([
            'dokumens' => array_map(fn ($i) => $this->pdf("d{$i}.pdf"), range(1, 9)),
        ]), ['Accept' => 'application/json'])->assertCreated()->json('data.id');

        $admin->post("/api/inisiasi/{$id}", $this->payload([
            '_method' => 'PATCH',
            'judul' => 'Tidak boleh tersimpan',
            'dokumens' => [$this->pdf('x.pdf'), $this->pdf('y.pdf')],
        ]), ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['dokumens']);

        $this->assertSame(9, InisiasiDokumen::count());
        $this->assertSame('Kunjungan Penjajakan ke Mitra', Inisiasi::find($id)->judul);
        $this->assertCount(9, Storage::disk('public')->allFiles());
    }

    public function test_hapus_inisiasi_ikut_menghapus_dokumen_dan_berkasnya(): void
    {
        $admin = $this->actingAs($this->admin());
        $id = $admin->post('/api/inisiasi', $this->payload(['dokumens' => [$this->pdf('a.pdf'), $this->pdf('b.pdf')]]), ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');

        $this->assertCount(2, Storage::disk('public')->allFiles());

        $admin->deleteJson("/api/inisiasi/{$id}")->assertOk();

        $this->assertSame(0, InisiasiDokumen::count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_daftar_dan_detail_menyertakan_dokumen(): void
    {
        $admin = $this->actingAs($this->admin());
        $id = $admin->post('/api/inisiasi', $this->payload(['dokumens' => [$this->pdf('a.pdf')]]), ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');

        $admin->getJson('/api/inisiasi')->assertOk()->assertJsonPath('data.0.dokumens.0.nama_asli', 'a.pdf');
        $admin->getJson("/api/inisiasi/{$id}")->assertOk()->assertJsonPath('data.dokumens.0.nama_asli', 'a.pdf');
    }

    public function test_dokumen_hanya_bisa_dibuka_admin_lewat_berkas(): void
    {
        $id = $this->actingAs($this->admin())
            ->post('/api/inisiasi', $this->payload(['dokumens' => [$this->pdf('rahasia.pdf')]]), ['Accept' => 'application/json'])
            ->assertCreated()->json('data.id');
        $path = InisiasiDokumen::where('inisiasi_id', $id)->value('path_file');

        $this->actingAs($this->admin())->get('/api/berkas?path='.urlencode($path))->assertOk();

        $internal = User::factory()->create(['role' => 'internal']);
        $this->actingAs($internal)->get('/api/berkas?path='.urlencode($path))->assertNotFound();
    }
}
