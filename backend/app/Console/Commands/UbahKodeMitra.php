<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Ubah / kosongkan master_mitra.kode_mitra secara eksplisit (mis. memasukkan kode resmi dari Humas).
 *
 *   php artisan sikerma:ubah-kode-mitra --set=394:,451:PTP15            # pratinjau (dry-run)
 *   php artisan sikerma:ubah-kode-mitra --set=394:,451:PTP15 --apply    # terapkan
 *   php artisan sikerma:ubah-kode-mitra --rollback=<berkas> [--apply]   # pulihkan nilai lama (pratinjau dulu)
 *
 * Format --set: id:kode,id:kode. Kode kosong sesudah titik dua (mis. 394:) berarti MENGOSONGKAN kode.
 * Pengaman opsional "id:kode@kode_lama" (mis. 1059:A03@A06): kode mitra SEKARANG harus persis kode_lama
 * (kosong setelah @ = harus belum berkode); kalau tidak, seluruh perintah ditolak — melindungi dari daftar basi.
 * kode_mitra bersifat unik, jadi kode yang sudah dipakai mitra LAIN membuat seluruh perubahan ditolak
 * (tidak ada yang diterapkan sebagian). Mitra yang saling bertukar kode dalam satu --set diperbolehkan.
 * Kode di luar pola umum (huruf besar 1–3 + angka 1–3, mis. PTP15) hanya diberi peringatan.
 * Nilai lama dicadangkan ke storage/app/ sebelum --apply, dan sesudahnya dicek tidak ada kode ganda.
 */
class UbahKodeMitra extends Command
{
    protected $signature = 'sikerma:ubah-kode-mitra
        {--set= : Perubahan kode, format id:kode,id:kode — kode kosong (mis. 394:) mengosongkan kode_mitra}
        {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}
        {--rollback= : Pulihkan kode lama dari berkas cadangan JSON di storage/app/ (pratinjau dulu; tambahkan --apply)}';

    protected $description = 'Ubah atau kosongkan kode_mitra di master_mitra dengan pratinjau, pengecekan bentrok unik, cadangan, dan rollback';

    private const POLA = '/^[A-Z]{1,3}[0-9]{1,3}$/';

    /** @var array<int, ?string> pengaman id => kode_lama yang diharapkan (dari "id:kode@kode_lama") */
    private array $guard = [];

    public function handle(): int
    {
        if ($this->option('rollback')) {
            return $this->rollback((string) $this->option('rollback'), (bool) $this->option('apply'));
        }

        $set = $this->parse((string) $this->option('set'));
        if ($set === null) {
            return self::FAILURE;
        }

        $mitra = DB::table('master_mitra')->whereIn('id', array_keys($set))->get()->keyBy('id');
        $hilang = array_values(array_diff(array_keys($set), $mitra->keys()->map(fn ($v) => (int) $v)->all()));
        if ($hilang !== []) {
            $this->error('Mitra tidak ditemukan: #'.implode(', #', $hilang).'.');

            return self::FAILURE;
        }

        [$baris, $perubahan, $bentrok] = $this->evaluasi($set, $mitra);

        $this->table(['id', 'Nama', 'Kode lama', '→ Kode baru', 'Keterangan'], $baris);

        if ($bentrok !== []) {
            $this->error('DITOLAK — ada kode yang bentrok (kode_mitra unik). Tidak ada yang diubah:');
            foreach ($bentrok as $b) {
                $this->line('  - '.$b);
            }

            return self::FAILURE;
        }

        if ($perubahan === []) {
            $this->info('Semua kode sudah sesuai. Tidak ada yang perlu diubah.');

            return self::SUCCESS;
        }

        $this->line(sprintf('Ringkasan: %d kode akan diubah (%d dikosongkan, %d diisi/diganti).', count($perubahan),
            count(array_filter($perubahan, fn ($k) => $k === null)), count(array_filter($perubahan, fn ($k) => $k !== null))));

        if (! $this->option('apply')) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan.');

            return self::SUCCESS;
        }

