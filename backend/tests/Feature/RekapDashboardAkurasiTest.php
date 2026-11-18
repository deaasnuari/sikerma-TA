<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use App\Support\KerjasamaStatus;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Akurasi rekap dashboard (/api/public/stats & /api/dokumen-kerjasama/stats/mitra) dan
 * kekonsistenannya setelah deduplikasi mitra (sikerma:gabung-mitra-ganda).
 *
 * Angka yang diharapkan DIHITUNG MANUAL dari data yang dibuat di tiap tes (bukan memanggil
 * logika yang sama dengan controller), jadi selisih sekecil apa pun akan ketahuan.
 */
class RekapDashboardAkurasiTest extends TestCase
{
    use RefreshDatabase;

    /** @var string[] berkas cadangan yang sudah ada sebelum tes (jangan dihapus). */
    private array $cadanganAwal = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->cadanganAwal = glob(storage_path('app/cadangan-gabung-mitra-*.json')) ?: [];
    }

    protected function tearDown(): void
    {
        // --apply menulis cadangan ke storage/app; bersihkan yang dibuat tes ini saja.
        foreach (glob(storage_path('app/cadangan-gabung-mitra-*.json')) ?: [] as $f) {
            if (! in_array($f, $this->cadanganAwal, true)) {
                @unlink($f);
            }
        }
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function mitra(string $nama, string $kategori, ?string $negara, array $extra = []): MasterMitra
    {
        return MasterMitra::create(array_merge([
            'nama_mitra' => $nama, 'kategori_mitra' => $kategori, 'negara' => $negara, 'aktif' => true,
        ], $extra));
    }

    private function dokumen(MasterMitra $mitra, string $kode, array $extra = []): DokumenKerjasama
    {
        return DokumenKerjasama::create(array_merge([
            'no_permohonan' => $kode, 'nomor_dokumen' => $kode, 'nama_dokumen' => 'Dok '.$kode,
            'jenis_dokumen' => 'MOU', 'file' => 't.pdf', 'mitra_id' => $mitra->id,
        ], $extra));
    }

    /**
     * Data campuran:
     *   DUDI dalam negeri (Industri, Indonesia)    : 2 dokumen
     *   DUDI luar negeri  (Perusahaan, Jepang)     : 1 dokumen
     *   Instansi dalam negeri (Perguruan Tinggi, negara kosong -> dianggap dalam negeri) : 3 dokumen (1 mitra, 3 dokumen)
     *   Instansi luar negeri (Pemerintahan, Malaysia) : 1 dokumen
     *   + 2 dokumen di Sampah (admin & pengusul) yang TIDAK boleh terhitung.
     */
    private function isiDataCampuran(): void
    {
        $dudiDn = $this->mitra('PT Industri Lokal', 'Industri', 'Indonesia');
        $dudiLn = $this->mitra('Nippon Co', 'Perusahaan', 'Jepang');
        $instDn = $this->mitra('Politeknik X', 'Perguruan Tinggi', null);
        $instLn = $this->mitra('Kementerian Y', 'Pemerintahan', 'Malaysia');

        $this->dokumen($dudiDn, 'A1');
        $this->dokumen($dudiDn, 'A2');
        $this->dokumen($dudiLn, 'B1');
        $this->dokumen($instDn, 'C1');
        $this->dokumen($instDn, 'C2');
        $this->dokumen($instDn, 'C3');
        $this->dokumen($instLn, 'D1');

        $this->dokumen($instLn, 'X1', ['dihapus_admin_pada' => now()]);
        $this->dokumen($dudiDn, 'X2', ['dihapus_user_pada' => now()]);
    }

    // ------------------------------------------------------------------
    // 1. public/stats cocok dengan hitungan manual
    // ------------------------------------------------------------------

    public function test_public_stats_cocok_dengan_hitungan_manual_dan_dokumen_di_sampah_tidak_terhitung(): void
    {
        $this->isiDataCampuran();

        $data = $this->getJson('/api/public/stats')->assertOk()->json('data');

        $this->assertSame(7, $data['total']);
        $this->assertSame(5, $data['dalam_negeri']);   // A1, A2, C1, C2, C3
        $this->assertSame(2, $data['luar_negeri']);    // B1 (Jepang), D1 (Malaysia)
    }

    public function test_public_stats_rincian_jumlahnya_sama_dengan_total(): void
    {
        $this->isiDataCampuran();

        $d = $this->getJson('/api/public/stats')->assertOk()->json('data');

        $this->assertSame(2, $d['dudi_nasional']);
        $this->assertSame(1, $d['dudi_internasional']);
        $this->assertSame(3, $d['instansi_nasional']);
        $this->assertSame(1, $d['instansi_internasional']);

        // Invarian: tiap dokumen bermitra jatuh ke TEPAT satu dari empat kelompok.
        $this->assertSame(
            $d['total'],
            $d['dudi_nasional'] + $d['dudi_internasional'] + $d['instansi_nasional'] + $d['instansi_internasional'],
        );
        // Dalam negeri + luar negeri = total.
        $this->assertSame($d['total'], $d['dalam_negeri'] + $d['luar_negeri']);
        $this->assertSame($d['dudi_internasional'] + $d['instansi_internasional'], $d['luar_negeri']);
    }

    // ------------------------------------------------------------------
    // 2. mitra/stats: hitung mitra unik, bukan dokumen
    // ------------------------------------------------------------------

    public function test_mitra_stats_menghitung_mitra_bukan_dokumen_dan_cocok_dengan_jumlah_baris_master_mitra(): void
    {
        $this->isiDataCampuran();

        $d = $this->getJson('/api/dokumen-kerjasama/stats/mitra')->assertOk()->json('data');

        $this->assertSame(MasterMitra::count(), $d['total']);   // 4 mitra, walau ada 9 dokumen
        $this->assertSame(4, $d['total']);
        $this->assertSame(
            $d['total'],
            $d['dudi_nasional'] + $d['dudi_internasional'] + $d['instansi_nasional'] + $d['instansi_internasional'],
        );
    }

    // ------------------------------------------------------------------
    // 3. Setelah deduplikasi: rekap tetap akurat
    // ------------------------------------------------------------------

    public function test_setelah_gabung_mitra_ganda_jumlah_dokumen_tetap_dan_jumlah_mitra_turun_sebanyak_duplikat(): void
    {
        $induk = $this->mitra('PT Maju Jaya', 'Industri', 'Indonesia', ['kode_mitra' => 'MJ-001']);
        $dup1 = $this->mitra('PT. Maju Jaya', 'Industri', 'Indonesia');
        $dup2 = $this->mitra('pt maju jaya', 'Industri', 'Indonesia');
        $lain = $this->mitra('Universitas Lain', 'Perguruan Tinggi', 'Indonesia');

        $this->dokumen($induk, 'M1');
        $this->dokumen($dup1, 'M2');
        $this->dokumen($dup2, 'M3');
        $this->dokumen($lain, 'L1');

        $publikSebelum = $this->getJson('/api/public/stats')->json('data');
        $mitraSebelum = $this->getJson('/api/dokumen-kerjasama/stats/mitra')->json('data');
        $this->assertSame(4, $mitraSebelum['total']);

        $this->artisan('sikerma:gabung-mitra-ganda', ['--apply' => true])->assertSuccessful();

        // Jumlah DOKUMEN tidak berubah: yang pindah hanya mitra_id-nya, tidak ada yang hilang/ganda.
        $publikSesudah = $this->getJson('/api/public/stats')->json('data');
        $this->assertSame($publikSebelum, $publikSesudah);
        $this->assertSame(4, DokumenKerjasama::count());
        $this->assertSame(3, DokumenKerjasama::where('mitra_id', $induk->id)->count());

        // Jumlah MITRA turun tepat sebanyak duplikat yang dihapus (4 -> 2) dan sama dengan baris master_mitra.
        $mitraSesudah = $this->getJson('/api/dokumen-kerjasama/stats/mitra')->json('data');
        $this->assertSame(2, $mitraSesudah['total']);
        $this->assertSame(MasterMitra::count(), $mitraSesudah['total']);
        $this->assertSame($mitraSebelum['total'] - 2, $mitraSesudah['total']);
        $this->assertSame(1, $mitraSesudah['dudi_nasional']);
    }

    public function test_gabung_mitra_ganda_tidak_menggandakan_hitungan_dokumen_per_kategori(): void
    {
        $induk = $this->mitra('CV Sentosa', 'Perusahaan', 'Indonesia', ['kode_mitra' => 'CV-1']);
        $dup = $this->mitra('Sentosa', 'Perusahaan', 'Indonesia');
        $this->dokumen($induk, 'S1');
        $this->dokumen($dup, 'S2');

        $this->artisan('sikerma:gabung-mitra-ganda', ['--apply' => true])->assertSuccessful();

        $d = $this->getJson('/api/public/stats')->json('data');
        $this->assertSame(2, $d['total']);
        $this->assertSame(2, $d['dudi_nasional']);   // bukan 4: join ke mitra tidak boleh menggandakan baris
    }

    public function test_dry_run_gabung_mitra_tidak_mengubah_angka_dashboard(): void
    {
        $this->mitra('PT Maju Jaya', 'Industri', 'Indonesia', ['kode_mitra' => 'MJ-001']);
        $this->mitra('PT. Maju Jaya', 'Industri', 'Indonesia');

        $sebelum = $this->getJson('/api/dokumen-kerjasama/stats/mitra')->json('data');
        $this->artisan('sikerma:gabung-mitra-ganda')->assertSuccessful();   // pratinjau tanpa --apply
        $sesudah = $this->getJson('/api/dokumen-kerjasama/stats/mitra')->json('data');

        $this->assertSame($sebelum, $sesudah);
        $this->assertSame(2, MasterMitra::count());
    }

    // ------------------------------------------------------------------
    // 4. Batas hari status (akurasi Aktif / Akan Berakhir / Kadaluarsa)
    // ------------------------------------------------------------------

    public function test_batas_hari_status_kerjasama(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 10:00:00'));

        $kasus = [
            // [tanggal_berakhir, status yang diharapkan]
            ['2026-06-14', 'archived'],  // kemarin -> kadaluarsa
            ['2026-06-15', 'expiring'],  // hari ini -> masih berlaku, akan berakhir
            ['2026-09-13', 'expiring'],  // hari ini + 90 hari (batas atas jendela)
            ['2026-09-14', 'active'],    // hari ini + 91 hari -> belum masuk jendela
            [null, 'active'],            // tanpa tanggal -> aktif
        ];

        foreach ($kasus as [$tanggal, $diharapkan]) {
            $this->assertSame(
                $diharapkan,
                KerjasamaStatus::fromTanggalBerakhir($tanggal, 'active'),
                'tanggal_berakhir='.($tanggal ?? 'null'),
            );
        }

        // Diarsipkan manual selalu archived walau tanggalnya masih jauh.
        $this->assertSame('archived', KerjasamaStatus::fromTanggalBerakhir('2030-01-01', 'archived'));
    }

    public function test_status_dari_tanggal_untuk_sinkron_siklus_konsisten_dengan_status_efektif(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 10:00:00'));
        $hariIni = '2026-06-15';
        $batas = Carbon::parse($hariIni)->addDays(KerjasamaStatus::EXPIRING_WINDOW_DAYS)->toDateString();

        foreach (['2026-06-14', '2026-06-15', '2026-09-13', '2026-09-14'] as $tanggal) {
            $this->assertSame(
                KerjasamaStatus::fromTanggalBerakhir($tanggal, 'active'),
                KerjasamaStatus::siklusDariTanggal($tanggal, $hariIni, $batas),
                'dua fungsi status harus sepakat untuk '.$tanggal,
            );
        }
    }
}
