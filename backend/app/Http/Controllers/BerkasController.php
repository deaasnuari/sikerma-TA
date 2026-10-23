<?php

namespace App\Http\Controllers;

use App\Models\DokumenFile;
use App\Models\DokumenKerjasama;
use App\Models\LaporanPelaksanaan;
use App\Models\Pengajuan;
use App\Models\PengajuanFile;
use App\Services\StructuralAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Pintu tunggal untuk membuka berkas yang tersimpan di disk 'public' (selain carousel).
 *
 * Sebelumnya semua berkas bisa dibuka siapa pun lewat URL /storage/... tanpa login. Sekarang
 * /storage hanya melayani folder carousel (lihat config/filesystems.php -> links), dan berkas
 * lain hanya lewat endpoint ini: wajib login + berkasnya harus milik record yang boleh diakses
 * pengguna tersebut.
 */
class BerkasController extends Controller
{
    public function show(Request $request): Response
    {
        $path = $this->normalisasiPath((string) $request->query('path', ''));

        if ($path === null || ! Storage::disk('public')->exists($path)) {
            return response()->json(['success' => false, 'message' => 'File tidak ditemukan.'], 404);
        }

        if (! $this->boleh($request, $path)) {
            // 404 (bukan 403) supaya keberadaan berkas milik orang lain tidak bisa diintip.
            return response()->json(['success' => false, 'message' => 'File tidak ditemukan.'], 404);
        }

        return Storage::disk('public')->response($path, basename($path));
    }

    /** Buang prefix storage/, tolak path traversal / absolut / nol-byte. */
    private function normalisasiPath(string $raw): ?string
    {
        $path = ltrim(str_replace('\\', '/', trim($raw)), '/');
        $path = preg_replace('#^storage/#', '', $path);

        if ($path === '' || str_contains($path, "\0") || preg_match('#(^|/)\.\.?(/|$)#', $path)) {
            return null;
        }

        // Path berupa nama file saja = berkas legacy yang disimpan di folder dokumen/.
        if (! str_contains($path, '/')) {
            $path = 'dokumen/'.$path;
        }

        return $path;
    }

    private function boleh(Request $request, string $path): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }

        $role = strtolower(str_replace([' ', '_'], '-', trim((string) $user->role)));
        if (in_array($role, ['admin', 'admin-humas'], true)) {
            return true;
        }

        // Dokumen kerja sama (daftar kerja sama memang terbuka untuk pengguna yang login —
        // sama dengan endpoint /dokumen-kerjasama/{id}/documents/.../download).
        $basename = basename($path);
        if (DokumenFile::query()->where('path_file', $path)->exists()
            || DokumenKerjasama::query()->whereIn('file', [$path, $basename])->exists()) {
            return true;
        }

        // Berkas pengajuan & dokumen final pengajuan: hanya yang boleh membuka pengajuannya.
        $pengajuanIds = PengajuanFile::query()->where('path_file', $path)->pluck('pengajuan_id')
            ->merge(Pengajuan::query()->where('final_file_path', $path)->pluck('id'))
            ->unique();
        foreach (Pengajuan::query()->whereIn('id', $pengajuanIds)->get() as $pengajuan) {
            if ($this->bolehBukaPengajuan($user, $role, $pengajuan)) {
                return true;
            }
        }

        // Laporan pelaksanaan/monev: pengirimnya, atau yang boleh membuka pengajuan terkaitnya.
        foreach (LaporanPelaksanaan::query()->where('file_path', $path)->get() as $laporan) {
            if ((int) $laporan->dikirim_oleh_user_id === (int) $user->id) {
                return true;
            }
            if ($laporan->pengajuan && $this->bolehBukaPengajuan($user, $role, $laporan->pengajuan)) {
                return true;
            }
        }

        // Selain itu (mis. bukti perpanjangan) hanya admin, yang sudah ditangani di atas.
        return false;
    }

    /** Cerminan aturan PengajuanController::show(). */
    private function bolehBukaPengajuan($user, string $role, Pengajuan $pengajuan): bool
    {
        if ($role === 'pimpinan') {
            return true;
        }

        if ((int) $pengajuan->user_pengusul_id === (int) $user->id) {
            return true;
        }

        if (is_array($pengajuan->distribusi_user_ids) && in_array($user->id, $pengajuan->distribusi_user_ids, false)) {
            return true;
        }

        if (in_array($role, ['internal', 'unit', 'jurusan', 'prodi'], true)) {
            $svc = app(StructuralAccessService::class);
            $scoped = $svc->resolveScopedUnitProdiIds($svc->getUserStructuralAccess($user));

            return $scoped && in_array($pengajuan->unit_prodi_id, $scoped, false);
        }

        return false;
    }
}
