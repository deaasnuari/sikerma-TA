<?php

namespace App\Console\Commands;

use App\Support\KerjasamaStatus;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Selaraskan kolom dokumen_kerjasama.status_siklus dengan tanggal_berakhir, supaya
 * "Kadaluarsa/Akan Berakhir/Aktif" di halaman Rekap Data & Arsip Dokumen (yang membaca
 * kolom ini apa adanya) SAMA dengan halaman Status dan Progres/Monitoring (yang selama ini
 * menghitung live dari tanggal). status_siklus tidak pernah di-update otomatis oleh sistem,
 * jadi command ini yang menyamakannya.
 *
 *   php artisan sikerma:sinkron-status-siklus            # pratinjau (dry-run)
 *   php artisan sikerma:sinkron-status-siklus --apply    # terapkan
 *
 * Aturan (dok yang belum dihapus):
 *   tanggal_berakhir < hari ini            -> archived  (Kadaluarsa)
 *   <= hari ini + N hari (default 90)      -> expiring  (Akan Berakhir)
 *   selebihnya / tanggal_berakhir kosong  -> active    (Aktif)
 */
class SinkronStatusSiklus extends Command
{
    protected $signature = 'sikerma:sinkron-status-siklus
        {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}
        {--hari-akan-berakhir=90 : Ambang hari untuk status "expiring"/Akan Berakhir}';

    protected $description = 'Selaraskan dokumen_kerjasama.status_siklus dengan tanggal_berakhir (Kadaluarsa/Akan Berakhir/Aktif konsisten di semua halaman)';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $ambang = max(0, (int) $this->option('hari-akan-berakhir'));
        $hariIni = Carbon::now()->startOfDay()->toDateString();
        $batasAkanBerakhir = Carbon::now()->startOfDay()->addDays($ambang)->toDateString();

        $rows = DB::table('dokumen_kerjasama')
            ->whereNull('dihapus_admin_pada')
            ->whereNull('dihapus_user_pada')
            ->get(['id', 'status_siklus', 'tanggal_berakhir']);

        $rencana = []; // [id => targetStatus]
        $matriks = []; // "dari -> ke" => count

        foreach ($rows as $row) {
            $target = $this->targetStatus($row->tanggal_berakhir, $hariIni, $batasAkanBerakhir);
            $sekarang = $row->status_siklus ?: 'active';

            if ($sekarang === $target) {
                continue;
            }

            $rencana[$row->id] = $target;
            $key = "{$sekarang} -> {$target}";
            $matriks[$key] = ($matriks[$key] ?? 0) + 1;
        }

        if ($rencana === []) {
            $this->info('status_siklus sudah selaras dengan tanggal_berakhir. Tidak ada yang diubah.');

            return self::SUCCESS;
        }

        ksort($matriks);
        $this->table(
            ['Perubahan', 'Jumlah'],
            collect($matriks)->map(fn ($n, $k) => [$k, $n])->values()->all(),
        );
        $this->line('Total baris berubah: ' . count($rencana));

        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($rencana) {
            foreach (array_chunk($rencana, 500, true) as $chunk) {
                foreach ($chunk as $id => $target) {
                    DB::table('dokumen_kerjasama')->where('id', $id)->update([
                        'status_siklus' => $target,
                        'updated_at' => Carbon::now(),
                    ]);
                }
            }
        });

        $this->info('Selesai. ' . count($rencana) . ' baris status_siklus diselaraskan.');

        return self::SUCCESS;
    }

    private function targetStatus(?string $tanggalBerakhir, string $hariIni, string $batasAkanBerakhir): string
    {
        return KerjasamaStatus::siklusDariTanggal($tanggalBerakhir, $hariIni, $batasAkanBerakhir);
    }
}
