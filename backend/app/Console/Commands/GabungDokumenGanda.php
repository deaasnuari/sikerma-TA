<?php

namespace App\Console\Commands;

use App\Support\KerjasamaStatus;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Gabungkan dokumen_kerjasama ganda hasil dua tahap migrasi SIKERMA 1.0:
 *   - tahap 1 (keterangan "Migrasi data lama | Mitra: ...") -> dokumen ASLI
 *   - tahap 2 (keterangan "Migrasi dari tabel dokumen")     -> SALINAN, nomor diberi akhiran "-L<angka>"
 *     karena nomor aslinya bentrok dengan tahap 1.
 *
 *   php artisan sikerma:gabung-dokumen-ganda                              # pratinjau (dry-run)
 *   php artisan sikerma:gabung-dokumen-ganda --apply                      # gabungkan pasangan "mitra sama"
 *   php artisan sikerma:gabung-dokumen-ganda --apply --termasuk-mitra-beda # ikut pasangan yang mitra_id-nya beda
 *   php artisan sikerma:gabung-dokumen-ganda --rollback=<berkas cadangan>  # batalkan satu kali --apply
 *
 * Pasangan ganda = nomor_dokumen salinan = nomor asli + "-L<angka>", file SAMA, dan (jenis A) mitra_id
 * sama/salah satunya NULL. Jenis B = file sama tapi mitra_id beda (tahap 2 membuat baris master_mitra
 * baru untuk nama yang sedikit berbeda) — hanya diproses dengan --termasuk-mitra-beda. Dokumen "-L"
 * yang file-nya beda BUKAN duplikat (nomor yang memang dipakai dua dokumen berbeda) dan tidak disentuh.
 *
 * Untuk tiap pasangan:
 *  1. dokumen ASLI dipertahankan (kalau salinan "-L" jauh lebih lengkap -> masuk "perlu keputusan");
 *  2. kolom kosong di ASLI diisi dari salinan — tidak ada nilai yang ditimpa, kecuali tanggal yang
 *     sudah diputuskan (KEPUTUSAN_TANGGAL) dan mitra (KEPUTUSAN_MITRA);
 *  3. status_siklus dihitung ulang (aturan sikerma:sinkron-status-siklus) bila tanggal_berakhir berubah;
 *  4. data turunan (dokumen_file yang belum ada, dokumen_log, notifikasi, laporan, aktivitas) dipindah ke ASLI;
 *  5. salinan di-SOFT DELETE (dihapus_admin_pada) dan masuk menu Sampah — dapat dipulihkan.
 *
 * Seluruh --apply dalam satu transaksi; kondisi sebelumnya dicadangkan ke storage/app/ sebagai JSON
 * yang dipakai --rollback. unit_prodi_id TIDAK pernah diubah bila keduanya terisi (dipakai milik ASLI).
 * BACKUP DATABASE DULU (pg_dump) sebelum --apply.
 */
class GabungDokumenGanda extends Command
{
    protected $signature = 'sikerma:gabung-dokumen-ganda
        {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}
        {--termasuk-mitra-beda : Ikut proses pasangan yang file-nya sama tapi mitra_id-nya beda}
        {--rollback= : Batalkan satu kali --apply memakai berkas cadangan JSON di storage/app/}
        {--hari-akan-berakhir=90 : Ambang hari untuk status "expiring"}';

    protected $description = 'Gabungkan dokumen_kerjasama ganda (asli + salinan "-L") hasil migrasi dua tahap — soft delete salinan, lengkapi dokumen asli';

    /** Kolom yang diisi dari salinan HANYA bila kosong di dokumen asli. */
    private const FIELD_LENGKAPI = [
        'jenis_dokumen', 'ruang_lingkup_ids', 'tanggal_mulai', 'tanggal_berakhir', 'tanggal_ttd',
        'unit_prodi_id', 'mitra_id', 'sumber_pengajuan_id', 'dibuat_oleh_user_id',
        'snap_nama_mitra', 'snap_whatsapp_pengusul', 'snap_nama_pengusul', 'snap_email_pengusul',
        'snap_jenis_mitra', 'snap_tingkat_perusahaan', 'snap_bidang_usaha',
        'manfaat', 'luaran_kerja_sama', 'follow_up', 'diarsipkan_pada', 'alasan_arsip',
    ];

