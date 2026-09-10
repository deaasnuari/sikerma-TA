<?php

namespace App\Http\Controllers;

use App\Models\LaporanPelaksanaan;
use App\Models\Pengajuan;
use App\Support\Triwulan;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LaporanPelaksanaanController extends Controller
{
    private function normalizedRole(Request $request): string
    {
        $user = $request->user();
        return strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));
    }

    private function isAdminRole(Request $request): bool
    {
        return in_array($this->normalizedRole($request), ['admin', 'admin-humas'], true);
    }

    private function ensureAdmin(Request $request): ?Response
    {
        if (!$this->isAdminRole($request)) {
            return response([
                'success' => false,
                'message' => 'Only admin can perform this action',
            ], 403);
        }

        return null;
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

    //menampilkan semua laporan pelaksanaan yang bisa dilihat oleh user (pemilik pengajuan atau admin)
    public function index(Request $request): Response
    {
        $query = LaporanPelaksanaan::query()->with(['dikirimOleh:id,name,role']);
        $viewableIds = $this->viewablePengajuanIds($request);

        if ($request->filled('pengajuan_ids')) {
            $ids = array_filter(array_map('intval', explode(',', (string) $request->query('pengajuan_ids'))));

            if ($viewableIds !== null) {
                $ids = array_values(array_intersect($ids, $viewableIds));
            }

            $query->whereIn('pengajuan_id', $ids);
        } elseif ($viewableIds !== null) {
            $query->whereIn('pengajuan_id', $viewableIds);
        }

        if ($request->filled('dokumen_kerjasama_ids')) {
            // Belum ada model kepemilikan per-user untuk dokumen_kerjasama, dan saat ini
            // tidak ada pemanggil non-admin di frontend — batasi ke admin untuk jaga-jaga.
            if (!$this->isAdminRole($request)) {
                return response([
                    'success' => false,
                    'message' => 'Only admin can filter by dokumen_kerjasama_ids',
                ], 403);
            }

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
            // Monev manual (Rekap Data -> Detail Kerjasama -> Monev Triwulan): "Catatan
            // Monitoring" dipetakan ke `kegiatan`, "Hasil Evaluasi" ke `hasil` di atas.
            'kendala' => ['nullable', 'string'],
            'tindak_lanjut' => ['nullable', 'string'],
            'tautan_dokumentasi' => ['nullable', 'string', 'max:255'],
            // Periode Hasil Monitoring (Triwulan 1: Jan-Mar, ..., 4: Okt-Des) untuk rekap.
            'tahun' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'triwulan' => ['nullable', 'integer', 'min:1', 'max:4'],
            'nama_penanggung_jawab' => ['nullable', 'string', 'max:150'],
            'nip_penanggung_jawab' => ['nullable', 'string', 'max:50'],
            'jabatan_mengetahui' => ['nullable', 'string', 'max:150'],
            'nama_mengetahui' => ['nullable', 'string', 'max:150'],
            'nip_mengetahui' => ['nullable', 'string', 'max:50'],
            'file' => [
                'nullable',
                'file',
                'max:10240',
                function ($attribute, $value, $fail) {
                    $ext = strtolower((string) $value->getClientOriginalExtension());
                    if (!in_array($ext, ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'], true)) {
                        $fail('The file field must be a file of type: pdf, doc, docx, jpg, jpeg, png.');
                    }
                },
            ],
        ]);

        if (empty($validated['pengajuan_id']) && empty($validated['dokumen_kerjasama_id'])) {
            return response([
                'success' => false,
                'message' => 'Laporan harus terhubung ke pengajuan atau dokumen kerjasama.',
            ], 422);
        }

        if (!$this->isAdminRole($request)) {
            // Yang di-CC (distribusi_user_ids) cuma boleh melihat — hanya pemilik asli
            // pengajuan yang boleh mengirim laporan pelaksanaan.
            $user = $request->user();
            $isOwner = !empty($validated['pengajuan_id']) && $user && Pengajuan::query()
                ->where('id', $validated['pengajuan_id'])
                ->where('user_pengusul_id', $user->id)
                ->exists();

            if (!$isOwner) {
                return response([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk mengirim laporan pelaksanaan pada pengajuan ini.',
                ], 403);
            }
        }

        if ($request->hasFile('file')) {
            $uploadedFile = $request->file('file');
            // Simpan pakai ekstensi asli dari nama file klien, bukan tebakan MIME dari isi berkas —
            // finfo sering mendeteksi .docx sebagai application/zip sehingga store() bawaan salah beri ekstensi .zip.
            $originalExt = strtolower($uploadedFile->getClientOriginalExtension());
            $fileName = Str::random(32) . ($originalExt !== '' ? '.' . $originalExt : '');
            $path = $uploadedFile->storeAs('laporan-pelaksanaan/' . now()->format('Y/m'), $fileName, 'public');

            $validated['file_path'] = $path;
            $validated['file_nama'] = $uploadedFile->getClientOriginalName();
            $validated['file_mime_type'] = $uploadedFile->getMimeType();
            $validated['file_ukuran_bytes'] = $uploadedFile->getSize();
        }

        unset($validated['file']);

        // Kalau pengirim tidak menyebut periode secara eksplisit, tentukan dari
        // tanggal laporan dikirim supaya tetap bisa direkap per triwulan.
        if (empty($validated['tahun'])) {
            $validated['tahun'] = (int) now()->format('Y');
        }
        if (empty($validated['triwulan'])) {
            $validated['triwulan'] = Triwulan::fromMonth((int) now()->format('n'));
        }

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
