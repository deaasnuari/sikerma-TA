<?php

namespace App\Providers;

use App\Services\StructuralAccessService;
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
        //
    }
}
