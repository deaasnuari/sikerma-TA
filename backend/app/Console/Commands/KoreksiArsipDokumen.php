<?php

namespace App\Console\Commands;

use App\Support\KerjasamaStatus;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Koreksi satu kali untuk dokumen_kerjasama aktif yang salah terdeteksi kedaluwarsa saat migrasi
 * (mis. tanggal_berakhir 0029-02-04 karena salah ketik tahun di data lama) sehingga berstatus
 * bukan-archived tetapi masih membawa diarsipkan_pada / alasan_arsip. TERPISAH dari
 * sikerma:gabung-dokumen-ganda.
 *
 *   php artisan sikerma:koreksi-arsip-dokumen                          # pratinjau (dry-run)
 *   php artisan sikerma:koreksi-arsip-dokumen --apply                  # terapkan
 *   php artisan sikerma:koreksi-arsip-dokumen --rollback=<berkas JSON> # batalkan satu kali --apply
 *
 * Tiap koreksi dikunci pada nomor_dokumen dan kondisi lama yang diharapkan (status, tanggal, jenis):
 * kalau data di database tidak sama dengan yang diputuskan (mis. id berbeda di server lain), koreksi
 * DILEWATI dan dilaporkan, tidak dipaksakan. Kalau koreksi mengganti nomor_dokumen, nomor baru juga
 * harus belum dipakai dokumen lain (kolomnya unik). Kondisi sebelumnya dicadangkan ke storage/app/
 * sebelum --apply.
 */
class KoreksiArsipDokumen extends Command
{
    protected $signature = 'sikerma:koreksi-arsip-dokumen
        {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}
        {--rollback= : Batalkan satu kali --apply memakai berkas cadangan JSON di storage/app/}';

    protected $description = 'Koreksi dokumen aktif yang salah terdeteksi kedaluwarsa saat migrasi (kosongkan metadata arsip / betulkan nomor & tanggal)';

    private const KOLOM_TANGGAL = ['tanggal_mulai', 'tanggal_berakhir', 'tanggal_ttd'];

    /**
     * Keputusan koreksi.
     *  - 'nomor'         : nomor_dokumen LAMA yang harus cocok.
     *  - 'harapan'       : kondisi lama lain yang harus cocok sebelum diubah.
     *  - 'set'           : nilai baru.
     *  - 'hitung_status' : hitung ulang status_siklus dari tanggal_berakhir akhir (KerjasamaStatus::siklusDariTanggal).
     */
    private const KOREKSI = [
        851 => [
            'nomor' => '77/MOU.PL29/VI/2024',
            'harapan' => ['status_siklus' => 'active', 'tanggal_berakhir' => '2029-02-04'],
            'set' => ['diarsipkan_pada' => null, 'alasan_arsip' => null],
            'hitung_status' => false,
            'catatan' => 'Tahun di data lama salah ketik (0029); berakhir 2029-02-04 dan status active sudah benar → metadata arsip dikosongkan.',
        ],
        1161 => [
            'nomor' => '114/MOU.PL29/XI/2025',
            'harapan' => ['status_siklus' => 'active', 'jenis_dokumen' => 'MOA', 'tanggal_mulai' => '2027-06-16', 'tanggal_berakhir' => '2029-11-22'],
            'set' => [
                'nomor_dokumen' => '114/MOA.PL29/XI/2025',
                'tanggal_mulai' => '2025-11-02',
                'tanggal_berakhir' => '2025-12-14',
                'tanggal_ttd' => '2025-11-03',
            ],
            'hitung_status' => true,
            'catatan' => 'Sesuai PDF: Nomor 114/MOA.PL29/XI/2025, jangka waktu 2 Nov s/d 14 Des 2025, ditandatangani 3 Nov 2025. Status dihitung ulang; diarsipkan_pada/alasan_arsip dibiarkan terisi (jenis_dokumen tidak diubah).',
        ],
        1080 => [
            'nomor' => '82/MOA.PL29/VIII/202',
            'harapan' => ['status_siklus' => 'active', 'tanggal_mulai' => '2025-08-11', 'tanggal_berakhir' => '2030-08-11'],
            'set' => [
                'nomor_dokumen' => '82/MOA.PL29/VIII/2025',
                'nama_dokumen' => 'Dokumen 82/MOA.PL29/VIII/2025',
            ],
            'hitung_status' => false,
            'catatan' => 'Nomor terpotong (tahun kurang satu digit). Tahun 2025 didukung tanggal_mulai 2025-08-11 dan tetangga nomor 81/84/85 VIII/2025; PDF-nya scan tanpa teks. nama_dokumen memuat typo yang sama, ikut diperbaiki.',
        ],
        1153 => [
            'nomor' => '86/MOA.PL29/VIII2025',
            'harapan' => ['status_siklus' => 'archived', 'tanggal_mulai' => '2024-08-26', 'tanggal_berakhir' => '2025-08-25'],
            'set' => [
                'nomor_dokumen' => '86/MOA.PL29/VIII/2025',
                'nama_dokumen' => 'Dokumen 86/MOA.PL29/VIII/2025',
            ],
            'hitung_status' => false,
            'catatan' => 'Garis miring sebelum tahun hilang ("VIII2025"). nama_dokumen memuat typo yang sama, ikut diperbaiki. Catatan: tanggal_mulai 2024-08-26 tidak diubah (berkas "MOA-ADD" = addendum, jadi periode awalnya bisa memang 2024).',
        ],
    ];

