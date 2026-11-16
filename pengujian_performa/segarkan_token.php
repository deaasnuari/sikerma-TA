<?php
// Membuat (bila belum ada) akun uji Locust + token BARU, lalu menulis env_uji.ps1.
// Token Sanctum kedaluwarsa setelah 480 menit (8 jam), jadi skrip ini dijalankan otomatis oleh jalankan_locust.ps1.
// Manual (dari folder pengujian_performa):  php segarkan_token.php
require __DIR__.'/../backend/vendor/autoload.php';
$app = require __DIR__.'/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;

$baris = ['# Token akun uji sementara (rahasia, jangan di-commit). Dibuat otomatis oleh segarkan_token.php.'];
foreach (['admin' => 'admin', 'internal' => 'internal', 'eksternal' => 'external'] as $peran => $role) {
    $tokens = [];
    for ($i = 1; $i <= 3; $i++) {
        $email = "uji-locust-{$peran}-{$i}@example.test";
        $u = User::where('email', $email)->first();
        if (! $u) {
            $f = User::factory();
            if ($role === 'admin') { $f = $f->admin(); }
            if ($role === 'external') { $f = $f->external(); }
            $u = $f->create(['email' => $email, 'name' => "Uji Locust {$peran} {$i}"]);
        }
        $u->tokens()->where('name', 'locust')->delete();   // buang token lama (sudah/akan kedaluwarsa)
        $tokens[] = $u->createToken('locust')->plainTextToken;
    }
    $baris[] = '$env:LOCUST_TOKEN_'.strtoupper($peran).'="'.implode(',', $tokens).'"';
}
file_put_contents(__DIR__.'/env_uji.ps1', implode("\r\n", $baris)."\r\n");

// Kumpulan token SEKALI PAKAI untuk skenario logout (logout menghapus token, jadi tiap logout butuh token sendiri).
// Satu akun, banyak token; disimpan satu per baris di token_logout.txt.
$emailLogout = 'uji-locust-logout-1@example.test';
$ul = User::where('email', $emailLogout)->first()
    ?: User::factory()->create(['email' => $emailLogout, 'name' => 'Uji Locust logout 1']);
$ul->tokens()->where('name', 'locust-logout')->delete();
$jumlahLogout = 300;
$daftar = [];
for ($i = 0; $i < $jumlahLogout; $i++) {
    $daftar[] = $ul->createToken('locust-logout')->plainTextToken;
}
file_put_contents(__DIR__.'/token_logout.txt', implode("\n", $daftar)."\n");
echo "Token akun uji diperbarui (berlaku 8 jam).\n";
