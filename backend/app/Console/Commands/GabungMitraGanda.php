<?php

namespace App\Console\Commands;

use App\Models\MasterMitra;
use App\Support\MitraNameMatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Gabungkan baris master_mitra yang namanya sama (duplikat hasil beberapa batch import).
 *
 * Berbasis ATURAN, bukan id — aman dijalankan di database mana pun (lokal, server, laptop
 * rekan) walau id-nya beda. Idempotent: kalau sudah bersih, jadi no-op.
 *
 *   php artisan sikerma:gabung-mitra-ganda            # pratinjau (dry-run)
 *   php artisan sikerma:gabung-mitra-ganda --apply    # benar-benar menggabung
 *
 *   # Pasangan yang ditentukan SENDIRI (nama yang beda terlalu jauh untuk dicocokkan otomatis):
 *   php artisan sikerma:gabung-mitra-ganda --pasangan=1504:372,791:372            # pratinjau
 *   php artisan sikerma:gabung-mitra-ganda --pasangan=1504:372,791:372 --apply    # terapkan
 *
 *   # Batalkan satu kali --apply (mode otomatis maupun --pasangan). Tanpa --apply hanya pratinjau:
 *   php artisan sikerma:gabung-mitra-ganda --rollback=cadangan-gabung-mitra-YYYYMMDD-HHMMSS.json [--apply]
 *   # Pulihkan hanya SEBAGIAN (mis. satu pasangan dari berkas yang berisi beberapa pasangan):
 *   php artisan sikerma:gabung-mitra-ganda --rollback=cadangan-gabung-mitra-YYYYMMDD-HHMMSS.json --hanya=1235 [--apply]
 *
 * Dua nama dianggap sama (lihat App\Support\MitraNameMatcher) kalau beda cuma di huruf besar/kecil,
 * tanda baca, spasi, bentuk badan usaha (PT/CV/Tbk/Persero/Ltd/...), atau salah ketik kecil.
 * Sebelum --apply menghapus apa pun, baris yang akan dihapus dicadangkan ke storage/app/.
 *
 * Untuk tiap grup nama yang sama:
 *  1. pilih 1 baris jadi INDUK — prioritas:
 *       a. punya kode_mitra
 *       b. paling banyak dipakai (dokumen_kerjasama + pengajuan_v2)
 *       c. data paling lengkap
 *       d. id terkecil
 *  2. isi field kosong di INDUK dari baris duplikat (nilai non-kosong pertama);
 *  3. alihkan semua dokumen_kerjasama.mitra_id & pengajuan_v2.mitra_id dari duplikat ke INDUK;
 *  4. hapus baris duplikat.
 *
 * Mode --pasangan=hapus:tujuan,...: INDUK = TUJUAN (ditentukan Anda, bukan dipilih otomatis), semua
 * baris "hapus" digabung ke tujuannya dengan langkah 2–4 yang sama. Pencocokan nama dan aturan
 * grup sekolah dilewati — Anda yang bertanggung jawab atas pasangannya, jadi pratinjau tiap pasangan
 * ditampilkan lengkap. Satu mitra tidak boleh jadi "hapus" sekaligus "tujuan".
 */
class GabungMitraGanda extends Command
{
    protected $signature = 'sikerma:gabung-mitra-ganda
        {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}
        {--pasangan= : Gabungkan pasangan yang ditentukan sendiri, format hapus:tujuan,hapus:tujuan (mis. 1504:372,791:372)}
        {--rollback= : Pulihkan dari berkas cadangan JSON di storage/app/ (pratinjau dulu; tambahkan --apply untuk memulihkan)}
        {--tanpa-backfill-kontak : Jangan salin kolom kontak utama duplikat ke INDUK dan jangan jadikan PIC utama duplikat kontak tambahan INDUK (untuk unit/fakultas yang kontaknya bukan kontak institusi induk)}
        {--tanpa-backfill : Matikan SEMUA backfill: tidak ada kolom INDUK yang diisi dari duplikat (termasuk website, kode_mitra) dan PIC utama duplikat tidak dijadikan kontak tambahan; hanya dokumen/pengajuan/kontak tambahan yang dipindah}
        {--hanya= : Dengan --rollback: pulihkan hanya mitra dengan id ini (pisah koma), pasangan lain di berkas yang sama tidak disentuh}';

    protected $description = 'Gabungkan mitra ganda di master_mitra berdasarkan kesamaan nama (induk = yang punya kode_mitra), atau pasangan hapus:tujuan yang ditentukan sendiri';

    /** Kolom kontak utama; tidak di-backfill bila --tanpa-backfill-kontak. */
    private const FIELD_KONTAK_UTAMA = ['nama_kontak_utama', 'jabatan_kontak_utama', 'email_kontak_utama', 'telepon_kontak_utama'];

    private bool $tanpaBackfillKontak = false;

    private bool $tanpaBackfill = false;

    /** Field yang boleh di-backfill ke INDUK dari baris duplikat. */
    private const FIELD_BACKFILL = [
        'kategori_mitra', 'tingkat_perusahaan', 'bidang_usaha', 'negara', 'website', 'alamat',
        'email_mitra', 'whatsapp_mitra', 'no_telepon_mitra', 'kode_mitra',
        'nama_kontak_utama', 'jabatan_kontak_utama', 'email_kontak_utama', 'telepon_kontak_utama',
    ];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->tanpaBackfill = (bool) $this->option('tanpa-backfill');
        $this->tanpaBackfillKontak = $this->tanpaBackfill || (bool) $this->option('tanpa-backfill-kontak');

