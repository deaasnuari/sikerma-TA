<?php

namespace App\Console\Commands;

use App\Support\MitraNameMatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sambungkan lagi dokumen_kerjasama / pengajuan_v2 yang mitra_id-nya kosong ke baris
 * master_mitra yang namanya cocok (mis. setelah sebuah mitra dihapus langsung dari Data
 * Kemitraan, atau data lama yang tidak pernah tersambung).
 *
 *   php artisan sikerma:sambung-mitra-yatim            # pratinjau (dry-run)
 *   php artisan sikerma:sambung-mitra-yatim --apply    # benar-benar menyambung
 *
 * Nama diambil dari snapshot dokumen (snap_nama_mitra / keterangan "Mitra: ...") atau, kalau
 * kosong, dari pengajuan sumbernya. Aturan cocok = MitraNameMatcher (sama dengan
 * sikerma:gabung-mitra-ganda). Hanya disambung kalau TEPAT SATU mitra yang cocok; kalau
 * cocoknya cuma karena salah ketik atau ada lebih dari satu kandidat, dilaporkan saja
 * (tambahkan --termasuk-typo untuk ikut menyambung yang cocok karena salah ketik).
 * Idempotent, dan sebelum --apply mengubah apa pun, kondisi awal dicadangkan ke storage/app/.
 */
class SambungMitraYatim extends Command
{
    protected $signature = 'sikerma:sambung-mitra-yatim
        {--apply : Terapkan perubahan (tanpa flag ini hanya pratinjau)}
        {--termasuk-typo : Ikut sambungkan yang cocok hanya karena salah ketik kecil}';

    protected $description = 'Sambungkan dokumen/pengajuan tanpa mitra ke mitra di Data Kemitraan yang namanya cocok';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $termasukTypo = (bool) $this->option('termasuk-typo');

        $mitra = DB::table('master_mitra')->select('id', 'nama_mitra', 'kode_mitra')->orderBy('id')->get();

        $pengajuanNama = $this->namaPengajuan();
        $rencana = ['dokumen_kerjasama' => [], 'pengajuan_v2' => []];
        $perluKonfirmasi = [];
        $tanpaCocok = 0;
        $tanpaNama = 0;

        // Pengajuan dulu: dokumen yang namanya kosong mewarisi nama dari pengajuan sumbernya.
        foreach (DB::table('pengajuan_v2')->whereNull('mitra_id')->orderBy('id')->get(['id']) as $p) {
            $this->evaluasi('pengajuan_v2', $p->id, [$pengajuanNama[$p->id] ?? ''], $mitra, $termasukTypo, $rencana, $perluKonfirmasi, $tanpaCocok, $tanpaNama);
        }

        $dokumen = DB::table('dokumen_kerjasama')->whereNull('mitra_id')
            ->orderBy('id')->get(['id', 'nomor_dokumen', 'snap_nama_mitra', 'keterangan', 'sumber_pengajuan_id']);
        foreach ($dokumen as $d) {
            // Beberapa sumber nama dicoba berurutan sampai ada yang cocok dengan sebuah mitra:
            // snapshot dokumen, nama di keterangan (data migrasi), lalu nama di pengajuan sumber.
            $namas = [trim((string) $d->snap_nama_mitra)];
            if ($d->keterangan && preg_match('/Mitra:\s*(.*?)(?:\s*\|\s*Bidang:|$)/i', (string) $d->keterangan, $m)) {
                $namas[] = trim($m[1]);
            }
            if ($d->sumber_pengajuan_id) {
                $namas[] = $pengajuanNama[$d->sumber_pengajuan_id] ?? '';
            }
            $this->evaluasi('dokumen_kerjasama', $d->id, $namas, $mitra, $termasukTypo, $rencana, $perluKonfirmasi, $tanpaCocok, $tanpaNama, $d->nomor_dokumen);
        }

        $baris = [];
        foreach ($rencana as $tabel => $items) {
            foreach ($items as $r) {
                $baris[] = [$tabel === 'dokumen_kerjasama' ? 'dokumen' : 'pengajuan', $r['id'], mb_strimwidth($r['label'], 0, 40, '…'), mb_strimwidth($r['nama'], 0, 36, '…'), '#'.$r['mitra_id'].' '.mb_strimwidth($r['mitra_nama'], 0, 30, '…').' ['.$r['alasan'].']'];
            }
        }

        if ($baris !== []) {
            $this->table(['Jenis', 'id', 'Dokumen/pengajuan', 'Nama tercatat', 'Disambung ke [alasan]'], $baris);
        }
        $jumlah = count($rencana['dokumen_kerjasama']) + count($rencana['pengajuan_v2']);
        $this->line(sprintf(
            'Ringkasan: %d akan disambung (%d dokumen, %d pengajuan) | %d perlu konfirmasi | %d tanpa mitra yang cocok | %d tanpa nama.',
            $jumlah, count($rencana['dokumen_kerjasama']), count($rencana['pengajuan_v2']), count($perluKonfirmasi), $tanpaCocok, $tanpaNama,
        ));

