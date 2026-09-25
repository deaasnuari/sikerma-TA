<?php

namespace App\Services;

use App\Models\MasterMitra;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Satu aturan pencocokan nama mitra untuk semua alur yang bisa membuat baris
 * master_mitra (registrasi eksternal, pengajuan, upsert admin) — supaya satu
 * instansi tidak masuk Data Kemitraan dua kali hanya karena beda penulisan.
 *
 * Nama dinormalkan: huruf kecil, lalu semua spasi & tanda baca dibuang, jadi
 * "PT. Berkah Jaya", "PT Berkah  Jaya" dan "pt berkah jaya" dianggap sama.
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

    public function findByName(?string $nama): ?MasterMitra
    {
        $key = self::normalize($nama);
        if ($key === '') {
            return null;
        }

        // Normalisasi tidak bisa dilakukan portabel di SQL (pgsql vs sqlite), jadi
        // dicocokkan di PHP. Hanya kolom id & nama yang dibaca; datanya ratusan baris.
        $matchId = null;
        DB::table('master_mitra')->select('id', 'nama_mitra')->orderBy('id')
            ->chunk(500, function ($rows) use ($key, &$matchId) {
                foreach ($rows as $row) {
                    if (self::normalize($row->nama_mitra) === $key) {
                        $matchId = $row->id;

                        return false;
                    }
                }

                return true;
            });

        return $matchId ? MasterMitra::find($matchId) : null;
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