        if ($this->option('rollback')) {
            return $this->rollback((string) $this->option('rollback'), $apply, (string) $this->option('hanya'));
        }
        $manual = trim((string) $this->option('pasangan')) !== '';

        $pakaiDok = DB::table('dokumen_kerjasama')->select('mitra_id', DB::raw('count(*) n'))
            ->whereNotNull('mitra_id')->groupBy('mitra_id')->pluck('n', 'mitra_id');
        $pakaiPeng = DB::table('pengajuan_v2')->select('mitra_id', DB::raw('count(*) n'))
            ->whereNotNull('mitra_id')->groupBy('mitra_id')->pluck('n', 'mitra_id');

        // $kelompok: daftar ['induk' => MasterMitra, 'duplikat' => Collection<MasterMitra>, 'semua' => ?Collection]
        if ($manual) {
            $kelompok = $this->kelompokManual((string) $this->option('pasangan'));
            if ($kelompok === null) {
                return self::FAILURE;
            }
            $this->tampilkanPasangan($kelompok, $pakaiDok, $pakaiPeng);
        } else {
            $semua = MasterMitra::query()->orderBy('id')->get();
            $grup = $this->kelompokkan($semua);

            if ($grup->isEmpty()) {
                $this->info('Tidak ada mitra ganda. Tidak ada yang perlu digabung.');

                return self::SUCCESS;
            }

            $kelompok = [];
            foreach ($grup as $rows) {
                $rows = $rows->sortByDesc(fn (MasterMitra $m) => [
                    trim((string) $m->kode_mitra) !== '' ? 1 : 0,
                    (int) ($pakaiDok[$m->id] ?? 0) + (int) ($pakaiPeng[$m->id] ?? 0),
                    $this->kelengkapan($m),
                    -$m->id,
                ])->values();

                $kelompok[] = ['induk' => $rows->first(), 'duplikat' => $rows->slice(1), 'semua' => $rows];
            }
        }

        $baris = [];
        $dilewati = [];
        $rencana = [];
        $totalDupHapus = 0;
        $totalDokAlih = 0;
        $totalPengAlih = 0;
        $totalKontakAlih = 0;
        $tanpaKode = 0;

        foreach ($kelompok as $k) {
            $induk = $k['induk'];
            $duplikat = $k['duplikat'];
            $dupIds = $duplikat->pluck('id')->all();

            // Grup SEKOLAH wajib punya induk berkode (aturan admin) — kalau tidak ada satu pun
            // baris berkode, jangan digabung otomatis; dilaporkan di akhir untuk diputuskan manual.
            // (Mode --pasangan: pilihan Anda, aturan ini tidak dipakai.)
            if (! $manual && MitraNameMatcher::kunciSekolah($induk->nama_mitra) !== null && trim((string) $induk->kode_mitra) === '') {
                $dilewati[] = $k['semua']->map(fn (MasterMitra $m) => '#'.$m->id.' '.$m->nama_mitra)->implode('  |  ');

                continue;
            }

            if (trim((string) $induk->kode_mitra) === '') {
                $tanpaKode++;
            }

            $dok = $duplikat->sum(fn (MasterMitra $m) => (int) ($pakaiDok[$m->id] ?? 0));
            $peng = $duplikat->sum(fn (MasterMitra $m) => (int) ($pakaiPeng[$m->id] ?? 0));
            $kontak = $duplikat->sum(fn (MasterMitra $m) => count($m->kontak_tambahan ?? []));
            $backfill = $this->hitungBackfill($induk, $duplikat, $pakaiDok, $pakaiPeng);

            $totalDupHapus += count($dupIds);
            $totalDokAlih += $dok;
            $totalPengAlih += $peng;
            $totalKontakAlih += $kontak;

            $baris[] = [
                $induk->id,
                trim((string) $induk->kode_mitra) !== '' ? $induk->kode_mitra : '(tanpa kode)',
                mb_strimwidth((string) $induk->nama_mitra, 0, 34, '…'),
                implode(',', $dupIds).' ('.implode('; ', $duplikat->map(fn (MasterMitra $d) => mb_strimwidth((string) $d->nama_mitra, 0, 30, '…').' ['.($manual ? 'pasangan manual' : (MitraNameMatcher::alasan($induk->nama_mitra, $d->nama_mitra) ?? 'terkait')).']')->all()).')',
                $dok,
                $peng,
                $kontak,
                $backfill ? implode(',', array_keys($backfill)) : '-',
            ];

            $rencana[] = compact('induk', 'duplikat', 'dupIds', 'backfill');
        }

        $this->table(
            ['INDUK id', 'Kode', 'Nama', 'Duplikat (dihapus) [alasan]', 'Dok dialihkan', 'Peng dialihkan', 'Kontak dialihkan', 'Field di-backfill'],
            $baris,
        );
        $this->line(sprintf(
            'Ringkasan: %d grup | %d baris duplikat dihapus | %d dokumen + %d pengajuan + %d kontak dialihkan | %d grup INDUK-nya belum punya kode.',
            count($rencana), $totalDupHapus, $totalDokAlih, $totalPengAlih, $totalKontakAlih, $tanpaKode,
        ));

        if ($dilewati !== []) {
            $this->newLine();
            $this->warn(count($dilewati).' grup sekolah DILEWATI karena tidak ada baris berkode — putuskan manual:');
            foreach ($dilewati as $baris) {
                $this->line('  - '.$baris);
            }
        }

