<?php

namespace App\Console\Commands;

use App\Models\KontakMitra;
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
 *   # Batalkan satu kali --apply (mode otomatis maupun --pasangan):
 *   php artisan sikerma:gabung-mitra-ganda --rollback=cadangan-gabung-mitra-YYYYMMDD-HHMMSS.json
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
        {--rollback= : Batalkan satu kali --apply memakai berkas cadangan JSON di storage/app/}';

    protected $description = 'Gabungkan mitra ganda di master_mitra berdasarkan kesamaan nama (induk = yang punya kode_mitra), atau pasangan hapus:tujuan yang ditentukan sendiri';

    /** Field yang boleh di-backfill ke INDUK dari baris duplikat. */
    private const FIELD_BACKFILL = [
        'kategori_mitra', 'tingkat_perusahaan', 'bidang_usaha', 'negara', 'website', 'alamat',
        'email_mitra', 'whatsapp_mitra', 'no_telepon_mitra', 'kode_mitra', 'kode_perusahaan',
        'nama_kontak_utama', 'jabatan_kontak_utama', 'email_kontak_utama', 'telepon_kontak_utama',
    ];

    public function handle(): int
    {
        if ($this->option('rollback')) {
            return $this->rollback((string) $this->option('rollback'));
        }

        $apply = (bool) $this->option('apply');
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
            $kontak = DB::table('kontak_mitra')->whereIn('mitra_id', $dupIds)->count();
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

                // Sebelum dihapus (kontak_mitra ikut terhapus via cascade), pindahkan kontaknya ke INDUK.
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
        $this->line('Batalkan dengan: php artisan sikerma:gabung-mitra-ganda --rollback='.basename($berkas));

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
                    DB::table('kontak_mitra')->where('mitra_id', $d->id)->count().(trim((string) $d->nama_kontak_utama) !== '' ? ' + PIC utama' : ''),
                ];
            }
        }

        $this->info('=== PASANGAN (hapus → tujuan) ===');
        $this->table(['Dihapus', 'Tujuan (INDUK)', 'Dokumen dialihkan', 'Pengajuan', 'Kontak'], $baris);
    }

    /**
     * Kontak dari baris duplikat — kontak utamanya dan kontak_mitra-nya — dipindah
     * ke INDUK sebagai kontak tambahan, kecuali emailnya sudah jadi kontak utama
     * INDUK (setelah backfill) atau sudah ada di kontak INDUK.
     *
     * @param  \Illuminate\Support\Collection<int, MasterMitra>  $duplikat
     */
    private function pindahkanKontak(MasterMitra $induk, $duplikat, array $backfill): void
    {
        $emailUtama = strtolower(trim((string) ($backfill['email_kontak_utama'] ?? $induk->email_kontak_utama)));
        $namaUtama = mb_strtolower(trim((string) ($backfill['nama_kontak_utama'] ?? $induk->nama_kontak_utama)));
        $sudahAda = KontakMitra::where('mitra_id', $induk->id)->pluck('email')
            ->map(fn ($e) => strtolower(trim((string) $e)))->filter()->flip()->all();

        $dupIds = $duplikat->pluck('id')->all();
        foreach (KontakMitra::whereIn('mitra_id', $dupIds)->orderBy('id')->get() as $kontak) {
            $email = strtolower(trim((string) $kontak->email));
            if ($email !== '' && ($email === $emailUtama || isset($sudahAda[$email]))) {
                $kontak->delete();
                continue;
            }
            $kontak->update(['mitra_id' => $induk->id]);
            if ($email !== '') {
                $sudahAda[$email] = true;
            }
        }

        foreach ($duplikat as $d) {
            $nama = trim((string) $d->nama_kontak_utama);
            $email = strtolower(trim((string) $d->email_kontak_utama));
            if ($this->kosong($nama)) {
                continue;
            }
            $samaDenganUtama = $email !== '' ? $email === $emailUtama : mb_strtolower($nama) === $namaUtama;
            if ($samaDenganUtama || ($email !== '' && isset($sudahAda[$email]))) {
                continue;
            }

            KontakMitra::create([
                'mitra_id' => $induk->id,
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
            'versi' => 2,
            'dibuat' => now()->toIso8601String(),
            'mitra_dihapus' => DB::table('master_mitra')->whereIn('id', $ids)->get()->all(),
            'kontak_mitra' => DB::table('kontak_mitra')->whereIn('mitra_id', $ids)->get()->all(),
            'induk_sebelum' => DB::table('master_mitra')->whereIn('id', $indukIds)->get()->keyBy('id')->all(),
            'kontak_induk_sebelum' => collect($indukIds)->mapWithKeys(
                fn ($id) => [$id => DB::table('kontak_mitra')->where('mitra_id', $id)->get()->all()]
            )->all(),
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
     * Batalkan satu kali --apply: kolom INDUK yang di-backfill dikembalikan, mitra yang dihapus
     * dihidupkan lagi (id aslinya), kontak dipulihkan, dan mitra_id dokumen/pengajuan dikembalikan.
     */
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
        if (! is_array($data) || ($data['perintah'] ?? null) !== 'sikerma:gabung-mitra-ganda') {
            $this->error('Berkas bukan cadangan sikerma:gabung-mitra-ganda (cadangan lama sebelum fitur rollback juga tidak bisa dipakai).');

            return self::FAILURE;
        }
        if ((int) ($data['versi'] ?? 0) < 2) {
            $this->error('Berkas cadangan versi lama (tanpa data INDUK/kontak) — tidak bisa di-rollback otomatis.');

            return self::FAILURE;
        }

        $hidup = 0;
        DB::transaction(function () use ($data, &$hidup) {
            // 1. Kembalikan kolom INDUK yang diisi backfill — LEBIH DULU dari langkah 2, karena
            //    kode_mitra unik: kode yang disalin ke INDUK harus dilepas sebelum baris asalnya hidup lagi.
            foreach ($data['induk_sebelum'] as $id => $row) {
                $kolom = array_intersect_key($row, array_flip(self::FIELD_BACKFILL));
                $kolom['updated_at'] = $row['updated_at'] ?? now();
                DB::table('master_mitra')->where('id', $id)->update($kolom);
            }

            // 2. Hidupkan lagi mitra yang dihapus (id asli dipertahankan).
            foreach ($data['mitra_dihapus'] as $row) {
                if (! DB::table('master_mitra')->where('id', $row['id'])->exists()) {
                    DB::table('master_mitra')->insert($row);
                    $hidup++;
                }
            }

            // 3. Kontak: buang kontak yang ditambahkan ke INDUK oleh penggabungan, lalu pulihkan kontak duplikat.
            foreach ($data['kontak_induk_sebelum'] as $indukId => $rows) {
                $keep = array_column($rows, 'id');
                $q = DB::table('kontak_mitra')->where('mitra_id', $indukId);
                if ($keep !== []) {
                    $q->whereNotIn('id', $keep);
                }
                $q->delete();
            }
            foreach ($data['kontak_mitra'] as $row) {
                if (! DB::table('kontak_mitra')->where('id', $row['id'])->exists()) {
                    DB::table('kontak_mitra')->insert($row);
                }
            }

            // 4. Kembalikan mitra_id dokumen & pengajuan.
            foreach ($data['dokumen_kerjasama_mitra_lama'] as $id => $mitraId) {
                DB::table('dokumen_kerjasama')->where('id', $id)->update(['mitra_id' => $mitraId]);
            }
            foreach ($data['pengajuan_v2_mitra_lama'] as $id => $mitraId) {
                DB::table('pengajuan_v2')->where('id', $id)->update(['mitra_id' => $mitraId]);
            }
        });

        $this->info(sprintf(
            'Rollback selesai: %d mitra dihidupkan lagi, %d dokumen + %d pengajuan dikembalikan ke mitra lama.',
            $hidup, count($data['dokumen_kerjasama_mitra_lama']), count($data['pengajuan_v2_mitra_lama']),
        ));

        return self::SUCCESS;
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
        $urut = $duplikat->sortByDesc(fn (MasterMitra $m) => (int) ($pakaiDok[$m->id] ?? 0) + (int) ($pakaiPeng[$m->id] ?? 0));

        $isi = [];
        foreach (self::FIELD_BACKFILL as $f) {
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
