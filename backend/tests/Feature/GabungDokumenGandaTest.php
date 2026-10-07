<?php

namespace Tests\Feature;

use App\Models\DokumenFile;
use App\Models\DokumenKerjasama;
use App\Models\DokumenLog;
use App\Models\MasterMitra;
use App\Models\MasterUnitProdi;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class GabungDokumenGandaTest extends TestCase
{
    use RefreshDatabase;

    private int $urut = 0;

    /** @var string[] berkas cadangan yang sudah ada sebelum tes (jangan dihapus). */
    private array $cadanganAwal = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-07 10:00:00');
        $this->cadanganAwal = glob(storage_path('app/cadangan-gabung-dokumen-*.json')) ?: [];
    }

    protected function tearDown(): void
    {
        foreach (glob(storage_path('app/cadangan-gabung-dokumen-*.json')) ?: [] as $f) {
            if (! in_array($f, $this->cadanganAwal, true)) {
                @unlink($f);
            }
        }
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function dok(array $o = []): DokumenKerjasama
    {
        $this->urut++;
        $d = new DokumenKerjasama();
        $d->forceFill(array_merge([
            'no_permohonan' => 'PMH-'.$this->urut,
            'nomor_dokumen' => 'NO-'.$this->urut,
            'nama_dokumen' => 'Dok',
            'jenis_dokumen' => 'MOU',
            'file' => 'x.pdf',
            'status_siklus' => 'active',
        ], $o))->save();

        return $d->fresh();
    }

    /** Pasangan asli + salinan -L dengan file sama. */
    private function pasangan(array $asli = [], array $salinan = [], string $nomor = '06A/MOA.PL29/I/2023'): array
    {
        $a = $this->dok(array_merge([
            'nomor_dokumen' => $nomor, 'file' => 'f.pdf', 'keterangan' => 'Migrasi data lama | Mitra: X',
        ], $asli));
        $s = $this->dok(array_merge([
            'nomor_dokumen' => $nomor.'-L432', 'file' => 'f.pdf', 'keterangan' => 'Migrasi dari tabel dokumen',
        ], $salinan));

        return [$a, $s];
    }

    private function mitra(string $nama = 'PT Contoh', ?int $id = null): MasterMitra
    {
        $m = new MasterMitra();
        $m->forceFill(array_filter(['id' => $id, 'nama_mitra' => $nama, 'kategori_mitra' => 'DUDI', 'aktif' => true]))->save();

        return $m->fresh();
    }

    private function unit(string $nama): int
    {
        return MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => $nama, 'aktif' => true])->id;
    }

    private function berkasCadangan(): string
    {
        $baru = array_values(array_diff(glob(storage_path('app/cadangan-gabung-dokumen-*.json')) ?: [], $this->cadanganAwal));
        $this->assertNotEmpty($baru, 'berkas cadangan tidak dibuat');

        return end($baru);
    }

    public function test_pratinjau_tidak_mengubah_apa_pun(): void
    {
        [$a, $s] = $this->pasangan([], ['snap_nama_mitra' => 'PT Contoh']);

        $this->artisan('sikerma:gabung-dokumen-ganda')->assertSuccessful();

        $this->assertNull($s->fresh()->dihapus_admin_pada);
        $this->assertNull($a->fresh()->snap_nama_mitra);
        $this->assertSame([], array_diff(glob(storage_path('app/cadangan-gabung-dokumen-*.json')) ?: [], $this->cadanganAwal));
    }

    public function test_asli_dipertahankan_dilengkapi_dan_salinan_di_soft_delete(): void
    {
        $mitra = $this->mitra();
        $unit = $this->unit('TI');
        // Asli sengaja kosong di tanggal_mulai, ruang lingkup & snapshot supaya terisi dari salinan,
        // tapi tidak "kalah jauh" dari salinan (itu masuk perlu keputusan, ada tesnya sendiri).
        [$a, $s] = $this->pasangan(
            ['mitra_id' => $mitra->id, 'unit_prodi_id' => $unit, 'tanggal_berakhir' => '2030-01-26'],
            ['snap_nama_mitra' => 'PT Contoh', 'ruang_lingkup_ids' => [1, 2], 'tanggal_mulai' => '2023-01-26', 'tanggal_berakhir' => '2030-01-26'],
        );

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $a = $a->fresh();
        $this->assertSame('06A/MOA.PL29/I/2023', $a->nomor_dokumen);
        $this->assertNull($a->dihapus_admin_pada);
        $this->assertSame('PT Contoh', $a->snap_nama_mitra);
        $this->assertSame([1, 2], $a->ruang_lingkup_ids);
        $this->assertSame('2023-01-26', $a->tanggal_mulai->toDateString());
        $this->assertSame($mitra->id, $a->mitra_id);

        $s = $s->fresh();
        $this->assertNotNull($s->dihapus_admin_pada);
        $this->assertStringContainsString('[Duplikat] digabung ke dokumen #'.$a->id, $s->keterangan);
        $this->assertStringContainsString('Migrasi dari tabel dokumen', $s->keterangan);
    }

    public function test_nilai_asli_yang_sudah_terisi_tidak_ditimpa_oleh_salinan(): void
    {
        $m1 = $this->mitra('PT A');
        [$a, $s] = $this->pasangan(
            ['mitra_id' => $m1->id, 'snap_nama_mitra' => 'Nama Asli', 'ruang_lingkup_ids' => [9]],
            ['snap_nama_mitra' => 'Nama Salinan', 'ruang_lingkup_ids' => [1, 2]],
        );

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $a = $a->fresh();
        $this->assertSame('Nama Asli', $a->snap_nama_mitra);
        $this->assertSame([9], $a->ruang_lingkup_ids);
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_dokumen_L_dengan_file_berbeda_bukan_duplikat_dan_tidak_disentuh(): void
    {
        [$a, $s] = $this->pasangan([], ['file' => 'lain.pdf'], '17/MOA.PL29/II/2024');

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertNull($a->fresh()->dihapus_admin_pada);
        $this->assertNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_dokumen_yang_sudah_dihapus_diabaikan(): void
    {
        [$a, $s] = $this->pasangan([], ['dihapus_admin_pada' => now()->subDay()]);
        $ketAwal = $s->keterangan;

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertSame($ketAwal, $s->fresh()->keterangan);
        $this->assertNull($a->fresh()->snap_nama_mitra);
    }

    public function test_data_turunan_dipindah_ke_asli_tanpa_dobel_file(): void
    {
        [$a, $s] = $this->pasangan();
        DokumenFile::create(['dokumen_id' => $a->id, 'peran_berkas' => 'dokumen_final', 'nama_file' => 'f.pdf', 'path_file' => 'uploads/f.pdf']);
        $sama = DokumenFile::create(['dokumen_id' => $s->id, 'peran_berkas' => 'dokumen_final', 'nama_file' => 'f.pdf', 'path_file' => 'uploads/f.pdf']);
        $beda = DokumenFile::create(['dokumen_id' => $s->id, 'peran_berkas' => 'lampiran', 'nama_file' => 'g.pdf', 'path_file' => 'uploads/g.pdf']);
        $log = DokumenLog::create(['dokumen_id' => $s->id, 'tipe_log' => 'status', 'judul_log' => 'x']);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertSame($a->id, (int) $beda->fresh()->dokumen_id, 'file yang belum ada dipindah');
        $this->assertSame($s->id, (int) $sama->fresh()->dokumen_id, 'file yang sudah ada di asli tidak dipindah (tidak dobel)');
        $this->assertSame($a->id, (int) $log->fresh()->dokumen_id);
        $this->assertSame(2, DokumenFile::where('dokumen_id', $a->id)->count());
    }

    public function test_tanggal_beda_tanpa_keputusan_masuk_perlu_keputusan_dan_tidak_diproses(): void
    {
        [$a, $s] = $this->pasangan(['tanggal_berakhir' => '2027-01-01'], ['tanggal_berakhir' => '2028-01-01']);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertNull($s->fresh()->dihapus_admin_pada);
        $this->assertSame('2027-01-01', $a->fresh()->tanggal_berakhir->toDateString());
    }

    public function test_keputusan_tanggal_memakai_tanggal_salinan_dan_menghitung_ulang_status(): void
    {
        // Pasangan 98 / 698 -> tanggal_berakhir 2024-09-02 (keputusan). Sekarang 2026-10-07 -> archived.
        $a = $this->dok(['id' => 98, 'nomor_dokumen' => '06A/MOA.PL29/I/2023', 'file' => 'f.pdf', 'tanggal_berakhir' => '2025-09-02', 'status_siklus' => 'active']);
        $s = $this->dok(['id' => 698, 'nomor_dokumen' => '06A/MOA.PL29/I/2023-L432', 'file' => 'f.pdf', 'tanggal_berakhir' => '2024-09-02', 'status_siklus' => 'archived']);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $a = $a->fresh();
        $this->assertSame('2024-09-02', $a->tanggal_berakhir->toDateString());
        $this->assertSame('archived', $a->status_siklus);
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_keputusan_tanggal_ditahan_bila_tanggal_salinan_tidak_cocok(): void
    {
        $a = $this->dok(['id' => 98, 'nomor_dokumen' => '06A/MOA.PL29/I/2023', 'file' => 'f.pdf', 'tanggal_berakhir' => '2025-09-02']);
        $s = $this->dok(['id' => 698, 'nomor_dokumen' => '06A/MOA.PL29/I/2023-L432', 'file' => 'f.pdf', 'tanggal_berakhir' => '2024-09-03']);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertNull($s->fresh()->dihapus_admin_pada);
        $this->assertSame('2025-09-02', $a->fresh()->tanggal_berakhir->toDateString());
    }

    public function test_keputusan_tanggal_tidak_menimpa_bila_tanggal_salinan_kosong(): void
    {
        $a = $this->dok(['id' => 98, 'nomor_dokumen' => '06A/MOA.PL29/I/2023', 'file' => 'f.pdf', 'tanggal_berakhir' => '2025-09-02', 'status_siklus' => 'archived']);
        $s = $this->dok(['id' => 698, 'nomor_dokumen' => '06A/MOA.PL29/I/2023-L432', 'file' => 'f.pdf', 'tanggal_berakhir' => null, 'status_siklus' => 'archived']);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertSame('2025-09-02', $a->fresh()->tanggal_berakhir->toDateString());
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_status_yang_masih_beda_setelah_penyelarasan_masuk_perlu_keputusan(): void
    {
        // Salinan punya tanggal_berakhir sendiri, jadi statusnya membawa informasi dan harus cocok.
        [$a, $s] = $this->pasangan(
            ['status_siklus' => 'active', 'tanggal_berakhir' => '2030-01-01'],
            ['status_siklus' => 'archived', 'tanggal_berakhir' => '2030-01-01'],
        );

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_status_salinan_tidak_dibandingkan_bila_salinan_tidak_punya_tanggal_berakhir(): void
    {
        // Kasus 51 / 728: asli archived (tanggal sudah lewat), salinan tanpa tanggal & berstatus active bawaan.
        [$a, $s] = $this->pasangan(
            ['status_siklus' => 'archived', 'tanggal_berakhir' => '2024-11-02'],
            ['status_siklus' => 'active', 'tanggal_berakhir' => null],
        );

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
        $a = $a->fresh();
        $this->assertSame('archived', $a->status_siklus);
        $this->assertSame('2024-11-02', $a->tanggal_berakhir->toDateString());
    }

    public function test_dokumen_yang_jadi_archived_karena_tanggal_baru_ikut_menerima_metadata_arsip(): void
    {
        // 98 / 698: tanggal baru 2024-09-02 -> archived; salinan membawa metadata arsip.
        $a = $this->dok(['id' => 98, 'nomor_dokumen' => '06A/MOA.PL29/I/2023', 'file' => 'f.pdf', 'tanggal_berakhir' => '2028-09-02', 'status_siklus' => 'active']);
        $s = $this->dok(['id' => 698, 'nomor_dokumen' => '06A/MOA.PL29/I/2023-L432', 'file' => 'f.pdf', 'tanggal_berakhir' => '2024-09-02', 'status_siklus' => 'archived', 'diarsipkan_pada' => '2025-01-01 00:00:00', 'alasan_arsip' => 'Kadaluarsa']);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $a = $a->fresh();
        $this->assertSame('archived', $a->status_siklus);
        $this->assertNotNull($a->diarsipkan_pada);
        $this->assertSame('Kadaluarsa', $a->alasan_arsip);
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_dokumen_yang_tetap_active_tidak_menerima_metadata_arsip_dari_salinan(): void
    {
        // 113 / 711: tanggal baru 2027-10-24 -> tetap active; metadata arsip di salinan TIDAK disalin.
        $a = $this->dok(['id' => 113, 'nomor_dokumen' => '77A/MOU.PL29/XI/2023', 'file' => 'f.pdf', 'tanggal_berakhir' => '2027-11-06', 'status_siklus' => 'active']);
        $s = $this->dok(['id' => 711, 'nomor_dokumen' => '77A/MOU.PL29/XI/2023-L400', 'file' => 'f.pdf', 'tanggal_berakhir' => '2027-10-24', 'status_siklus' => 'active', 'diarsipkan_pada' => '2025-01-01 00:00:00', 'alasan_arsip' => 'Salah']);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $a = $a->fresh();
        $this->assertSame('active', $a->status_siklus);
        $this->assertNull($a->diarsipkan_pada);
        $this->assertNull($a->alasan_arsip);
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_unit_prodi_beda_tidak_diubah_dan_pakai_milik_asli(): void
    {
        $u1 = $this->unit('TI');
        $u2 = $this->unit('Mesin');
        [$a, $s] = $this->pasangan(['unit_prodi_id' => $u1], ['unit_prodi_id' => $u2]);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertSame($u1, (int) $a->fresh()->unit_prodi_id);
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_salinan_jauh_lebih_lengkap_masuk_perlu_keputusan(): void
    {
        $m = $this->mitra();
        [$a, $s] = $this->pasangan([], [
            'mitra_id' => $m->id, 'snap_nama_mitra' => 'PT Contoh',
            'tanggal_mulai' => '2023-01-01', 'tanggal_berakhir' => '2033-01-01',
        ]);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertNull($s->fresh()->dihapus_admin_pada);
        $this->assertNull($a->fresh()->mitra_id);
    }

    public function test_metadata_arsip_disalin_hanya_bila_dokumen_akhirnya_archived(): void
    {
        [$a, $s] = $this->pasangan(
            ['status_siklus' => 'archived'],
            ['status_siklus' => 'archived', 'diarsipkan_pada' => '2025-01-01 00:00:00', 'alasan_arsip' => 'Kadaluarsa'],
        );
        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();
        $this->assertSame('Kadaluarsa', $a->fresh()->alasan_arsip);

        [$a2, $s2] = $this->pasangan(
            ['status_siklus' => 'active'],
            ['status_siklus' => 'active', 'diarsipkan_pada' => '2025-01-01 00:00:00', 'alasan_arsip' => 'Salah'],
            '99/MOU.PL29/I/2024',
        );
        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();
        $this->assertNull($a2->fresh()->alasan_arsip);
        $this->assertNotNull($s2->fresh()->dihapus_admin_pada);
    }

    public function test_pasangan_mitra_beda_hanya_diproses_dengan_flag_dan_memakai_mitra_asli(): void
    {
        $m1 = $this->mitra('PT Asli');
        $m2 = $this->mitra('PT Asli Cabang');
        [$a, $s] = $this->pasangan(['mitra_id' => $m1->id], ['mitra_id' => $m2->id]);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();
        $this->assertNull($s->fresh()->dihapus_admin_pada, 'tanpa flag, jenis B tidak diproses');

        $this->artisan('sikerma:gabung-dokumen-ganda --apply --termasuk-mitra-beda')->assertSuccessful();
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
        $this->assertSame($m1->id, (int) $a->fresh()->mitra_id);
    }

    public function test_keputusan_mitra_103_726_memakai_mitra_milik_salinan(): void
    {
        $salah = $this->mitra('Resto Baabaa Kambing');
        $benar = $this->mitra('CV Amanah Berkah Bersama', 1100);
        $a = $this->dok(['id' => 103, 'nomor_dokumen' => '61/MOU.PL29/IX/2021', 'file' => 'f.pdf', 'mitra_id' => $salah->id]);
        $s = $this->dok(['id' => 726, 'nomor_dokumen' => '61/MOU.PL29/IX/2021-L408', 'file' => 'f.pdf', 'mitra_id' => $benar->id]);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply --termasuk-mitra-beda')->assertSuccessful();

        $this->assertSame(1100, (int) $a->fresh()->mitra_id);
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
    }

    public function test_rollback_mengembalikan_semuanya(): void
    {
        $mitra = $this->mitra();
        [$a, $s] = $this->pasangan(['mitra_id' => $mitra->id], ['snap_nama_mitra' => 'PT Contoh', 'ruang_lingkup_ids' => [1, 2]]);
        $beda = DokumenFile::create(['dokumen_id' => $s->id, 'peran_berkas' => 'lampiran', 'nama_file' => 'g.pdf', 'path_file' => 'uploads/g.pdf']);
        $ketSalinan = $s->keterangan;

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();
        $this->assertNotNull($s->fresh()->dihapus_admin_pada);
        $this->assertSame($a->id, (int) $beda->fresh()->dokumen_id);

        // Pakai array argumen: string perintah mem-parse backslash path Windows.
        $this->artisan('sikerma:gabung-dokumen-ganda', ['--rollback' => $this->berkasCadangan()])->assertSuccessful();

        $a = $a->fresh();
        $s = $s->fresh();
        $this->assertNull($a->snap_nama_mitra);
        $this->assertEmpty($a->ruang_lingkup_ids);
        $this->assertNull($s->dihapus_admin_pada);
        $this->assertSame($ketSalinan, $s->keterangan);
        $this->assertSame($s->id, (int) $beda->fresh()->dokumen_id);
    }

    public function test_rollback_menolak_berkas_yang_bukan_cadangan_command_ini(): void
    {
        $path = storage_path('app/cadangan-gabung-dokumen-bukan.json');
        file_put_contents($path, json_encode(['perintah' => 'lain']));

        try {
            $this->artisan('sikerma:gabung-dokumen-ganda', ['--rollback' => $path])->assertFailed();
        } finally {
            @unlink($path);
        }
    }

    public function test_idempotent_dijalankan_dua_kali_tidak_mengubah_lagi(): void
    {
        [$a, $s] = $this->pasangan([], ['snap_nama_mitra' => 'PT Contoh']);

        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();
        $ket = $s->fresh()->keterangan;
        $this->artisan('sikerma:gabung-dokumen-ganda --apply')->assertSuccessful();

        $this->assertSame($ket, $s->fresh()->keterangan);
    }
}
