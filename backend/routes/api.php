<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\CarouselImageController;
use App\Http\Controllers\DokumenKerjasamaController;
use App\Http\Controllers\MasterMitraController;
use App\Http\Controllers\MasterNegaraController;
use App\Http\Controllers\MasterRuangLingkupController;
use App\Http\Controllers\OtpController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\MasterUnitProdiController;
use App\Http\Controllers\CatatanAdminController;
use App\Http\Controllers\PengajuanController;
use App\Http\Controllers\PengajuanAktivitasController;
use App\Http\Controllers\LaporanPelaksanaanController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/login-kampus', [AuthController::class, 'loginLdap']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/reset-password', [AuthController::class, 'resetPassword']);

Route::middleware('auth:sanctum')->group(function () {
	Route::post('/logout', [AuthController::class, 'logout']);
	Route::get('/me', [AuthController::class, 'me']);

	Route::apiResource('/admin/users', AdminUserController::class)->only(['index', 'store', 'update', 'destroy']);
	Route::patch('/admin/users/{user}/approval-status', [AdminUserController::class, 'updateApprovalStatus']);

	// Master Unit/Prodi routes
	Route::get('/master/unit-prodi/tree', [MasterUnitProdiController::class, 'tree']);
	Route::apiResource('/master/unit-prodi', MasterUnitProdiController::class);
	Route::apiResource('/master/mitra', MasterMitraController::class);
	Route::apiResource('/master/negara', MasterNegaraController::class)
		->parameters(['negara' => 'negara']);
	Route::apiResource('/master/ruang-lingkup', MasterRuangLingkupController::class)
		->parameters(['ruang-lingkup' => 'ruang_lingkup']);

	Route::apiResource('/pengajuan', PengajuanController::class);
	Route::patch('/pengajuan/{pengajuan}/tahapan', [PengajuanController::class, 'updateTahapan']);
	Route::get('/pengajuan-aktivitas', [PengajuanAktivitasController::class, 'index']);
	Route::post('/pengajuan-aktivitas', [PengajuanAktivitasController::class, 'store']);
	Route::put('/pengajuan-aktivitas/{pengajuan_aktivitas}', [PengajuanAktivitasController::class, 'update']);
	Route::delete('/pengajuan-aktivitas/{pengajuan_aktivitas}', [PengajuanAktivitasController::class, 'destroy']);

	// Catatan Admin (hanya dapat diakses oleh Admin, tidak ditampilkan ke Internal/Mitra)
	Route::get('/catatan-admin', [CatatanAdminController::class, 'index']);
	Route::post('/catatan-admin', [CatatanAdminController::class, 'store']);
	Route::put('/catatan-admin/{catatan_admin}', [CatatanAdminController::class, 'update']);
	Route::delete('/catatan-admin/{catatan_admin}', [CatatanAdminController::class, 'destroy']);
	Route::post('/dokumen-kerjasama/{dokumen_kerjasama}/upload-file', [DokumenKerjasamaController::class, 'uploadFile'])
		->whereNumber('dokumen_kerjasama');
	Route::get('/dokumen-kerjasama/{dokumen_kerjasama}/documents', [DokumenKerjasamaController::class, 'documents'])
		->whereNumber('dokumen_kerjasama');
	Route::get('/dokumen-kerjasama/{dokumen_kerjasama}/notifikasi', [NotificationController::class, 'riwayat'])
		->whereNumber('dokumen_kerjasama');
	Route::get('/dokumen-kerjasama/{dokumen_kerjasama}/documents/{dokumen_file}/download', [DokumenKerjasamaController::class, 'downloadDocument'])
		->whereNumber('dokumen_kerjasama')
		->name('dokumen-kerjasama.documents.download');
	Route::get('/dokumen-kerjasama/{dokumen_kerjasama}/documents/{dokumen_file}/view', [DokumenKerjasamaController::class, 'viewDocument'])
		->whereNumber('dokumen_kerjasama')
		->name('dokumen-kerjasama.documents.view');
	Route::post('/dokumen-kerjasama/manual', [DokumenKerjasamaController::class, 'storeManual']);
	Route::get('/dokumen-kerjasama/perpanjangan/requests', [DokumenKerjasamaController::class, 'renewalRequests']);
	Route::post('/dokumen-kerjasama/{dokumen_kerjasama}/perpanjangan', [DokumenKerjasamaController::class, 'submitRenewalRequest'])
		->whereNumber('dokumen_kerjasama');
	Route::patch('/dokumen-kerjasama/perpanjangan/{dokumen_log}/status', [DokumenKerjasamaController::class, 'decideRenewalRequest'])
		->whereNumber('dokumen_log');
	Route::apiResource('/dokumen-kerjasama', DokumenKerjasamaController::class)
		->parameters(['dokumen-kerjasama' => 'dokumen_kerjasama']);

	Route::get('/laporan-pelaksanaan', [LaporanPelaksanaanController::class, 'index']);
	Route::post('/laporan-pelaksanaan', [LaporanPelaksanaanController::class, 'store']);
	Route::delete('/laporan-pelaksanaan/{laporan_pelaksanaan}', [LaporanPelaksanaanController::class, 'destroy']);
});

Route::get('/carousel-images', [CarouselImageController::class, 'index']);
Route::get('/public/unit-prodi', [MasterUnitProdiController::class, 'publicUnits']);
Route::get('/public/kerjasama', [DokumenKerjasamaController::class, 'publicIndex']);
Route::get('/public/stats', [DokumenKerjasamaController::class, 'publicStats']);
// Publik juga (dipakai landing page & dashboard admin) — datanya sudah sama kelasnya
// dengan /public/kerjasama & /public/stats (nama/kategori mitra memang publik).
Route::get('/dokumen-kerjasama/stats/mitra', [DokumenKerjasamaController::class, 'mitraStats']);
Route::post('/admin/carousel-images', [CarouselImageController::class, 'store']);
Route::patch('/admin/carousel-images/{carouselImage}', [CarouselImageController::class, 'update']);
Route::delete('/admin/carousel-images/{carouselImage}', [CarouselImageController::class, 'destroy']);

// OTP Email Verification Routes
Route::post('/otp/send', [OtpController::class, 'sendOtp']);
Route::post('/otp/verify', [OtpController::class, 'verifyOtp']);

// Notification Email Routes
Route::post('/notifications/send-email', [NotificationController::class, 'sendEmail']);
Route::post('/notifications/send-bulk', [NotificationController::class, 'sendBulk']);
