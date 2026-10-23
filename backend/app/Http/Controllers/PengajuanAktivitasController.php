<?php

namespace App\Http\Controllers;

use App\Models\DokumenKerjasama;
use App\Models\Pengajuan;
use App\Models\PengajuanAktivitas;
use App\Services\StructuralAccessService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class PengajuanAktivitasController extends Controller
{
    private function baseValidationRules(): array
    {
        return [
            // Aktivitas menempel ke pengajuan ATAU ke dokumen kerja sama — minimal salah satu.
            'pengajuan_id' => ['nullable', 'required_without:dokumen_kerjasama_id', 'integer', Rule::exists((new Pengajuan)->getTable(), 'id')],
            'dokumen_kerjasama_id' => ['nullable', 'required_without:pengajuan_id', 'integer', Rule::exists('dokumen_kerjasama', 'id')],
            'judul' => ['required', 'string', 'max:255'],
            'jenis_aktivitas' => ['required', 'string', 'max:120'],
            'tanggal' => ['required', 'date'],
            'jumlah_peserta' => ['nullable', 'integer', 'min:0'],
            'deskripsi' => ['nullable', 'string'],
            'pic_polibatam' => ['nullable', 'string', 'max:200'],
            'pic_mitra' => ['nullable', 'string', 'max:200'],
            'status' => ['required', Rule::in(['direncanakan', 'berlangsung', 'selesai'])],
        ];
    }

    private function normalizedRole(Request $request): string
    {
        $user = $request->user();
        return strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));
    }

    private function isAdminRole(Request $request): bool
    {
        return in_array($this->normalizedRole($request), ['admin', 'admin-humas'], true);
    }

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

        if (in_array($this->normalizedRole($request), ['internal', 'unit', 'jurusan', 'prodi'], true)) {
            $access = app(StructuralAccessService::class)->getUserStructuralAccess($user);
            $scopedUnitProdiIds = app(StructuralAccessService::class)->resolveScopedUnitProdiIds($access);

            if ($scopedUnitProdiIds) {
                $query->orWhere(fn ($q) => $q->dalamUnitProdi($scopedUnitProdiIds));
            }
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
     * Hanya admin, PEMILIK pengajuan sumbernya, ATAU pembuat dokumen kerja samanya yang
     * boleh menambah/mengubah/menghapus aktivitas. User yang cuma di-CC hanya bisa melihat.
     */
    private function ensureCanManage(Request $request, ?int $pengajuanId, ?int $dokumenId): ?Response
    {
        if ($this->isAdminRole($request)) {
            return null;
        }

        $user = $request->user();
        if (!$user) {
            return $this->tolakKelola();
        }

        if ($pengajuanId && Pengajuan::query()->whereKey($pengajuanId)->where('user_pengusul_id', $user->id)->exists()) {
            return null;
        }

        if ($dokumenId) {
            $dokumen = DokumenKerjasama::query()->find($dokumenId);
            if ($dokumen) {
                if ((int) $dokumen->dibuat_oleh_user_id === (int) $user->id) {
                    return null;
                }
                if ($dokumen->sumber_pengajuan_id
                    && Pengajuan::query()->whereKey($dokumen->sumber_pengajuan_id)->where('user_pengusul_id', $user->id)->exists()) {
                    return null;
                }
                $scopedUnitProdiIds = $this->scopedUnitProdiIds($request);
                if ($scopedUnitProdiIds && $dokumen->termasukUnitProdi($scopedUnitProdiIds)) {
                    return null;
                }
            }
        }

        return $this->tolakKelola();
    }

    private function tolakKelola(): Response
    {
        return response([
            'success' => false,
            'message' => 'Anda tidak memiliki akses untuk mengubah aktivitas pada kerja sama ini.',
        ], 403);
    }

    public function index(Request $request): Response
    {
        $query = PengajuanAktivitas::query()->orderByDesc('tanggal')->orderByDesc('id');

        $viewablePengajuanIds = $this->viewablePengajuanIds($request);
        if ($viewablePengajuanIds !== null) {
            $viewableDokumenIds = $this->viewableDokumenIds($request, $viewablePengajuanIds);
            $query->where(function ($builder) use ($viewablePengajuanIds, $viewableDokumenIds) {
                $builder->whereIn('pengajuan_id', $viewablePengajuanIds)
                    ->orWhereIn('dokumen_kerjasama_id', $viewableDokumenIds ?: [0]);
            });
        }

        if ($request->filled('pengajuan_id')) {
            $query->where('pengajuan_id', (int) $request->input('pengajuan_id'));
        }

        if ($request->filled('dokumen_kerjasama_id')) {
            $query->where('dokumen_kerjasama_id', (int) $request->input('dokumen_kerjasama_id'));
        }

        return response([
            'success' => true,
            'data' => $query->get(),
            'message' => 'Data aktivitas berhasil diambil',
        ]);
    }

    public function store(Request $request): Response
    {
        $validated = $request->validate($this->baseValidationRules());

        $pengajuanId = isset($validated['pengajuan_id']) ? (int) $validated['pengajuan_id'] : null;
        $dokumenId = isset($validated['dokumen_kerjasama_id']) ? (int) $validated['dokumen_kerjasama_id'] : null;

        if ($response = $this->ensureCanManage($request, $pengajuanId, $dokumenId)) {
            return $response;
        }

        $validated['jumlah_peserta'] = (int) ($validated['jumlah_peserta'] ?? 0);
        $validated['dibuat_oleh_user_id'] = $request->user()?->id;

        $aktivitas = PengajuanAktivitas::create($validated);

        return response([
            'success' => true,
            'data' => $aktivitas,
            'message' => 'Aktivitas berhasil ditambahkan',
        ], 201);
    }

    public function update(Request $request, PengajuanAktivitas $pengajuan_aktivitas): Response
    {
        if ($response = $this->ensureCanManage($request, (int) $pengajuan_aktivitas->pengajuan_id ?: null, (int) $pengajuan_aktivitas->dokumen_kerjasama_id ?: null)) {
            return $response;
        }

        $validated = $request->validate($this->baseValidationRules());

        $pengajuanId = isset($validated['pengajuan_id']) ? (int) $validated['pengajuan_id'] : null;
        $dokumenId = isset($validated['dokumen_kerjasama_id']) ? (int) $validated['dokumen_kerjasama_id'] : null;

        if ($response = $this->ensureCanManage($request, $pengajuanId, $dokumenId)) {
            return $response;
        }

        $validated['jumlah_peserta'] = (int) ($validated['jumlah_peserta'] ?? 0);
        $validated['pengajuan_id'] = $pengajuanId;
        $validated['dokumen_kerjasama_id'] = $dokumenId;

        $pengajuan_aktivitas->update($validated);

        return response([
            'success' => true,
            'data' => $pengajuan_aktivitas,
            'message' => 'Aktivitas berhasil diperbarui',
        ]);
    }

    public function destroy(Request $request, PengajuanAktivitas $pengajuan_aktivitas): Response
    {
        if ($response = $this->ensureCanManage($request, (int) $pengajuan_aktivitas->pengajuan_id ?: null, (int) $pengajuan_aktivitas->dokumen_kerjasama_id ?: null)) {
            return $response;
        }

        $pengajuan_aktivitas->delete();

        return response([
            'success' => true,
            'data' => null,
            'message' => 'Aktivitas berhasil dihapus',
        ]);
    }
}