    /** Kolom skor kelengkapan untuk memutuskan apakah salinan "jauh lebih lengkap" dari asli. */
    private const FIELD_SKOR = [
        'mitra_id', 'snap_nama_mitra', 'tanggal_mulai', 'tanggal_berakhir',
        'unit_prodi_id', 'sumber_pengajuan_id', 'ruang_lingkup_ids',
    ];

    /**
     * Keputusan tanggal (dicocokkan dengan tabel dokumen SIKERMA 1.0, Oktober 2026): untuk pasangan
     * berikut tanggal yang benar adalah tanggal di salinan "-L". [id asli, id salinan, kolom => tanggal].
     * Hanya dipakai bila nilai salinan memang SAMA dengan yang tercatat di sini; kalau salinan kosong,
     * tidak ada yang ditimpa (jadi "lengkapi kolom kosong" biasa).
     */
    private const KEPUTUSAN_TANGGAL = [
        [98, 698, ['tanggal_berakhir' => '2024-09-02']],
        [23, 661, ['tanggal_mulai' => '2023-09-02', 'tanggal_berakhir' => '2024-09-02']],
        [64, 640, ['tanggal_berakhir' => '2026-03-30']],
        [113, 711, ['tanggal_berakhir' => '2027-10-24']],
        [74, 770, ['tanggal_berakhir' => '2026-03-15']],
        [56, 768, ['tanggal_mulai' => '2024-02-26', 'tanggal_berakhir' => '2029-02-26']],
        [117, 736, ['tanggal_mulai' => '2023-02-23', 'tanggal_berakhir' => '2024-02-23']],
        [93, 631, ['tanggal_berakhir' => '2025-10-22']],
    ];

    /**
     * Keputusan mitra untuk pasangan jenis B: [id asli, id salinan, mitra_id yang benar].
     * Pasangan jenis B lain memakai mitra_id dokumen asli (penggabungan master_mitra yang dobel
     * diputuskan nanti lewat sikerma:gabung-mitra-ganda).
     */
    private const KEPUTUSAN_MITRA = [
        [103, 726, 1100],
    ];

    public function handle(): int
    {
        if ($this->option('rollback')) {
            return $this->rollback((string) $this->option('rollback'));
        }

        $apply = (bool) $this->option('apply');
        $termasukB = (bool) $this->option('termasuk-mitra-beda');
        $ambang = max(0, (int) $this->option('hari-akan-berakhir'));
        $hariIni = Carbon::now()->startOfDay()->toDateString();
        $batas = Carbon::now()->startOfDay()->addDays($ambang)->toDateString();

        $docs = DB::table('dokumen_kerjasama')
            ->whereNull('dihapus_admin_pada')
            ->whereNull('dihapus_user_pada')
            ->orderBy('id')
            ->get()
            ->keyBy('id');
        $aktifSebelum = $docs->count();

        [$pasangan, $ambigu] = $this->cariPasangan($docs);
        $rencana = [];
        foreach ($pasangan as $p) {
            $rencana[] = $this->evaluasi($p['asli'], $p['salinan'], $p['jenis'], $hariIni, $batas);
        }

        $unitNama = DB::table('master_unit_prodi')->pluck('nama', 'id');
        $this->laporkan($rencana, $ambigu, $unitNama, $aktifSebelum, $termasukB, $docs);

        $dijalankan = array_values(array_filter($rencana, fn ($r) => $r['keputusan'] === [] && ($r['jenis'] === 'A' || $termasukB)));

        if ($dijalankan === []) {
            $this->info('Tidak ada pasangan yang bisa digabung.');

            return self::SUCCESS;
        }

        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan'.($termasukB ? '' : ' (tambahkan --termasuk-mitra-beda untuk ikut pasangan jenis B)').'.');
            $this->line('Ingat: backup database dulu, mis. pg_dump -U <user> -Fc <database> -f sebelum_gabung_dokumen.dump');

            return self::SUCCESS;
        }

        $berkas = $this->terapkan($dijalankan);
        $this->info(sprintf(
            'Selesai. %d dokumen asli dipertahankan, %d salinan di-soft delete (menu Sampah). Cadangan rollback: %s',
            count(array_unique(array_column(array_column($dijalankan, 'asli'), 'id'))),
            count($dijalankan),
            $berkas,
        ));
        $this->line('Batalkan dengan: php artisan sikerma:gabung-dokumen-ganda --rollback='.basename($berkas));

