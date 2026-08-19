<?php
//ini script untuk membersihkan data internal/eksternal test yang sudah tidak relevan lagi di database dan file storage.
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$pengajuanIds = [639, 640, 641, 644, 645, 646, 647, 649, 651, 652, 653];
$dokumenIds = [1217, 1218, 1223, 1225, 1226, 1227];

$publicRoot = storage_path('app/public');

$backup = [
    'pengajuan_v2' => DB::table('pengajuan_v2')->whereIn('id', $pengajuanIds)->get(),
    'pengajuan_file' => DB::table('pengajuan_file')->whereIn('pengajuan_id', $pengajuanIds)->get(),
    'pengajuan_log' => DB::table('pengajuan_log')->whereIn('pengajuan_id', $pengajuanIds)->get(),
    'dokumen_kerjasama' => DB::table('dokumen_kerjasama')->whereIn('id', $dokumenIds)->get(),
    'dokumen_file' => DB::table('dokumen_file')->whereIn('dokumen_id', $dokumenIds)->get(),
    'dokumen_log' => DB::table('dokumen_log')->whereIn('dokumen_id', $dokumenIds)->get(),
];

$backupPath = storage_path('app/backup-internal-eksternal-testdata-' . date('Ymd-His') . '.json');
file_put_contents($backupPath, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
echo "Backup written to: $backupPath\n";

// Kumpulkan path file fisik SEBELUM baris DB-nya dihapus.
$filePaths = [];
foreach ($backup['pengajuan_file'] as $r) {
    if (!empty($r->path_file)) {
        $filePaths[] = $r->path_file;
    }
}
foreach ($backup['dokumen_file'] as $r) {
    if (!empty($r->path_file)) {
        $filePaths[] = $r->path_file;
    }
}
// dokumen_kerjasama.file (kolom legacy) juga bisa menyimpan path file langsung.
foreach ($backup['dokumen_kerjasama'] as $r) {
    if (!empty($r->file) && !str_starts_with((string) $r->file, 'http')) {
        $filePaths[] = $r->file;
    }
}
$filePaths = array_unique($filePaths);

$deletedCounts = [];

DB::beginTransaction();
try {
    $deletedCounts['dokumen_log'] = DB::table('dokumen_log')->whereIn('dokumen_id', $dokumenIds)->delete();
    $deletedCounts['dokumen_file'] = DB::table('dokumen_file')->whereIn('dokumen_id', $dokumenIds)->delete();
    $deletedCounts['dokumen_kerjasama'] = DB::table('dokumen_kerjasama')->whereIn('id', $dokumenIds)->delete();

    $deletedCounts['pengajuan_log'] = DB::table('pengajuan_log')->whereIn('pengajuan_id', $pengajuanIds)->delete();
    $deletedCounts['pengajuan_file'] = DB::table('pengajuan_file')->whereIn('pengajuan_id', $pengajuanIds)->delete();
    $deletedCounts['pengajuan_v2'] = DB::table('pengajuan_v2')->whereIn('id', $pengajuanIds)->delete();

    DB::commit();
} catch (\Throwable $e) {
    DB::rollBack();
    throw $e;
}

echo "\n== Baris terhapus ==\n";
foreach ($deletedCounts as $table => $count) {
    echo "$table: $count\n";
}

echo "\n== Menghapus file fisik ==\n";
$removed = 0;
$missing = 0;
foreach ($filePaths as $path) {
    $full = $publicRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, ltrim($path, '/'));
    if (is_file($full)) {
        unlink($full);
        $removed++;
        echo "  deleted: $path\n";
    } else {
        $missing++;
        echo "  not found (skip): $path\n";
    }
}
echo "File fisik dihapus: $removed, tidak ditemukan: $missing\n";
