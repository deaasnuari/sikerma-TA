<?php

namespace App\Support;

/**
 * Satu pengajuan boleh memilih beberapa jenis dokumen sekaligus (mis. MoU dan MoA ditandatangani
 * bersamaan) dan tetap menjadi SATU pengajuan / SATU dokumen kerja sama.
 *
 * jenis_dokumen tetap berisi jenis UTAMA (yang pertama dipilih) supaya validasi, penomoran, filter,
 * dan statistik yang sudah ada tidak berubah. Daftar lengkapnya disimpan di kolom JSON
 * jenis_dokumen_list — NULL bila hanya satu jenis.
 */
class JenisDokumenSelection
{
    public const JENIS = ['MOU', 'MOA', 'IA', 'LAINNYA'];

    /** Aturan validasi untuk endpoint yang menerima pilihan jenis majemuk. */
    public static function rules(): array
    {
        return [
            'jenis_dokumen_list' => ['nullable', 'array'],
            'jenis_dokumen_list.*' => ['string', 'distinct:ignore_case', 'in:'.implode(',', self::JENIS)],
        ];
    }

    /** Jenis berkas yang termasuk dokumen kerja sama (dihitung di dashboard). */
    public const JENIS_BERKAS_UTAMA = ['MOU', 'MOA', 'IA'];

    /** Jenis berkas pendukung (bukan dokumen kerja sama, tidak dihitung di dashboard). */
    public const JENIS_BERKAS_PENDUKUNG = ['TOR', 'KAK', 'PROPOSAL', 'LAPORAN_KEGIATAN', 'LAINNYA'];

    /**
     * Jenis untuk satu berkas: MoU / MoA / IA, atau salah satu jenis pendukung (TOR, KAK, Proposal, Laporan
     * Kegiatan, Lainnya). Huruf besar/kecil dan spasi ("Laporan Kegiatan") dinormalkan; null bila kosong
     * atau tidak dikenal.
     */
    public static function untukBerkas(mixed $jenis): ?string
    {
        $jenis = str_replace([' ', '-'], '_', strtoupper(trim((string) $jenis)));

        return in_array($jenis, array_merge(self::JENIS_BERKAS_UTAMA, self::JENIS_BERKAS_PENDUKUNG), true) ? $jenis : null;
    }

    /** Berkas dengan jenis ini disimpan sebagai dokumen pendukung, bukan dokumen final. */
    public static function adalahPendukung(?string $jenisBerkas): bool
    {
        return $jenisBerkas !== null && in_array($jenisBerkas, self::JENIS_BERKAS_PENDUKUNG, true);
    }

    /**
     * Terapkan pilihan majemuk ke $validated: jenis_dokumen = jenis pertama, jenis_dokumen_list = daftar
     * lengkap (null bila cuma satu). Tidak melakukan apa pun bila klien tidak mengirim daftar.
     *
     * @param  array<string, mixed>  $validated
     */
    public static function apply(array &$validated): void
    {
        if (! array_key_exists('jenis_dokumen_list', $validated)) {
            return;
        }

        $list = array_values(array_unique(array_map(
            fn ($jenis) => strtoupper((string) $jenis),
            (array) $validated['jenis_dokumen_list']
        )));

        if ($list === []) {
            $validated['jenis_dokumen_list'] = null;

            return;
        }

        $validated['jenis_dokumen'] = $list[0];
        $validated['jenis_dokumen_list'] = count($list) > 1 ? $list : null;
    }
}
