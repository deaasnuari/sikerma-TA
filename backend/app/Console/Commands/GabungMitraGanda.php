<?php

namespace App\Console\Commands;

use App\Models\KontakMitra;
use App\Models\MasterMitra;
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
 * Untuk tiap grup nama yang sama (nama dinormalkan: huruf kecil, buang spasi & tanda baca):
 *  1. pilih 1 baris jadi INDUK — prioritas:
 *       a. punya kode_mitra
 *       b. paling banyak dipakai (dokumen_kerjasama + pengajuan_v2)
 *       c. data paling lengkap
 *       d. id terkecil
 *  2. isi field kosong di INDUK dari baris duplikat (nilai non-kosong pertama);
 *  3. alihkan semua dokumen_kerjasama.mitra_id & pengajuan_v2.mitra_id dari duplikat ke INDUK;
 *  4. hapus baris duplikat.
 */
class GabungMitraGanda extends Command
{
    protected $signature = 'sikerma:gabung-mitra-ganda {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}';

    protected $description = 'Gabungkan mitra ganda di master_mitra berdasarkan kesamaan nama (induk = yang punya kode_mitra)';

    /** Field yang boleh di-backfill ke INDUK dari baris duplikat. */
    private const FIELD_BACKFILL = [
        'kategori_mitra', 'tingkat_perusahaan', 'bidang_usaha', 'negara', 'website', 'alamat',
        'email_mitra', 'whatsapp_mitra', 'no_telepon_mitra', 'kode_mitra', 'kode_perusahaan',
        'nama_kontak_utama', 'jabatan_kontak_utama', 'email_kontak_utama', 'telepon_kontak_utama',
    ];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');

        $semua = MasterMitra::query()->orderBy('id')->get();
        $grup = $semua->groupBy(fn (MasterMitra $m) => $this->normalkan($m->nama_mitra))
            ->filter(fn ($rows, $key) => $key !== '' && $rows->count() > 1);

        if ($grup->isEmpty()) {
            $this->info('Tidak ada mitra ganda. Tidak ada yang perlu digabung.');

            return self::SUCCESS;
        }

        $pakaiDok = DB::table('dokumen_kerjasama')->select('mitra_id', DB::raw('count(*) n'))
            ->whereNotNull('mitra_id')->groupBy('mitra_id')->pluck('n', 'mitra_id');
        $pakaiPeng = DB::table('pengajuan_v2')->select('mitra_id', DB::raw('count(*) n'))
            ->whereNotNull('mitra_id')->groupBy('mitra_id')->pluck('n', 'mitra_id');

        $baris = [];
        $rencana = [];
        $totalDupHapus = 0;
        $totalDokAlih = 0;
        $totalPengAlih = 0;
        $tanpaKode = 0;

        foreach ($grup as $rows) {
            $rows = $rows->sortByDesc(fn (MasterMitra $m) => [
                trim((string) $m->kode_mitra) !== '' ? 1 : 0,
                (int) ($pakaiDok[$m->id] ?? 0) + (int) ($pakaiPeng[$m->id] ?? 0),
                $this->kelengkapan($m),
                -$m->id,
            ])->values();

            $induk = $rows->first();
            $duplikat = $rows->slice(1);
            $dupIds = $duplikat->pluck('id')->all();

            if (trim((string) $induk->kode_mitra) === '') {
                $tanpaKode++;
            }

            $dok = $duplikat->sum(fn (MasterMitra $m) => (int) ($pakaiDok[$m->id] ?? 0));
            $peng = $duplikat->sum(fn (MasterMitra $m) => (int) ($pakaiPeng[$m->id] ?? 0));
            $backfill = $this->hitungBackfill($induk, $duplikat, $pakaiDok, $pakaiPeng);

            $totalDupHapus += count($dupIds);
            $totalDokAlih += $dok;
            $totalPengAlih += $peng;

            $baris[] = [
                $induk->id,
                trim((string) $induk->kode_mitra) !== '' ? $induk->kode_mitra : '(tanpa kode)',
                mb_strimwidth((string) $induk->nama_mitra, 0, 34, '…'),
                implode(',', $dupIds),
                $dok,
                $peng,
                $backfill ? implode(',', array_keys($backfill)) : '-',
            ];

            $rencana[] = compact('induk', 'duplikat', 'dupIds', 'backfill');
        }

        $this->table(
            ['INDUK id', 'Kode', 'Nama', 'Duplikat id (dihapus)', 'Dok dialihkan', 'Peng dialihkan', 'Field di-backfill'],
            $baris,
        );
        $this->line(sprintf(
            'Ringkasan: %d grup | %d baris duplikat dihapus | %d dokumen + %d pengajuan dialihkan | %d grup INDUK-nya belum punya kode.',
            $grup->count(), $totalDupHapus, $totalDokAlih, $totalPengAlih, $tanpaKode,
        ));

        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($rencana) {
            foreach ($rencana as $r) {
                if ($r['dupIds'] === []) {
                    continue;
                }
                DB::table('dokumen_kerjasama')->whereIn('mitra_id', $r['dupIds'])->update(['mitra_id' => $r['induk']->id]);
                DB::table('pengajuan_v2')->whereIn('mitra_id', $r['dupIds'])->update(['mitra_id' => $r['induk']->id]);

                if ($r['backfill'] !== []) {
                    MasterMitra::whereKey($r['induk']->id)->update($r['backfill']);
                }

                // Sebelum dihapus (kontak_mitra ikut terhapus via cascade), pindahkan kontaknya ke INDUK.
                $this->pindahkanKontak($r['induk'], $r['duplikat'], $r['backfill']);

                MasterMitra::whereIn('id', $r['dupIds'])->delete();
            }
        });

        $this->info(sprintf(
            'Selesai. %d baris duplikat dihapus, %d dokumen + %d pengajuan dialihkan ke induk.',
            $totalDupHapus, $totalDokAlih, $totalPengAlih,
        ));

        return self::SUCCESS;
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

    private function normalkan(?string $nama): string
    {
        return preg_replace('/[^a-z0-9]/', '', mb_strtolower(trim((string) $nama))) ?? '';
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
