<?php
// Hapus akun uji Locust beserta token & notifikasinya. Jalankan dari folder backend:
//   php ..\pengujian_performa\hapus_akun_uji.php
require __DIR__.'/../backend/vendor/autoload.php';
$app = require __DIR__.'/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\User;
$ids = User::where('email', 'like', 'uji-locust-%@example.test')->pluck('id');
DB::table('personal_access_tokens')->where('tokenable_type', User::class)->whereIn('tokenable_id', $ids)->delete();
DB::table('notifikasi')->whereIn('user_id', $ids)->delete();
User::whereIn('id', $ids)->delete();
echo "akun uji tersisa: ".User::where('email', 'like', 'uji-locust-%@example.test')->count()."\n";
