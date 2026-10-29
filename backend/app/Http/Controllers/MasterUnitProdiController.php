<?php

namespace App\Http\Controllers;

use App\Models\MasterUnitProdi;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class MasterUnitProdiController extends Controller
{
    private const HIDDEN_JURUSAN_ALIASES = ['EL', 'TM', 'MB'];

    private function isHiddenJurusanAlias(?string $name): bool
    {
        $normalized = strtoupper(trim((string) $name));
        return $normalized !== '' && in_array($normalized, self::HIDDEN_JURUSAN_ALIASES, true);
    }

    /**
     * Parameter rute bernama {unit_prodi}, sedangkan variabel controller $masterUnitProdi, sehingga
     * implicit route binding Laravel tidak cocok dan yang masuk adalah model KOSONG (belum tersimpan).
     * Tanpa ini update() tidak mengubah apa pun tapi tetap membalas sukses. Muat modelnya dari id rute.
     */
    private function resolveFromRoute(Request $request, MasterUnitProdi $injected): MasterUnitProdi
    {
        if ($injected->exists) {
            return $injected;
        }

        $routeId = $request->route('unit_prodi');

        return MasterUnitProdi::query()->findOrFail(is_numeric($routeId) ? (int) $routeId : 0);
    }

    private function ensureAdmin(Request $request): ?Response
    {
        $user = $request->user();
        $rawRole = (string) ($user?->role ?? '');
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim($rawRole)));

        if (!in_array($normalizedRole, ['admin', 'admin-humas'], true)) {
            return response([
                'success' => false,
                'message' => 'Only admin can modify master unit/prodi',
            ], 403);
        }

        return null;
    }

    /**
     * Lightweight unit name list for the public landing page dropdown.
     * Returns only active unit/prodi names — no auth, no heavy relationships.
     *
     * Dipisah per kategori (jurusan / prodi / unit kerja) supaya dropdown di
     * landing page bisa tampil sebagai grup terpisah, bukan 1 list rata yang
     * mencampur ketiganya.
     */
    public function publicUnits(): Response
    {
        $rows = MasterUnitProdi::where('aktif', true)
            ->orderBy('nama')
            ->get(['nama', 'jenis_node', 'kategori_unit']);

        $jurusan = $rows->where('jenis_node', 'unit')->where('kategori_unit', 'jurusan')
            ->pluck('nama')->unique()->values();
        $prodi = $rows->where('jenis_node', 'prodi')
            ->pluck('nama')->unique()->values();
        $unit = $rows->where('jenis_node', 'unit')->where('kategori_unit', '!=', 'jurusan')
            ->pluck('nama')->unique()->values();

        return response([
            'success' => true,
            'data'    => [
                'jurusan' => $jurusan,
                'prodi'   => $prodi,
                'unit'    => $unit,
            ],
            'message' => 'Unit list retrieved successfully',
        ]);
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): Response
    {
        $query = MasterUnitProdi::query();

        // Filter by jenis_node if provided
        if ($request->has('jenis_node') && $request->jenis_node) {
            $query->where('jenis_node', $request->jenis_node);
        }

        // Filter by kategori_unit for unit nodes (jurusan/unit_kerja)
        if ($request->has('kategori_unit') && $request->kategori_unit) {
            $query->where('kategori_unit', $request->kategori_unit);
        }

        // Filter by parent_id if provided
        if ($request->has('parent_id') && $request->parent_id) {
            $query->where('parent_id', $request->parent_id);
        }

        // Filter aktif if requested
        if ($request->has('aktif')) {
            $query->where('aktif', $request->boolean('aktif'));
        }

        // With parent relationship
        $query->with('parent', 'children');

        $unitProdi = $query->get();

        return response([
            'success' => true,
            'data' => $unitProdi,
            'message' => 'Master Unit/Prodi retrieved successfully'
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'parent_id' => 'nullable|exists:master_unit_prodi,id',
            'jenis_node' => 'required|in:unit,prodi',
            'kategori_unit' => 'nullable|in:jurusan,unit_kerja',
            'kode' => 'nullable|string|max:30',
            'nama' => 'required|string|max:150',
            'aktif' => 'boolean',
        ]);

        if (($validated['jenis_node'] ?? null) === 'prodi') {
            $validated['kategori_unit'] = null;
        }

        try {
            $unitProdi = MasterUnitProdi::create($validated);
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal menyimpan master unit/prodi. Cek duplikasi data atau format input.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        return response([
            'success' => true,
            'data' => $unitProdi->load('parent', 'children'),
            'message' => 'Master Unit/Prodi created successfully'
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, MasterUnitProdi $masterUnitProdi): Response
    {
        $masterUnitProdi = $this->resolveFromRoute($request, $masterUnitProdi);
        $masterUnitProdi->load('parent', 'children');

        return response([
            'success' => true,
            'data' => $masterUnitProdi,
            'message' => 'Master Unit/Prodi retrieved successfully'
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, MasterUnitProdi $masterUnitProdi): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $masterUnitProdi = $this->resolveFromRoute($request, $masterUnitProdi);

        $validated = $request->validate([
            'parent_id' => 'nullable|exists:master_unit_prodi,id',
            'jenis_node' => 'in:unit,prodi',
            'kategori_unit' => 'nullable|in:jurusan,unit_kerja',
            'kode' => 'nullable|string|max:30',
            'nama' => 'string|max:150',
            'aktif' => 'boolean',
        ]);

        if (($validated['jenis_node'] ?? $masterUnitProdi->jenis_node) === 'prodi') {
            $validated['kategori_unit'] = null;
        }

        try {
            $masterUnitProdi->update($validated);
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal mengubah master unit/prodi. Cek duplikasi data atau format input.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        return response([
            'success' => true,
            'data' => $masterUnitProdi->load('parent', 'children'),
            'message' => 'Master Unit/Prodi updated successfully'
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, MasterUnitProdi $masterUnitProdi): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $routeIdRaw = $request->route('unit_prodi');
        $targetId = is_numeric($routeIdRaw) ? (int) $routeIdRaw : (int) $masterUnitProdi->id;

        if ($targetId < 1) {
            return response([
                'success' => false,
                'message' => 'ID master unit/prodi tidak valid.',
            ], 422);
        }

        $targetNode = DB::table('master_unit_prodi')
            ->where('id', $targetId)
            ->first(['id', 'jenis_node', 'kategori_unit']);

        if (!$targetNode) {
            return response([
                'success' => false,
                'message' => 'Data master unit/prodi tidak ditemukan.',
            ], 404);
        }

        $jenisNode = strtolower(trim((string) ($targetNode->jenis_node ?? '')));
        $kategoriUnit = strtolower(trim((string) ($targetNode->kategori_unit ?? '')));

        try {
            DB::transaction(function () use ($targetId, $jenisNode, $kategoriUnit) {
                // unit_prodi_ids dokumen tidak punya foreign key, jadi unit/prodi yang masih dipakai
                // dokumen harus ditolak di sini — kalau terhapus, id-nya jadi yatim di JSON.
                $idsTerhapus = [$targetId];
                if ($jenisNode === 'unit' && $kategoriUnit === 'jurusan') {
                    $idsTerhapus = array_merge($idsTerhapus, DB::table('master_unit_prodi')
                        ->where('parent_id', $targetId)
                        ->where('jenis_node', 'prodi')
                        ->pluck('id')
                        ->all());
                }
                $dokumenTerkait = DB::table('dokumen_kerjasama')->where(function ($q) use ($idsTerhapus) {
                    foreach ($idsTerhapus as $idTerhapus) {
                        $q->orWhereJsonContains('unit_prodi_ids', (int) $idTerhapus);
                    }
                });
                $jumlahDokumen = (clone $dokumenTerkait)->count();
                if ($jumlahDokumen > 0) {
                    // Dokumen yang sudah dihapus admin tidak tampil di Rekap Data, tapi masih ada di Sampah
                    // dan tetap menahan penghapusan sampai dihapus permanen.
                    $jumlahDiSampah = (clone $dokumenTerkait)->whereNotNull('dihapus_admin_pada')->count();
                    $pesan = sprintf('Tidak bisa dihapus: masih dipakai %d dokumen kerja sama', $jumlahDokumen);
                    if ($jumlahDiSampah > 0) {
                        $pesan .= sprintf(' (%d di antaranya ada di Sampah Rekap Data — hapus permanen dari Sampah)', $jumlahDiSampah);
                    }
                    throw new RuntimeException($pesan.'. Atau pindahkan dokumennya ke prodi/unit lain, atau nonaktifkan saja.');
                }

                // Sama untuk pengajuan: unit_prodi_ids-nya juga tanpa foreign key. Pengajuan yang sudah
                // dihapus (Sampah) tetap dihitung, konsisten dengan dokumen di atas.
                $jumlahPengajuan = DB::table('pengajuan_v2')->where(function ($q) use ($idsTerhapus) {
                    foreach ($idsTerhapus as $idTerhapus) {
                        $q->orWhereJsonContains('unit_prodi_ids', (int) $idTerhapus);
                    }
                })->count();
                if ($jumlahPengajuan > 0) {
                    throw new RuntimeException(sprintf(
                        'Tidak bisa dihapus: masih dipakai %d pengajuan. Atau pindahkan pengajuannya ke prodi/unit lain, atau nonaktifkan saja.',
                        $jumlahPengajuan
                    ));
                }

                // Kebijakan hapus dibuat eksplisit untuk mencegah penghapusan massal tidak sengaja.
                if ($jenisNode === 'prodi') {
                    $deleted = DB::table('master_unit_prodi')
                        ->where('id', $targetId)
                        ->delete();

                    if ($deleted < 1) {
                        throw new RuntimeException('Prodi tidak ditemukan atau gagal dihapus.');
                    }

                    return;
                }

                if ($jenisNode === 'unit' && $kategoriUnit === 'jurusan') {
                    DB::table('master_unit_prodi')
                        ->where('parent_id', $targetId)
                        ->where('jenis_node', 'prodi')
                        ->delete();

                    $deletedJurusan = DB::table('master_unit_prodi')
                        ->where('id', $targetId)
                        ->where('jenis_node', 'unit')
                        ->where('kategori_unit', 'jurusan')
                        ->delete();

                    if ($deletedJurusan < 1) {
                        throw new RuntimeException('Jurusan tidak ditemukan atau gagal dihapus.');
                    }

                    return;
                }

                if ($jenisNode === 'unit' && $kategoriUnit === 'unit_kerja') {
                    $childCount = DB::table('master_unit_prodi')
                        ->where('parent_id', $targetId)
                        ->count();

                    if ($childCount > 0) {
                        throw new RuntimeException('Unit kerja masih memiliki data turunan dan tidak dapat dihapus.');
                    }

                    $deletedUnit = DB::table('master_unit_prodi')
                        ->where('id', $targetId)
                        ->where('jenis_node', 'unit')
                        ->where('kategori_unit', 'unit_kerja')
                        ->delete();

                    if ($deletedUnit < 1) {
                        throw new RuntimeException('Unit kerja tidak ditemukan atau gagal dihapus.');
                    }

                    return;
                }

                throw new RuntimeException(sprintf(
                    'Tipe data master unit/prodi tidak valid untuk operasi hapus. jenis_node=%s, kategori_unit=%s',
                    $jenisNode !== '' ? $jenisNode : '(kosong)',
                    $kategoriUnit !== '' ? $kategoriUnit : '(kosong)'
                ));
            });
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal menghapus data master unit/prodi.',
                'error' => $exception->getMessage(),
            ], 422);
        } catch (RuntimeException $exception) {
            return response([
                'success' => false,
                'message' => $exception->getMessage(),
            ], 422);
        } catch (Throwable $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal menghapus data master unit/prodi.',
                'error' => $exception->getMessage(),
            ], 500);
        }

        return response([
            'success' => true,
            'message' => 'Master Unit/Prodi deleted successfully',
        ]);
    }

    /**
     * Get unit/prodi with hierarchical structure
     */
    public function tree(): Response
    {
        $rootUnits = MasterUnitProdi::where('parent_id', null)
            ->with('children')
            ->get()
            ->reject(fn (MasterUnitProdi $item): bool => $this->isHiddenJurusanAlias($item->nama))
            ->values();

        return response([
            'success' => true,
            'data' => $rootUnits,
            'message' => 'Hierarchical unit/prodi retrieved successfully'
        ]);
    }
}
