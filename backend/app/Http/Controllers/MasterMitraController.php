<?php

namespace App\Http\Controllers;

use App\Models\MasterMitra;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MasterMitraController extends Controller
{
    //menautkan pengajuan/dokumen yang sudah ada di database tapi belum punya mitra_id (karena sebelumnya mitra belum ada di master_mitra) ke master_mitra yang baru dibuat
    private function linkOrphanedRecordsToMitra(MasterMitra $mitra): void
    {
        $namaNormalized = strtolower(trim((string) $mitra->nama_mitra));
        if ($namaNormalized === '') {
            return;
        }

        $hasPengajuanMitraId = Schema::hasTable('pengajuan_v2') && Schema::hasColumn('pengajuan_v2', 'mitra_id');
        $hasDokumenMitraId = Schema::hasTable('dokumen_kerjasama') && Schema::hasColumn('dokumen_kerjasama', 'mitra_id');

        if ($hasPengajuanMitraId) {
            DB::table('pengajuan_v2')
                ->whereNull('mitra_id')
                ->whereRaw('LOWER(TRIM(nama_mitra)) = ?', [$namaNormalized])
                ->update(['mitra_id' => $mitra->id]);
        }

        if ($hasDokumenMitraId) {
            // Dokumen yang namanya diketik manual langsung (bukan hasil approve pengajuan).
            DB::table('dokumen_kerjasama')
                ->whereNull('mitra_id')
                ->whereRaw('LOWER(TRIM(snap_nama_mitra)) = ?', [$namaNormalized])
                ->update(['mitra_id' => $mitra->id]);

           // Dokumen yang berasal dari pengajuan, tapi pengajuan-nya belum punya mitra_id (karena sebelumnya mitra belum ada di master_mitra).
            if ($hasPengajuanMitraId && Schema::hasColumn('dokumen_kerjasama', 'sumber_pengajuan_id')) {
                DB::table('dokumen_kerjasama as d')
                    ->join('pengajuan_v2 as p', 'p.id', '=', 'd.sumber_pengajuan_id')
                    ->whereNull('d.mitra_id')
                    ->where('p.mitra_id', $mitra->id)
                    ->update(['d.mitra_id' => $mitra->id]);
            }
        }
    }

    private function ensureAdmin(Request $request): ?Response
    {
        $user = $request->user();
        $rawRole = (string) ($user?->role ?? '');
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim($rawRole)));

        if (!in_array($normalizedRole, ['admin', 'admin-humas'], true)) {
            return response([
                'success' => false,
                'message' => 'Only admin can modify master mitra',
            ], 403);
        }

        return null;
    }

    public function index(Request $request): Response
    {
        $query = MasterMitra::query();

        if ($request->filled('kategori_mitra')) {
            $query->where('kategori_mitra', $request->string('kategori_mitra'));
        }

        if ($request->filled('negara')) {
            $query->where('negara', $request->string('negara'));
        }

        if ($request->has('aktif')) {
            $query->where('aktif', $request->boolean('aktif'));
        }

        if ($request->filled('search')) {
            $keyword = $request->string('search')->trim()->toString();
            $query->where(function ($builder) use ($keyword) {
                $builder
                    ->whereRaw('LOWER(nama_mitra) LIKE ?', ['%' . strtolower($keyword) . '%'])
                    ->orWhereRaw('LOWER(COALESCE(kode_mitra, \'\')) LIKE ?', ['%' . strtolower($keyword) . '%'])
                    ->orWhereRaw('LOWER(COALESCE(kategori_mitra, \'\')) LIKE ?', ['%' . strtolower($keyword) . '%'])
                    ->orWhereRaw('LOWER(COALESCE(negara, \'\')) LIKE ?', ['%' . strtolower($keyword) . '%'])
                    ->orWhereRaw('LOWER(COALESCE(email_mitra, \'\')) LIKE ?', ['%' . strtolower($keyword) . '%']);
            });
        }

        return response([
            'success' => true,
            'data' => $query->orderBy('nama_mitra')->get(),
            'message' => 'Master mitra retrieved successfully',
        ]);
    }

    public function store(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'kode_mitra' => 'nullable|string|max:20|unique:master_mitra,kode_mitra',
            'nama_mitra' => 'required|string|max:255',
            'kategori_mitra' => ['nullable', 'string', 'max:150'],
            'bidang_usaha' => ['nullable', 'string', 'max:150'],
            'tingkat_perusahaan' => ['nullable', 'string', 'in:Lokal,Nasional,Internasional,Multinasional'],
            'negara' => 'nullable|string|max:100',
            'website' => 'nullable|url|max:255',
            'alamat' => 'nullable|string',
            'email_mitra' => 'nullable|email|max:255',
            'telepon_mitra' => 'nullable|string|max:50',
            'nama_kontak_utama' => 'nullable|string|max:200',
            'jabatan_kontak_utama' => 'nullable|string|max:120',
            'email_kontak_utama' => 'nullable|email|max:255',
            'telepon_kontak_utama' => 'nullable|string|max:50',
            'aktif' => 'boolean',
        ]);

        try {
            $mitra = MasterMitra::create($validated);
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal menyimpan master mitra.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        $this->linkOrphanedRecordsToMitra($mitra);

        return response([
            'success' => true,
            'data' => $mitra,
            'message' => 'Master mitra created successfully',
        ], 201);
    }

    public function show(MasterMitra $mitra): Response
    {
        return response([
            'success' => true,
            'data' => $mitra,
            'message' => 'Master mitra retrieved successfully',
        ]);
    }

    public function update(Request $request, MasterMitra $mitra): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'kode_mitra' => ['nullable', 'string', 'max:20', 'unique:master_mitra,kode_mitra,' . $mitra->id],
            'nama_mitra' => 'sometimes|required|string|max:255',
            'kategori_mitra' => ['nullable', 'string', 'max:150'],
            'bidang_usaha' => ['nullable', 'string', 'max:150'],
            'tingkat_perusahaan' => ['nullable', 'string', 'in:Lokal,Nasional,Internasional,Multinasional'],
            'negara' => 'nullable|string|max:100',
            'website' => 'nullable|url|max:255',
            'alamat' => 'nullable|string',
            'email_mitra' => 'nullable|email|max:255',
            'telepon_mitra' => 'nullable|string|max:50',
            'nama_kontak_utama' => 'nullable|string|max:200',
            'jabatan_kontak_utama' => 'nullable|string|max:120',
            'email_kontak_utama' => 'nullable|email|max:255',
            'telepon_kontak_utama' => 'nullable|string|max:50',
            'aktif' => 'boolean',
        ]);

        try {
            $mitra->update($validated);
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal mengubah master mitra.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        $this->linkOrphanedRecordsToMitra($mitra);

        return response([
            'success' => true,
            'data' => $mitra,
            'message' => 'Master mitra updated successfully',
        ]);
    }

    public function destroy(Request $request, MasterMitra $mitra): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $mitra->delete();

        return response([
            'success' => true,
            'data' => null,
            'message' => 'Master mitra deleted successfully',
        ]);
    }
}