        return self::SUCCESS;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object>  $docs
     * @return array{0: array<int, array{asli: object, salinan: object, jenis: string}>, 1: array<int, string>}
     */
    private function cariPasangan($docs): array
    {
        $grup = [];
        foreach ($docs as $d) {
            $grup[$this->nomorDasar($d->nomor_dokumen)][] = $d;
        }

        $pasangan = [];
        $ambigu = [];
        foreach ($grup as $list) {
            if (count($list) < 2) {
                continue;
            }
            foreach ($list as $salinan) {
                if (! $this->adalahSalinan($salinan->nomor_dokumen)) {
                    continue;
                }
                $file = trim((string) $salinan->file);
                if ($file === '') {
                    continue;
                }
                $kandidat = array_values(array_filter($list, fn ($x) => ! $this->adalahSalinan($x->nomor_dokumen) && trim((string) $x->file) === $file));
                if ($kandidat === []) {
                    continue;
                }
                if (count($kandidat) > 1) {
                    $ambigu[] = "salinan #{$salinan->id} ({$salinan->nomor_dokumen}) cocok dengan >1 dokumen asli: #".implode(', #', array_column($kandidat, 'id'));

                    continue;
                }
                $asli = $kandidat[0];
                $mitraBeda = $asli->mitra_id !== null && $salinan->mitra_id !== null && (int) $asli->mitra_id !== (int) $salinan->mitra_id;
                $pasangan[] = ['asli' => $asli, 'salinan' => $salinan, 'jenis' => $mitraBeda ? 'B' : 'A'];
            }
        }

        // Satu dokumen asli dengan >1 salinan: tidak ditebak, semuanya masuk "perlu keputusan".
        $perAsli = [];
        foreach ($pasangan as $p) {
            $perAsli[$p['asli']->id][] = $p['salinan']->id;
        }
        $pasangan = array_values(array_filter($pasangan, function ($p) use ($perAsli, &$ambigu) {
            if (count($perAsli[$p['asli']->id]) > 1) {
                $ambigu[] = "salinan #{$p['salinan']->id} ({$p['salinan']->nomor_dokumen}): dokumen asli #{$p['asli']->id} punya >1 salinan";

                return false;
            }

            return true;
        }));

        return [$pasangan, $ambigu];
    }