        if ($rencana === []) {
            $this->info('Tidak ada yang perlu digabung.');

            return self::SUCCESS;
        }

        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan.');

            return self::SUCCESS;
        }

        $berkas = $this->cadangkan($rencana);

        DB::transaction(function () use ($rencana) {
            foreach ($rencana as $r) {
                if ($r['dupIds'] === []) {
                    continue;
                }
                DB::table('dokumen_kerjasama')->whereIn('mitra_id', $r['dupIds'])->update(['mitra_id' => $r['induk']->id]);
                DB::table('pengajuan_v2')->whereIn('mitra_id', $r['dupIds'])->update(['mitra_id' => $r['induk']->id]);

                // Sebelum dihapus, pindahkan kontak tambahan dan PIC utama duplikat ke INDUK.
                $this->pindahkanKontak($r['induk'], $r['duplikat'], $r['backfill']);

                MasterMitra::whereIn('id', $r['dupIds'])->delete();

                // Backfill SETELAH duplikat dihapus: kode_mitra (dan kolom unik lain) tidak boleh ada
                // di dua baris sekaligus — menyalinnya ke INDUK sebelum duplikat hilang melanggar unique.
                if ($r['backfill'] !== []) {
                    MasterMitra::whereKey($r['induk']->id)->update($r['backfill']);
                }
            }
        });

        $this->info(sprintf(
            'Selesai. %d baris duplikat dihapus, %d dokumen + %d pengajuan dialihkan ke induk.',
            $totalDupHapus, $totalDokAlih, $totalPengAlih,
        ));
        $this->line('Batalkan (pratinjau dulu, tambahkan --apply untuk memulihkan): php artisan sikerma:gabung-mitra-ganda --rollback='.basename($berkas));

        return self::SUCCESS;
    }

    /**
     * Parse --pasangan=hapus:tujuan,... dan validasi. Mengembalikan null (dan mencetak alasan)
     * kalau ada yang salah — tidak ada pasangan yang diproses sebagian.
     *
     * @return array<int, array{induk: MasterMitra, duplikat: \Illuminate\Support\Collection<int, MasterMitra>, semua: null}>|null
     */
    private function kelompokManual(string $opsi): ?array
    {
        $pasang = [];
        foreach (preg_split('/[\s,;]+/', trim($opsi), -1, PREG_SPLIT_NO_EMPTY) as $p) {
            if (! preg_match('/^(\d+):(\d+)$/', $p, $m)) {
                $this->error("Format pasangan tidak valid: '{$p}' — pakai hapus:tujuan, mis. 1504:372.");

                return null;
            }
            $pasang[] = [(int) $m[1], (int) $m[2]];
        }

        if ($pasang === []) {
            $this->error('Tidak ada pasangan yang diberikan.');

            return null;
        }

        $hapus = array_column($pasang, 0);
        $tujuan = array_column($pasang, 1);

        foreach ($pasang as [$h, $t]) {
            if ($h === $t) {
                $this->error("Pasangan {$h}:{$t} — mitra tidak bisa digabung ke dirinya sendiri.");

                return null;
            }
        }
        if (count(array_unique($hapus)) !== count($hapus)) {
            $dobel = array_keys(array_filter(array_count_values($hapus), fn ($n) => $n > 1));
            $this->error('Mitra #'.implode(', #', $dobel).' muncul sebagai "hapus" lebih dari sekali.');

            return null;
        }
        $bentrok = array_values(array_intersect($hapus, $tujuan));
        if ($bentrok !== []) {
            $this->error('Mitra #'.implode(', #', $bentrok).' tidak boleh jadi "hapus" sekaligus "tujuan" (gabungan berantai).');

            return null;
        }

        $ada = MasterMitra::query()->whereIn('id', array_unique(array_merge($hapus, $tujuan)))->get()->keyBy('id');
        $hilang = array_values(array_diff(array_unique(array_merge($hapus, $tujuan)), $ada->keys()->map(fn ($v) => (int) $v)->all()));
        if ($hilang !== []) {
            $this->error('Mitra tidak ditemukan di master_mitra: #'.implode(', #', $hilang).'.');

            return null;
        }

        $perTujuan = [];
        foreach ($pasang as [$h, $t]) {
            $perTujuan[$t][] = $ada[$h];
        }

        $hasil = [];
        foreach ($perTujuan as $t => $list) {
            $hasil[] = ['induk' => $ada[$t], 'duplikat' => collect($list), 'semua' => null];
        }

        return $hasil;
    }

    /** Pratinjau per pasangan (mode --pasangan): satu baris untuk tiap "hapus → tujuan". */
    private function tampilkanPasangan(array $kelompok, $pakaiDok, $pakaiPeng): void
    {
        $baris = [];
        foreach ($kelompok as $k) {
            foreach ($k['duplikat'] as $d) {
                $aktif = DB::table('dokumen_kerjasama')->where('mitra_id', $d->id)
                    ->whereNull('dihapus_admin_pada')->whereNull('dihapus_user_pada')->count();
                $total = (int) ($pakaiDok[$d->id] ?? 0);
                $baris[] = [
                    '#'.$d->id.' '.mb_strimwidth((string) $d->nama_mitra, 0, 34, '…').(trim((string) $d->kode_mitra) !== '' ? ' ['.$d->kode_mitra.']' : ''),
                    '#'.$k['induk']->id.' '.mb_strimwidth((string) $k['induk']->nama_mitra, 0, 34, '…').(trim((string) $k['induk']->kode_mitra) !== '' ? ' ['.$k['induk']->kode_mitra.']' : ''),
                    $total.' ('.$aktif.' aktif + '.($total - $aktif).' di Sampah)',
                    (int) ($pakaiPeng[$d->id] ?? 0),
                    count($d->kontak_tambahan ?? []).(trim((string) $d->nama_kontak_utama) !== '' ? ($this->tanpaBackfillKontak ? ' + PIC utama (tidak dipindah)' : ' + PIC utama') : ''),
                ];
            }
        }

        $this->info('=== PASANGAN (hapus → tujuan) ===');
        $this->table(['Dihapus', 'Tujuan (INDUK)', 'Dokumen dialihkan', 'Pengajuan', 'Kontak'], $baris);
    }

    /**
     * Kontak dari baris duplikat — kontak utamanya dan kontak tambahannya — dipindah
     * ke INDUK sebagai kontak tambahan, kecuali emailnya sudah jadi kontak utama
     * INDUK (setelah backfill) atau sudah ada di kontak INDUK.
     *
     * @param  \Illuminate\Support\Collection<int, MasterMitra>  $duplikat
     */
    private function pindahkanKontak(MasterMitra $induk, $duplikat, array $backfill): void
    {
        $emailUtama = strtolower(trim((string) ($backfill['email_kontak_utama'] ?? $induk->email_kontak_utama)));
        $namaUtama = mb_strtolower(trim((string) ($backfill['nama_kontak_utama'] ?? $induk->nama_kontak_utama)));
        $sudahAda = collect($induk->kontak)->map(fn ($k) => strtolower(trim((string) ($k['email'] ?? ''))))
            ->filter()->flip()->all();

        foreach ($duplikat as $d) {
            foreach ($d->kontak_tambahan ?? [] as $kontak) {
                $email = strtolower(trim((string) ($kontak['email'] ?? '')));
                if ($email !== '' && ($email === $emailUtama || isset($sudahAda[$email]))) {
                    continue;
                }
                $induk->tambahKontak($kontak);
                if ($email !== '') {
                    $sudahAda[$email] = true;
                }
            }
        }

        foreach ($duplikat as $d) {
            if ($this->tanpaBackfillKontak) {
                break;
            }
            $nama = trim((string) $d->nama_kontak_utama);
            $email = strtolower(trim((string) $d->email_kontak_utama));
            if ($this->kosong($nama)) {
                continue;
            }
            $samaDenganUtama = $email !== '' ? $email === $emailUtama : mb_strtolower($nama) === $namaUtama;
            if ($samaDenganUtama || ($email !== '' && isset($sudahAda[$email]))) {
                continue;
            }

            $induk->tambahKontak([
                'nama' => $nama,
                'jabatan' => $this->kosong($d->jabatan_kontak_utama) ? null : trim((string) $d->jabatan_kontak_utama),
                'email' => $email !== '' ? $email : null,
                'telepon' => $this->kosong($d->telepon_kontak_utama) ? null : trim((string) $d->telepon_kontak_utama),
            ]);
            if ($email !== '') {
                $sudahAda[$email] = true;
            }
        }
    }

    /** Kunci pembanding kontak: email bila ada, kalau tidak nama. Kosong bila keduanya kosong. */
    private function kunciKontak(array $kontak): string
    {
        $email = strtolower(trim((string) ($kontak['email'] ?? '')));
        if ($email !== '' && $email !== '-') {
            return 'e:'.$email;
        }
        $nama = mb_strtolower(trim((string) ($kontak['nama'] ?? '')));

        return $nama !== '' ? 'n:'.$nama : '';
    }

    /**
     * Cadangan versi 2 menyimpan kontak di tabel kontak_mitra (kini sudah digabung ke kolom JSON
     * master_mitra.kontak_tambahan). Ubah ke bentuk baru supaya cadangan lama tetap bisa dipulihkan.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalisasiKontakCadangan(array $data): array
    {
        if (! array_key_exists('kontak_mitra', $data)) {
            return $data;
        }

        $jadiJson = function (array $baris): ?string {
            $hasil = [];
            foreach (array_values($baris) as $i => $r) {
                $hasil[] = [
                    'id' => $i + 1,
                    'user_id' => $r['user_id'] ?? null,
                    'nama' => $r['nama'] ?? '-',
                    'jabatan' => $r['jabatan'] ?? null,
                    'email' => $r['email'] ?? null,
                    'telepon' => $r['telepon'] ?? null,
                ];
            }

            return $hasil !== [] ? json_encode($hasil) : null;
        };

        $perMitra = [];
        foreach ($data['kontak_mitra'] as $r) {
            $perMitra[(int) $r['mitra_id']][] = $r;
        }
        foreach ($data['mitra_dihapus'] as $i => $row) {
            $data['mitra_dihapus'][$i]['kontak_tambahan'] = $jadiJson($perMitra[(int) $row['id']] ?? []);
        }
        foreach ($data['induk_sebelum'] as $id => $row) {
            $data['induk_sebelum'][$id]['kontak_tambahan'] = $jadiJson($data['kontak_induk_sebelum'][$id] ?? []);
        }
        unset($data['kontak_mitra'], $data['kontak_induk_sebelum']);

        return $data;
    }

    /**
     * Kelompokkan mitra yang namanya "sama" menurut MitraNameMatcher. Transitif (union-find):
     * kalau A~B dan B~C maka ketiganya satu grup. Hanya grup berisi >1 baris yang dikembalikan.
     *
     * @param  \Illuminate\Support\Collection<int, MasterMitra>  $semua
     * @return \Illuminate\Support\Collection<int, \Illuminate\Support\Collection<int, MasterMitra>>
     */
    private function kelompokkan($semua)
    {
        $list = $semua->values();
        $n = $list->count();
        $induk = range(0, max($n - 1, 0));
        $cari = function (int $i) use (&$induk, &$cari): int {
            while ($induk[$i] !== $i) {
                $induk[$i] = $induk[$induk[$i]];
                $i = $induk[$i];
            }

            return $i;
        };

        $tokens = $list->map(fn (MasterMitra $m) => MitraNameMatcher::tokens($m->nama_mitra))->all();
        $kunci = array_map(fn ($t) => implode('', $t), $tokens);

        for ($i = 0; $i < $n; $i++) {
            if ($kunci[$i] === '') {
                continue;
            }
            for ($j = $i + 1; $j < $n; $j++) {
                if ($kunci[$j] === '') {
                    continue;
                }
                if ($kunci[$i] === $kunci[$j]
                    || MitraNameMatcher::samaTetap($list[$i]->nama_mitra, $list[$j]->nama_mitra)
                    || (count($tokens[$i]) === count($tokens[$j]) && MitraNameMatcher::sama($list[$i]->nama_mitra, $list[$j]->nama_mitra))) {
                    $a = $cari($i);
                    $b = $cari($j);
                    if ($a !== $b) {
                        $induk[max($a, $b)] = min($a, $b);
                    }
                }
            }
        }

        $grup = [];
        foreach ($list as $i => $m) {
            $grup[$cari($i)][] = $m;
        }

        return collect($grup)->filter(fn ($rows) => count($rows) > 1)->map(fn ($rows) => collect($rows))->values();
    }

    /**
     * Simpan kondisi SEBELUM diubah supaya bisa dipulihkan (--rollback): baris yang akan dihapus
     * beserta kontaknya, kondisi INDUK sebelum backfill dan kontaknya, serta mitra_id lama tiap
     * dokumen/pengajuan yang dialihkan.
     */
    private function cadangkan(array $rencana): string
    {
        $ids = collect($rencana)->pluck('dupIds')->flatten()->all();
        $indukIds = collect($rencana)->map(fn ($r) => $r['induk']->id)->all();

        // id mitra dihapus => id induk. Dibangun dengan loop biasa: flatMap/collapse memakai array_merge
        // yang me-renumber kunci angka, sehingga id-nya hilang.
        $pemetaan = [];
        foreach ($rencana as $r) {
            foreach ($r['dupIds'] as $dupId) {
                $pemetaan[$dupId] = $r['induk']->id;
            }
        }

        $payload = [
            'perintah' => 'sikerma:gabung-mitra-ganda',
            'versi' => 3,
            'dibuat' => now()->toIso8601String(),
            'mitra_dihapus' => DB::table('master_mitra')->whereIn('id', $ids)->get()->all(),
            'induk_sebelum' => DB::table('master_mitra')->whereIn('id', $indukIds)->get()->keyBy('id')->all(),
            'dokumen_kerjasama_mitra_lama' => DB::table('dokumen_kerjasama')->whereIn('mitra_id', $ids)->pluck('mitra_id', 'id')->all(),
            'pengajuan_v2_mitra_lama' => DB::table('pengajuan_v2')->whereIn('mitra_id', $ids)->pluck('mitra_id', 'id')->all(),
            'pemetaan_ke_induk' => $pemetaan,
        ];
        $path = storage_path('app/cadangan-gabung-mitra-'.now()->format('Ymd-His').'.json');
        if (file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw new \RuntimeException('Gagal menulis berkas cadangan: '.$path);
        }
        $this->line('Cadangan disimpan: '.$path);

        return $path;
    }

    /**
     * Pulihkan dari berkas cadangan. TANPA --apply hanya PRATINJAU.
     *
     *  - penuh (tanpa --hanya): batalkan satu kali --apply seluruhnya.
     *  - sebagian (--hanya=id,id): hanya mitra yang dihapus dengan id itu yang dihidupkan lagi, beserta
     *    dokumen/pengajuan/kontak miliknya; pasangan lain dalam berkas yang sama TIDAK disentuh.
     *
     * Urutan: kolom INDUK yang di-backfill dikembalikan lebih dulu (kode_mitra unik — kode yang disalin
     * ke INDUK harus dilepas sebelum baris asalnya hidup lagi), lalu mitra dihidupkan, kontak, dokumen/pengajuan.
     */
    private function rollback(string $path, bool $apply, string $hanyaOpsi): int
    {
        if (! is_file($path)) {
            $path = storage_path('app/'.ltrim($path, '/\\'));
        }
        if (! is_file($path)) {
            $this->error('Berkas cadangan tidak ditemukan: '.$path);

            return self::FAILURE;
        }

        $data = json_decode((string) file_get_contents($path), true);
        if (! is_array($data) || ($data['perintah'] ?? null) !== 'sikerma:gabung-mitra-ganda') {
            $this->error('Berkas bukan cadangan sikerma:gabung-mitra-ganda (cadangan lama sebelum fitur rollback juga tidak bisa dipakai).');

            return self::FAILURE;
        }
        if ((int) ($data['versi'] ?? 0) < 2) {
            $this->error('Berkas cadangan versi lama (tanpa data INDUK/kontak) — tidak bisa di-rollback otomatis.');

            return self::FAILURE;
        }
        $data = $this->normalisasiKontakCadangan($data);

        $hanya = null;
        if (trim($hanyaOpsi) !== '') {
            $hanya = [];
            foreach (preg_split('/[\s,;]+/', trim($hanyaOpsi), -1, PREG_SPLIT_NO_EMPTY) as $p) {
                if (! ctype_digit($p)) {
                    $this->error("Nilai --hanya tidak valid: '{$p}' — pakai id mitra, pisahkan dengan koma.");

                    return self::FAILURE;
                }
                $hanya[] = (int) $p;
            }
        }

        $dihapus = collect($data['mitra_dihapus'])->keyBy(fn ($r) => (int) $r['id']);
        if ($hanya !== null) {
            $tidakAda = array_values(array_diff($hanya, $dihapus->keys()->all()));
            if ($tidakAda !== []) {
                $this->error('Mitra #'.implode(', #', $tidakAda).' tidak ada di daftar mitra_dihapus berkas ini.');

                return self::FAILURE;
            }
            $dihapus = $dihapus->only($hanya);
        }
        $ids = $dihapus->keys()->map(fn ($v) => (int) $v)->all();
        $indukDari = $this->indukDariCadangan($data, $ids);

        // ---- Susun rencana ----
        $mitraBaru = [];
        $sudahAda = [];
        foreach ($dihapus as $id => $row) {
            if (DB::table('master_mitra')->where('id', $id)->exists()) {
                $sudahAda[] = $id;
            } else {
                $mitraBaru[$id] = $row;
            }
        }

        $dokBalik = $this->daftarBalik('dokumen_kerjasama', $data['dokumen_kerjasama_mitra_lama'], $ids, 'nomor_dokumen');
        $pengBalik = $this->daftarBalik('pengajuan_v2', $data['pengajuan_v2_mitra_lama'], $ids, 'nomor_pengajuan');

        // Kolom INDUK yang dikembalikan.
        $indukRencana = [];
        $jumlahKontakDibuang = 0;
        foreach ($data['induk_sebelum'] as $indukId => $before) {
            $indukId = (int) $indukId;
            $dups = $hanya === null ? $ids : array_values(array_filter($ids, fn ($d) => ($indukDari[$d] ?? null) === $indukId));
            if ($dups === []) {
                continue;
            }
            $now = DB::table('master_mitra')->where('id', $indukId)->first();
            if (! $now) {
                continue;
            }
            $kolom = [];
            foreach (self::FIELD_BACKFILL as $f) {
                $semula = $before[$f] ?? null;
                if ($hanya === null) {
                    if ((string) ($now->{$f} ?? null) !== (string) $semula) {
                        $kolom[$f] = $semula;
                    }

                    continue;
                }
                // Sebagian: kembalikan HANYA kolom yang tadinya kosong dan kini berisi persis nilai dari mitra yang dipulihkan.
                if (! $this->kosong($semula) || $this->kosong(($now->{$f} ?? null))) {
                    continue;
                }
                foreach ($dups as $d) {
                    if (trim((string) ($dihapus[$d][$f] ?? '')) !== '' && trim((string) $dihapus[$d][$f]) === trim((string) ($now->{$f} ?? null))) {
                        $kolom[$f] = $semula;
                        break;
                    }
                }
            }
            // Kontak tambahan INDUK (kolom JSON kontak_tambahan) ikut dikembalikan.
            $kontakSekarang = json_decode((string) ($now->kontak_tambahan ?? ''), true) ?: [];
            $kontakSebelum = json_decode((string) ($before['kontak_tambahan'] ?? ''), true) ?: [];
            if ($hanya === null) {
                $kontakBaru = $kontakSebelum;
            } else {
                // Sebagian: buang hanya kontak yang berasal dari mitra yang dipulihkan (PIC utamanya dan kontak
                // tambahannya) dan belum ada sebelum penggabungan.
                $kunciSebelum = array_flip(array_filter(array_map(fn ($k) => $this->kunciKontak($k), $kontakSebelum)));
                $kunciDari = [];
                foreach ($dups as $d) {
                    $kunciDari[] = $this->kunciKontak(['nama' => $dihapus[$d]['nama_kontak_utama'] ?? '', 'email' => $dihapus[$d]['email_kontak_utama'] ?? '']);
                    foreach (json_decode((string) ($dihapus[$d]['kontak_tambahan'] ?? ''), true) ?: [] as $k) {
                        $kunciDari[] = $this->kunciKontak($k);
                    }
                }
                $kunciDari = array_flip(array_filter($kunciDari));
                $kontakBaru = array_values(array_filter(
                    $kontakSekarang,
                    fn ($k) => isset($kunciSebelum[$this->kunciKontak($k)]) || ! isset($kunciDari[$this->kunciKontak($k)])
                ));
            }
            if (json_encode($kontakBaru) !== json_encode($kontakSekarang)) {
                $kolom['kontak_tambahan'] = $kontakBaru !== [] ? json_encode($kontakBaru) : null;
                $jumlahKontakDibuang += max(0, count($kontakSekarang) - count($kontakBaru));
            }

            if ($kolom !== []) {
                $indukRencana[$indukId] = ['nama' => $now->nama_mitra, 'kolom' => $kolom, 'sekarang' => array_intersect_key((array) $now, $kolom)];
            }
        }

        // Konflik kode_mitra unik untuk baris yang dihidupkan lagi.
        $dilepas = [];
        foreach ($indukRencana as $r) {
            if (array_key_exists('kode_mitra', $r['kolom']) && ! $this->kosong($r['sekarang']['kode_mitra'] ?? null)) {
                $dilepas[] = (string) $r['sekarang']['kode_mitra'];
            }
        }
        $konflik = [];
        foreach ($mitraBaru as $id => $row) {
            $kode = trim((string) ($row['kode_mitra'] ?? ''));
            if ($kode === '' || in_array($kode, $dilepas, true)) {
                continue;
            }
            $pemegang = DB::table('master_mitra')->where('kode_mitra', $kode)->where('id', '!=', $id)->value('id');
            if ($pemegang) {
                $konflik[] = "kode '{$kode}' milik mitra #{$id} sudah dipakai mitra #{$pemegang}";
            }
        }

        // ---- Pratinjau ----
        $this->info('=== PEMULIHAN '.($hanya === null ? '(penuh: seluruh isi berkas)' : '(sebagian: hanya mitra #'.implode(', #', $ids).')').' ===');
        if ($sudahAda !== []) {
            $this->warn('Sudah ada di master_mitra (dilewati): #'.implode(', #', $sudahAda));
        }

        $this->line('Mitra yang dihidupkan lagi:');
        $baris = [];
        foreach ($mitraBaru as $id => $r) {
            $baris[] = [$id, $r['nama_mitra'] ?? '', ($r['kode_mitra'] ?? null) ?: '-', ($r['kategori_mitra'] ?? null) ?: '-', ($r['negara'] ?? null) ?: '-'];
        }
        $baris === [] ? $this->line('  (tidak ada)') : $this->table(['id', 'nama_mitra', 'kode_mitra', 'kategori_mitra', 'negara'], $baris);

        $this->line('Dokumen yang dikembalikan:');
        $dokBalik === [] ? $this->line('  (tidak ada)') : $this->table(['id', 'nomor', 'status', 'mitra_id sekarang', '→ kembali ke'], array_map(fn ($r) => [$r['id'], $r['label'], $r['status'], $r['sekarang'], $r['lama']], $dokBalik));

        $this->line('Pengajuan yang dikembalikan:');
        $pengBalik === [] ? $this->line('  (tidak ada)') : $this->table(['id', 'nomor', 'status', 'mitra_id sekarang', '→ kembali ke'], array_map(fn ($r) => [$r['id'], $r['label'], $r['status'], $r['sekarang'], $r['lama']], $pengBalik));

        $jumlahKontakBalik = array_sum(array_map(fn ($r) => count(json_decode((string) ($r['kontak_tambahan'] ?? ''), true) ?: []), $mitraBaru));
        $this->line(sprintf('Kontak: %d dipulihkan bersama mitra asalnya, %d kontak hasil penggabungan dibuang dari induk.', $jumlahKontakBalik, $jumlahKontakDibuang));

        $this->line('Kolom INDUK yang dikembalikan:');
        if ($indukRencana === []) {
            $this->line('  (tidak ada — penggabungan itu tidak mengisi kolom apa pun di induk)');
        } else {
            $baris = [];
            foreach ($indukRencana as $indukId => $r) {
                foreach ($r['kolom'] as $f => $semula) {
                    $baris[] = [$indukId, $r['nama'], $f, ($r['sekarang'][$f] ?? '-') ?: '-', $semula === null || $semula === '' ? '(kosong)' : $semula];
                }
            }
            $this->table(['induk id', 'nama', 'kolom', 'sekarang', '→ semula'], $baris);
        }

        if ($konflik !== []) {
            $this->error('KONFLIK — pemulihan tidak bisa dilanjutkan:');
            foreach ($konflik as $k) {
                $this->line('  - '.$k);
            }

            return self::FAILURE;
        }

        $this->line(sprintf(
            'Ringkasan: %d mitra dihidupkan | %d dokumen + %d pengajuan dikembalikan | %d kontak dipulihkan, %d dibuang | %d induk dikembalikan kolomnya.',
            count($mitraBaru), count($dokBalik), count($pengBalik), $jumlahKontakBalik, $jumlahKontakDibuang, count($indukRencana),
        ));

        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk memulihkan.');

            return self::SUCCESS;
        }

        // ---- Cadangan kondisi SEKARANG (sebelum dipulihkan), lalu terapkan ----
        $cadangan = storage_path('app/cadangan-pulihkan-mitra-'.now()->format('Ymd-His').'.json');
        $isi = [
            'perintah' => 'sikerma:gabung-mitra-ganda:pulihkan',
            'dibuat' => now()->toIso8601String(),
            'berkas_sumber' => basename($path),
            'hanya' => $hanya,
            'mitra_dihidupkan' => array_keys($mitraBaru),
            'dokumen_sebelum' => array_column($dokBalik, 'sekarang', 'id'),
            'pengajuan_sebelum' => array_column($pengBalik, 'sekarang', 'id'),
            'induk_sebelum' => array_map(fn ($r) => $r['sekarang'], $indukRencana),
        ];
        if (file_put_contents($cadangan, json_encode($isi, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw new \RuntimeException('Gagal menulis berkas cadangan: '.$cadangan);
        }
        $this->line('Cadangan kondisi sebelum pemulihan: '.$cadangan);

        try {
            DB::transaction(function () use ($indukRencana, $mitraBaru, $dokBalik, $pengBalik) {
                foreach ($indukRencana as $indukId => $r) {
                    DB::table('master_mitra')->where('id', $indukId)->update($r['kolom'] + ['updated_at' => now()]);
                }
                // Cadangan lama bisa memuat kolom yang sudah dihapus dari master_mitra (mis. kode_perusahaan): dibuang.
                $kolomAda = array_flip(\Illuminate\Support\Facades\Schema::getColumnListing('master_mitra'));
                foreach ($mitraBaru as $row) {
                    DB::table('master_mitra')->insert(array_intersect_key($row, $kolomAda));
                }
                foreach ($dokBalik as $r) {
                    DB::table('dokumen_kerjasama')->where('id', $r['id'])->update(['mitra_id' => $r['lama']]);
                }
                foreach ($pengBalik as $r) {
                    DB::table('pengajuan_v2')->where('id', $r['id'])->update(['mitra_id' => $r['lama']]);
                }
            });
        } catch (\Throwable $e) {
            @unlink($cadangan);

            throw $e;
        }

        $this->info(sprintf(
            'Pemulihan selesai: %d mitra dihidupkan lagi, %d dokumen + %d pengajuan dikembalikan ke mitra lama.',
            count($mitraBaru), count($dokBalik), count($pengBalik),
        ));
        if ($mitraBaru !== []) {
            $this->line('Untuk menggabungkannya lagi: php artisan sikerma:gabung-mitra-ganda --pasangan=hapus:tujuan [--apply]');
        }

        return self::SUCCESS;
    }

    /**
     * Baris dokumen/pengajuan yang tadinya milik mitra yang dipulihkan: id, label, status, mitra_id sekarang, mitra_id lama.
     *
     * @param  array<int|string, int>  $peta  id baris => mitra_id lama (dari cadangan)
     * @return array<int, array{id: int, label: string, status: string, sekarang: mixed, lama: int}>
     */
    private function daftarBalik(string $tabel, array $peta, array $ids, string $kolomLabel): array
    {
        $hasil = [];
        foreach ($peta as $rowId => $lama) {
            if (! in_array((int) $lama, $ids, true)) {
                continue;
            }
            $baris = DB::table($tabel)->where('id', $rowId)->first();
            if (! $baris) {
                continue;
            }
            $status = $tabel === 'dokumen_kerjasama'
                ? (($baris->dihapus_admin_pada || $baris->dihapus_user_pada) ? 'di Sampah' : 'aktif')
                : (string) ($baris->status_pengajuan ?? '-');
            $hasil[] = ['id' => (int) $rowId, 'label' => (string) $baris->{$kolomLabel}, 'status' => $status, 'sekarang' => $baris->mitra_id, 'lama' => (int) $lama];
        }

        return $hasil;
    }

    /**
     * Mitra induk tiap mitra yang dihapus. Dipakai pemetaan di cadangan kalau berkunci id; cadangan lama
     * menyimpannya sebagai daftar tanpa kunci (bug yang sudah diperbaiki), jadi induk diturunkan dari
     * mitra_id dokumen/pengajuan yang tadinya milik mitra itu.
     *
     * @return array<int, int|null>
     */
    private function indukDariCadangan(array $data, array $ids): array
    {
        $peta = $data['pemetaan_ke_induk'] ?? [];
        $hasil = [];
        foreach ($ids as $id) {
            if (is_array($peta) && ! array_is_list($peta) && array_key_exists($id, $peta)) {
                $hasil[$id] = (int) $peta[$id];

                continue;
            }
            $induk = null;
            foreach ([['dokumen_kerjasama', 'dokumen_kerjasama_mitra_lama'], ['pengajuan_v2', 'pengajuan_v2_mitra_lama']] as [$tabel, $kunci]) {
                $rowIds = array_keys(array_filter($data[$kunci] ?? [], fn ($v) => (int) $v === $id));
                if ($rowIds === []) {
                    continue;
                }
                $m = DB::table($tabel)->whereIn('id', $rowIds)->whereNotNull('mitra_id')->value('mitra_id');
                if ($m) {
                    $induk = (int) $m;
                    break;
                }
            }
            $hasil[$id] = $induk;
        }

        return $hasil;
    }

    private function kosong(mixed $v): bool
    {
        $v = trim((string) $v);

        return $v === '' || $v === '-';
    }

    private function kelengkapan(MasterMitra $m): int
    {
        $n = 0;
        foreach (self::FIELD_BACKFILL as $f) {
            if (! $this->kosong($m->{$f})) {
                $n++;
            }
        }

        return $n;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, MasterMitra>  $duplikat
     * @return array<string, string>
     */
    private function hitungBackfill(MasterMitra $induk, $duplikat, $pakaiDok, $pakaiPeng): array
    {
        if ($this->tanpaBackfill) {
            return [];
        }

        $urut = $duplikat->sortByDesc(fn (MasterMitra $m) => (int) ($pakaiDok[$m->id] ?? 0) + (int) ($pakaiPeng[$m->id] ?? 0));

        $isi = [];
        foreach (self::FIELD_BACKFILL as $f) {
            if ($this->tanpaBackfillKontak && in_array($f, self::FIELD_KONTAK_UTAMA, true)) {
                continue;
            }
            if (! $this->kosong($induk->{$f})) {
                continue;
            }
            foreach ($urut as $d) {
                if (! $this->kosong($d->{$f})) {
                    $isi[$f] = trim((string) $d->{$f});
                    break;
                }
            }
        }

        return $isi;
    }
}
