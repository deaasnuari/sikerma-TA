<?php

namespace App\Services;

use App\Models\MasterMitra;
use App\Support\MitraNameMatcher;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Satu aturan pencocokan nama mitra untuk semua alur yang bisa membuat baris
 * master_mitra (registrasi eksternal, pengajuan, upsert admin) — supaya satu
 * instansi tidak masuk Data Kemitraan dua kali hanya karena beda penulisan.
 *
 * Nama dinormalkan: huruf kecil, lalu semua spasi & tanda baca dibuang, jadi
 * "PT. Berkah Jaya", "PT Berkah  Jaya" dan "pt berkah jaya" dianggap sama. Kecocokan
 * longgar (PT/CV/Tbk diabaikan, salah ketik kecil) dipakai sebagai cadangan — lihat
 * MitraNameMatcher.
 *
 * Catatan: tambah mitra manual di halaman Data Kemitraan (MasterMitraController::store)
 * sengaja TIDAK memakai ini — admin tetap boleh membuat baris terpisah.
 */
class MasterMitraResolver
{
    public static function normalize(?string $nama): string
    {
        return preg_replace('/[^\p{L}\p{N}]+/u', '', mb_strtolower(trim((string) $nama))) ?? '';
    }

    public function findByName(?string $nama, ?int $exceptId = null): ?MasterMitra
    {
        $key = self::normalize($nama);
        if ($key === '') {
            return null;
        }

        // Normalisasi tidak bisa dilakukan portabel di SQL (pgsql vs sqlite), jadi
        // dicocokkan di PHP. Hanya kolom id & nama yang dibaca; datanya ratusan baris.
        // Kecocokan persis (setelah tanda baca dibuang) diutamakan; kalau tidak ada, pakai
        // kecocokan longgar (abaikan PT/CV/Tbk/..., atau salah ketik kecil — lihat
        // MitraNameMatcher) supaya satu instansi tidak masuk dua kali.
        $exactId = null;
        $looseId = null;
        DB::table('master_mitra')->select('id', 'nama_mitra')->orderBy('id')
            ->chunk(500, function ($rows) use ($key, $nama, $exceptId, &$exactId, &$looseId) {
                foreach ($rows as $row) {
                    if ($exceptId !== null && (int) $row->id === $exceptId) {
                        continue;
                    }
                    if (self::normalize($row->nama_mitra) === $key) {
                        $exactId = $row->id;

                        return false;
                    }
                    if ($looseId === null && MitraNameMatcher::sama($nama, $row->nama_mitra)) {
                        $looseId = $row->id;
                    }
                }

                return true;
            });

        $matchId = $exactId ?? $looseId;

        return $matchId ? MasterMitra::find($matchId) : null;
    }

    /**
     * Mitra yang namanya MIRIP (bukan pasti sama) — untuk peringatan di form Data Kemitraan.
     *
     * @return object[] baris dengan kolom id, nama_mitra, kode_mitra
     */
    public function findMirip(?string $nama, ?int $exceptId = null, int $batas = 5): array
    {
        $hasil = [];
        DB::table('master_mitra')->select('id', 'nama_mitra', 'kode_mitra')->orderBy('id')
            ->chunk(500, function ($rows) use ($nama, $exceptId, $batas, &$hasil) {
                foreach ($rows as $row) {
                    if ($exceptId !== null && (int) $row->id === $exceptId) {
                        continue;
                    }
                    if (MitraNameMatcher::mirip($nama, $row->nama_mitra)) {
                        $hasil[] = $row;
                        if (count($hasil) >= $batas) {
                            return false;
                        }
                    }
                }

                return true;
            });

        return $hasil;
    }

    /**
     * Mitra dari registrasi eksternal: pakai mitra yang dipilih (mitraId) atau yang
     * namanya cocok; kalau sudah ada, HANYA kolom yang masih kosong yang diisi —
     * data yang sudah diisi admin tidak ditimpa, dan pendaftar dicatat sebagai
     * kontak tambahan di kontak_mitra. Kalau belum ada, buat baru (pendaftar jadi
     * kontak utama).
     */
    public function resolveForRegistration(?int $mitraId, string $nama, array $data, ?int $userId = null): MasterMitra
    {
        $mitra = ($mitraId ? MasterMitra::find($mitraId) : null) ?? $this->findByName($nama);

        if ($mitra) {
            $this->fillEmpty($mitra, $data);
            $this->addKontak($mitra, $data, $userId);

            return $mitra;
        }

        $mitra = MasterMitra::create(array_merge(['nama_mitra' => trim($nama), 'aktif' => true], $this->withoutEmpty($data)));
        $this->linkOrphanedRecords($mitra);

        return $mitra;
    }

