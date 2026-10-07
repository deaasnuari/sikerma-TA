<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Pindahkan dokumen_kerjasama / pengajuan_v2 TERTENTU ke mitra lain (mis. memisahkan satu baris mitra
 * yang ternyata memuat dokumen beberapa instansi). Beda dengan sikerma:gabung-mitra-ganda yang memindahkan
 * SEMUA milik sebuah mitra.
 *
 *   php artisan sikerma:pindah-dokumen-mitra --dokumen=1115:1136@375 --pengajuan=395:1215@468   # pratinjau
 *   php artisan sikerma:pindah-dokumen-mitra --dokumen=1115:1136@375 --apply                    # terapkan
 *   php artisan sikerma:pindah-dokumen-mitra --rollback=<berkas JSON> [--apply]                 # pulihkan
 *
 * Format tiap item: id:mitra_tujuan atau id:mitra_tujuan@mitra_asal. "@mitra_asal" adalah pengaman —
 * kalau dokumen/pengajuan itu SEKARANG tidak milik mitra_asal, seluruh perintah ditolak (mis. id di server
 * lain berbeda). Tidak ada yang diterapkan sebagian. Mitra asal TIDAK dihapus oleh command ini.
 * Mitra_id lama dicadangkan ke storage/app/ sebelum --apply.
 */
class PindahDokumenMitra extends Command
{
    protected $signature = 'sikerma:pindah-dokumen-mitra
        {--dokumen= : dokumen_kerjasama yang dipindah, format id:tujuan[@asal],id:tujuan[@asal]}
        {--pengajuan= : pengajuan_v2 yang dipindah, format id:tujuan[@asal],id:tujuan[@asal]}
        {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}
        {--rollback= : Pulihkan mitra_id lama dari berkas cadangan JSON di storage/app/ (pratinjau dulu; tambahkan --apply)}';

    protected $description = 'Pindahkan dokumen/pengajuan tertentu ke mitra lain (pratinjau, pengaman mitra asal, cadangan, rollback)';