    public function handle(): int
    {
        if ($this->option('rollback')) {
            return $this->rollback((string) $this->option('rollback'));
        }

        $hariIni = Carbon::now()->startOfDay()->toDateString();
        $batas = Carbon::now()->startOfDay()->addDays(KerjasamaStatus::EXPIRING_WINDOW_DAYS)->toDateString();

        $rencana = [];
        $baris = [];
        foreach (self::KOREKSI as $id => $k) {
            $d = DB::table('dokumen_kerjasama')->where('id', $id)->first();
            if (! $d) {
                $baris[] = [$id, $k['nomor'], 'DILEWATI', 'dokumen tidak ditemukan'];

                continue;
            }
            if (trim((string) $d->nomor_dokumen) !== $k['nomor']) {
                $baris[] = [$id, $k['nomor'], 'DILEWATI', "nomor di database '{$d->nomor_dokumen}'"];

                continue;
            }

            $beda = [];
            foreach ($k['harapan'] as $kolom => $nilai) {
                $sekarang = $this->nilai($d, $kolom);
                if ($sekarang !== $this->normal($kolom, $nilai)) {
                    $beda[] = "{$kolom}: database '".($sekarang ?? 'NULL')."' ≠ keputusan '{$nilai}'";
                }
            }
            if ($beda !== []) {
                $baris[] = [$id, $k['nomor'], 'DILEWATI', implode('; ', $beda)];

                continue;
            }

            $perubahan = [];
            foreach ($k['set'] as $kolom => $nilai) {
                if ($this->nilai($d, $kolom) !== $this->normal($kolom, $nilai)) {
                    $perubahan[$kolom] = $nilai;
                }
            }

            if ($k['hitung_status']) {
                $berakhir = $perubahan['tanggal_berakhir'] ?? $d->tanggal_berakhir;
                $target = KerjasamaStatus::siklusDariTanggal($berakhir ? (string) $berakhir : null, $hariIni, $batas);
                if ($target !== ($d->status_siklus ?: 'active')) {
                    $perubahan['status_siklus'] = $target;
                }
            }

            if (isset($perubahan['nomor_dokumen'])) {
                $bentrok = DB::table('dokumen_kerjasama')
                    ->where('id', '!=', $id)
                    ->whereRaw('lower(trim(nomor_dokumen)) = ?', [mb_strtolower(trim($perubahan['nomor_dokumen']))])
                    ->value('id');
                if ($bentrok) {
                    $baris[] = [$id, $k['nomor'], 'DILEWATI', "nomor baru '{$perubahan['nomor_dokumen']}' sudah dipakai dokumen #{$bentrok}"];

                    continue;
                }
            }

            if ($perubahan === []) {
                $baris[] = [$id, $k['nomor'], 'sudah benar', ''];

                continue;
            }

            $rincian = [];
            foreach ($perubahan as $kolom => $nilai) {
                $rincian[] = $kolom.': '.($this->nilai($d, $kolom) ?? 'NULL').' → '.($nilai ?? 'NULL');
            }
            $rencana[$id] = ['sebelum' => array_intersect_key((array) $d, $perubahan), 'sesudah' => $perubahan];
            $baris[] = [$id, $k['nomor'], 'AKAN DIKOREKSI', implode("\n", $rincian)];
        }

        $this->table(['id', 'Nomor (lama)', 'Hasil', 'Rincian'], $baris);
        foreach (self::KOREKSI as $id => $k) {
            $this->line("  #{$id}: {$k['catatan']}");
        }

        if ($rencana === []) {
            $this->info('Tidak ada yang perlu dikoreksi.');

            return self::SUCCESS;
        }

        if (! $this->option('apply')) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan.');

            return self::SUCCESS;
        }

