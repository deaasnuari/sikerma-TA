<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Isi dokumen_kerjasama.snap_nama_mitra yang KOSONG dengan nama mitra yang sedang tertaut, supaya nama yang
 * tertulis di dokumen tidak hilang sebelum mitranya digabung / diganti nama. Jalankan SEBELUM penggabungan.
 *
 *   php artisan sikerma:isi-snap-nama-mitra --mitra=374,375 --dokumen=1156,1157           # pratinjau (dry-run)
 *   php artisan sikerma:isi-snap-nama-mitra --mitra=374,375 --dokumen=1156,1157 --apply   # terapkan
 *   php artisan sikerma:isi-snap-nama-mitra --rollback=<berkas> [--apply]                 # kosongkan lagi (pratinjau dulu)
 *
 * --mitra   : semua dokumen (termasuk yang di Sampah) milik mitra tersebut.
 * --dokumen : dokumen tertentu (nama yang dipakai = nama mitra yang tertaut ke dokumen itu).
 * Snap yang sudah terisi TIDAK ditimpa. Rollback hanya mengembalikan snap yang nilainya masih persis seperti yang
 * diisi perintah ini (kalau sudah diubah orang lain, dilewati).
 */
class IsiSnapNamaMitra extends Command
{
    protected $signature = 'sikerma:isi-snap-nama-mitra
        {--mitra= : id mitra (pisah koma): semua dokumennya yang snap_nama_mitra-nya kosong diisi}
        {--dokumen= : id dokumen (pisah koma) yang snap_nama_mitra-nya kosong diisi}
        {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}
        {--rollback= : Kosongkan lagi snap yang diisi, dari berkas cadangan JSON di storage/app/ (pratinjau dulu; tambahkan --apply)}';

    protected $description = 'Isi snap_nama_mitra kosong dengan nama mitra tertaut (pratinjau, cadangan JSON, rollback)';

    public function handle(): int
    {
        if ($this->option('rollback')) {
            return $this->rollback((string) $this->option('rollback'), (bool) $this->option('apply'));
        }

        $mitraIds = $this->ids($this->option('mitra'));
        $dokIds = $this->ids($this->option('dokumen'));
        if ($mitraIds === [] && $dokIds === []) {
            $this->error('Isi --mitra dan/atau --dokumen.');

            return self::FAILURE;
        }

        $dok = DB::table('dokumen_kerjasama as d')->join('master_mitra as m', 'm.id', '=', 'd.mitra_id')
            ->where(fn ($q) => $q->whereIn('d.mitra_id', $mitraIds)->orWhereIn('d.id', $dokIds))
            ->orderBy('d.mitra_id')->orderBy('d.id')
            ->get(['d.id', 'd.nomor_dokumen', 'd.mitra_id', 'd.snap_nama_mitra', 'd.dihapus_admin_pada', 'd.dihapus_user_pada', 'm.nama_mitra']);

        $dokHilang = array_diff($dokIds, $dok->pluck('id')->map(fn ($v) => (int) $v)->all());
        $mitraHilang = array_diff($mitraIds, DB::table('master_mitra')->whereIn('id', $mitraIds)->pluck('id')->map(fn ($v) => (int) $v)->all());
        if ($dokHilang || $mitraHilang) {
            $this->error('Tidak ditemukan / tanpa mitra: dokumen #'.implode(',#', $dokHilang).' mitra #'.implode(',#', $mitraHilang));

            return self::FAILURE;
        }

        $isi = [];
        $baris = [];
        foreach ($dok as $d) {
            $sampah = ($d->dihapus_admin_pada || $d->dihapus_user_pada) ? ' (Sampah)' : '';
            if (trim((string) $d->snap_nama_mitra) !== '') {
                $baris[] = [$d->id, $d->nomor_dokumen.$sampah, $d->mitra_id, 'sudah terisi: '.mb_strimwidth($d->snap_nama_mitra, 0, 40, '…'), '(tidak ditimpa)'];

                continue;
            }
            $isi[$d->id] = $d->nama_mitra;
            $baris[] = [$d->id, $d->nomor_dokumen.$sampah, $d->mitra_id, '(kosong)', $d->nama_mitra];
        }
        $this->table(['dok id', 'Nomor', 'mitra', 'snap sekarang', '→ snap diisi'], $baris);
        $this->line(sprintf('Ringkasan: %d dokumen diperiksa | %d akan diisi | %d sudah terisi (dilewati).', $dok->count(), count($isi), $dok->count() - count($isi)));

        if ($isi === []) {
            $this->info('Tidak ada yang perlu diisi.');

            return self::SUCCESS;
        }
        if (! $this->option('apply')) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan.');

            return self::SUCCESS;
        }

