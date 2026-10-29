<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PengajuanJenisMajemukTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $override = []): array
    {
        return array_merge([
            'nama_pengusul' => 'Dr. Budi',
            'judul_pengajuan' => 'MoU dan MoA Sekaligus',
            'jenis_dokumen' => 'MOU',
            'kategori_pengajuan' => 'internal',
            'nama_mitra' => 'PT Teknologi Maju',
        ], $override);
    }

    private function internal(): User
    {
        return User::factory()->create(['role' => 'internal']);
    }

    public function test_mou_dan_moa_sekaligus_tetap_satu_pengajuan(): void
    {
        $jumlahSebelum = Pengajuan::count();

        $response = $this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'jenis_dokumen' => 'MOA',
            'jenis_dokumen_list' => ['MOU', 'MOA'],
        ]))->assertCreated();

        $this->assertSame($jumlahSebelum + 1, Pengajuan::count());

        $pengajuan = Pengajuan::findOrFail($response->json('data.id'));
        // Jenis utama = jenis pertama di daftar, bukan yang dikirim di jenis_dokumen.
        $this->assertSame('MOU', $pengajuan->jenis_dokumen);
        $this->assertSame(['MOU', 'MOA'], $pengajuan->jenis_dokumen_list);
    }

    public function test_satu_jenis_saja_tidak_menyimpan_daftar(): void
    {
        $response = $this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload())
            ->assertCreated();

        $pengajuan = Pengajuan::findOrFail($response->json('data.id'));
        $this->assertSame('MOU', $pengajuan->jenis_dokumen);
        $this->assertNull($pengajuan->jenis_dokumen_list);
    }

    public function test_jenis_tidak_dikenal_atau_ganda_ditolak(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->postJson('/api/pengajuan', $this->payload(['jenis_dokumen_list' => ['MOU', 'XYZ']]))
            ->assertStatus(422)->assertJsonValidationErrors('jenis_dokumen_list.1');

        $this->actingAs($user)->postJson('/api/pengajuan', $this->payload(['jenis_dokumen_list' => ['MOU', 'mou']]))
            ->assertStatus(422)->assertJsonValidationErrors('jenis_dokumen_list.1');
    }

    public function test_update_dengan_satu_jenis_mengosongkan_daftar_lama(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = Pengajuan::findOrFail($this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'jenis_dokumen_list' => ['MOU', 'MOA'],
        ]))->json('data.id'));

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", ['jenis_dokumen' => 'IA'])->assertOk();

        $pengajuan->refresh();
        $this->assertSame('IA', $pengajuan->jenis_dokumen);
        $this->assertNull($pengajuan->jenis_dokumen_list);
    }

    public function test_edit_yang_mengirim_ulang_jenis_utama_sama_tidak_menghapus_daftar(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = Pengajuan::findOrFail($this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'jenis_dokumen_list' => ['MOU', 'MOA'],
        ]))->json('data.id'));

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'jenis_dokumen' => 'MOU', 'judul_pengajuan' => 'Judul Diedit',
        ])->assertOk();

        $this->assertSame(['MOU', 'MOA'], $pengajuan->fresh()->jenis_dokumen_list);
    }

    public function test_dokumen_gabungan_terhitung_di_kedua_jenis_pada_halaman_publik_dan_filter(): void
    {
        $gabungan = DokumenKerjasama::create([
            'nomor_dokumen' => 'G-001', 'no_permohonan' => 'PMH-901', 'nama_dokumen' => 'Gabungan', 'jenis_dokumen' => 'MOU',
            'jenis_dokumen_list' => ['MOU', 'MOA'], 'file' => 'x.pdf',
        ]);
        $moaSaja = DokumenKerjasama::create([
            'nomor_dokumen' => 'M-001', 'no_permohonan' => 'PMH-902', 'nama_dokumen' => 'MoA saja', 'jenis_dokumen' => 'MOA', 'file' => 'y.pdf',
        ]);

        $publik = collect($this->getJson('/api/public/kerjasama')->assertOk()->json('data.data'))->keyBy('id');
        $this->assertSame(['MoU', 'MoA'], $publik[$gabungan->id]['jenis_list']);
        $this->assertSame('MoU', $publik[$gabungan->id]['jenis']);
        $this->assertSame(['MoA'], $publik[$moaSaja->id]['jenis_list']);

        // Filter jenis di Rekap Data: dokumen gabungan muncul di MoU maupun MoA.
        $admin = User::factory()->admin()->create();
        $idsMoa = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?jenis_dokumen=MOA&per_page=50')->json('data.data'))->pluck('id');
        $this->assertContains($gabungan->id, $idsMoa);
        $this->assertContains($moaSaja->id, $idsMoa);

        $idsMou = collect($this->actingAs($admin)->getJson('/api/dokumen-kerjasama?jenis_dokumen=MOU&per_page=50')->json('data.data'))->pluck('id');
        $this->assertContains($gabungan->id, $idsMou);
        $this->assertNotContains($moaSaja->id, $idsMou);
    }

    private function pengajuanGabungan(): Pengajuan
    {
        return Pengajuan::findOrFail($this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'jenis_dokumen_list' => ['MOU', 'MOA'],
        ]))->json('data.id'));
    }

    private function pdfBerkas(string $nama, ?string $jenis): array
    {
        return [
            'name' => $nama, 'type' => 'application/pdf', 'size' => 1, 'jenis_dokumen' => $jenis,
            'url' => 'data:application/pdf;base64,'.base64_encode('isi '.$nama),
        ];
    }

    public function test_berkas_final_pengajuan_multi_jenis_wajib_diberi_jenis_yang_valid(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuanGabungan();

        // Tanpa jenis.
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('a.pdf', null)],
        ])->assertStatus(422)->assertJsonValidationErrors('acc_file_attachments.0.jenis_dokumen');

        // Jenis yang tidak dikenal (pilihan hanya MoU / MoA / IA).
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('a.pdf', 'MOU'), $this->pdfBerkas('b.pdf', 'XYZ')],
        ])->assertStatus(422)->assertJsonValidationErrors('acc_file_attachments.1.jenis_dokumen');

        $this->assertSame(0, $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_final')->count(), 'tidak ada yang tersimpan');

        // Pengajuan satu jenis tidak diwajibkan.
        $tunggal = Pengajuan::findOrFail($this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload())->json('data.id'));
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$tunggal->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('a.pdf', null)],
        ])->assertOk();
    }

    public function test_acc_ditolak_bila_ada_berkas_final_tanpa_jenis(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuanGabungan();
        // Berkas final lama yang belum diberi jenis (mis. data sebelum aturan ini).
        $pengajuan->pengajuanFiles()->create(['peran_berkas' => 'dokumen_final', 'nama_file' => 'lama.pdf', 'path_file' => 'pengajuan/lama.pdf']);

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'disetujui', 'nomor_dokumen' => 'X-001/MOU',
        ])->assertStatus(422)->assertJsonValidationErrors('acc_file_attachments');

        $this->assertSame(0, DokumenKerjasama::where('sumber_pengajuan_id', $pengajuan->id)->count());
    }

    public function test_jenis_dokumen_mengikuti_jenis_berkas_final(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuanGabungan();

        // Hanya berkas MoU yang sudah ada: dokumen tersimpan sebagai MoU saja (bukan MoU + MoA).
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('mou.pdf', 'MOU')],
        ])->assertOk();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'disetujui', 'nomor_dokumen' => 'Y-001/MOU',
        ])->assertOk();

        $dokumen = DokumenKerjasama::where('sumber_pengajuan_id', $pengajuan->id)->firstOrFail();
        $this->assertSame('MOU', $dokumen->jenis_dokumen);
        $this->assertNull($dokumen->jenis_dokumen_list);
    }

    public function test_jenis_berkas_final_boleh_mou_moa_atau_ia_dan_menentukan_jenis_dokumen(): void
    {
        $admin = User::factory()->admin()->create();

        // Pengajuan MoU + MoA, tetapi finalnya MoU dan IA: jenis dokumen mengikuti berkas final.
        $gabungan = $this->pengajuanGabungan();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$gabungan->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('mou.pdf', 'MOU'), $this->pdfBerkas('ia.pdf', 'ia')],
        ])->assertOk();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$gabungan->id}", [
            'status_pengajuan' => 'disetujui', 'nomor_dokumen' => 'Z-001/MOU',
        ])->assertOk();
        $dokumen = DokumenKerjasama::where('sumber_pengajuan_id', $gabungan->id)->firstOrFail();
        $this->assertSame('MOU', $dokumen->jenis_dokumen);
        $this->assertSame(['MOU', 'IA'], $dokumen->jenis_dokumen_list);

        // Pengajuan satu jenis (MoU): admin memilih MoA di final, dokumen tersimpan sebagai MoA.
        $tunggal = Pengajuan::findOrFail($this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload())->json('data.id'));
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$tunggal->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('moa.pdf', 'MOA')],
        ])->assertOk();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$tunggal->id}", [
            'status_pengajuan' => 'disetujui', 'nomor_dokumen' => 'Z-002/MOA',
        ])->assertOk();
        $dokumenTunggal = DokumenKerjasama::where('sumber_pengajuan_id', $tunggal->id)->firstOrFail();
        $this->assertSame('MOA', $dokumenTunggal->jenis_dokumen);
        $this->assertNull($dokumenTunggal->jenis_dokumen_list);

        // Pengajuan satu jenis yang jenis berkasnya dikosongkan tetap memakai jenis pengajuannya.
        $polos = Pengajuan::findOrFail($this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload())->json('data.id'));
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$polos->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('x.pdf', null)],
        ])->assertOk();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$polos->id}", [
            'status_pengajuan' => 'disetujui', 'nomor_dokumen' => 'Z-003/MOU',
        ])->assertOk();
        $this->assertSame('MOU', DokumenKerjasama::where('sumber_pengajuan_id', $polos->id)->firstOrFail()->jenis_dokumen);
    }

    public function test_berkas_pendukung_tor_dst_disimpan_sebagai_pendukung_dan_tidak_menjadi_jenis_dokumen(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = $this->pengajuanGabungan();
        // Dokumen pendukung dari pengusul (tanpa jenis) harus tetap ada setelah ACC.
        $pengajuan->pengajuanFiles()->create(['peran_berkas' => 'dokumen_pendukung', 'nama_file' => 'proposal-pengusul.pdf', 'path_file' => 'pengajuan/proposal-pengusul.pdf']);

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'acc_file_attachments' => [
                $this->pdfBerkas('mou.pdf', 'MOU'),
                $this->pdfBerkas('moa.pdf', 'MOA'),
                $this->pdfBerkas('tor.pdf', 'TOR'),
                $this->pdfBerkas('laporan.pdf', 'Laporan Kegiatan'),
            ],
        ])->assertOk();

        $this->assertEqualsCanonicalizing(['mou.pdf', 'moa.pdf'], $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_final')->pluck('nama_file')->all());
        $this->assertEqualsCanonicalizing(
            ['tor.pdf' => 'TOR', 'laporan.pdf' => 'LAPORAN_KEGIATAN', 'proposal-pengusul.pdf' => null],
            $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_pendukung')->pluck('jenis_dokumen', 'nama_file')->all()
        );

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'disetujui', 'nomor_dokumen' => 'T-001/MOU',
        ])->assertOk();

        // TOR dan laporan tidak ikut menentukan jenis dokumen; tetap MoU + MoA.
        $dokumen = DokumenKerjasama::where('sumber_pengajuan_id', $pengajuan->id)->firstOrFail();
        $this->assertSame('MOU', $dokumen->jenis_dokumen);
        $this->assertSame(['MOU', 'MOA'], $dokumen->jenis_dokumen_list);
        $this->assertSame('TOR', $dokumen->dokumenFiles()->where('nama_file', 'tor.pdf')->firstOrFail()->jenis_dokumen);

        // Kirim ulang: TOR hasil ACC diganti, proposal pengusul tetap ada.
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('mou.pdf', 'MOU'), $this->pdfBerkas('moa.pdf', 'MOA'), $this->pdfBerkas('kak.pdf', 'KAK')],
        ])->assertOk();
        $this->assertEqualsCanonicalizing(
            ['kak.pdf', 'proposal-pengusul.pdf'],
            $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_pendukung')->pluck('nama_file')->all()
        );
    }

    public function test_hanya_berkas_pendukung_tanpa_dokumen_final_ditolak(): void
    {
        $admin = User::factory()->admin()->create();
        $tunggal = Pengajuan::findOrFail($this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload())->json('data.id'));

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$tunggal->id}", [
            'acc_file_attachments' => [$this->pdfBerkas('tor.pdf', 'TOR')],
        ])->assertStatus(422)->assertJsonValidationErrors('acc_file_attachments');
    }

    public function test_upload_berkas_final_ke_dokumen_gabungan_wajib_jenis(): void
    {
        Storage::fake('public');
        $admin = User::factory()->admin()->create();
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen' => 'U-001', 'no_permohonan' => 'PMH-903', 'nama_dokumen' => 'Gabungan', 'jenis_dokumen' => 'MOU',
            'jenis_dokumen_list' => ['MOU', 'MOA'], 'file' => 'x.pdf',
        ]);

        $this->actingAs($admin)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/upload-file", [
            'file' => UploadedFile::fake()->create('baru.pdf', 10, 'application/pdf'), 'peran_berkas' => 'dokumen_final', 'tambah' => 1,
        ])->assertStatus(422)->assertJsonValidationErrors('jenis_dokumen');

        $this->actingAs($admin)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/upload-file", [
            'file' => UploadedFile::fake()->create('baru.pdf', 10, 'application/pdf'), 'peran_berkas' => 'dokumen_final', 'tambah' => 1,
            'jenis_dokumen' => 'MOA',
        ])->assertOk();

        $this->assertSame('MOA', $dokumen->dokumenFiles()->firstOrFail()->jenis_dokumen);
    }

    public function test_dokumen_final_satu_dokumen_membawa_kedua_jenis_dan_semua_berkas(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = Pengajuan::findOrFail($this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'jenis_dokumen_list' => ['MOU', 'MOA'],
        ]))->json('data.id'));

        // Admin mengunggah dua PDF final sekaligus dan menandai mana yang MoU dan mana yang MoA.
        $pdf = fn (string $nama, ?string $jenis) => [
            'name' => $nama, 'type' => 'application/pdf', 'size' => 1, 'jenis_dokumen' => $jenis,
            'url' => 'data:application/pdf;base64,'.base64_encode('isi '.$nama),
        ];
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'acc_file_attachments' => [$pdf('final-mou.pdf', 'mou'), $pdf('final-moa.pdf', 'MOA')],
        ])->assertOk();

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'status_pengajuan' => 'disetujui', 'nomor_dokumen' => '001/MOU-MOA',
        ])->assertOk();

        $dokumen = DokumenKerjasama::where('sumber_pengajuan_id', $pengajuan->id)->get();
        $this->assertCount(1, $dokumen, 'satu pengajuan menghasilkan satu dokumen');
        $this->assertSame('MOU', $dokumen[0]->jenis_dokumen);
        $this->assertSame(['MOU', 'MOA'], $dokumen[0]->jenis_dokumen_list);

        // Label jenis per berkas ikut tersalin ke dokumen.
        $this->assertEqualsCanonicalizing(
            ['final-mou.pdf' => 'MOU', 'final-moa.pdf' => 'MOA'],
            $dokumen[0]->dokumenFiles()->where('peran_berkas', 'dokumen_final')->pluck('jenis_dokumen', 'nama_file')->all()
        );

        // Daftar berkas di Rekap Data juga membawa labelnya.
        $daftar = collect($this->actingAs($admin)->getJson("/api/dokumen-kerjasama/{$dokumen[0]->id}/documents")->json('data'));
        $this->assertSame('MOA', $daftar->firstWhere('nama_file', 'final-moa.pdf')['jenis_dokumen']);
    }
}