    public function handle(): int
    {
        if ($this->option('rollback')) {
            return $this->rollback((string) $this->option('rollback'), (bool) $this->option('apply'));
        }

        $dokumen = $this->parse((string) $this->option('dokumen'), 'dokumen');
        $pengajuan = $this->parse((string) $this->option('pengajuan'), 'pengajuan');
        if ($dokumen === null || $pengajuan === null) {
            return self::FAILURE;
        }
        if ($dokumen === [] && $pengajuan === []) {
            $this->error('Isi --dokumen dan/atau --pengajuan, mis. --dokumen=1115:1136@375.');

            return self::FAILURE;
        }

        $rencana = ['dokumen' => [], 'pengajuan' => []];
        $baris = [];
        $masalah = [];

        foreach (['dokumen' => ['dokumen_kerjasama', 'nomor_dokumen', 'file'], 'pengajuan' => ['pengajuan_v2', 'nomor_pengajuan', 'judul_pengajuan']] as $jenis => [$tabel, $kolomNomor, $kolomNama]) {
            $items = $jenis === 'dokumen' ? $dokumen : $pengajuan;
            foreach ($items as $id => ['tujuan' => $tujuan, 'asal' => $asal]) {
                $row = DB::table($tabel)->where('id', $id)->first();
                if (! $row) {
                    $masalah[] = "{$jenis} #{$id} tidak ditemukan";

                    continue;
                }
                $tujuanMitra = DB::table('master_mitra')->where('id', $tujuan)->first(['id', 'nama_mitra', 'kode_mitra']);
                if (! $tujuanMitra) {
                    $masalah[] = "mitra tujuan #{$tujuan} untuk {$jenis} #{$id} tidak ditemukan";

                    continue;
                }
                $sekarang = $row->mitra_id !== null ? (int) $row->mitra_id : null;
                if ($asal !== null && $sekarang !== $asal) {
                    $masalah[] = "{$jenis} #{$id} sekarang milik mitra #".($sekarang ?? 'NULL').", bukan #{$asal} seperti yang diharapkan";

                    continue;
                }
                $mitraSekarang = $sekarang ? DB::table('master_mitra')->where('id', $sekarang)->first(['nama_mitra', 'kode_mitra']) : null;
                $status = $jenis === 'dokumen'
                    ? (($row->dihapus_admin_pada || $row->dihapus_user_pada) ? 'di Sampah' : 'aktif')
                    : (string) ($row->status_pengajuan ?? '-');

                if ($sekarang === $tujuan) {
                    $baris[] = [$jenis, $id, $row->{$kolomNomor}, mb_strimwidth((string) $row->{$kolomNama}, 0, 46, '…'), $status, "#{$tujuan} (sudah di tujuan — dilewati)", ''];

                    continue;
                }

                $rencana[$jenis][$id] = ['lama' => $sekarang, 'baru' => $tujuan];
                $baris[] = [
                    $jenis, $id, $row->{$kolomNomor}, mb_strimwidth((string) $row->{$kolomNama}, 0, 46, '…'), $status,
                    $sekarang ? "#{$sekarang} ".mb_strimwidth((string) ($mitraSekarang->nama_mitra ?? '?'), 0, 36, '…') : '(tanpa mitra)',
                    "#{$tujuanMitra->id} ".mb_strimwidth((string) $tujuanMitra->nama_mitra, 0, 36, '…').($tujuanMitra->kode_mitra ? " [{$tujuanMitra->kode_mitra}]" : ''),
                ];
            }
        }

        $this->table(['Jenis', 'id', 'Nomor', 'File / judul', 'Status', 'Mitra sekarang', '→ Mitra tujuan'], $baris);

        if ($masalah !== []) {
            $this->error('DITOLAK — tidak ada yang diubah:');
            foreach ($masalah as $m) {
                $this->line('  - '.$m);
            }

            return self::FAILURE;
        }

        $jumlah = count($rencana['dokumen']) + count($rencana['pengajuan']);
        if ($jumlah === 0) {
            $this->info('Semua sudah berada di mitra tujuan. Tidak ada yang perlu dipindah.');

            return self::SUCCESS;
        }
        $this->line(sprintf('Ringkasan: %d dokumen + %d pengajuan akan dipindah.', count($rencana['dokumen']), count($rencana['pengajuan'])));

        if (! $this->option('apply')) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan.');

            return self::SUCCESS;
        }

