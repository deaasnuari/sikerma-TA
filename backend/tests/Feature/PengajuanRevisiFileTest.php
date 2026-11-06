<?php

namespace Tests\Feature;

use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PengajuanRevisiFileTest extends TestCase
{
    use RefreshDatabase;

    private const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    private function pengajuan(User $pemilik): Pengajuan
    {
        return Pengajuan::create([
            'nama_pengusul' => 'Dr. Andi',
            'judul_pengajuan' => 'Kerja Sama Penelitian',
            'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'menunggu',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $pemilik->id,
        ]);
    }

    private function revisiPayload(string $name, string $mime = self::DOCX_MIME): array
    {
        return [
            'status_pengajuan' => 'revisi',
            'catatan_revisi' => 'Mohon perbaiki pasal 3.',
            'revisi_file_attachments' => [[
                'name' => $name,
                'type' => $mime,
                'size' => 1,
                'url' => 'data:'.$mime.';base64,'.base64_encode('isi dokumen'),
            ]],
        ];
    }

    public function test_admin_melampirkan_file_word_saat_minta_revisi_dan_pengusul_bisa_melihatnya(): void
    {
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $pemilik = User::factory()->create(['role' => 'internal']);
        $pengajuan = $this->pengajuan($pemilik);

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", $this->revisiPayload('Draf Revisi.docx'))->assertOk();

        $file = $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_revisi')->first();
        $this->assertNotNull($file);
        $this->assertSame('Draf Revisi.docx', $file->nama_file);
        Storage::disk('public')->assertExists($file->path_file);

        $show = $this->actingAs($pemilik)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
        $this->assertContains('dokumen_revisi', collect($show->json('data.dokumen_files'))->pluck('peran_berkas')->all());
    }

    public function test_file_revisi_selain_word_ditolak(): void
    {
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuan(User::factory()->create(['role' => 'internal']));

        foreach (['revisi.pdf', 'revisi.xlsx', 'revisi.docx.exe', 'revisi'] as $nama) {
            $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", $this->revisiPayload($nama, 'application/pdf'))
                ->assertStatus(422)->assertJsonValidationErrors('revisi_file_attachments.0.name');
        }

        $this->assertSame(0, $pengajuan->pengajuanFiles()->count());
        $this->assertSame('menunggu', $pengajuan->fresh()->status_pengajuan);
    }

    public function test_file_revisi_baru_menggantikan_yang_lama_dan_tidak_hilang_saat_pengusul_kirim_ulang(): void
    {
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $pemilik = User::factory()->create(['role' => 'internal']);
        $pengajuan = $this->pengajuan($pemilik);

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", $this->revisiPayload('Revisi 1.docx'))->assertOk();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", $this->revisiPayload('Revisi 2.doc', 'application/msword'))->assertOk();

        $this->assertSame(['Revisi 2.doc'], $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_revisi')->pluck('nama_file')->all());

        // Pengusul memperbaiki dan mengunggah ulang lampirannya.
        $this->actingAs($pemilik)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Sudah Diperbaiki',
            'file_attachments' => [[
                'name' => 'Perbaikan.docx',
                'type' => self::DOCX_MIME,
                'size' => 1,
                'url' => 'data:'.self::DOCX_MIME.';base64,'.base64_encode('perbaikan'),
            ]],
        ])->assertOk();

        $this->assertEqualsCanonicalizing(
            ['Revisi 2.doc', 'Perbaikan.docx'],
            $pengajuan->pengajuanFiles()->pluck('nama_file')->all()
        );
    }

    public function test_pengusul_tidak_bisa_memasang_file_revisi_sendiri(): void
    {
        Storage::fake('public');
        $pemilik = User::factory()->create(['role' => 'internal']);
        $pengajuan = $this->pengajuan($pemilik);

        $this->actingAs($pemilik)->patchJson("/api/pengajuan/{$pengajuan->id}", $this->revisiPayload('Palsu.docx'))->assertOk();

        $this->assertSame(0, $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_revisi')->count());
    }

    public function test_berkas_final_acc_hanya_boleh_pdf(): void
    {
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuan(User::factory()->create(['role' => 'internal']));

        $kirim = fn (string $nama, string $mime) => $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'acc_file_attachments' => [[
                'name' => $nama, 'type' => $mime, 'size' => 1,
                'url' => 'data:'.$mime.';base64,'.base64_encode('isi'),
            ]],
        ]);

        $kirim('final.docx', self::DOCX_MIME)->assertStatus(422)->assertJsonValidationErrors('acc_file_attachments.0.name');
        $kirim('final.pdf', 'application/pdf')->assertOk();

        $this->assertSame(['final.pdf'], $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_final')->pluck('nama_file')->all());
    }

    public function test_berkas_pengajuan_baru_hanya_boleh_word(): void
    {
        Storage::fake('public');
        $pemilik = User::factory()->create(['role' => 'internal']);
        $pengajuan = $this->pengajuan($pemilik);

        $kirim = fn (string $nama, string $mime) => $this->actingAs($pemilik)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'file_attachments' => [[
                'name' => $nama, 'type' => $mime, 'size' => 1,
                'url' => 'data:'.$mime.';base64,'.base64_encode('isi'),
            ]],
        ]);

        $kirim('proposal.pdf', 'application/pdf')->assertStatus(422)->assertJsonValidationErrors('file_attachments.0.name');
        $kirim('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')->assertStatus(422);
        $this->assertSame(0, $pengajuan->pengajuanFiles()->count());

        $kirim('proposal.docx', self::DOCX_MIME)->assertOk();
        $this->assertSame(['proposal.docx'], $pengajuan->pengajuanFiles()->pluck('nama_file')->all());
    }

    public function test_lampiran_lama_berupa_path_tidak_dicek_ulang_saat_pengusul_memperbaiki(): void
    {
        Storage::fake('public');
        $pemilik = User::factory()->create(['role' => 'internal']);
        $pengajuan = $this->pengajuan($pemilik);
        Storage::disk('public')->put('pengajuan/2026/01/lama.pdf', 'pdf lama');
        $pengajuan->pengajuanFiles()->create([
            'peran_berkas' => 'pengajuan_awal', 'nama_file' => 'lama.pdf', 'path_file' => 'pengajuan/2026/01/lama.pdf',
        ]);

        $this->actingAs($pemilik)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Diperbaiki',
            'file_attachments' => [[
                'name' => 'lama.pdf', 'path_file' => 'pengajuan/2026/01/lama.pdf', 'url' => '',
            ]],
        ])->assertOk();
    }

    public function test_file_revisi_lebih_dari_10mb_ditolak(): void
    {
        ini_set('memory_limit', '768M'); // payload base64 belasan MB dibuat berulang dalam tes ini
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuan(User::factory()->create(['role' => 'internal']));

        // Ukuran yang dilaporkan klien melebihi batas.
        $payload = $this->revisiPayload('Draf Besar.docx');
        $payload['revisi_file_attachments'][0]['size'] = 10 * 1024 * 1024 + 1;
        $respons = $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors('revisi_file_attachments.0.size');
        $this->assertSame('File revisi maksimal 10 MB.', $respons->json('errors')['revisi_file_attachments.0.size'][0]);

        // Ukuran dilaporkan kecil tapi isi berkas sebenarnya lebih dari 10 MB: tetap ditolak server.
        $isi = str_repeat('x', 10 * 1024 * 1024 + 1);
        $payload = $this->revisiPayload('Draf Besar.docx');
        $payload['revisi_file_attachments'][0]['url'] = 'data:'.self::DOCX_MIME.';base64,'.base64_encode($isi);
        $respons = $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", $payload)->assertStatus(422);
        $this->assertSame('File revisi maksimal 10 MB.', $respons->json('errors')['revisi_file_attachments.0.url'][0]);

        $this->assertSame(0, $pengajuan->pengajuanFiles()->count());
        $this->assertSame('menunggu', $pengajuan->fresh()->status_pengajuan);
    }

    public function test_file_revisi_tepat_10mb_diterima(): void
    {
        ini_set('memory_limit', '768M'); // payload base64 belasan MB dibuat berulang dalam tes ini
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuan(User::factory()->create(['role' => 'internal']));

        $payload = $this->revisiPayload('Draf Batas.docx');
        $payload['revisi_file_attachments'][0]['size'] = 10 * 1024 * 1024;
        $payload['revisi_file_attachments'][0]['url'] = 'data:'.self::DOCX_MIME.';base64,'.base64_encode(str_repeat('x', 10 * 1024 * 1024));

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", $payload)->assertOk();
        $this->assertSame(1, $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_revisi')->count());
    }

    public function test_berkas_final_pdf_lebih_dari_10mb_ditolak_dan_status_tidak_berubah(): void
    {
        ini_set('memory_limit', '768M'); // payload base64 belasan MB dibuat berulang dalam tes ini
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuan(User::factory()->create(['role' => 'internal']));
        $pengajuan->update(['status_pengajuan' => 'diproses']);

        $respons = $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'disetujui',
            'acc_file_attachments' => [[
                'name' => 'Final Besar.pdf',
                'type' => 'application/pdf',
                'size' => 1,
                'jenis_dokumen' => 'MoU',
                'url' => 'data:application/pdf;base64,'.base64_encode(str_repeat('x', 10 * 1024 * 1024 + 1)),
            ]],
        ])->assertStatus(422);

        $this->assertSame('Berkas final maksimal 10 MB.', $respons->json('errors')['acc_file_attachments.0.url'][0]);
        $this->assertSame('diproses', $pengajuan->fresh()->status_pengajuan);
    }
}
