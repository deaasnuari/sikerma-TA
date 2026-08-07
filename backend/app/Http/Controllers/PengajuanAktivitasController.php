<?php

namespace App\Http\Controllers;

use App\Models\Pengajuan;
use App\Models\PengajuanAktivitas;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class PengajuanAktivitasController extends Controller
{
    private function baseValidationRules(): array
    {
        return [
            'pengajuan_id' => ['required', 'integer', Rule::exists((new Pengajuan)->getTable(), 'id')],
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
     * ID pengajuan yang boleh DILIHAT (pemilik ATAU yang di-CC admin lewat distribusi_user_ids).
     * Null berarti tidak ada batasan (admin/admin-humas).
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

        return Pengajuan::query()
            ->where(function ($builder) use ($user) {
                $builder->where('user_pengusul_id', $user->id)
                    ->orWhereJsonContains('distribusi_user_ids', $user->id);
            })
            ->pluck('id')
            ->all();
    }

    /**
     * Hanya PEMILIK pengajuan (bukan sekadar yang di-CC) atau admin yang boleh
     * menambah/mengubah/menghapus aktivitas. User yang di-CC cuma boleh melihat.
     */
    private function ensureCanManage(Request $request, int $pengajuanId): ?Response
    {
        if ($this->isAdminRole($request)) {
            return null;
        }

        $user = $request->user();
        $isOwner = $user && Pengajuan::query()
            ->where('id', $pengajuanId)
            ->where('user_pengusul_id', $user->id)
            ->exists();

        if (!$isOwner) {
            return response([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk mengubah aktivitas pada pengajuan ini.',
            ], 403);
        }

        return null;
    }

    public function index(Request $request): Response
    {
        $query = PengajuanAktivitas::query()->orderByDesc('tanggal')->orderByDesc('id');

        $viewableIds = $this->viewablePengajuanIds($request);
        if ($viewableIds !== null) {
            $query->whereIn('pengajuan_id', $viewableIds);
        }

        if ($request->filled('pengajuan_id')) {
            $query->where('pengajuan_id', (int) $request->input('pengajuan_id'));
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

        if ($response = $this->ensureCanManage($request, (int) $validated['pengajuan_id'])) {
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
        if ($response = $this->ensureCanManage($request, (int) $pengajuan_aktivitas->pengajuan_id)) {
            return $response;
        }

        $validated = $request->validate($this->baseValidationRules());

        if ($response = $this->ensureCanManage($request, (int) $validated['pengajuan_id'])) {
            return $response;
        }

        $validated['jumlah_peserta'] = (int) ($validated['jumlah_peserta'] ?? 0);

        $pengajuan_aktivitas->update($validated);

        return response([
            'success' => true,
            'data' => $pengajuan_aktivitas,
            'message' => 'Aktivitas berhasil diperbarui',
        ]);
    }

    public function destroy(Request $request, PengajuanAktivitas $pengajuan_aktivitas): Response
    {
        if ($response = $this->ensureCanManage($request, (int) $pengajuan_aktivitas->pengajuan_id)) {
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
