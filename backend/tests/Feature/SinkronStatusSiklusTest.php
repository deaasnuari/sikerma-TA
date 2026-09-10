<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterUnitProdi;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SinkronStatusSiklusTest extends TestCase
{
    use RefreshDatabase;

    private function dokumen(string $status, ?string $tanggalBerakhir, array $override = []): DokumenKerjasama
    {
        $unit = MasterUnitProdi::create([
            'jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'TI ' . fake()->unique()->numerify('##'), 'aktif' => true,
        ]);

        return DokumenKerjasama::create(array_merge([
            'no_permohonan'   => 'PMH-' . fake()->unique()->numerify('#####'),
            'nomor_dokumen'   => 'DOK-' . fake()->unique()->numerify('###'),
            'nama_dokumen'    => 'Dok',
            'file'            => 'x.pdf',
            'unit_prodi_id'   => $unit->id,
            'status_siklus'   => $status,
            'tanggal_berakhir' => $tanggalBerakhir,
        ], $override));
    }

    public function test_menyelaraskan_status_siklus_dengan_tanggal_berakhir(): void
    {
        $lewat = $this->dokumen('active', Carbon::now()->subMonths(2)->toDateString());
        $dekat = $this->dokumen('active', Carbon::now()->addDays(30)->toDateString());
        $jauh  = $this->dokumen('active', Carbon::now()->addMonths(10)->toDateString());
        $sudahBenar = $this->dokumen('archived', Carbon::now()->subYear()->toDateString());

        $this->artisan('sikerma:sinkron-status-siklus --apply')->assertSuccessful();

        $this->assertSame('archived', $lewat->fresh()->status_siklus);
        $this->assertSame('expiring', $dekat->fresh()->status_siklus);
        $this->assertSame('active', $jauh->fresh()->status_siklus);
        $this->assertSame('archived', $sudahBenar->fresh()->status_siklus);
    }

    public function test_dokumen_tanpa_tanggal_berakhir_jadi_active(): void
    {
        $dok = $this->dokumen('archived', null);

        $this->artisan('sikerma:sinkron-status-siklus --apply')->assertSuccessful();

        $this->assertSame('active', $dok->fresh()->status_siklus);
    }

    public function test_dokumen_terhapus_tidak_disentuh(): void
    {
        $dok = $this->dokumen('active', Carbon::now()->subMonths(2)->toDateString(), [
            'dihapus_admin_pada' => Carbon::now(),
        ]);

        $this->artisan('sikerma:sinkron-status-siklus --apply')->assertSuccessful();

        $this->assertSame('active', $dok->fresh()->status_siklus);
    }

    public function test_dry_run_tidak_mengubah_apa_pun(): void
    {
        $dok = $this->dokumen('active', Carbon::now()->subMonths(2)->toDateString());

        $this->artisan('sikerma:sinkron-status-siklus')->assertSuccessful();

        $this->assertSame('active', $dok->fresh()->status_siklus);
    }

    public function test_tidak_ada_perubahan_saat_sudah_selaras(): void
    {
        $this->dokumen('archived', Carbon::now()->subMonths(2)->toDateString());
        $this->dokumen('active', Carbon::now()->addYear()->toDateString());

        $this->artisan('sikerma:sinkron-status-siklus --apply')
            ->expectsOutputToContain('sudah selaras')
            ->assertSuccessful();
    }
}
