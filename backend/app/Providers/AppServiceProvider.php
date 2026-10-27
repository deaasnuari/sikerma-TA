<?php

namespace App\Providers;

use App\Services\StructuralAccessService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Singleton supaya memo per-user di dalamnya (lihat StructuralAccessService)
        // berlaku lintas pemanggilan app(StructuralAccessService::class) dalam 1 request —
        // controller-controller list (Pengajuan/DokumenKerjasama/PengajuanAktivitas)
        // masing-masing bisa manggil getUserStructuralAccess() 2-3x per request.
        $this->app->singleton(StructuralAccessService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Pembatas percobaan untuk endpoint publik yang bisa ditebak/disalahgunakan. Dua lapis:
        // per IP (menahan satu penyerang) dan per email/username (menahan serangan dari banyak IP
        // ke satu akun, mis. menebak OTP 6 digit).
        $identitas = fn (Request $r): string => strtolower(trim((string) ($r->input('email') ?: $r->input('username') ?: '')));

        // Batas umum seluruh API (termasuk endpoint publik): per pengguna yang login, atau per IP bila
        // belum login. Longgar untuk pemakaian normal (polling dashboard) tapi menahan scraping/banjir.
        RateLimiter::for('api', fn (Request $r) => $r->user()
            ? Limit::perMinute(600)->by('api-user|'.$r->user()->id)
            : Limit::perMinute(120)->by('api-ip|'.$r->ip()));

        RateLimiter::for('login', fn (Request $r) => [
            Limit::perMinute(10)->by('login-ip|'.$r->ip()),
            Limit::perMinute(5)->by('login-id|'.$identitas($r)),
        ]);

        RateLimiter::for('otp-kirim', fn (Request $r) => [
            Limit::perMinute(5)->by('otp-kirim-ip|'.$r->ip()),
            Limit::perHour(5)->by('otp-kirim-id|'.$identitas($r)),
        ]);

        RateLimiter::for('otp-verifikasi', fn (Request $r) => [
            Limit::perMinute(10)->by('otp-verif-ip|'.$r->ip()),
            Limit::perMinute(5)->by('otp-verif-id|'.$identitas($r)),
        ]);
    }
}
