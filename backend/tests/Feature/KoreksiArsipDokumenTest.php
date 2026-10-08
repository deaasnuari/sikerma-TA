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

    private function dok1080(array $o = []): DokumenKerjasama
    {
        $d = new DokumenKerjasama();
        $d->forceFill(array_merge([
            'id' => 1080, 'no_permohonan' => 'PMH-1080', 'nomor_dokumen' => '82/MOA.PL29/VIII/202',
            'nama_dokumen' => 'Dokumen 82/MOA.PL29/VIII/202', 'jenis_dokumen' => 'MOA', 'file' => 'x.pdf',
            'status_siklus' => 'active', 'tanggal_mulai' => '2025-08-11', 'tanggal_berakhir' => '2030-08-11',
        ], $o))->save();

        return $d->fresh();
    }

    public function test_koreksi_1080_melengkapi_tahun_di_nomor_dan_nama_dokumen_tanpa_menyentuh_lainnya(): void
    {
        $d = $this->dok1080();

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $d = $d->fresh();
        $this->assertSame('82/MOA.PL29/VIII/2025', $d->nomor_dokumen);
        $this->assertSame('Dokumen 82/MOA.PL29/VIII/2025', $d->nama_dokumen);
        $this->assertSame('active', $d->status_siklus);
        $this->assertSame('2025-08-11', $d->tanggal_mulai->toDateString());
    }

    public function test_koreksi_1080_dilewati_bila_nomor_baru_sudah_dipakai_atau_tanggal_tidak_cocok(): void
    {
        $lain = new DokumenKerjasama();
        $lain->forceFill(['no_permohonan' => 'PMH-LAIN', 'nomor_dokumen' => '82/MOA.PL29/VIII/2025', 'nama_dokumen' => 'Dok', 'file' => 'y.pdf', 'status_siklus' => 'active'])->save();
        $d = $this->dok1080();
        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();
        $this->assertSame('82/MOA.PL29/VIII/202', $d->fresh()->nomor_dokumen, 'nomor baru sudah dipakai dokumen lain');

        $lain->delete();
        $d->forceFill(['tanggal_mulai' => '2024-01-01'])->save();
        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();
        $this->assertSame('82/MOA.PL29/VIII/202', $d->fresh()->nomor_dokumen, 'tanggal tidak cocok keputusan');
    }

    public function test_rollback_mengembalikan_nomor_dan_nama_dokumen_1080(): void
    {
        $d = $this->dok1080();
        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->artisan('sikerma:koreksi-arsip-dokumen', ['--rollback' => $this->berkas()])->assertSuccessful();

        $d = $d->fresh();
        $this->assertSame('82/MOA.PL29/VIII/202', $d->nomor_dokumen);
        $this->assertSame('Dokumen 82/MOA.PL29/VIII/202', $d->nama_dokumen);
    }

    public function test_koreksi_1153_memperbaiki_garis_miring_di_nomor_dan_nama_dokumen(): void
    {
        $d = new DokumenKerjasama();
        $d->forceFill([
            'id' => 1153, 'no_permohonan' => 'PMH-1153', 'nomor_dokumen' => '86/MOA.PL29/VIII2025',
            'nama_dokumen' => 'Dokumen 86/MOA.PL29/VIII2025', 'jenis_dokumen' => 'MOA', 'file' => 'x.pdf',
            'status_siklus' => 'archived', 'tanggal_mulai' => '2024-08-26', 'tanggal_berakhir' => '2025-08-25',
        ])->save();

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $d = $d->fresh();
        $this->assertSame('86/MOA.PL29/VIII/2025', $d->nomor_dokumen);
        $this->assertSame('Dokumen 86/MOA.PL29/VIII/2025', $d->nama_dokumen);
        $this->assertSame('2024-08-26', $d->tanggal_mulai->toDateString(), 'tanggal tidak diubah');
    }

    private function dokMedan(int $id, string $nomor, string $mulai, string $berakhir, string $status, ?string $dihapus = null): DokumenKerjasama
    {
        $d = new DokumenKerjasama();
        $d->forceFill([
            'id' => $id, 'no_permohonan' => "PMH-{$id}", 'nomor_dokumen' => $nomor, 'nama_dokumen' => "Dokumen {$nomor}",
            'jenis_dokumen' => 'MOU', 'file' => "{$id}.pdf", 'status_siklus' => $status,
            'tanggal_mulai' => $mulai, 'tanggal_berakhir' => $berakhir, 'dihapus_admin_pada' => $dihapus,
        ])->save();
        \Illuminate\Support\Facades\DB::table('dokumen_kerjasama')->where('id', $id)->update(['ruang_lingkup_ids' => $id === 800 ? '[3]' : '[]']);

        return $d->fresh();
    }

    public function test_koreksi_484_mengganti_titik_jadi_garis_miring_di_nomor_dan_nama_dokumen(): void
    {
        $d = $this->dokMedan(484, '76/MOA.PL29/XII.2021', '2021-12-15', '2025-12-14', 'archived');

        $this->artisan('sikerma:koreksi-arsip-dokumen')->assertSuccessful();
        $this->assertSame('76/MOA.PL29/XII.2021', $d->fresh()->nomor_dokumen, 'pratinjau tidak mengubah');

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();
        $this->assertSame('76/MOA.PL29/XII/2021', $d->fresh()->nomor_dokumen);
        $this->assertSame('Dokumen 76/MOA.PL29/XII/2021', $d->fresh()->nama_dokumen);
        $this->assertSame('archived', $d->fresh()->status_siklus);

        $this->artisan('sikerma:koreksi-arsip-dokumen', ['--rollback' => $this->berkas(), '--apply' => true])->assertSuccessful();
        $this->assertSame('76/MOA.PL29/XII.2021', $d->fresh()->nomor_dokumen);
    }

    public function test_nomor_972_dan_800_polimedan_dilepas_lalu_dipakai_urut_dan_bisa_dirollback(): void
    {
        $d800 = $this->dokMedan(800, '35/MOU.PL29/VIII/2023', '2023-08-28', '2024-08-28', 'archived', now()->toDateTimeString());
        $d972 = $this->dokMedan(972, '35/MOU.PL29/VII/2023', '2023-08-01', '2028-08-01', 'active');

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->assertSame('35/MOU.PL29/VIII/2023', $d972->fresh()->nomor_dokumen);
        $this->assertSame('Dokumen 35/MOU.PL29/VIII/2023', $d972->fresh()->nama_dokumen);
        $this->assertSame('35/MOU.PL29/VIII/2023-DUP800', $d800->fresh()->nomor_dokumen);
        $this->assertNotNull($d800->fresh()->dihapus_admin_pada, '#800 tetap soft delete, tidak dihapus permanen');
        $this->assertSame('2028-08-01', $d972->fresh()->tanggal_berakhir->toDateString(), 'periode #972 tidak berubah');
        $this->assertSame([3], json_decode((string) \Illuminate\Support\Facades\DB::table('dokumen_kerjasama')->where('id', 972)->value('ruang_lingkup_ids'), true), 'Magang disalin ke #972');

        // Rollback berurutan terbalik: tidak boleh melanggar unique nomor_dokumen.
        $this->artisan('sikerma:koreksi-arsip-dokumen', ['--rollback' => $this->berkas(), '--apply' => true])->assertSuccessful();
        $this->assertSame('35/MOU.PL29/VII/2023', $d972->fresh()->nomor_dokumen);
        $this->assertSame('35/MOU.PL29/VIII/2023', $d800->fresh()->nomor_dokumen);
        $this->assertSame([], json_decode((string) \Illuminate\Support\Facades\DB::table('dokumen_kerjasama')->where('id', 972)->value('ruang_lingkup_ids'), true), 'rollback mengembalikan ruang lingkup #972');
    }

    public function test_nomor_972_tidak_diubah_selama_800_belum_di_soft_delete(): void
    {
        $d800 = $this->dokMedan(800, '35/MOU.PL29/VIII/2023', '2023-08-28', '2024-08-28', 'archived');   // masih aktif
        $d972 = $this->dokMedan(972, '35/MOU.PL29/VII/2023', '2023-08-01', '2028-08-01', 'active');

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->assertSame('35/MOU.PL29/VIII/2023', $d800->fresh()->nomor_dokumen, '#800 aktif tidak boleh dilepas nomornya');
        $this->assertSame('35/MOU.PL29/VII/2023', $d972->fresh()->nomor_dokumen, '#972 menunggu #800 di-soft delete');
    }

    public function test_idempotent_dijalankan_dua_kali(): void
    {
        $d = $this->dok851();

        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();
        $this->artisan('sikerma:koreksi-arsip-dokumen --apply')->assertSuccessful();

        $this->assertNull($d->fresh()->diarsipkan_pada);
    }
}