    private function evaluasi(object $asli, object $salinan, string $jenis, string $hariIni, string $batas): array
    {
        $set = [];
        $keputusan = [];
        $cekTanggal = [];
        $override = [];
        foreach (self::KEPUTUSAN_TANGGAL as [$a, $s, $kolom]) {
            if ((int) $asli->id === $a && (int) $salinan->id === $s) {
                $override = $kolom;
            }
        }

        // Skor kelengkapan: salinan hanya "jauh lebih lengkap" kalau unggul >= 2 kolom.
        $skorAsli = $skorSalinan = 0;
        foreach (self::FIELD_SKOR as $kolom) {
            $skorAsli += $this->kosong($asli->{$kolom}) ? 0 : 1;
            $skorSalinan += $this->kosong($salinan->{$kolom}) ? 0 : 1;
        }
        if ($skorSalinan >= $skorAsli + 2) {
            $keputusan[] = "salinan -L jauh lebih lengkap (skor {$skorSalinan} vs {$skorAsli}) — perlu keputusan dokumen mana yang dipertahankan";
        }

        // Tanggal: keduanya terisi tapi beda -> hanya pakai tanggal salinan kalau sudah diputuskan.
        foreach (['tanggal_mulai', 'tanggal_berakhir'] as $kolom) {
            $nilaiAsli = $this->tanggal($asli->{$kolom});
            $nilaiSalinan = $this->tanggal($salinan->{$kolom});
            $target = $override[$kolom] ?? null;

            if ($target !== null) {
                $hasil = match (true) {
                    $nilaiSalinan === null => 'salinan kosong → tidak ditimpa',
                    $nilaiSalinan !== $target => 'TIDAK COCOK dengan keputusan',
                    $nilaiAsli === $target => 'sudah sama',
                    default => 'diganti',
                };
                $cekTanggal[] = [$asli->id, $salinan->id, $kolom, $nilaiAsli ?? '-', $nilaiSalinan ?? '-', $target, $hasil];
                if ($hasil === 'TIDAK COCOK dengan keputusan') {
                    $keputusan[] = "{$kolom} salinan ({$nilaiSalinan}) tidak sama dengan keputusan ({$target})";

                    continue;
                }
                if ($hasil === 'diganti') {
                    $set[$kolom] = $target;
                }

                continue;
            }

            if ($nilaiAsli !== null && $nilaiSalinan !== null && $nilaiAsli !== $nilaiSalinan) {
                $keputusan[] = "{$kolom} beda ({$nilaiAsli} vs {$nilaiSalinan}) dan belum ada keputusan";
            }
        }

        // Mitra jenis B: keputusan eksplisit, selain itu mitra dokumen asli dipakai.
        if ($jenis === 'B') {
            foreach (self::KEPUTUSAN_MITRA as [$a, $s, $mitraBenar]) {
                if ((int) $asli->id === $a && (int) $salinan->id === $s) {
                    if ((int) $salinan->mitra_id !== $mitraBenar) {
                        $keputusan[] = "mitra salinan (#{$salinan->mitra_id}) tidak sama dengan keputusan (#{$mitraBenar})";
                    } else {
                        $set['mitra_id'] = $mitraBenar;
                    }
                }
            }
        }

        // Lengkapi kolom kosong (tidak menimpa). mitra_id jenis B sudah ditangani di atas.
        foreach (self::FIELD_LENGKAPI as $kolom) {
            if (array_key_exists($kolom, $set) || ($jenis === 'B' && $kolom === 'mitra_id')) {
                continue;
            }
            if ($this->kosong($asli->{$kolom}) && ! $this->kosong($salinan->{$kolom})) {
                $set[$kolom] = $salinan->{$kolom};
            }
        }

        // Status: hitung ulang (aturan SinkronStatusSiklus) kalau tanggal_berakhir berubah.
        $statusAsli = $asli->status_siklus ?: 'active';
        $statusBerubah = null;
        if (array_key_exists('tanggal_berakhir', $set)) {
            $target = KerjasamaStatus::siklusDariTanggal($set['tanggal_berakhir'], $hariIni, $batas);
            if ($target !== $statusAsli) {
                $set['status_siklus'] = $target;
                $statusBerubah = [$statusAsli, $target];
            }
        }
        $statusAkhir = $set['status_siklus'] ?? $statusAsli;
        $statusSalinan = $salinan->status_siklus ?: 'active';
        // Status salinan hanya dibandingkan kalau salinan punya tanggal_berakhir sendiri; tanpa tanggal,
        // 'active' di salinan cuma nilai bawaan dan tidak membawa informasi.
        if ($this->tanggal($salinan->tanggal_berakhir) !== null && $statusAkhir !== $statusSalinan) {
            $keputusan[] = "status_siklus masih beda setelah penyelarasan (asli {$statusAkhir} vs salinan {$statusSalinan})";
        }

        // diarsipkan_pada / alasan_arsip hanya boleh diisi dari salinan kalau status_siklus AKHIR
        // dokumen yang dipertahankan (setelah tanggal dihitung ulang) adalah 'archived'.
        if ($statusAkhir !== 'archived') {
            unset($set['diarsipkan_pada'], $set['alasan_arsip']);
        }

        $unitBeda = ! $this->kosong($asli->unit_prodi_id) && ! $this->kosong($salinan->unit_prodi_id)
            && (int) $asli->unit_prodi_id !== (int) $salinan->unit_prodi_id;

        return [
            'asli' => $asli,
            'salinan' => $salinan,
            'jenis' => $jenis,
            'set' => $set,
            'keputusan' => $keputusan,
            'cekTanggal' => $cekTanggal,
            'statusBerubah' => $statusBerubah,
            'unitBeda' => $unitBeda,
            'anak' => $this->anakYangDipindah($asli->id, $salinan->id),
        ];
    }

