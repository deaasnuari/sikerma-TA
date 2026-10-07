<?php

namespace App\Support;

use Carbon\Carbon;
use DateTimeInterface;
use Throwable;

/**
 * Satu sumber aturan status kerjasama (active/expiring/archived), dipakai oleh
 * DokumenKerjasama::status_efektif supaya jumlah "Kadaluarsa" SELALU sama di semua
 * halaman (Rekap Data, Monitoring, Status & Progres Kerjasama, Arsip Dokumen).
 *
 * Sebelum ada ini, tiap halaman punya cara hitung sendiri-sendiri yang beda:
 * - Rekap Data & dashboard admin baca kolom `status_siklus` apa adanya dari
 *   database — kolom ini cuma keisi manual (saat dibuat / saat admin arsip
 *   manual) dan TIDAK pernah otomatis di-update saat tanggal_berakhir lewat,
 *   jadi gampang basi (dokumen yang sudah lewat tanggal berakhirnya bisa masih
 *   tercatat 'active').
 * - Monitoring & dashboard Pimpinan menghitung ULANG dari tanggal_berakhir vs
 *   tanggal hari ini, sama sekali mengabaikan status_siklus.
 * - Arsip Dokumen menghitung ULANG lagi dengan jendela "akan berakhir" yang
 *   beda (3 bulan kalender, bukan 90 hari tetap).
 *
 * Aturan final (dipakai bersama): sebuah dokumen dianggap 'archived' (Kadaluarsa)
 * kalau SUDAH diarsipkan manual ATAU tanggal_berakhir-nya sudah lewat — mengikuti
 * definisi bisnis "kerjasama yang sudah kadaluarsa masuk ke Arsip Dokumen".
 */
class KerjasamaStatus
{
    public const EXPIRING_WINDOW_DAYS = 90;

    /**
     * Target status_siklus murni dari tanggal_berakhir (tanpa memperhatikan arsip manual) —
     * aturan yang dipakai sikerma:sinkron-status-siklus dan sikerma:gabung-dokumen-ganda.
     *
     * @param  string  $hariIni  Y-m-d
     * @param  string  $batasAkanBerakhir  Y-m-d (hari ini + ambang hari)
     */
    public static function siklusDariTanggal(?string $tanggalBerakhir, string $hariIni, string $batasAkanBerakhir): string
    {
        $tanggal = $tanggalBerakhir ? substr($tanggalBerakhir, 0, 10) : null;

        if ($tanggal === null || $tanggal === '') {
            return 'active';
        }

        if ($tanggal < $hariIni) {
            return 'archived';
        }

        if ($tanggal <= $batasAkanBerakhir) {
            return 'expiring';
        }

        return 'active';
    }

    public static function fromTanggalBerakhir(DateTimeInterface|string|null $tanggalBerakhir, ?string $statusSiklus): string
    {
        // Diarsipkan manual (apa pun alasannya, lihat kolom alasan_arsip) selalu
        // dianggap archived, terlepas dari tanggal_berakhir-nya.
        if ($statusSiklus === 'archived') {
            return 'archived';
        }

        if ($tanggalBerakhir === null || $tanggalBerakhir === '') {
            return 'active';
        }

        try {
            $berakhir = $tanggalBerakhir instanceof DateTimeInterface
                ? Carbon::instance($tanggalBerakhir)->startOfDay()
                : Carbon::parse($tanggalBerakhir)->startOfDay();
        } catch (Throwable) {
            return 'active';
        }

        $today = Carbon::now()->startOfDay();

        if ($berakhir->lt($today)) {
            return 'archived';
        }

        if ($berakhir->lte($today->copy()->addDays(self::EXPIRING_WINDOW_DAYS))) {
            return 'expiring';
        }

        return 'active';
    }
}