        $berkas = storage_path('app/cadangan-koreksi-arsip-'.now()->format('Ymd-His').'.json');
        $cadangan = ['dibuat' => now()->toIso8601String(), 'perintah' => 'sikerma:koreksi-arsip-dokumen', 'koreksi' => []];
        foreach ($rencana as $id => $r) {
            $cadangan['koreksi'][] = [
                'id' => $id,
                'sebelum' => $r['sebelum'] + ['updated_at' => DB::table('dokumen_kerjasama')->where('id', $id)->value('updated_at')],
            ];
        }
        if (file_put_contents($berkas, json_encode($cadangan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw new \RuntimeException('Gagal menulis berkas cadangan: '.$berkas);
        }

        try {
            DB::transaction(function () use ($rencana) {
                foreach ($rencana as $id => $r) {
                    DB::table('dokumen_kerjasama')->where('id', $id)->update($r['sesudah'] + ['updated_at' => now()]);
                }
            });
        } catch (\Throwable $e) {
            @unlink($berkas);

            throw $e;
        }

        $this->info(count($rencana).' dokumen dikoreksi. Cadangan rollback: '.$berkas);

        return self::SUCCESS;
    }

    /** Nilai kolom pada baris database, dinormalkan supaya bisa dibandingkan dengan keputusan. */
    private function nilai(object $d, string $kolom): ?string
    {
        return $this->normal($kolom, $d->{$kolom} ?? null);
    }

    private function normal(string $kolom, mixed $nilai): ?string
    {
        $nilai = $nilai === null ? '' : trim((string) $nilai);

        return match (true) {
            in_array($kolom, self::KOLOM_TANGGAL, true) => $nilai === '' ? null : substr($nilai, 0, 10),
            $kolom === 'status_siklus' => $nilai === '' ? 'active' : $nilai,
            $kolom === 'jenis_dokumen' => $nilai === '' ? null : strtoupper($nilai),
            default => $nilai === '' ? null : $nilai,
        };
    }

    private function rollback(string $path): int
    {
        if (! is_file($path)) {
            $path = storage_path('app/'.ltrim($path, '/\\'));
        }
        if (! is_file($path)) {
            $this->error('Berkas cadangan tidak ditemukan: '.$path);

            return self::FAILURE;
        }

        $data = json_decode((string) file_get_contents($path), true);
        if (! is_array($data) || ($data['perintah'] ?? null) !== 'sikerma:koreksi-arsip-dokumen') {
            $this->error('Berkas bukan cadangan sikerma:koreksi-arsip-dokumen.');

            return self::FAILURE;
        }

        DB::transaction(function () use ($data) {
            foreach ($data['koreksi'] as $k) {
                DB::table('dokumen_kerjasama')->where('id', $k['id'])->update($k['sebelum']);
            }
        });

        $this->info('Rollback selesai: '.count($data['koreksi']).' dokumen dikembalikan.');

        return self::SUCCESS;
    }
}
