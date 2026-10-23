<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterUnitProdi;
use App\Models\NotifikasiKerjasama;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class NotificationRiwayatTest extends TestCase
{
    use RefreshDatabase;

    private function buatDokumen(array $override = []): DokumenKerjasama
    {
        $unit = MasterUnitProdi::create([
            'jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Informatika', 'aktif' => true,
        ]);

        return DokumenKerjasama::create(array_merge([
            'no_permohonan'    => 'PMH-' . fake()->unique()->numerify('#####'),
            'nomor_dokumen'    => '001/MOU.PL29/I/2026',
            'nama_dokumen'     => 'Dokumen Kerja Sama',
            'jenis_dokumen'    => 'MOU',
            'file'             => 'pengajuan/2026/01/dokumen.pdf',
            'status_siklus'    => 'active',
            'unit_prodi_id'    => $unit->id,
            'tanggal_berakhir' => '2026-06-30',
            'snap_nama_mitra'  => 'PT Contoh Sejahtera',
        ], $override));
    }

    public function test_riwayat_notifikasi_mengembalikan_baris_terbaru_dulu(): void
    {
        $dokumen = $this->buatDokumen();

        NotifikasiKerjasama::create([
            'dokumen_kerjasama_id' => $dokumen->id, 'jenis' => 'reminder-3bulan',
            'tanggal_berakhir_acuan' => '2026-06-30', 'email_tujuan' => 'a@polibatam.ac.id',
            'status' => 'terkirim', 'dikirim_pada' => now()->subDays(2),
        ]);
        NotifikasiKerjasama::create([
            'dokumen_kerjasama_id' => $dokumen->id, 'jenis' => 'reminder-1bulan',
            'tanggal_berakhir_acuan' => '2026-06-30', 'email_tujuan' => null,
            'status' => 'dilewati', 'keterangan' => 'Tidak ada email', 'dikirim_pada' => null,
        ]);

        $response = $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->getJson("/api/dokumen-kerjasama/{$dokumen->id}/notifikasi");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.jenis', 'reminder-3bulan')
            ->assertJsonPath('data.0.status', 'terkirim')
            ->assertJsonPath('data.1.status', 'dilewati');
    }

    public function test_riwayat_notifikasi_butuh_login(): void
    {
        $dokumen = $this->buatDokumen();

        $this->getJson("/api/dokumen-kerjasama/{$dokumen->id}/notifikasi")->assertUnauthorized();
    }

    public function test_pengiriman_manual_dengan_dokumen_id_tercatat_di_notifikasi_kerjasama(): void
    {
        Mail::fake();
        $dokumen = $this->buatDokumen();

        $response = $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->postJson('/api/notifications/send-email', [
            'email'     => 'mitra@contoh.co.id',
            'subject'   => 'Uji',
            'body'      => 'Isi uji',
            'jenis'     => 'urgent',
            'noDokumen' => $dokumen->nomor_dokumen,
            'namaMitra' => 'PT Contoh Sejahtera',
            'dokumenId' => $dokumen->id,
        ]);

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertDatabaseHas('notifikasi_kerjasama', [
            'dokumen_kerjasama_id'   => $dokumen->id,
            'jenis'                  => 'urgent',
            'tanggal_berakhir_acuan' => '2026-06-30',
            'status'                 => 'terkirim',
            'email_tujuan'           => 'mitra@contoh.co.id',
            'keterangan'             => 'Dikirim manual dari halaman Monitoring',
        ]);
    }

    public function test_pengiriman_manual_tanpa_dokumen_id_tidak_menyentuh_tabel(): void
    {
        Mail::fake();

        $response = $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->postJson('/api/notifications/send-email', [
            'email'     => 'mitra@contoh.co.id',
            'subject'   => 'Uji',
            'body'      => 'Isi uji',
            'jenis'     => 'urgent',
            'noDokumen' => 'X-001',
            'namaMitra' => 'PT Contoh',
        ]);

        $response->assertOk();
        $this->assertSame(0, NotifikasiKerjasama::count());
    }
}
