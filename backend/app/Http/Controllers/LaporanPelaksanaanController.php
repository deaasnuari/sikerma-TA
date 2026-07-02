<?php

namespace App\Http\Controllers;

use App\Models\LaporanPelaksanaan;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

class LaporanPelaksanaanController extends Controller
{
    private function ensureAdmin(Request $request): ?Response
    {
        $user = $request->user();
        $rawRole = (string) ($user?->role ?? '');
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim($rawRole)));

        if (!in_array($normalizedRole, ['admin', 'admin-humas'], true)) {
            return response([
                'success' => false,
                'message' => 'Only admin can perform this action',
            ], 403);
        }

        return null;
    }

    /**
     * Daftar laporan pelaksanaan, difilter berdasarkan pengajuan_id[] atau dokumen_kerjasama_id[].
     * Dipakai oleh halaman Story Aktivitas untuk menampilkan laporan yang masuk per mitra.
     */
    public function index(Request $request): Response
    {
        $query = LaporanPelaksanaan::query()->with(['dikirimOleh:id,name,role']);

        if ($request->filled('pengajuan_ids')) {
            $ids = array_filter(array_map('intval', explode(',', (string) $request->query('pengajuan_ids'))));
            $query->whereIn('pengajuan_id', $ids);
        }

        if ($request->filled('dokumen_kerjasama_ids')) {
            $ids = array_filter(array_map('intval', explode(',', (string) $request->query('dokumen_kerjasama_ids'))));
            $query->whereIn('dokumen_kerjasama_id', $ids);
        }

        $data = $query->orderByDesc('created_at')->get();

        return response([
            'success' => true,
            'data' => $data,
            'message' => 'Laporan pelaksanaan retrieved successfully',
        ]);
    }

    public function store(Request $request): Response
    {
        $validated = $request->validate([
            'pengajuan_id' => ['nullable', 'integer', 'exists:pengajuan_v2,id'],
            'dokumen_kerjasama_id' => ['nullable', 'integer', 'exists:dokumen_kerjasama,id'],
            'nomor_dokumen' => ['nullable', 'string', 'max:100'],
            'nama_mitra' => ['nullable', 'string', 'max:255'],
            'jenis_dokumen' => ['nullable', 'string', 'max:10'],
            'judul_kerjasama' => ['nullable', 'string', 'max:255'],
            'referensi_kerjasama' => ['nullable', 'string', 'max:255'],
            'unit_pengaju' => ['nullable', 'string', 'max:255'],
            'kegiatan' => ['nullable', 'string'],
            'capaian' => ['nullable', 'string'],
            'hasil' => ['nullable', 'string'],
            'tautan_dokumentasi' => ['nullable', 'string', 'max:255'],
            'nama_penanggung_jawab' => ['nullable', 'string', 'max:150'],
            'nip_penanggung_jawab' => ['nullable', 'string', 'max:50'],
            'jabatan_mengetahui' => ['nullable', 'string', 'max:150'],
            'nama_mengetahui' => ['nullable', 'string', 'max:150'],
            'nip_mengetahui' => ['nullable', 'string', 'max:50'],
            'file' => ['nullable', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:10240'],
        ]);

        if (empty($validated['pengajuan_id']) && empty($validated['dokumen_kerjasama_id'])) {
            return response([
                'success' => false,
                'message' => 'Laporan harus terhubung ke pengajuan atau dokumen kerjasama.',
            ], 422);
        }

        if ($request->hasFile('file')) {
            $uploadedFile = $request->file('file');
            $path = $uploadedFile->store('laporan-pelaksanaan/' . now()->format('Y/m'), 'public');

            $validated['file_path'] = $path;
            $validated['file_nama'] = $uploadedFile->getClientOriginalName();
            $validated['file_mime_type'] = $uploadedFile->getMimeType();
            $validated['file_ukuran_bytes'] = $uploadedFile->getSize();
        }

        unset($validated['file']);

        $user = $request->user();
        $validated['dikirim_oleh_user_id'] = $user?->id;
        $validated['dikirim_oleh_role'] = $user?->role;
        $validated['status'] = 'terkirim';

        $laporan = LaporanPelaksanaan::create($validated);
        $laporan->load(['dikirimOleh:id,name,role']);

        return response([
            'success' => true,
            'data' => $laporan,
            'message' => 'Laporan pelaksanaan berhasil dikirim',
        ], 201);
    }

    public function destroy(Request $request, LaporanPelaksanaan $laporan_pelaksanaan): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        if ($laporan_pelaksanaan->file_path) {
            Storage::disk('public')->delete($laporan_pelaksanaan->file_path);
        }

        $laporan_pelaksanaan->delete();

        return response([
            'success' => true,
            'data' => null,
            'message' => 'Laporan pelaksanaan berhasil dihapus',
        ]);
    }
}
