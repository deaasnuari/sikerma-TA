<?php

namespace App\Console\Commands;

use App\Services\KerjasamaReminderService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class KirimReminderKerjasama extends Command
{
    protected $signature = 'sikerma:kirim-reminder-kerjasama
        {--dry-run : Tampilkan apa yang akan dikirim tanpa benar-benar mengirim / menyimpan}
        {--tanggal= : Anggap tanggal ini sebagai "hari ini" (format Y-m-d), untuk pengujian}';

    protected $description = 'Kirim email pengingat otomatis untuk dokumen kerja sama yang mendekati tanggal berakhir (3 bulan / 1 bulan / urgent)';

    public function handle(KerjasamaReminderService $service): int
    {
        $hariIni = $this->option('tanggal') ? Carbon::parse($this->option('tanggal')) : Carbon::now();
        $dryRun = (bool) $this->option('dry-run');

        $this->info(sprintf(
            'Menjalankan pengingat kerja sama untuk tanggal %s%s',
            $hariIni->toDateString(),
            $dryRun ? ' (DRY RUN — tidak mengirim)' : '',
        ));

        $hasil = $service->jalankan($hariIni, $dryRun);

        if ($hasil['baris'] === []) {
            $this->line('Tidak ada dokumen yang perlu dikirimi pengingat.');
        } else {
            $this->table(
                ['Dok ID', 'Nomor', 'Mitra', 'Jenis', 'Berakhir', 'Sisa (hari)', 'Email', 'Status'],
                array_map(static fn (array $b) => [
                    $b['dokumen_id'],
                    $b['nomor'],
                    \Illuminate\Support\Str::limit((string) $b['mitra'], 30),
                    $b['jenis'],
                    $b['tanggal_berakhir'],
                    $b['sisa_hari'],
                    $b['email'] ?? '(tidak ada)',
                    $b['status'],
                ], $hasil['baris']),
            );
        }

        $this->info(sprintf(
            'Selesai. Terkirim: %d | Gagal: %d | Dilewati (tanpa email): %d | Sudah pernah dikirim: %d',
            $hasil['terkirim'],
            $hasil['gagal'],
            $hasil['dilewati'],
            $hasil['sudah_pernah'],
        ));

        return $hasil['gagal'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