    /**
     * Baris turunan salinan yang akan dipindah ke asli. dokumen_file hanya yang path_file-nya belum ada
     * di asli (supaya tidak dobel); notifikasi_kerjasama yang akan bentrok unique dilewati.
     *
     * @return array<string, array{kolom: string, ids: array<int, int>}>
     */
    private function anakYangDipindah(int $asliId, int $salinanId): array
    {
        $hasil = [];

        $pathAsli = DB::table('dokumen_file')->where('dokumen_id', $asliId)->pluck('path_file')->all();
        $hasil['dokumen_file'] = ['kolom' => 'dokumen_id', 'ids' => DB::table('dokumen_file')
            ->where('dokumen_id', $salinanId)
            ->whereNotIn('path_file', $pathAsli === [] ? [''] : $pathAsli)
            ->pluck('id')->map(fn ($v) => (int) $v)->all()];

        $hasil['dokumen_log'] = ['kolom' => 'dokumen_id', 'ids' => DB::table('dokumen_log')
            ->where('dokumen_id', $salinanId)->pluck('id')->map(fn ($v) => (int) $v)->all()];

        $kunciAsli = DB::table('notifikasi_kerjasama')->where('dokumen_kerjasama_id', $asliId)
            ->get(['jenis', 'tanggal_berakhir_acuan'])
            ->map(fn ($r) => $r->jenis.'|'.substr((string) $r->tanggal_berakhir_acuan, 0, 10))->flip()->all();
        $hasil['notifikasi_kerjasama'] = ['kolom' => 'dokumen_kerjasama_id', 'ids' => DB::table('notifikasi_kerjasama')
            ->where('dokumen_kerjasama_id', $salinanId)->get(['id', 'jenis', 'tanggal_berakhir_acuan'])
            ->filter(fn ($r) => ! isset($kunciAsli[$r->jenis.'|'.substr((string) $r->tanggal_berakhir_acuan, 0, 10)]))
            ->pluck('id')->map(fn ($v) => (int) $v)->values()->all()];

        foreach (['laporan_pelaksanaan', 'pengajuan_aktivitas'] as $tabel) {
            $hasil[$tabel] = ['kolom' => 'dokumen_kerjasama_id', 'ids' => DB::table($tabel)
                ->where('dokumen_kerjasama_id', $salinanId)->pluck('id')->map(fn ($v) => (int) $v)->all()];
        }

        return $hasil;
    }

