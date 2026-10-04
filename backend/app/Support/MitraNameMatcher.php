<?php

namespace App\Support;

/**
 * Aturan "nama mitra ini sama dengan nama itu" yang lebih longgar dari sekadar membuang
 * tanda baca — dipakai untuk menggabungkan mitra ganda dan mencocokkan mitra saat registrasi.
 *
 * Dua nama dianggap SAMA kalau:
 *  1. kunci kanoniknya sama — huruf kecil, tanda baca/spasi diabaikan, dan bentuk badan usaha
 *     (PT, CV, Tbk, Persero, Ltd, Pte, ...) diabaikan; ATAU
 *  2. beda karena typo — jumlah kata sama dan tiap kata yang berbeda hanya selisih sedikit
 *     huruf. Dibuat sengaja konservatif supaya instansi yang memang berbeda tidak ikut
 *     tergabung: kata pendek harus persis (mis. "SMOE" vs "SOME"), kata yang mengandung angka
 *     harus persis (SMK Negeri 1 vs 4), dan kata nama tempat yang selisih 2 huruf
 *     (Padang vs Malang) tidak dianggap typo.
 */
class MitraNameMatcher
{
    /** Bentuk badan usaha yang tidak membedakan instansi. */
    private const BADAN_USAHA = [
        'pt', 'cv', 'ud', 'pd', 'tbk', 'persero', 'perseroan', 'terbatas',
        'ltd', 'limited', 'co', 'inc', 'corp', 'corporation', 'sdn', 'bhd', 'pte', 'gmbh', 'llc',
    ];

    /**
     * Pasangan nama yang sudah dipastikan admin sebagai instansi yang sama, tapi terlalu jauh
     * bedanya untuk ditangkap aturan otomatis (kata terlalu pendek, singkatan, atau kata
     * yang dibalik). Dibandingkan lewat kunci kanonik, jadi tidak tergantung ID baris.
     */
    private const SAMA_MANUAL = [
        ['Bnk BTN Syariah', 'Bank BTN Syariah'],
        ['PT. oryber Edu inkor (CEI)', 'PT Cyber Edu Inkor (CEI)'],
        ['PT. Goto gojek tokopedia tb', 'PT Goto Gojek Tokopedia Tbk'],
        ['APPLENESIA – APPLE SERVICE CENTER SPECIALIST', 'Applenesia - Apple Servis Center Specialist'],
        ['SEKOLAH TINGGI IILMU EKONOMI BENTARA PERSADA', 'Sekolah Tinggi Ilmu Ekonomi Bentara Persada'],
        ['PT. KB BANK INDONESIA', 'PT Bank KB Indonesia Tbk'],
        ['PT. SOME Indonesia', 'PT SMOE Indonesia'],
        ['Yayasan Embun Pelangi', 'Yayasan Embun Pelangi Kota Batam'],
        ['infineon', 'PT Infineon Technologies Batam'],
        ['Perpustakaan Nasional', 'Perpustakaan Nasional Republik Indonesia'],
        ['PT. WIK FAR EAST BATAM', 'PT WIK Far East'],
        ['Politeknik Pertanian Negeri Pangkajene Kepulauan', 'Politeknik Pertanian Negeri Pangkajene'],
        ['4Happy Studio (PT. Budaya Digital Indonesia)', 'PT Budaya Digital Indonesia'],
        // Satu instansi yang tertulis lima kali.
        [
            'PII Cabang Kota Batam',
            'PII Cabang Batam Kota',
            'Persatuan Insinyur Indonesia Cabang Batam',
            'PERSATUAN INSINYUR INDONESIA PENGURUS CABANG BATAM',
            'Persatuan Insinyur Indonesia (PII) Cabang Kota Batam',
        ],
        [
            'Direktorat Pembelajaran dan Kemahasiswaan. Direktorat Jendral Pendidikan Tinggi, Riset dan Teknologi',
            'Direktorat Pembelajaran dan Kemahasiswaan Direktorat Jendral Pendidikan Tinggi',
            'Direktorat Pembelajaran dan Kemahasiswaan',
        ],
    ];

