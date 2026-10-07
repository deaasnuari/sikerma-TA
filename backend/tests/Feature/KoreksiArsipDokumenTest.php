<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class KoreksiArsipDokumenTest extends TestCase
{
    use RefreshDatabase;

    /** @var string[] */
    private array $cadanganAwal = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->cadanganAwal = glob(storage_path('app/cadangan-koreksi-arsip-*.json')) ?: [];
    }

    protected function tearDown(): void
    {
        foreach (glob(storage_path('app/cadangan-koreksi-arsip-*.json')) ?: [] as $f) {
            if (! in_array($f, $this->cadanganAwal, true)) {
                @unlink($f);
            }
        }
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function dok851(array $o = []): DokumenKerjasama
    {
        $d = new DokumenKerjasama();
        $d->forceFill(array_merge([
            'id' => 851, 'no_permohonan' => 'PMH-851', 'nomor_dokumen' => '77/MOU.PL29/VI/2024',
            'nama_dokumen' => 'Dok', 'jenis_dokumen' => 'MOU', 'file' => 'x.pdf',
            'status_siklus' => 'active', 'tanggal_berakhir' => '2029-02-04',
            'diarsipkan_pada' => '2026-05-31 03:43:17', 'alasan_arsip' => 'Masa berlaku telah habis (migrasi)',
        ], $o))->save();

        return $d->fresh();
    }

    private function berkas(): string
    {
        $baru = array_values(array_diff(glob(storage_path('app/cadangan-koreksi-arsip-*.json')) ?: [], $this->cadanganAwal));
        $this->assertNotEmpty($baru);

        return end($baru);
    }

    public function test_pratinjau_tidak_mengubah_apa_pun(): void
    {
        $d = $this->dok851();

        $this->artisan('sikerma:koreksi-arsip-dokumen')->assertSuccessful();

        $this->assertNotNull($d->fresh()->diarsipkan_pada);
        $this->assertSame([], array_diff(glob(storage_path('app/cadangan-koreksi-arsip-*.json')) ?: [], $this->cadanganAwal));
    }

    public function test_apply_mengosongkan_metadata_arsip_dan_tidak_menyentuh_kolom_lain(): void
    {
        $d = $this->dok851();

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $d = $d->fresh();
        $this->assertNull($d->diarsipkan_pada);
        $this->assertNull($d->alasan_arsip);
        $this->assertSame('active', $d->status_siklus);
        $this->assertSame('2029-02-04', $d->tanggal_berakhir->toDateString());
    }

    public function test_dilewati_bila_data_tidak_sama_dengan_keputusan(): void
    {
        // Mis. di server lain id 851 ternyata dokumen lain / tanggalnya beda.
        $d = $this->dok851(['tanggal_berakhir' => '2027-01-01']);

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->assertNotNull($d->fresh()->diarsipkan_pada);
    }

    public function test_dilewati_bila_nomor_dokumen_beda(): void
    {
        $d = $this->dok851(['nomor_dokumen' => 'LAIN/MOU.PL29/I/2024']);

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->assertNotNull($d->fresh()->diarsipkan_pada);
    }

    public function test_rollback_mengembalikan_metadata_arsip(): void
    {
        $d = $this->dok851();
        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->artisan('sikerma:koreksi-arsip-dokumen', ['--rollback' => $this->berkas()])->assertSuccessful();

        $d = $d->fresh();
        $this->assertNotNull($d->diarsipkan_pada);
        $this->assertSame('Masa berlaku telah habis (migrasi)', $d->alasan_arsip);
    }

    public function test_rollback_menolak_berkas_yang_bukan_cadangan_command_ini(): void
    {
        $path = storage_path('app/cadangan-koreksi-arsip-bukan.json');
        file_put_contents($path, json_encode(['perintah' => 'lain']));

        try {
            $this->artisan('sikerma:koreksi-arsip-dokumen', ['--rollback' => $path])->assertFailed();
        } finally {
            @unlink($path);
        }
    }

    private function dok1161(array $o = []): DokumenKerjasama
    {
        $d = new DokumenKerjasama();
        $d->forceFill(array_merge([
            'id' => 1161, 'no_permohonan' => 'PMH-1161', 'nomor_dokumen' => '114/MOU.PL29/XI/2025',
            'nama_dokumen' => 'Dok', 'jenis_dokumen' => 'MOA', 'file' => 'x.pdf',
            'status_siklus' => 'active', 'tanggal_mulai' => '2027-06-16', 'tanggal_berakhir' => '2029-11-22',
            'diarsipkan_pada' => '2026-05-31 03:43:18', 'alasan_arsip' => 'Masa berlaku telah habis (migrasi)',
        ], $o))->save();

        return $d->fresh();
    }

    public function test_koreksi_1161_membetulkan_nomor_tanggal_dan_status_tanpa_menyentuh_arsip_dan_jenis(): void
    {
        Carbon::setTestNow('2026-10-07 10:00:00');
        $d = $this->dok1161();

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $d = $d->fresh();
        $this->assertSame('114/MOA.PL29/XI/2025', $d->nomor_dokumen);
        $this->assertSame('2025-11-02', $d->tanggal_mulai->toDateString());
        $this->assertSame('2025-12-14', $d->tanggal_berakhir->toDateString());
        $this->assertSame('2025-11-03', $d->tanggal_ttd->toDateString());
        $this->assertSame('archived', $d->status_siklus);
        $this->assertSame('MOA', $d->jenis_dokumen);
        $this->assertNotNull($d->diarsipkan_pada, 'metadata arsip dibiarkan terisi karena status akhir archived');
        $this->assertSame('Masa berlaku telah habis (migrasi)', $d->alasan_arsip);
    }

    public function test_koreksi_1161_dilewati_bila_tanggal_lama_tidak_cocok(): void
    {
        $d = $this->dok1161(['tanggal_mulai' => '2026-01-01']);

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->assertSame('114/MOU.PL29/XI/2025', $d->fresh()->nomor_dokumen);
    }

    public function test_koreksi_1161_dilewati_bila_nomor_baru_sudah_dipakai_dokumen_lain(): void
    {
        $d = $this->dok1161();
        $lain = new DokumenKerjasama();
        $lain->forceFill([
            'no_permohonan' => 'PMH-LAIN', 'nomor_dokumen' => '114/MOA.PL29/XI/2025',
            'nama_dokumen' => 'Dok', 'file' => 'y.pdf', 'status_siklus' => 'active',
        ])->save();

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $d = $d->fresh();
        $this->assertSame('114/MOU.PL29/XI/2025', $d->nomor_dokumen);
        $this->assertSame('2027-06-16', $d->tanggal_mulai->toDateString());
    }

    public function test_rollback_mengembalikan_nomor_tanggal_dan_status_1161(): void
    {
        Carbon::setTestNow('2026-10-07 10:00:00');
        $d = $this->dok1161();
        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->artisan('sikerma:koreksi-arsip-dokumen', ['--rollback' => $this->berkas()])->assertSuccessful();

        $d = $d->fresh();
        $this->assertSame('114/MOU.PL29/XI/2025', $d->nomor_dokumen);
        $this->assertSame('2027-06-16', $d->tanggal_mulai->toDateString());
        $this->assertSame('2029-11-22', $d->tanggal_berakhir->toDateString());
        $this->assertNull($d->tanggal_ttd);
        $this->assertSame('active', $d->status_siklus);
    }

    public function test_idempotent_dijalankan_dua_kali(): void
    {
        $d = $this->dok851();

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();
        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->assertNull($d->fresh()->diarsipkan_pada);
    }
}