    private function laporkan(array $rencana, array $ambigu, $unitNama, int $aktifSebelum, bool $termasukB, $docs): void
    {
        $a = array_filter($rencana, fn ($r) => $r['jenis'] === 'A');
        $b = array_filter($rencana, fn ($r) => $r['jenis'] === 'B');
        $siap = fn (array $set) => array_filter($set, fn ($r) => $r['keputusan'] === []);
        $dilengkapi = fn (array $set) => count(array_filter($set, fn ($r) => $r['set'] !== []));
        $pindah = function (array $set) {
            $n = [];
            foreach ($set as $r) {
                foreach ($r['anak'] as $tabel => $info) {
                    $n[$tabel] = ($n[$tabel] ?? 0) + count($info['ids']);
                }
            }

            return $n;
        };

        $this->newLine();
        $this->info('=== RINGKASAN ===');
        $this->table(
            ['', 'Jenis A (mitra sama/NULL)', 'Jenis B (mitra_id beda)'],
            [
                ['Pasangan ditemukan', count($a), count($b)],
                ['Siap digabung (tanpa masalah)', count($siap($a)), count($siap($b))],
                ['  - dokumen asli dipertahankan', count($siap($a)), count($siap($b))],
                ['  - di antaranya dilengkapi/diubah kolomnya', $dilengkapi($siap($a)), $dilengkapi($siap($b))],
                ['  - salinan di-soft delete', count($siap($a)), count($siap($b))],
                ['Perlu keputusan (dilewati)', count($a) - count($siap($a)), count($b) - count($siap($b))],
            ],
        );
        $this->line('Data turunan yang dipindah (A): '.json_encode($pindah($siap($a))));
        $this->line('Data turunan yang dipindah (B): '.json_encode($pindah($siap($b))));

        $sebelum = $aktifSebelum;
        $sesudahA = $aktifSebelum - count($siap($a));
        $sesudahAB = $sesudahA - count($siap($b));
        $this->newLine();
        $this->table(
            ['Dokumen aktif', 'Jumlah'],
            [
                ['Sebelum', $sebelum],
                ['Sesudah --apply (jenis A saja)', $sesudahA],
                ['Sesudah --apply --termasuk-mitra-beda (A + B)', $sesudahAB],
            ],
        );
        $this->line($termasukB ? 'Mode: jenis A + B akan diproses.' : 'Mode: hanya jenis A yang akan diproses; B tampil di bawah sebagai rencana.');

        // Daftar keputusan tanggal (untuk dicek ulang).
        $this->newLine();
        $this->info('=== PERUBAHAN TANGGAL (cek ulang keputusan) ===');
        $baris = [];
        $ditemukan = [];
        foreach ($rencana as $r) {
            foreach ($r['cekTanggal'] as $c) {
                $baris[] = array_merge([$r['jenis']], $c);
                $ditemukan[$c[0].':'.$c[1]] = true;
            }
        }
        foreach (self::KEPUTUSAN_TANGGAL as [$as, $sa, $kolom]) {
            if (! isset($ditemukan[$as.':'.$sa])) {
                $baris[] = ['-', $as, $sa, implode(',', array_keys($kolom)), '-', '-', implode(',', $kolom), 'PASANGAN TIDAK DITEMUKAN'];
            }
        }
        $this->table(['Jenis', 'id asli', 'id -L', 'Kolom', 'Asli', '-L', 'Keputusan', 'Hasil'], $baris);

        // Perubahan status_siklus.
        $this->newLine();
        $this->info('=== PERUBAHAN status_siklus (dihitung ulang dari tanggal_berakhir) ===');
        $baris = [];
        foreach ($rencana as $r) {
            if ($r['statusBerubah']) {
                $baris[] = [$r['jenis'], $r['asli']->id, $r['asli']->nomor_dokumen, $r['statusBerubah'][0].' → '.$r['statusBerubah'][1], $r['keputusan'] === [] ? '' : 'ditahan (perlu keputusan)'];
            }
        }
        $baris === [] ? $this->line('Tidak ada.') : $this->table(['Jenis', 'id asli', 'Nomor', 'Perubahan', 'Catatan'], $baris);

        // diarsipkan_pada / alasan_arsip: berapa yang diisi, dan simulasi kondisi akhir (A + B).
        $this->newLine();
        $this->info('=== diarsipkan_pada / alasan_arsip (hanya untuk status akhir archived) ===');
        $siapSemua = $siap($rencana);
        $diisiDiarsipkan = count(array_filter($siapSemua, fn ($r) => isset($r['set']['diarsipkan_pada'])));
        $diisiAlasan = count(array_filter($siapSemua, fn ($r) => isset($r['set']['alasan_arsip'])));
        $ditolakArsip = count(array_filter($siapSemua, fn ($r) => ($r['salinan']->diarsipkan_pada || $r['salinan']->alasan_arsip)
            && ! isset($r['set']['diarsipkan_pada']) && ! isset($r['set']['alasan_arsip'])
            && ($r['set']['status_siklus'] ?? ($r['asli']->status_siklus ?: 'active')) !== 'archived'));
        $this->line("Dokumen asli yang diisi diarsipkan_pada: {$diisiDiarsipkan} | alasan_arsip: {$diisiAlasan}");
        $this->line("Salinan yang punya metadata arsip tapi TIDAK disalin (status akhir bukan archived): {$ditolakArsip}");

        $hapus = [];
        foreach ($siapSemua as $r) {
            $hapus[$r['salinan']->id] = true;
        }
        $keeper = [];
        foreach ($siapSemua as $r) {
            $keeper[$r['asli']->id] = $r;
        }
        $pelanggaran = [];
        foreach ($docs as $d) {
            if (isset($hapus[$d->id])) {
                continue;
            }
            $set = isset($keeper[$d->id]) ? $keeper[$d->id]['set'] : [];
            $status = ($set['status_siklus'] ?? $d->status_siklus) ?: 'active';
            $diarsipkan = array_key_exists('diarsipkan_pada', $set) ? $set['diarsipkan_pada'] : $d->diarsipkan_pada;
            if ($status !== 'archived' && ! $this->kosong($diarsipkan)) {
                $pelanggaran[] = '#'.$d->id.' '.$d->nomor_dokumen.' ('.$status.', diarsipkan_pada '.substr((string) $diarsipkan, 0, 10).')'.(isset($keeper[$d->id]) ? ' [dokumen asli pasangan ini]' : ' [tidak terkait penggabungan]');
            }
        }
        $this->line('Dokumen non-archived yang punya diarsipkan_pada setelah penggabungan: '.count($pelanggaran));
        foreach (array_slice($pelanggaran, 0, 20) as $p) {
            $this->line('  - '.$p);
        }

        // Perlu keputusan.
        $this->newLine();
        $this->warn('=== PERLU KEPUTUSAN (tidak diproses) ===');
        $ada = false;
        foreach ($rencana as $r) {
            if ($r['keputusan'] !== []) {
                $ada = true;
                $this->line(sprintf('  [%s] asli #%d %s / -L #%d %s', $r['jenis'], $r['asli']->id, $r['asli']->nomor_dokumen, $r['salinan']->id, $r['salinan']->nomor_dokumen));
                foreach ($r['keputusan'] as $k) {
                    $this->line('       - '.$k);
                }
            }
        }
        foreach ($ambigu as $k) {
            $ada = true;
            $this->line('  - '.$k);
        }
        if (! $ada) {
            $this->line('Tidak ada.');
        }

        // Pasangan jenis B.
        $this->newLine();
        $this->info('=== PASANGAN JENIS B (mitra_id beda) ===');
        $baris = [];
        foreach ($b as $r) {
            $mitraAkhir = $r['set']['mitra_id'] ?? $r['asli']->mitra_id;
            $baris[] = [$r['asli']->id, $r['salinan']->id, $r['asli']->mitra_id, $r['salinan']->mitra_id, $mitraAkhir, isset($r['set']['mitra_id']) ? 'keputusan' : 'mitra asli dipakai', $r['keputusan'] === [] ? 'siap' : 'perlu keputusan'];
        }
        $baris === [] ? $this->line('Tidak ada.') : $this->table(['id asli', 'id -L', 'mitra asli', 'mitra -L', 'mitra akhir', 'Dasar', 'Status'], $baris);

        // unit_prodi_id beda.
        $this->newLine();
        $this->info('=== unit_prodi_id BEDA (tidak diubah — milik dokumen asli dipakai; cek manual) ===');
        $baris = [];
        foreach ($rencana as $r) {
            if ($r['unitBeda']) {
                $baris[] = [
                    $r['jenis'], $r['asli']->id, $r['salinan']->id, mb_strimwidth((string) $r['asli']->nomor_dokumen, 0, 28, '…'),
                    '#'.$r['asli']->unit_prodi_id.' '.mb_strimwidth((string) ($unitNama[$r['asli']->unit_prodi_id] ?? '?'), 0, 30, '…'),
                    '#'.$r['salinan']->unit_prodi_id.' '.mb_strimwidth((string) ($unitNama[$r['salinan']->unit_prodi_id] ?? '?'), 0, 30, '…'),
                ];
            }
        }
        $baris === [] ? $this->line('Tidak ada.') : $this->table(['Jenis', 'id asli', 'id -L', 'Nomor', 'Unit asli (DIPAKAI)', 'Unit -L'], $baris);
        $this->line('Jumlah pasangan dengan unit_prodi_id beda: '.count($baris));

        $kolomDiisi = [];
        foreach ($siap($rencana) as $r) {
            foreach (array_keys($r['set']) as $k) {
                $kolomDiisi[$k] = ($kolomDiisi[$k] ?? 0) + 1;
            }
        }
        ksort($kolomDiisi);
        $this->newLine();
        $this->line('Kolom yang diisi/diubah di dokumen asli (jumlah pasangan siap): '.json_encode($kolomDiisi));
    }