    /**
     * Kata yang tidak membedakan instansi saat mencari nama yang MIRIP (wilayah umum, kata
     * generik perusahaan). Kata jenis instansi (universitas, politeknik, yayasan, dinas, ...)
     * sengaja TIDAK di sini supaya "Universitas Jambi" dan "Politeknik Jambi" tidak dianggap mirip.
     */
    private const KATA_UMUM = [
        'batam', 'kota', 'indonesia', 'republik', 'provinsi', 'kepulauan', 'riau',
        'technologies', 'technology', 'teknologi', 'group', 'grup', 'international', 'internasional',
        'company', 'corporation', 'limited',
    ];

    /** @var array<string, int>|null kunci kanonik => nomor pasangan di SAMA_MANUAL */
    private static ?array $petaManual = null;

    /** @return string[] kata-kata nama (huruf kecil, tanpa tanda baca & badan usaha). */
    public static function tokens(?string $nama): array
    {
        $kecil = mb_strtolower(trim((string) $nama));
        $kata = preg_split('/[^\p{L}\p{N}]+/u', $kecil, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        // "Sekolah SMK Pertiwi Batam" = "SMK Pertiwi Batam": kata "Sekolah" di depan nama sekolah
        // (SMK/SMA/SMP/SD) tidak membedakan. "Sekolah Tinggi ..." tidak terkena aturan ini.
        if (count($kata) > 1 && $kata[0] === 'sekolah' && in_array($kata[1], ['smk', 'sma', 'smp', 'sd'], true)) {
            array_shift($kata);
        }

        $inti = array_values(array_filter($kata, fn ($k) => ! in_array($k, self::BADAN_USAHA, true)));

        // Nama yang isinya cuma badan usaha (mis. "PT") jangan jadi kosong.
        return $inti !== [] ? $inti : $kata;
    }

    public static function canonicalKey(?string $nama): string
    {
        return implode('', self::tokens($nama));
    }

    public static function sama(?string $a, ?string $b): bool
    {
        $keyA = self::canonicalKey($a);
        $keyB = self::canonicalKey($b);

        if ($keyA === '' || $keyB === '') {
            return false;
        }

        return $keyA === $keyB
            || self::samaTetap($a, $b)
            || self::samaKarenaTypo(self::tokens($a), self::tokens($b));
    }

    /**
     * Kunci sekolah "jenis|nomor|kota" untuk nama bergaya sekolah negeri bernomor, mis.
     * "SMKN 1 Tanjung Pinang", "SMK Negeri 1 Tanjungpinang" dan "Sekolah SMK Negeri 1 Tanjung
     * Pinang" semuanya jadi "smk|1|tanjungpinang". null kalau bukan nama sekolah bernomor
     * (harus ada tepat satu jenis SMK/SMA/SMP/SD, satu angka, dan nama kota).
     */
    public static function kunciSekolah(?string $nama): ?string
    {
        $kecil = mb_strtolower(trim((string) $nama));
        // "smkn"/"sman" -> "smk n"/"sma n"; "n3" -> "n 3".
        $kecil = preg_replace('/(?<![\p{L}\p{N}])(smk|sma|smp)n(?![\p{L}\p{N}])/u', '$1 n', $kecil) ?? $kecil;
        $kata = preg_split('/[^\p{L}\p{N}]+/u', $kecil, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        $jenis = [];
        $angka = [];
        $kota = [];
        foreach ($kata as $k) {
            if (in_array($k, ['sekolah', 'negeri', 'n', 'kota'], true)) {
                continue;
            }
            if (in_array($k, ['smk', 'sma', 'smp', 'sd'], true)) {
                $jenis[] = $k;
            } elseif (ctype_digit($k)) {
                $angka[] = $k;
            } else {
                $kota[] = $k;
            }
        }

        if (count($jenis) !== 1 || count($angka) !== 1 || $kota === []) {
            return null;
        }

        return $jenis[0].'|'.ltrim($angka[0], '0').'|'.implode('', $kota);
    }

    /** True kalau kedua nama sekolah yang sama (jenis, nomor, dan kota sama). */
    public static function samaSekolah(?string $a, ?string $b): bool
    {
        $kunciA = self::kunciSekolah($a);

        return $kunciA !== null && $kunciA === self::kunciSekolah($b);
    }

    /** True kalau sama karena ditetapkan manual atau karena sekolah yang sama (bukan tebakan typo). */
    public static function samaTetap(?string $a, ?string $b): bool
    {
        return self::samaManual($a, $b) || self::samaSekolah($a, $b);
    }

    /**
     * "Mirip" = BUKAN pasti sama, tapi layak diperingatkan: setelah kata umum dibuang, semua
     * kata nama yang lebih pendek ada di nama yang lebih panjang (mis. "Infineon" dan
     * "PT Infineon Technologies Batam"). Nama pendek harus punya minimal satu kata >= 5 huruf
     * supaya singkatan pendek tidak memicu peringatan sembarangan.
     */
    public static function mirip(?string $a, ?string $b): bool
    {
        $setA = array_values(array_diff(self::tokens($a), self::KATA_UMUM));
        $setB = array_values(array_diff(self::tokens($b), self::KATA_UMUM));
        if ($setA === [] || $setB === []) {
            return false;
        }

        [$kecil, $besar] = count($setA) <= count($setB) ? [$setA, $setB] : [$setB, $setA];
        if (array_diff($kecil, $besar) !== []) {
            return false;
        }

        foreach ($kecil as $kata) {
            if (mb_strlen($kata) >= 5 && ! ctype_digit($kata)) {
                return true;
            }
        }

        return false;
    }

    /** True kalau kedua nama termasuk satu pasangan di SAMA_MANUAL. */
    public static function samaManual(?string $a, ?string $b): bool
    {
        if (self::$petaManual === null) {
            self::$petaManual = [];
            foreach (self::SAMA_MANUAL as $nomor => $pasangan) {
                foreach ($pasangan as $nama) {
                    self::$petaManual[self::canonicalKey($nama)] = $nomor;
                }
            }
        }

        $grupA = self::$petaManual[self::canonicalKey($a)] ?? null;
        $grupB = self::$petaManual[self::canonicalKey($b)] ?? null;

        return $grupA !== null && $grupA === $grupB;
    }

    /** Alasan dua nama dianggap sama (untuk pratinjau penggabungan), atau null kalau tidak sama. */
    public static function alasan(?string $a, ?string $b): ?string
    {
        $keyA = self::canonicalKey($a);
        $keyB = self::canonicalKey($b);

        if ($keyA === '' || $keyB === '') {
            return null;
        }
        if ($keyA === $keyB) {
            return 'tanda baca/badan usaha';
        }

        if (self::samaManual($a, $b)) {
            return 'ditetapkan manual';
        }
        if (self::samaSekolah($a, $b)) {
            return 'sekolah sama (jenis+nomor+kota)';
        }

        return self::samaKarenaTypo(self::tokens($a), self::tokens($b)) ? 'typo' : null;
    }

    /**
     * @param  string[]  $a
     * @param  string[]  $b
     */
    private static function samaKarenaTypo(array $a, array $b): bool
    {
        if (count($a) !== count($b) || count($a) < 2) {
            return false;
        }

        $berbeda = 0;
        foreach ($a as $i => $kata) {
            if ($kata === $b[$i]) {
                continue;
            }
            if (! self::katasamaTypo($kata, $b[$i])) {
                return false;
            }
            $berbeda++;
        }

        // Paling banyak 2 kata yang salah ketik; lebih dari itu terlalu berisiko.
        return $berbeda >= 1 && $berbeda <= 2;
    }

    private static function katasamaTypo(string $x, string $y): bool
    {
        // Kata dengan angka harus persis (SMK Negeri 1 != SMK Negeri 4).
        if (preg_match('/\d/', $x) || preg_match('/\d/', $y)) {
            return false;
        }

        $panjang = min(mb_strlen($x), mb_strlen($y));
        $jarak = levenshtein($x, $y);

        // Kata sedang (>=5 huruf): selisih 1 huruf. Kata panjang (>=8 huruf): selisih sampai 2.
        // Kata pendek wajib persis supaya singkatan/nama berbeda tidak tergabung.
        if ($panjang >= 8) {
            return $jarak <= 2;
        }

        return $panjang >= 5 && $jarak <= 1;
    }
}
