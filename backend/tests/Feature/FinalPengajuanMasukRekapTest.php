<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinalPengajuanMasukRekapTest extends TestCase
{
    use RefreshDatabase;

    private function pengajuanDenganFinal(string $nomor): Pengajuan
    {
        $pengajuan = Pengajuan::create([
            'nomor_pengajuan' => $nomor,
            'nama_pengusul' => 'Dr. Andi',
            'judul_pengajuan' => 'Kerja Sama Baru',
            'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'menunggu',
            'ruang_lingkup_ids' => [],
        ]);
        $pengajuan->pengajuanFiles()->create([
            'peran_berkas' => 'dokumen_final',
            'nama_file' => 'final.pdf',
            'path_file' => 'pengajuan/final.pdf',
        ]);

        return $pengajuan;
    }

    private function finalkan(Pengajuan $pengajuan, string $nomorDokumen): void
    {
        $this->actingAs(User::factory()->admin()->create())
            ->patchJson("/api/pengajuan/{$pengajuan->id}", ['status_pengajuan' => 'disetujui', 'nomor_dokumen' => $nomorDokumen])
            ->assertOk();
    }

    public function test_nomor_pengajuan_yang_dipakai_ulang_tidak_menelan_dokumen_lama_di_sampah(): void
    {
        // Dokumen dari pengajuan lama bernomor sama yang sudah dihapus ke Sampah (sumber sudah null).
        $lama = DokumenKerjasama::create([
            'nomor_dokumen' => 'LAMA-001/MOU', 'no_permohonan' => 'PMH-004', 'nama_dokumen' => 'Dokumen Lama',
            'jenis_dokumen' => 'MOU', 'file' => 'x.pdf', 'dihapus_admin_pada' => now(),
        ]);

        $baru = $this->pengajuanDenganFinal('PMH-004');
        $this->finalkan($baru, 'BARU-001/MOU');

        $dokumenBaru = DokumenKerjasama::where('sumber_pengajuan_id', $baru->id)->first();
        $this->assertNotNull($dokumenBaru);
        $this->assertNotSame($lama->id, $dokumenBaru->id);
        $this->assertNull($dokumenBaru->dihapus_admin_pada);
        $this->assertNotNull($lama->fresh()->dihapus_admin_pada, 'dokumen lama tetap di Sampah');

        $ids = collect($this->actingAs(User::factory()->admin()->create())->getJson('/api/dokumen-kerjasama?per_page=50')->json('data.data'))->pluck('id');
        $this->assertContains($dokumenBaru->id, $ids);
        $this->assertNotContains($lama->id, $ids);
    }

    public function test_finalkan_ulang_pengajuan_yang_dokumennya_di_sampah_memulihkannya_ke_rekap(): void
    {
        $pengajuan = $this->pengajuanDenganFinal('PMH-010');
        $this->finalkan($pengajuan, 'ULANG-001/MOU');

        $dokumen = DokumenKerjasama::where('sumber_pengajuan_id', $pengajuan->id)->firstOrFail();
        $dokumen->update(['dihapus_admin_pada' => now()]);

        $this->finalkan($pengajuan, 'ULANG-001/MOU');

        $this->assertNull($dokumen->fresh()->dihapus_admin_pada);
        $this->assertSame(1, DokumenKerjasama::where('sumber_pengajuan_id', $pengajuan->id)->count());
    }

    public function test_dokumen_lama_aktif_tanpa_sumber_tetap_ditautkan_ke_pengajuan(): void
    {
        $lama = DokumenKerjasama::create([
            'nomor_dokumen' => 'LEGACY-001/MOU', 'no_permohonan' => 'PMH-020', 'nama_dokumen' => 'Legacy',
            'jenis_dokumen' => 'MOU', 'file' => 'x.pdf',
        ]);

        $pengajuan = $this->pengajuanDenganFinal('PMH-020');
        $this->finalkan($pengajuan, 'LEGACY-001/MOU');

        $this->assertSame($pengajuan->id, $lama->fresh()->sumber_pengajuan_id);
        $this->assertSame(1, DokumenKerjasama::where('no_permohonan', 'PMH-020')->count());
    }

    public function test_pic_polibatam_disalin_ke_dokumen_dan_tampil_di_rekap(): void
    {
        $pengajuan = $this->pengajuanDenganFinal('PMH-030');
        $pengajuan->update([
            'pic_polibatam_nama' => 'Ivy', 'pic_polibatam_jabatan' => 'Dosen',
            'pic_polibatam_email' => 'ivy@polibatam.ac.id', 'pic_polibatam_whatsapp' => '81234567890',
        ]);
        $this->finalkan($pengajuan, 'PIC-001/MOU');

        $dokumen = DokumenKerjasama::where('sumber_pengajuan_id', $pengajuan->id)->firstOrFail();
        $this->assertSame('Ivy', $dokumen->snap_pic_polibatam_nama);
        $this->assertSame('81234567890', $dokumen->snap_pic_polibatam_whatsapp);

        // Pengajuan dihapus permanen: PIC tetap ada di dokumen.
        $pengajuan->forceDelete();
        $row = collect($this->actingAs(User::factory()->admin()->create())->getJson('/api/dokumen-kerjasama?per_page=50')->json('data.data'))->firstWhere('id', $dokumen->id);
        $this->assertSame('Ivy', $row['snap_pic_polibatam_nama']);
        $this->assertSame('ivy@polibatam.ac.id', $row['snap_pic_polibatam_email']);
    }
}
