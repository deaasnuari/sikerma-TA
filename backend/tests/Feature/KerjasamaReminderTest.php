<?php

namespace Tests\Feature;

use App\Mail\KerjasamaReminderMail;
use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use App\Models\MasterUnitProdi;
use App\Models\NotifikasiKerjasama;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class KerjasamaReminderTest extends TestCase
{
    use RefreshDatabase;

    private const HARI_INI = '2026-01-01';

    private function unit(): MasterUnitProdi
    {
        return MasterUnitProdi::create([
            'jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Informatika', 'aktif' => true,
        ]);
    }

    private function buatDokumen(string $tanggalBerakhir, array $override = []): DokumenKerjasama
    {
        return DokumenKerjasama::create(array_merge([
            'no_permohonan'  => 'PMH-' . fake()->unique()->numerify('#####'),
            'nomor_dokumen'  => 'DOK-' . fake()->unique()->numerify('###/MOU/####'),
            'nama_dokumen'   => 'Dokumen Kerja Sama',
            'jenis_dokumen'  => 'MOU',
            'file'           => 'pengajuan/2026/01/dokumen.pdf',
            'status_siklus'  => 'active',
            'unit_prodi_id'  => $this->unit()->id,
            'tanggal_mulai'  => '2021-01-01',
            'tanggal_berakhir' => $tanggalBerakhir,
            'snap_nama_mitra' => 'PT Contoh Sejahtera',
            'snap_email_pengusul' => 'pengusul@polibatam.ac.id',
        ], $override));
    }

    private function jalankan(array $opsi = []): int
    {
        return $this->artisan('sikerma:kirim-reminder-kerjasama', array_merge([
            '--tanggal' => self::HARI_INI,
        ], $opsi))->run();
    }

    public function test_reminder_3bulan_dikirim_saat_dokumen_berakhir_sekitar_90_hari(): void
    {
        Mail::fake();
        $dokumen = $this->buatDokumen('2026-03-31'); // 89 hari dari 2026-01-01

        $this->jalankan();

        Mail::assertSentCount(1);
        Mail::assertSent(KerjasamaReminderMail::class, function (KerjasamaReminderMail $mail) use ($dokumen) {
            $mail->assertTo('pengusul@polibatam.ac.id');
            $mail->assertHasSubject('[SIKERMA] Pengingat: kerja sama ' . $dokumen->nomor_dokumen . ' berakhir dalam ±3 bulan');
            $mail->assertSeeInHtml('PT Contoh Sejahtera');
            $mail->assertSeeInHtml('2026-03-31');

            return true;
        });
        $this->assertDatabaseHas('notifikasi_kerjasama', [
            'dokumen_kerjasama_id'   => $dokumen->id,
            'jenis'                  => 'reminder-3bulan',
            'tanggal_berakhir_acuan' => '2026-03-31',
            'status'                 => 'terkirim',
            'email_tujuan'           => 'pengusul@polibatam.ac.id',
        ]);
    }

    public function test_reminder_1bulan_dan_urgent_sesuai_ambang_hari(): void
    {
        Mail::fake();
        $satuBulan = $this->buatDokumen('2026-01-20'); // 19 hari -> reminder-1bulan
        $urgent = $this->buatDokumen('2026-01-05');    // 4 hari  -> urgent

        $this->jalankan();

        $this->assertDatabaseHas('notifikasi_kerjasama', [
            'dokumen_kerjasama_id' => $satuBulan->id, 'jenis' => 'reminder-1bulan', 'status' => 'terkirim',
        ]);
        $this->assertDatabaseHas('notifikasi_kerjasama', [
            'dokumen_kerjasama_id' => $urgent->id, 'jenis' => 'urgent', 'status' => 'terkirim',
        ]);
    }

    public function test_tidak_kirim_dobel_saat_dijalankan_ulang(): void
    {
        Mail::fake();
        $this->buatDokumen('2026-03-31');

        $this->jalankan();
        $this->jalankan();
        $this->jalankan();

        Mail::assertSentCount(1);
        $this->assertSame(1, NotifikasiKerjasama::where('status', 'terkirim')->count());
    }

    public function test_dokumen_diperpanjang_memicu_siklus_reminder_baru(): void
    {
        Mail::fake();
        $dokumen = $this->buatDokumen('2026-03-31');

        $this->jalankan();
        Mail::assertSentCount(1);

        // Diperpanjang: tanggal_berakhir baru, kembali masuk window 3 bulan.
        $dokumen->update(['tanggal_berakhir' => '2026-03-25']);
        $this->jalankan();

        Mail::assertSentCount(2);
        $this->assertSame(2, NotifikasiKerjasama::where('jenis', 'reminder-3bulan')->where('status', 'terkirim')->count());
    }

    public function test_dokumen_tanpa_email_dicatat_dilewati_dan_bisa_dikirim_setelah_email_diisi(): void
    {
        Mail::fake();
        config(['sikerma.reminder_fallback_email' => null]);
        $dokumen = $this->buatDokumen('2026-03-31', [
            'snap_email_pengusul' => null,
            'mitra_id'            => null,
        ]);

        $this->jalankan();

        Mail::assertNothingSent();
        $this->assertDatabaseHas('notifikasi_kerjasama', [
            'dokumen_kerjasama_id' => $dokumen->id, 'jenis' => 'reminder-3bulan', 'status' => 'dilewati',
        ]);

        // Email mitra diisi -> run berikutnya benar-benar mengirim, baris 'dilewati' jadi 'terkirim'.
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Contoh Sejahtera', 'email_mitra' => 'mitra@contoh.co.id', 'aktif' => true]);
        $dokumen->update(['mitra_id' => $mitra->id]);

        $this->jalankan();

        Mail::assertSentCount(1);
        $this->assertSame(0, NotifikasiKerjasama::where('status', 'dilewati')->count());
        $this->assertDatabaseHas('notifikasi_kerjasama', [
            'dokumen_kerjasama_id' => $dokumen->id, 'jenis' => 'reminder-3bulan',
            'status' => 'terkirim', 'email_tujuan' => 'mitra@contoh.co.id',
        ]);
    }

    public function test_prioritas_email_pengusul_lebih_dulu_dari_email_mitra(): void
    {
        Mail::fake();
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Contoh Sejahtera', 'email_mitra' => 'mitra@contoh.co.id', 'aktif' => true]);
        $dokumen = $this->buatDokumen('2026-03-31', [
            'snap_email_pengusul' => 'pengusul@polibatam.ac.id',
            'mitra_id'            => $mitra->id,
        ]);

        $this->jalankan();

        $this->assertDatabaseHas('notifikasi_kerjasama', [
            'dokumen_kerjasama_id' => $dokumen->id, 'email_tujuan' => 'pengusul@polibatam.ac.id',
        ]);
    }

    public function test_fallback_email_dipakai_saat_pengusul_dan_mitra_kosong(): void
    {
        Mail::fake();
        config(['sikerma.reminder_fallback_email' => 'admin-kerjasama@polibatam.ac.id']);
        $dokumen = $this->buatDokumen('2026-03-31', ['snap_email_pengusul' => null, 'mitra_id' => null]);

        $this->jalankan();

        Mail::assertSentCount(1);
        $this->assertDatabaseHas('notifikasi_kerjasama', [
            'dokumen_kerjasama_id' => $dokumen->id, 'status' => 'terkirim',
            'email_tujuan' => 'admin-kerjasama@polibatam.ac.id',
        ]);
    }

    public function test_dokumen_arsip_dan_terhapus_diabaikan(): void
    {
        Mail::fake();
        $this->buatDokumen('2026-03-31', ['status_siklus' => 'archived']);
        $this->buatDokumen('2026-03-31', ['diarsipkan_pada' => now()]);
        $this->buatDokumen('2026-03-31', ['dihapus_admin_pada' => now()]);
        $this->buatDokumen('2026-03-31', ['dihapus_user_pada' => now()]);

        $this->jalankan();

        Mail::assertNothingSent();
        $this->assertSame(0, NotifikasiKerjasama::count());
    }

    public function test_dokumen_masih_jauh_dari_berakhir_tidak_dikirim(): void
    {
        Mail::fake();
        $this->buatDokumen('2026-06-01'); // ~151 hari, di luar semua window

        $this->jalankan();

        Mail::assertNothingSent();
        $this->assertSame(0, NotifikasiKerjasama::count());
    }

    public function test_dry_run_tidak_mengirim_dan_tidak_menyimpan(): void
    {
        Mail::fake();
        $this->buatDokumen('2026-03-31');

        $this->jalankan(['--dry-run' => true]);

        Mail::assertNothingSent();
        $this->assertSame(0, NotifikasiKerjasama::count());
    }
}