    /** @param array<int, array> $rencana pasangan yang siap diproses */
    private function terapkan(array $rencana): string
    {
        $sekarang = now();
        $tanggal = $sekarang->format('Y-m-d');

        // Cadangan disusun dari kondisi SEBELUM diubah dan ditulis lebih dulu — kalau penulisan
        // gagal, tidak ada yang berubah; kalau transaksi gagal, berkasnya dihapus lagi.
        $cadangan = ['dibuat' => $sekarang->toIso8601String(), 'perintah' => 'sikerma:gabung-dokumen-ganda', 'pasangan' => []];
        foreach ($rencana as $r) {
            $sebelumAsli = [];
            foreach (array_keys($r['set']) as $kolom) {
                $sebelumAsli[$kolom] = $r['asli']->{$kolom};
            }
            $sebelumAsli['updated_at'] = $r['asli']->updated_at;

            $cadangan['pasangan'][] = [
                'asli_id' => $r['asli']->id,
                'salinan_id' => $r['salinan']->id,
                'jenis' => $r['jenis'],
                'asli_sebelum' => $sebelumAsli,
                'salinan_sebelum' => [
                    'dihapus_admin_pada' => $r['salinan']->dihapus_admin_pada,
                    'keterangan' => $r['salinan']->keterangan,
                    'updated_at' => $r['salinan']->updated_at,
                ],
                'anak_dipindah' => array_filter($r['anak'], fn ($info) => $info['ids'] !== []),
            ];
        }
        $berkas = storage_path('app/cadangan-gabung-dokumen-'.$sekarang->format('Ymd-His').'.json');
        if (file_put_contents($berkas, json_encode($cadangan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw new \RuntimeException('Gagal menulis berkas cadangan: '.$berkas);
        }

        try {
            DB::transaction(function () use ($rencana, $sekarang, $tanggal) {
                foreach ($rencana as $r) {
                    $this->gabungkan($r, $sekarang, $tanggal);
                }
            });
        } catch (\Throwable $e) {
            @unlink($berkas);

            throw $e;
        }

        return $berkas;
    }

    private function gabungkan(array $r, $sekarang, string $tanggal): void
    {
        $asli = $r['asli'];
        $salinan = $r['salinan'];

        if ($r['set'] !== []) {
            DB::table('dokumen_kerjasama')->where('id', $asli->id)->update($r['set'] + ['updated_at' => $sekarang]);
        }

        foreach ($r['anak'] as $tabel => $info) {
            if ($info['ids'] !== []) {
                DB::table($tabel)->whereIn('id', $info['ids'])->update([$info['kolom'] => $asli->id]);
            }
        }

        $catatan = "[Duplikat] digabung ke dokumen #{$asli->id} ({$asli->nomor_dokumen}) pada {$tanggal}";
        DB::table('dokumen_kerjasama')->where('id', $salinan->id)->update([
            'dihapus_admin_pada' => $sekarang,
            'keterangan' => trim((string) $salinan->keterangan) === '' ? $catatan : $salinan->keterangan.' | '.$catatan,
            'updated_at' => $sekarang,
        ]);
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
        if (! is_array($data) || ($data['perintah'] ?? null) !== 'sikerma:gabung-dokumen-ganda') {
            $this->error('Berkas bukan cadangan sikerma:gabung-dokumen-ganda.');

            return self::FAILURE;
        }

        $jumlah = 0;
        DB::transaction(function () use ($data, &$jumlah) {
            foreach ($data['pasangan'] as $p) {
                foreach ($p['anak_dipindah'] as $tabel => $info) {
                    DB::table($tabel)->whereIn('id', $info['ids'])->update([$info['kolom'] => $p['salinan_id']]);
                }
                DB::table('dokumen_kerjasama')->where('id', $p['salinan_id'])->update($p['salinan_sebelum']);
                DB::table('dokumen_kerjasama')->where('id', $p['asli_id'])->update($p['asli_sebelum']);
                $jumlah++;
            }
        });

        $this->info("Rollback selesai: {$jumlah} pasangan dikembalikan (salinan aktif lagi, kolom dokumen asli dan data turunan dipulihkan).");

        return self::SUCCESS;
    }

    private function nomorDasar(?string $nomor): string
    {
        return (string) preg_replace('/-L\d+\s*$/i', '', trim((string) $nomor));
    }

    private function adalahSalinan(?string $nomor): bool
    {
        return (bool) preg_match('/-L\d+\s*$/i', trim((string) $nomor));
    }

    private function kosong(mixed $v): bool
    {
        if ($v === null) {
            return true;
        }
        $v = trim((string) $v);

        return $v === '' || $v === '[]' || $v === 'null';
    }

    private function tanggal(mixed $v): ?string
    {
        $v = trim((string) $v);

        return $v === '' ? null : substr($v, 0, 10);
    }
}