        $berkas = storage_path('app/cadangan-ubah-kode-mitra-'.now()->format('Ymd-His').'.json');
        $cadangan = ['perintah' => 'sikerma:ubah-kode-mitra', 'dibuat' => now()->toIso8601String(), 'perubahan' => []];
        foreach ($perubahan as $id => $baru) {
            $cadangan['perubahan'][] = [
                'id' => $id,
                'nama_mitra' => $mitra[$id]->nama_mitra,
                'kode_sebelum' => $mitra[$id]->kode_mitra,
                'kode_sesudah' => $baru,
                'updated_at_sebelum' => $mitra[$id]->updated_at,
            ];
        }
        if (file_put_contents($berkas, json_encode($cadangan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw new \RuntimeException('Gagal menulis berkas cadangan: '.$berkas);
        }

        try {
            $this->terapkanKode($perubahan);
        } catch (\Throwable $e) {
            @unlink($berkas);

            throw $e;
        }

        $this->info(count($perubahan).' kode_mitra diubah. Cadangan: '.$berkas);
        $this->cekGanda();
        $this->line('Pulihkan dengan (pratinjau dulu): php artisan sikerma:ubah-kode-mitra --rollback='.basename($berkas));

        return self::SUCCESS;
    }

    /** @return array<int, ?string>|null id => kode baru (null = kosongkan) */
    private function parse(string $opsi): ?array
    {
        if (trim($opsi) === '') {
            $this->error('Isi --set, mis. --set=394:,451:PTP15 (kode kosong = mengosongkan kode).');

            return null;
        }

        $set = [];
        $kodeDipakai = [];
        foreach (preg_split('/[\s,;]+/', trim($opsi), -1, PREG_SPLIT_NO_EMPTY) as $p) {
            if (! preg_match('/^(\d+):([^@]*)(?:@(.*))?$/', $p, $m)) {
                $this->error("Format tidak valid: '{$p}' — pakai id:kode, mis. 451:PTP15, 394: (mengosongkan), atau id:kode@kode_lama (pengaman).");

                return null;
            }
            $id = (int) $m[1];
            $kode = trim($m[2]);
            if (isset($m[3])) {
                // Pengaman "@kode_lama": kode mitra SEKARANG harus persis ini (kosong = harus belum punya kode),
                // kalau tidak seluruh perintah ditolak. Mencegah memakai daftar yang sudah basi.
                $this->guard[$id] = trim($m[3]) === '' ? null : trim($m[3]);
            }
            if (array_key_exists($id, $set)) {
                $this->error("Mitra #{$id} muncul lebih dari sekali di --set.");

                return null;
            }
            if (mb_strlen($kode) > 20) {
                $this->error("Kode untuk #{$id} lebih dari 20 karakter.");

                return null;
            }
            if ($kode !== '') {
                if (isset($kodeDipakai[$kode])) {
                    $this->error("Kode '{$kode}' diberikan ke dua mitra (#{$kodeDipakai[$kode]} dan #{$id}) di --set yang sama.");

                    return null;
                }
                $kodeDipakai[$kode] = $id;
            }
            $set[$id] = $kode === '' ? null : $kode;
        }

        return $set;
    }

    /**
     * @param  array<int, ?string>  $set
     * @return array{0: array<int, array>, 1: array<int, ?string>, 2: array<int, string>} baris tabel, perubahan nyata, bentrok
     */
    private function evaluasi(array $set, $mitra): array
    {
        $baris = [];
        $perubahan = [];
        $bentrok = [];

        foreach ($set as $id => $baru) {
            $m = $mitra[$id];
            $lama = trim((string) $m->kode_mitra) === '' ? null : (string) $m->kode_mitra;
            $ket = [];

            if (array_key_exists($id, $this->guard) && $this->guard[$id] !== $lama) {
                $ket[] = "BENTROK: kode sekarang '".($lama ?? '(kosong)')."' ≠ yang diharapkan '".($this->guard[$id] ?? '(kosong)')."'";
                $bentrok[] = "mitra #{$id} {$m->nama_mitra}: kode sekarang '".($lama ?? '(kosong)')."', daftar mengharapkan '".($this->guard[$id] ?? '(kosong)')."' (daftar basi?)";
            }

            if ($lama === $baru) {
                $ket[] = 'sudah sama — dilewati';
            } else {
                $perubahan[$id] = $baru;
            }

            if ($baru !== null) {
                if (! preg_match(self::POLA, $baru)) {
                    $ket[] = 'peringatan: di luar pola umum (mis. PTP15)';
                }
                // Pemegang lain yang bukan bagian dari --set (atau yang tetap memegang kode itu sesudah --set).
                $pemegang = DB::table('master_mitra')->where('kode_mitra', $baru)->where('id', '!=', $id)->get(['id', 'nama_mitra']);
                foreach ($pemegang as $h) {
                    $dilepas = array_key_exists((int) $h->id, $set) && $set[(int) $h->id] !== $baru;
                    if ($dilepas) {
                        $ket[] = "kode dilepas oleh #{$h->id} (ikut --set)";
                    } else {
                        $ket[] = "BENTROK: dipakai #{$h->id} {$h->nama_mitra}";
                        $bentrok[] = "kode '{$baru}' untuk #{$id} {$m->nama_mitra} sudah dipakai mitra #{$h->id} {$h->nama_mitra}";
                    }
                }
                $mirip = DB::table('master_mitra')->whereRaw('lower(kode_mitra) = ?', [mb_strtolower($baru)])->where('kode_mitra', '!=', $baru)->where('id', '!=', $id)->value('id');
                if ($mirip) {
                    $ket[] = "peringatan: beda huruf besar/kecil saja dengan kode mitra #{$mirip}";
                }
            }

            $baris[] = [$id, mb_strimwidth((string) $m->nama_mitra, 0, 44, '…'), $lama ?? '(kosong)', $baru ?? '(dikosongkan)', implode('; ', $ket) ?: 'OK'];
        }

        return [$baris, $perubahan, $bentrok];
    }

    /**
     * Dua tahap supaya pertukaran kode antar-mitra tidak melanggar unique di tengah jalan:
     * kosongkan dulu semua yang berubah, baru isi.
     *
     * @param  array<int, ?string>  $perubahan
     */
    private function terapkanKode(array $perubahan): void
    {
        DB::transaction(function () use ($perubahan) {
            $ids = array_keys($perubahan);
            DB::table('master_mitra')->whereIn('id', $ids)->update(['kode_mitra' => null]);
            foreach ($perubahan as $id => $kode) {
                DB::table('master_mitra')->where('id', $id)->update(['kode_mitra' => $kode, 'updated_at' => now()]);
            }
        });
    }

    private function cekGanda(): void
    {
        $ganda = DB::table('master_mitra')->select('kode_mitra', DB::raw('count(*) as n'))
            ->whereNotNull('kode_mitra')->where('kode_mitra', '!=', '')
            ->groupBy('kode_mitra')->havingRaw('count(*) > 1')->pluck('n', 'kode_mitra');
        if ($ganda->isEmpty()) {
            $this->info('Pengecekan ulang: tidak ada kode_mitra ganda.');
        } else {
            $this->error('PERINGATAN: ada kode_mitra ganda: '.$ganda->map(fn ($n, $k) => "{$k} ({$n}x)")->implode(', '));
        }
    }

    private function rollback(string $path, bool $apply): int
    {
        if (! is_file($path)) {
            $path = storage_path('app/'.ltrim($path, '/\\'));
        }
        if (! is_file($path)) {
            $this->error('Berkas cadangan tidak ditemukan: '.$path);

            return self::FAILURE;
        }
        $data = json_decode((string) file_get_contents($path), true);
        if (! is_array($data) || ($data['perintah'] ?? null) !== 'sikerma:ubah-kode-mitra') {
            $this->error('Berkas bukan cadangan sikerma:ubah-kode-mitra.');

            return self::FAILURE;
        }

        $kembali = [];
        foreach ($data['perubahan'] as $p) {
            $kembali[(int) $p['id']] = $p['kode_sebelum'] === null || trim((string) $p['kode_sebelum']) === '' ? null : (string) $p['kode_sebelum'];
        }

        $mitra = DB::table('master_mitra')->whereIn('id', array_keys($kembali))->get()->keyBy('id');
        $hilang = array_values(array_diff(array_keys($kembali), $mitra->keys()->map(fn ($v) => (int) $v)->all()));
        if ($hilang !== []) {
            $this->error('Mitra tidak ditemukan lagi: #'.implode(', #', $hilang).' — rollback dibatalkan.');

            return self::FAILURE;
        }

        [$baris, $perubahan, $bentrok] = $this->evaluasi($kembali, $mitra);
        $this->table(['id', 'Nama', 'Kode sekarang', '→ Dikembalikan ke', 'Keterangan'], $baris);

        if ($bentrok !== []) {
            $this->error('DITOLAK — kode lama sudah dipakai mitra lain. Tidak ada yang diubah:');
            foreach ($bentrok as $b) {
                $this->line('  - '.$b);
            }

            return self::FAILURE;
        }
        if ($perubahan === []) {
            $this->info('Kode sudah seperti semula. Tidak ada yang perlu dipulihkan.');

            return self::SUCCESS;
        }
        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk memulihkan.');

            return self::SUCCESS;
        }

        $this->terapkanKode($perubahan);
        $this->info('Rollback selesai: '.count($perubahan).' kode_mitra dikembalikan.');
        $this->cekGanda();

        return self::SUCCESS;
    }
}
