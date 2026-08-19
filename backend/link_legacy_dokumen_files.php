<?php
//ini script untuk membersihkan data internal/eksternal test yang sudah tidak relevan lagi di database dan file storage.
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$dokumenDir = storage_path('app/public/dokumen');
$publicRoot = storage_path('app/public');

//ini daftar dokumen_kerjasama.id yang diketahui memiliki file yang sudah dihapus dari storage, tapi masih tersimpan di database.
$fuzzyOverrides = [
    371 => "11 MOU Pondok Pesantren Baitul Quran.pdf63bfc0e776b60.pdf",
    480 => "72 MOA SMK  Kal 1 Surabaya.pdf63cf71211404f.pdf",
    525 => "63 MOA APJII.pdf64056fa492efa.pdf",
    532 => "68  MOU SMK Maarif.pdf",
    528 => "13 MOA  PT Cyber Edu.pdf",
    611 => "72 MOA SMK9 .pdf",
    650 => "MOU MING CHI UNIVERSITY OF TECHHNOLOGY, TAIWAN .pdf646c6763f074d.pdf",
    634 => "77A MOA PT TDK.pdf",
    519 => "45 MOU Univ. Jember.pdf",
];

function resolveLegacyPath(string $rawValue, string $dokumenDir, string $publicRoot): ?string
{
    $val = ltrim($rawValue, '/');
    if ($val === '') {
        return null;
    }
    // Already resolves as-is relative to the public disk root (new-style uploads such as
    // "pengajuan/2026/08/x.pdf", or a value already prefixed with "dokumen/").
    if (is_file($publicRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $val))) {
        return $val;
    }
    // Legacy bare filename that actually lives under storage/app/public/dokumen/.
    if (is_file($dokumenDir . DIRECTORY_SEPARATOR . $val)) {
        return 'dokumen/' . $val;
    }
    return null;
}

$stats = [
    'dokumen_kerjasama' => ['already_ok' => 0, 'fixed' => 0, 'fuzzy_fixed' => 0, 'still_broken' => []],
    'dokumen_file' => ['already_ok' => 0, 'fixed' => 0, 'fuzzy_fixed' => 0, 'still_broken' => []],
];

DB::beginTransaction();
try {
    foreach (DB::table('dokumen_kerjasama')->select('id', 'nomor_dokumen', 'file')->get() as $r) {
        $resolved = resolveLegacyPath((string) $r->file, $dokumenDir, $publicRoot);
        if ($resolved !== null) {
            if ($resolved !== $r->file) {
                DB::table('dokumen_kerjasama')->where('id', $r->id)->update(['file' => $resolved, 'updated_at' => now()]);
                $stats['dokumen_kerjasama']['fixed']++;
            } else {
                $stats['dokumen_kerjasama']['already_ok']++;
            }
            continue;
        }

        if (isset($fuzzyOverrides[$r->id]) && is_file($dokumenDir . DIRECTORY_SEPARATOR . $fuzzyOverrides[$r->id])) {
            DB::table('dokumen_kerjasama')->where('id', $r->id)->update([
                'file' => 'dokumen/' . $fuzzyOverrides[$r->id],
                'updated_at' => now(),
            ]);
            $stats['dokumen_kerjasama']['fuzzy_fixed']++;
            continue;
        }

        $stats['dokumen_kerjasama']['still_broken'][] = "id={$r->id} nomor_dokumen={$r->nomor_dokumen} file=\"{$r->file}\"";
    }

    foreach (DB::table('dokumen_file')->select('id', 'dokumen_id', 'path_file')->get() as $r) {
        $resolved = resolveLegacyPath((string) $r->path_file, $dokumenDir, $publicRoot);
        if ($resolved !== null) {
            if ($resolved !== $r->path_file) {
                DB::table('dokumen_file')->where('id', $r->id)->update(['path_file' => $resolved, 'updated_at' => now()]);
                $stats['dokumen_file']['fixed']++;
            } else {
                $stats['dokumen_file']['already_ok']++;
            }
            continue;
        }

        if (isset($fuzzyOverrides[$r->dokumen_id]) && is_file($dokumenDir . DIRECTORY_SEPARATOR . $fuzzyOverrides[$r->dokumen_id])) {
            DB::table('dokumen_file')->where('id', $r->id)->update([
                'path_file' => 'dokumen/' . $fuzzyOverrides[$r->dokumen_id],
                'updated_at' => now(),
            ]);
            $stats['dokumen_file']['fuzzy_fixed']++;
            continue;
        }

        $stats['dokumen_file']['still_broken'][] = "id={$r->id} dokumen_id={$r->dokumen_id} path_file=\"{$r->path_file}\"";
    }

    DB::commit();
} catch (\Throwable $e) {
    DB::rollBack();
    throw $e;
}

foreach ($stats as $table => $s) {
    echo "== $table ==\n";
    echo "Already correct: {$s['already_ok']}\n";
    echo "Fixed (added 'dokumen/' prefix): {$s['fixed']}\n";
    echo "Fixed via high-confidence fuzzy match: {$s['fuzzy_fixed']}\n";
    echo "Still broken: " . count($s['still_broken']) . "\n";
    foreach ($s['still_broken'] as $line) {
        echo "  - $line\n";
    }
    echo "\n";
}
