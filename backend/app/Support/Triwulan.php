<?php

namespace App\Support;

use Carbon\Carbon;
use DateTimeInterface;

/**
 * Satu sumber aturan pemetaan bulan -> triwulan dipakai bersama oleh:
 * - PengajuanAktivitas (Story & Aktivitas) untuk menentukan Monev triwulan mana yang
 *   otomatis "memiliki" sebuah aktivitas, dihitung dari tanggal aktivitasnya.
 * - LaporanPelaksanaan (Monev manual) untuk auto-isi tahun/triwulan saat pengirim tidak
 *   menyebutnya secara eksplisit.
 *
 * Aturan: Jan-Mar = I, Apr-Jun = II, Jul-Sep = III, Okt-Des = IV.
 */
class Triwulan
{
    public const LABELS = [
        1 => 'Triwulan I (Jan-Mar)',
        2 => 'Triwulan II (Apr-Jun)',
        3 => 'Triwulan III (Jul-Sep)',
        4 => 'Triwulan IV (Okt-Des)',
    ];

    public static function fromMonth(int $month): int
    {
        return (int) ceil(max(1, min(12, $month)) / 3);
    }

    /**
     * @return array{tahun: int, triwulan: int}|null
     */
    public static function fromDate(DateTimeInterface|string|null $date): ?array
    {
        if ($date === null || $date === '') {
            return null;
        }

        try {
            $carbon = $date instanceof DateTimeInterface ? Carbon::instance($date) : Carbon::parse($date);
        } catch (\Throwable) {
            return null;
        }

        return [
            'tahun' => (int) $carbon->format('Y'),
            'triwulan' => self::fromMonth((int) $carbon->format('n')),
        ];
    }

    public static function label(int $triwulan): string
    {
        return self::LABELS[$triwulan] ?? "Triwulan {$triwulan}";
    }
}
