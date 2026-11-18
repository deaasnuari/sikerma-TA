<?php

namespace App\Http\Controllers\Concerns;

use App\Models\DokumenKerjasama;
use App\Models\Pengajuan;
use App\Services\StructuralAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

/**
 * Aturan akses bersama untuk fitur yang menempel ke pengajuan ATAU dokumen kerja sama
 * ("Story & Aktivitas": aktivitas dan laporan pelaksanaan), supaya keduanya konsisten.
 *
 * Kelas pemakai wajib punya normalizedRole() dan isAdminRole().
 */
trait AksesKerjaSama
{
    /**
     * ID pengajuan yang boleh DILIHAT — pemilik, yang di-CC admin lewat distribusi_user_ids,
     * ATAU (khusus internal/unit yang terdeteksi Ketua Jurusan/Ketua Prodi/Kepala Unit lewat
     * StructuralAccessService) pengajuan dalam cakupan jurusan/prodi/unit yang dia pimpin.
     * Null berarti tidak ada batasan (admin/admin-humas) — cerminan dari
     * PengajuanController::index() supaya "Story & Aktivitas" konsisten dengan Data Pengajuan.
     */
    private function viewablePengajuanIds(Request $request): ?array
    {
        if ($this->isAdminRole($request)) {
            return null;
        }

        $user = $request->user();
        if (!$user) {
            return [];
        }

        $query = Pengajuan::query()->where(function ($builder) use ($user) {
            $builder->where('user_pengusul_id', $user->id)
                ->orWhereJsonContains('distribusi_user_ids', $user->id);
        });

        $scopedUnitProdiIds = $this->scopedUnitProdiIds($request);
        if ($scopedUnitProdiIds) {
            $query->orWhere(fn ($q) => $q->dalamUnitProdi($scopedUnitProdiIds));
        }

        return $query->pluck('id')->all();
    }

    /**
     * unit_prodi_id yang berada dalam cakupan struktural user (Ketua Jurusan/Prodi/Kepala Unit).
     * Kosong untuk role/akun tanpa jabatan struktural.
     *
     * @return array<int, int>
     */
    private function scopedUnitProdiIds(Request $request): array
    {
        $user = $request->user();
        if (!$user || !in_array($this->normalizedRole($request), ['internal', 'unit', 'jurusan', 'prodi'], true)) {
            return [];
        }

        $access = app(StructuralAccessService::class)->getUserStructuralAccess($user);

        return app(StructuralAccessService::class)->resolveScopedUnitProdiIds($access) ?? [];
    }

    /**
     * ID dokumen_kerjasama yang boleh dilihat non-admin: berasal dari pengajuan yang boleh
     * dilihat, dibuat sendiri oleh user, ATAU berada dalam cakupan jurusan/prodi/unit yang
     * dipimpin user (LDAP Ketua Jurusan/Prodi/Kepala Unit). Null untuk admin.
     *
     * @param  array<int, int>|null  $viewablePengajuanIds
     */
    private function viewableDokumenIds(Request $request, ?array $viewablePengajuanIds): ?array
    {
        if ($viewablePengajuanIds === null) {
            return null;
        }

        $user = $request->user();
        $scopedUnitProdiIds = $this->scopedUnitProdiIds($request);

        return DokumenKerjasama::query()
            ->where(function ($builder) use ($viewablePengajuanIds, $user, $scopedUnitProdiIds) {
                $builder->whereIn('sumber_pengajuan_id', $viewablePengajuanIds);
                if ($user) {
                    $builder->orWhere('dibuat_oleh_user_id', $user->id);
                }
                if ($scopedUnitProdiIds) {
                    $builder->orWhere(fn ($q) => $q->dalamUnitProdi($scopedUnitProdiIds));
                }
            })
            ->pluck('id')->all();
    }

    /**
     * Dokumen kerja sama yang dipindahkan admin ke Sampah (dihapus_admin_pada) tersembunyi dari
     * semua daftar admin, tapi masih terlihat oleh pemiliknya. Data baru (laporan/aktivitas) yang
     * ditempel ke dokumen seperti ini tidak akan pernah terlihat admin, jadi tolak sejak awal.
     * Null kalau boleh; berisi pesan penolakan kalau dokumennya ada di Sampah.
     */
    private function tolakJikaDokumenDiSampah(?int $dokumenId): ?string
    {
        if (!$dokumenId || !Schema::hasColumn('dokumen_kerjasama', 'dihapus_admin_pada')) {
            return null;
        }

        $diSampah = DokumenKerjasama::query()->whereKey($dokumenId)->whereNotNull('dihapus_admin_pada')->exists();

        return $diSampah
            ? 'Kerja sama ini sudah dihapus oleh admin, sehingga tidak bisa menerima data baru. Silakan hubungi admin kampus.'
            : null;
    }

    /**
     * Boleh MENGELOLA (menambah/mengubah/mengirim) data pada kerja sama ini: admin, pemilik
     * pengajuan, pembuat dokumen kerja sama, pemilik pengajuan sumber dokumen, ATAU pimpinan
     * struktural yang jurusan/prodi/unitnya terlibat di dokumen. Yang cuma di-CC hanya melihat.
     */
    private function bolehKelolaKerjaSama(Request $request, ?int $pengajuanId, ?int $dokumenId): bool
    {
        if ($this->isAdminRole($request)) {
            return true;
        }

        $user = $request->user();
        if (!$user) {
            return false;
        }

        if ($pengajuanId && Pengajuan::query()->whereKey($pengajuanId)->where('user_pengusul_id', $user->id)->exists()) {
            return true;
        }

        if ($dokumenId) {
            $dokumen = DokumenKerjasama::query()->find($dokumenId);
            if ($dokumen) {
                if ((int) $dokumen->dibuat_oleh_user_id === (int) $user->id) {
                    return true;
                }
                if ($dokumen->sumber_pengajuan_id
                    && Pengajuan::query()->whereKey($dokumen->sumber_pengajuan_id)->where('user_pengusul_id', $user->id)->exists()) {
                    return true;
                }
                $scopedUnitProdiIds = $this->scopedUnitProdiIds($request);
                if ($scopedUnitProdiIds && $dokumen->termasukUnitProdi($scopedUnitProdiIds)) {
                    return true;
                }
            }
        }

        return false;
    }
}