        if ($perluKonfirmasi !== []) {
            $this->newLine();
            $this->warn('Perlu konfirmasi (tidak disambung otomatis):');
            foreach ($perluKonfirmasi as $baris) {
                $this->line('  - '.$baris);
            }
        }

        if ($jumlah === 0) {
            $this->info('Tidak ada yang perlu disambung.');

            return self::SUCCESS;
        }

        if (! $apply) {
            $this->warn('Ini PRATINJAU. Jalankan lagi dengan --apply untuk menerapkan.');

            return self::SUCCESS;
        }

        $path = storage_path('app/cadangan-sambung-mitra-'.now()->format('Ymd-His').'.json');
        file_put_contents($path, json_encode(array_map(
            fn ($items) => array_map(fn ($r) => ['id' => $r['id'], 'mitra_id_sebelumnya' => null, 'mitra_id_baru' => $r['mitra_id']], $items),
            $rencana,
        ), JSON_PRETTY_PRINT));
        $this->line('Cadangan disimpan: '.$path);

        DB::transaction(function () use ($rencana) {
            foreach ($rencana as $tabel => $items) {
                foreach ($items as $r) {
                    DB::table($tabel)->where('id', $r['id'])->whereNull('mitra_id')->update(['mitra_id' => $r['mitra_id']]);
                }
            }
        });

        $this->info(sprintf('Selesai. %d dokumen + %d pengajuan disambungkan ke mitra.', count($rencana['dokumen_kerjasama']), count($rencana['pengajuan_v2'])));

        return self::SUCCESS;
    }

    /** @return array<int, string> id pengajuan => nama mitra yang tercatat di pengajuan itu. */
    private function namaPengajuan(): array
    {
        $kolomNama = Schema::hasColumn('pengajuan_v2', 'nama_mitra');
        $kolom = array_filter(['id', 'judul_pengajuan', $kolomNama ? 'nama_mitra' : null]);
        $hasil = [];
        foreach (DB::table('pengajuan_v2')->get($kolom) as $p) {
            $nama = $kolomNama ? trim((string) $p->nama_mitra) : '';
            if ($nama === '') {
                // Judul bawaan: "Pengajuan MOU - Nama Mitra".
                $nama = trim((string) preg_replace('/^Pengajuan\s+\w+\s*-\s*/i', '', (string) $p->judul_pengajuan));
            }
            $hasil[$p->id] = $nama;
        }

        return $hasil;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, object>  $mitra
     */
    private function evaluasi(string $tabel, int $id, array $namas, $mitra, bool $termasukTypo, array &$rencana, array &$perluKonfirmasi, int &$tanpaCocok, int &$tanpaNama, ?string $label = null): void
    {
        $namas = array_values(array_filter(array_map('trim', $namas), fn ($n) => $n !== '' && ! preg_match('/^tanpa mitra$/i', $n)));
        if ($namas === []) {
            $tanpaNama++;

            return;
        }

        // Pakai nama pertama yang punya mitra cocok; kalau tidak ada yang cocok, nama pertama
        // dipakai untuk laporan.
        $nama = $namas[0];
        $kandidat = [];
        foreach ($namas as $coba) {
            $kandidat = [];
            foreach ($mitra as $m) {
                $alasan = MitraNameMatcher::alasan($coba, $m->nama_mitra);
                if ($alasan !== null) {
                    $kandidat[] = ['mitra' => $m, 'alasan' => $alasan];
                }
            }
            if ($kandidat !== []) {
                $nama = $coba;
                break;
            }
        }

        if ($kandidat === []) {
            $tanpaCocok++;

            return;
        }

        $tag = ($tabel === 'dokumen_kerjasama' ? 'dokumen' : 'pengajuan').' #'.$id.' ('.$nama.')';

        if (count($kandidat) > 1) {
            $perluKonfirmasi[] = $tag.' cocok dengan >1 mitra: '.implode(', ', array_map(fn ($k) => '#'.$k['mitra']->id.' '.$k['mitra']->nama_mitra, $kandidat));

            return;
        }

        $pilih = $kandidat[0];
        if ($pilih['alasan'] === 'typo' && ! $termasukTypo) {
            $perluKonfirmasi[] = $tag.' mirip karena salah ketik dengan #'.$pilih['mitra']->id.' '.$pilih['mitra']->nama_mitra.' (pakai --termasuk-typo bila yakin)';

            return;
        }

        $rencana[$tabel][] = [
            'id' => $id,
            'label' => $label ?? ('pengajuan #'.$id),
            'nama' => $nama,
            'mitra_id' => $pilih['mitra']->id,
            'mitra_nama' => $pilih['mitra']->nama_mitra,
            'alasan' => $pilih['alasan'],
        ];
    }
}