    public function fillEmpty(MasterMitra $mitra, array $data): void
    {
        foreach ($this->withoutEmpty($data) as $field => $value) {
            if (trim((string) $mitra->getAttribute($field)) === '') {
                $mitra->setAttribute($field, $value);
            }
        }

        if ($mitra->isDirty()) {
            $mitra->save();
        }
    }

    /**
     * Data mitra dari sebuah pengajuan: TIDAK menimpa Data Kemitraan. Kolom yang masih kosong diisi,
     * sedangkan PIC yang berbeda dari kontak utama dicatat sebagai kontak tambahan (tanpa dobel).
     * Mengubah data yang sudah ada tetap lewat Data Kemitraan (admin).
     */
    public function lengkapiDariPengajuan(MasterMitra $mitra, array $data): void
    {
        $this->fillEmpty($mitra, $data);
        $this->addKontak($mitra, $data, null);
    }

    /**
     * Catat pendaftar sebagai kontak mitra, kecuali dia sudah jadi kontak utama
     * (mis. baru saja mengisi kolom kontak utama yang kosong) atau emailnya sudah
     * tercatat sebagai kontak mitra ini.
     */
    private function addKontak(MasterMitra $mitra, array $data, ?int $userId): void
    {
        $email = strtolower(trim((string) ($data['email_kontak_utama'] ?? '')));
        $nama = trim((string) ($data['nama_kontak_utama'] ?? ''));
        if ($nama === '' && $email === '') {
            return;
        }

        if ($email !== '' && $email === strtolower(trim((string) $mitra->email_kontak_utama))) {
            return;
        }

        if ($email !== '' && $mitra->kontak()->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            return;
        }

        // Tanpa email, orang yang sama dikenali dari nama (kontak utama atau kontak tambahan).
        if ($email === '' && $nama !== '') {
            $namaKecil = mb_strtolower($nama);
            if ($namaKecil === mb_strtolower(trim((string) $mitra->nama_kontak_utama))
                || $mitra->kontak()->whereRaw('LOWER(nama) = ?', [$namaKecil])->exists()) {
                return;
            }
        }

        $mitra->kontak()->create([
            'user_id' => $userId,
            'nama' => $nama !== '' ? $nama : $email,
            'jabatan' => $data['jabatan_kontak_utama'] ?? null,
            'email' => $email !== '' ? $email : null,
            'telepon' => $data['telepon_kontak_utama'] ?? null,
        ]);
    }

    /**
     * Menautkan pengajuan/dokumen yang sudah ada tapi belum punya mitra_id (karena
     * dulu mitranya belum ada di master_mitra) ke mitra yang baru dibuat.
     */
    public function linkOrphanedRecords(MasterMitra $mitra): void
    {
        $namaNormalized = strtolower(trim((string) $mitra->nama_mitra));
        if ($namaNormalized === '') {
            return;
        }

        $hasPengajuanMitraId = Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'mitra_id');
        $hasDokumenMitraId = Schema::hasTable('dokumen_kerjasama') && Schema::hasColumn('dokumen_kerjasama', 'mitra_id');

        if ($hasPengajuanMitraId) {
            DB::table('pengajuan_v2')
                ->whereNull('mitra_id')
                ->whereRaw('LOWER(TRIM(nama_mitra)) = ?', [$namaNormalized])
                ->update(['mitra_id' => $mitra->id]);
        }

        if ($hasDokumenMitraId) {
            // Dokumen yang namanya diketik manual langsung (bukan hasil approve pengajuan).
            DB::table('dokumen_kerjasama')
                ->whereNull('mitra_id')
                ->whereRaw('LOWER(TRIM(snap_nama_mitra)) = ?', [$namaNormalized])
                ->update(['mitra_id' => $mitra->id]);

            // Dokumen yang berasal dari pengajuan, tapi pengajuan-nya belum punya mitra_id.
            if ($hasPengajuanMitraId && Schema::hasColumn('dokumen_kerjasama', 'sumber_pengajuan_id')) {
                DB::table('dokumen_kerjasama as d')
                    ->join('pengajuan_v2 as p', 'p.id', '=', 'd.sumber_pengajuan_id')
                    ->whereNull('d.mitra_id')
                    ->where('p.mitra_id', $mitra->id)
                    ->update(['d.mitra_id' => $mitra->id]);
            }
        }
    }

    private function withoutEmpty(array $data): array
    {
        return array_filter($data, static fn ($value) => $value !== null && trim((string) $value) !== '');
    }
}
