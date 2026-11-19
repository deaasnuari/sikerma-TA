<?php

namespace App\Http\Controllers;

use App\Models\CatatanAdmin;
use App\Models\Pengajuan;
use App\Models\User;
use App\Services\NotifikasiService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CatatanAdminController extends Controller
{
    /**
     * Hak akses (dicek di backend, bukan hanya disembunyikan di frontend):
     * - admin / admin-humas : lihat, buat, ubah, hapus semua catatan.
     * - internal / external : HANYA membaca catatan ber-flag untuk_pengusul=true pada pengajuan yang
     *                         pengusulnya adalah akun yang sedang login (pengajuan.user_pengusul_id).
     *                         Pemilik ditentukan dari token login, tidak pernah dari input request.
     *                         Catatan privat (default, termasuk catatan lama) tidak pernah terlihat.
     * - role lain           : ditolak (403), sama seperti aturan semula "hanya Admin".
     */
    private function role(Request $request): string
    {
        return strtolower(str_replace([' ', '_'], '-', trim((string) ($request->user()?->role ?? ''))));
    }

    private function isAdmin(Request $request): bool
    {
        return in_array($this->role($request), ['admin', 'admin-humas'], true);
    }

    private function wajibAdmin(Request $request): void
    {
        abort_unless($this->isAdmin($request), 403, 'Hanya admin yang dapat mengelola catatan admin.');
    }

    /** Admin boleh semua pengajuan; internal/external hanya pengajuan miliknya sendiri. */
    private function wajibBolehLihat(Request $request, int $pengajuanId): void
    {
        if ($this->isAdmin($request)) {
            return;
        }

        $user = $request->user();
        abort_unless(
            $user instanceof User && in_array($this->role($request), ['internal', 'external'], true),
            403,
            'Tidak diizinkan.'
        );

        $milikUser = Pengajuan::query()
            ->whereKey($pengajuanId)
            ->where('user_pengusul_id', $user->id)
            ->exists();
        abort_unless($milikUser, 403, 'Tidak diizinkan.');
    }

    /** Catatan hanya bisa dibagikan bila pengajuannya punya akun pengusul (penerima yang valid). */
    private function wajibAdaPengusul(int $pengajuanId): void
    {
        $adaPengusul = Pengajuan::query()->whereKey($pengajuanId)->whereNotNull('user_pengusul_id')->exists();
        if (! $adaPengusul) {
            throw ValidationException::withMessages([
                'untuk_pengusul' => ['Pengajuan ini tidak memiliki akun pengusul, sehingga catatan tidak dapat dibagikan.'],
            ]);
        }
    }

    /**
     * Notifikasi lonceng ke pemilik pengajuan. Penerima SELALU diambil dari pengajuan.user_pengusul_id
     * (bukan dari request). Kunci per catatan membuat pengiriman idempoten (tidak ganda).
     */
    private function beritahuPengusul(Request $request, CatatanAdmin $catatan): void
    {
        $pengajuan = Pengajuan::query()->find($catatan->pengajuan_id);
        $penerimaId = $pengajuan?->user_pengusul_id ? (int) $pengajuan->user_pengusul_id : null;
        if (! $penerimaId) {
            return;
        }

        $pelaku = $request->user();

        NotifikasiService::kirimKePengguna(
            $penerimaId,
            $pelaku?->id ? (int) $pelaku->id : null,
            'Catatan Baru dari Admin',
            NotifikasiService::sebutPelaku($pelaku).' menambahkan catatan pada pengajuan "'.Str::limit((string) $pengajuan->judul_pengajuan, 80).'": '.Str::limit((string) $catatan->teks, 200),
            NotifikasiService::hrefUntuk($penerimaId),
            'comment',
            (string) ($pelaku?->name ?: 'Admin'),
            ['jenis' => 'catatan_admin', 'actor' => $pelaku?->id, 'pengajuan' => $pengajuan->id, 'kunci' => 'catatan_admin:'.$catatan->id]
        );
    }

    private function serialize(Request $request, CatatanAdmin $c): array
    {
        $data = [
            'id'           => $c->id,
            'pengajuan_id' => $c->pengajuan_id,
            'teks'         => $c->teks,
            'untuk_pengusul' => (bool) $c->untuk_pengusul,
            'dibuat_oleh'  => $c->dibuatOleh?->name ?? 'Admin',
            'created_at'   => $c->created_at?->toISOString(),
            'updated_at'   => $c->updated_at?->toISOString(),
        ];

        // ID akun pembuat hanya untuk admin; pengusul cukup melihat nama.
        if ($this->isAdmin($request)) {
            $data['dibuat_oleh_user_id'] = $c->dibuat_oleh_user_id;
        }

        return $data;
    }

    public function index(Request $request): Response
    {
        $request->validate([
            'pengajuan_id' => ['required', 'integer', Rule::exists((new Pengajuan)->getTable(), 'id')],
        ]);

        $this->wajibBolehLihat($request, (int) $request->input('pengajuan_id'));

        $catatan = CatatanAdmin::with('dibuatOleh:id,name')
            ->where('pengajuan_id', (int) $request->input('pengajuan_id'))
            // Internal/External hanya melihat catatan yang ditandai untuk pengusul; catatan privat admin
            // (termasuk semua catatan lama) tidak pernah keluar ke mereka.
            ->when(! $this->isAdmin($request), fn ($q) => $q->where('untuk_pengusul', true))
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($c) => $this->serialize($request, $c));

        return response([
            'success' => true,
            'data'    => $catatan,
            'message' => 'Catatan admin berhasil diambil',
        ]);
    }

    public function store(Request $request): Response
    {
        $this->wajibAdmin($request);

        $validated = $request->validate([
            'pengajuan_id'   => ['required', 'integer', Rule::exists((new Pengajuan)->getTable(), 'id')],
            'teks'           => ['required', 'string', 'max:2000'],
            'untuk_pengusul' => ['sometimes', 'boolean'],
        ]);

        // Default privat. Penerima (bila dibagikan) = pengusul pengajuan itu sendiri; tidak ada ID penerima
        // yang diterima dari request.
        $untukPengusul = (bool) ($validated['untuk_pengusul'] ?? false);
        if ($untukPengusul) {
            $this->wajibAdaPengusul((int) $validated['pengajuan_id']);
        }

        $catatan = CatatanAdmin::create([
            'pengajuan_id'        => $validated['pengajuan_id'],
            'teks'                => $validated['teks'],
            'untuk_pengusul'      => $untukPengusul,
            'dibuat_oleh_user_id' => $request->user()?->id,
        ]);

        $catatan->load('dibuatOleh:id,name');

        if ($untukPengusul) {
            $this->beritahuPengusul($request, $catatan);
        }

        return response([
            'success' => true,
            'data'    => $this->serialize($request, $catatan),
            'message' => 'Catatan berhasil ditambahkan',
        ], 201);
    }

    public function update(Request $request, CatatanAdmin $catatan_admin): Response
    {
        $this->wajibAdmin($request);

        $validated = $request->validate([
            'teks'           => ['sometimes', 'required', 'string', 'max:2000'],
            'untuk_pengusul' => ['sometimes', 'boolean'],
        ]);

        if ($validated === []) {
            abort(422, 'Tidak ada perubahan yang dikirim.');
        }

        $barusajaDibagikan = array_key_exists('untuk_pengusul', $validated)
            && (bool) $validated['untuk_pengusul']
            && ! $catatan_admin->untuk_pengusul;
        if ($barusajaDibagikan) {
            $this->wajibAdaPengusul((int) $catatan_admin->pengajuan_id);
        }

        $catatan_admin->update($validated);
        $catatan_admin->load('dibuatOleh:id,name');

        // Notifikasi hanya saat catatan BARU menjadi terlihat pengusul; mengubah teks catatan yang sudah
        // dibagikan tidak mengirim notifikasi lagi.
        if ($barusajaDibagikan) {
            $this->beritahuPengusul($request, $catatan_admin);
        }

        return response([
            'success' => true,
            'data'    => $this->serialize($request, $catatan_admin),
            'message' => 'Catatan berhasil diperbarui',
        ]);
    }

    public function destroy(Request $request, CatatanAdmin $catatan_admin): Response
    {
        $this->wajibAdmin($request);

        $catatan_admin->delete();

        return response([
            'success' => true,
            'data'    => null,
            'message' => 'Catatan berhasil dihapus',
        ]);
    }
}