        $berkas = storage_path('app/cadangan-isi-snap-nama-mitra-'.now()->format('Ymd-His').'.json');
        $cad = ['perintah' => 'sikerma:isi-snap-nama-mitra', 'dibuat' => now()->toIso8601String(), 'diisi' => []];
        foreach ($isi as $id => $nama) {
            $cad['diisi'][] = ['id' => $id, 'snap_sebelum' => DB::table('dokumen_kerjasama')->where('id', $id)->value('snap_nama_mitra'), 'snap_sesudah' => $nama];
        }
        if (file_put_contents($berkas, json_encode($cad, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw new \RuntimeException('Gagal menulis berkas cadangan: '.$berkas);
        }
        try {
            DB::transaction(function () use ($isi) {
                foreach ($isi as $id => $nama) {
                    DB::table('dokumen_kerjasama')->where('id', $id)
                        ->where(fn ($q) => $q->whereNull('snap_nama_mitra')->orWhere('snap_nama_mitra', ''))
                        ->update(['snap_nama_mitra' => $nama]);
                }
            });
        } catch (\Throwable $e) {
            @unlink($berkas);

            throw $e;
        }

        $this->info(count($isi).' snap_nama_mitra diisi. Cadangan: '.$berkas);
        $this->line('Pulihkan dengan (pratinjau dulu): php artisan sikerma:isi-snap-nama-mitra --rollback='.basename($berkas));

        return self::SUCCESS;
    }

    /** @return int[] */
    private function ids(?string $opsi): array
    {
        return array_values(array_unique(array_map('intval', preg_split('/[\s,;]+/', trim((string) $opsi), -1, PREG_SPLIT_NO_EMPTY))));
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
        if (! is_array($data) || ($data['perintah'] ?? null) !== 'sikerma:isi-snap-nama-mitra') {
            $this->error('Berkas bukan cadangan sikerma:isi-snap-nama-mitra.');

            return self::FAILURE;
        }

        $pulih = [];
        $baris = [];
        foreach ($data['diisi'] as $r) {
            $row = DB::table('dokumen_kerjasama')->where('id', $r['id'])->first(['snap_nama_mitra']);
            if (! $row) {
                $baris[] = [$r['id'], '(dokumen tidak ada)', 'dilewati'];

                continue;
            }
            if ((string) $row->snap_nama_mitra !== (string) $r['snap_sesudah']) {
                $baris[] = [$r['id'], mb_strimwidth((string) $row->snap_nama_mitra, 0, 40, '…'), 'dilewati: sudah berbeda dari yang diisi'];

                continue;
            }
            $pulih[$r['id']] = $r['snap_sebelum'];
            $baris[] = [$r['id'], mb_strimwidth((string) $row->snap_nama_mitra, 0, 40, '…'), '→ '.($r['snap_sebelum'] ?? 'NULL')];
        }
        $this->table(['dok id', 'snap sekarang', 'Pemulihan'], $baris);
        if ($pulih === []) {
            $this->info('Tidak ada yang perlu dipulihkan.');

            return self::SUCCESS;
        }
        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk memulihkan.');

            return self::SUCCESS;
        }
        DB::transaction(function () use ($pulih) {
            foreach ($pulih as $id => $nilai) {
                DB::table('dokumen_kerjasama')->where('id', $id)->update(['snap_nama_mitra' => $nilai]);
            }
        });
        $this->info('Rollback selesai: '.count($pulih).' snap_nama_mitra dikembalikan.');

        return self::SUCCESS;
    }
}
