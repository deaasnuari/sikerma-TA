<?php

namespace Tests\Feature;

use App\Models\MasterMitra;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Kontak mitra dari form pengajuan tersimpan di pengajuan (tampil di detail), tidak masuk Data Kemitraan. */
class KontakMitraPengajuanTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $extra = []): array
    {
        return array_merge([
            'nama_pengusul' => 'Dr. Budi', 'jabatan_pengusul' => 'Dosen', 'email_pengusul' => 'budi@polibatam.ac.id',
            'judul_pengajuan' => 'Kerja Sama Pendidikan', 'jenis_dokumen' => 'MOU',
            'kategori_pengajuan' => 'internal', 'nama_mitra' => 'PT Kontak Uji',
            'mitra_email' => 'info@kontakuji.co.id', 'whatsapp_mitra' => '89665314602', 'no_telepon_mitra' => '0778123456',
        ], $extra);
    }

    public function test_kontak_mitra_dari_form_hanya_tersimpan_di_pengajuan(): void
    {
        $internal = User::factory()->create(['role' => 'internal']);

        $this->actingAs($internal)->postJson('/api/pengajuan', $this->payload())->assertCreated();

        // Data Kemitraan tidak disentuh sama sekali.
        $mitra = MasterMitra::where('nama_mitra', 'PT Kontak Uji')->firstOrFail();
        $this->assertNull($mitra->email_mitra);
        $this->assertNull($mitra->whatsapp_mitra);
        $this->assertNull($mitra->no_telepon_mitra);
        $this->assertDatabaseHas('pengajuan_v2', [
            'email_mitra' => 'info@kontakuji.co.id', 'whatsapp_mitra' => '89665314602', 'no_telepon_mitra' => '0778123456',
        ]);
    }

    public function test_kontak_mitra_yang_sudah_terisi_di_data_kemitraan_tidak_berubah(): void
    {
        $internal = User::factory()->create(['role' => 'internal']);
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Kontak Uji', 'aktif' => true, 'email_mitra' => 'lama@kontakuji.co.id']);

        $this->actingAs($internal)->postJson('/api/pengajuan', $this->payload(['mitra_id' => $mitra->id]))->assertCreated();

        $this->assertSame('lama@kontakuji.co.id', $mitra->refresh()->email_mitra);
    }

    public function test_email_mitra_tidak_valid_ditolak(): void
    {
        $internal = User::factory()->create(['role' => 'internal']);

        $this->actingAs($internal)->postJson('/api/pengajuan', $this->payload(['mitra_email' => 'bukan-email']))->assertStatus(422);
    }
}