        $berkas = storage_path('app/cadangan-pindah-dokumen-mitra-'.now()->format('Ymd-His').'.json');
        $cadangan = [
            'perintah' => 'sikerma:pindah-dokumen-mitra',
            'dibuat' => now()->toIso8601String(),
            'dokumen' => array_map(fn ($r) => $r['lama'], $rencana['dokumen']),
            'pengajuan' => array_map(fn ($r) => $r['lama'], $rencana['pengajuan']),
            'tujuan_dokumen' => array_map(fn ($r) => $r['baru'], $rencana['dokumen']),
            'tujuan_pengajuan' => array_map(fn ($r) => $r['baru'], $rencana['pengajuan']),
        ];
        if (file_put_contents($berkas, json_encode($cadangan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw new \RuntimeException('Gagal menulis berkas cadangan: '.$berkas);
        }

        try {
            DB::transaction(function () use ($rencana) {
                foreach ($rencana['dokumen'] as $id => $r) {
                    DB::table('dokumen_kerjasama')->where('id', $id)->update(['mitra_id' => $r['baru']]);
                }
                foreach ($rencana['pengajuan'] as $id => $r) {
                    DB::table('pengajuan_v2')->where('id', $id)->update(['mitra_id' => $r['baru']]);
                }
            });
        } catch (\Throwable $e) {
            @unlink($berkas);

            throw $e;
        }

        $this->info(sprintf('Selesai. %d dokumen + %d pengajuan dipindah. Cadangan: %s', count($rencana['dokumen']), count($rencana['pengajuan']), $berkas));
        $this->line('Pulihkan (pratinjau dulu): php artisan sikerma:pindah-dokumen-mitra --rollback='.basename($berkas));

        return self::SUCCESS;
    }

    /** @return array<int, array{tujuan: int, asal: ?int}>|null */
    private function parse(string $opsi, string $jenis): ?array
    {
        $hasil = [];
        if (trim($opsi) === '') {
            return $hasil;
        }
        foreach (preg_split('/[\s,;]+/', trim($opsi), -1, PREG_SPLIT_NO_EMPTY) as $p) {
            if (! preg_match('/^(\d+):(\d+)(?:@(\d+))?$/', $p, $m)) {
                $this->error("Format --{$jenis} tidak valid: '{$p}' — pakai id:tujuan atau id:tujuan@asal.");

                return null;
            }
            $id = (int) $m[1];
            if (isset($hasil[$id])) {
                $this->error("{$jenis} #{$id} muncul lebih dari sekali.");

                return null;
            }
            $hasil[$id] = ['tujuan' => (int) $m[2], 'asal' => isset($m[3]) && $m[3] !== '' ? (int) $m[3] : null];
        }

        return $hasil;
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
        if (! is_array($data) || ($data['perintah'] ?? null) !== 'sikerma:pindah-dokumen-mitra') {
            $this->error('Berkas bukan cadangan sikerma:pindah-dokumen-mitra.');

            return self::FAILURE;
        }

        $baris = [];
        $kembali = ['dokumen' => [], 'pengajuan' => []];
        foreach (['dokumen' => 'dokumen_kerjasama', 'pengajuan' => 'pengajuan_v2'] as $jenis => $tabel) {
            foreach ($data[$jenis] ?? [] as $id => $lama) {
                $sekarang = DB::table($tabel)->where('id', $id)->value('mitra_id');
                if ($sekarang === null && ! DB::table($tabel)->where('id', $id)->exists()) {
                    $this->error("{$jenis} #{$id} tidak ditemukan lagi — rollback dibatalkan.");

                    return self::FAILURE;
                }
                if ($lama !== null && ! DB::table('master_mitra')->where('id', $lama)->exists()) {
                    $this->error("Mitra asal #{$lama} untuk {$jenis} #{$id} sudah tidak ada — rollback dibatalkan (hidupkan dulu mitranya).");

                    return self::FAILURE;
                }
                $baris[] = [$jenis, $id, '#'.($sekarang ?? 'NULL'), $lama === null ? '(tanpa mitra)' : '#'.$lama, ((int) $sekarang === (int) $lama && $sekarang !== null) ? 'sudah semula' : 'dipulihkan'];
                if ((int) $sekarang !== (int) $lama || ($sekarang === null) !== ($lama === null)) {
                    $kembali[$jenis][$id] = $lama;
                }
            }
        }
        $this->table(['Jenis', 'id', 'Mitra sekarang', '→ Dikembalikan ke', 'Keterangan'], $baris);

        $jumlah = count($kembali['dokumen']) + count($kembali['pengajuan']);
        if ($jumlah === 0) {
            $this->info('Semua sudah seperti semula. Tidak ada yang perlu dipulihkan.');

            return self::SUCCESS;
        }
        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk memulihkan.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($kembali) {
            foreach ($kembali['dokumen'] as $id => $lama) {
                DB::table('dokumen_kerjasama')->where('id', $id)->update(['mitra_id' => $lama]);
            }
            foreach ($kembali['pengajuan'] as $id => $lama) {
                DB::table('pengajuan_v2')->where('id', $id)->update(['mitra_id' => $lama]);
            }
        });
        $this->info(sprintf('Rollback selesai: %d dokumen + %d pengajuan dikembalikan.', count($kembali['dokumen']), count($kembali['pengajuan'])));

        return self::SUCCESS;
    }
}
