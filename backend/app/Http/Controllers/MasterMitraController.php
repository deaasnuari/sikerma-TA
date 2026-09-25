<?php

namespace App\Http\Controllers;

use App\Models\MasterMitra;
use App\Services\MasterMitraResolver;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class MasterMitraController extends Controller
{
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

    /**
     * Saran nama instansi untuk form registrasi eksternal (autocomplete), supaya
     * pendaftar bisa memilih mitra yang sudah ada alih-alih mengetik nama baru.
     * Hanya id & nama yang dikembalikan — nama mitra memang sudah publik
     * (lihat /public/kerjasama).
     *
     * Pencocokan per kata & abaikan tanda baca: "sum", "pt sumi", "sumitomo indo"
     * semuanya ketemu "PT. Sumitomo Electric Indonesia". Urutan: nama yang diawali
     * ketikan dulu, lalu yang salah satu katanya diawali ketikan, baru sisanya.
     */
    public function publicSearch(Request $request): Response
    {
        $keyword = mb_strtolower(trim((string) $request->query('q', '')));
        $tokens = array_values(array_filter(preg_split('/[^\p{L}\p{N}]+/u', $keyword) ?: []));
        if (mb_strlen(implode('', $tokens)) < 2) {
            return response(['success' => true, 'data' => []]);
        }

        $query = MasterMitra::query();
        foreach ($tokens as $token) {
            $query->whereRaw('LOWER(nama_mitra) LIKE ?', ['%' . $token . '%']);
        }
        $candidates = $query->orderBy('nama_mitra')->limit(50)->get(['id', 'nama_mitra']);

        $normalizedKeyword = MasterMitraResolver::normalize($keyword);
        $rank = function (MasterMitra $mitra) use ($normalizedKeyword, $tokens): int {
            $normalized = MasterMitraResolver::normalize($mitra->nama_mitra);
            if ($normalized === $normalizedKeyword) {
                return 0;
            }
            if (str_starts_with($normalized, $normalizedKeyword)) {
                return 1;
            }
            $words = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($mitra->nama_mitra)) ?: [];
            foreach ($words as $word) {
                if ($word !== '' && str_starts_with($word, $tokens[0])) {
                    return 2;
                }
            }

            return 3;
        };

        $rows = $candidates
            ->sortBy(fn (MasterMitra $mitra) => [$rank($mitra), mb_strtolower($mitra->nama_mitra)])
            ->take(8)
            ->values();

        return response(['success' => true, 'data' => $rows]);
    }

    /**
     * Cari mitra dengan aturan nama yang sama seperti registrasi/pengajuan
     * (MasterMitraResolver); kalau ada, update field yang dikirim, kalau belum ada,
     * buat baru. Dipakai edit pengajuan & Tambah Dokumen di Rekap Data.
     */
    public function upsertByName(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'nama_mitra' => 'required|string|max:255',
            'kategori_mitra' => ['nullable', 'string', 'max:150'],
            'bidang_usaha' => ['nullable', 'string', 'max:150'],
            'tingkat_perusahaan' => ['nullable', 'string', 'in:Lokal,Nasional,Internasional,Multinasional'],
            'negara' => 'nullable|string|max:100',
            'website' => 'nullable|url|max:255',
            'alamat' => 'nullable|string',
            'email_mitra' => 'nullable|email|max:255',
            'whatsapp_mitra' => 'nullable|string|max:50',
            'no_telepon_mitra' => 'nullable|string|max:50',
            'nama_kontak_utama' => 'nullable|string|max:200',
            'jabatan_kontak_utama' => 'nullable|string|max:120',
            'email_kontak_utama' => 'nullable|email|max:255',
            'telepon_kontak_utama' => 'nullable|string|max:50',
            'aktif' => 'boolean',
        ]);

        $resolver = app(MasterMitraResolver::class);
        $mitra = $resolver->findByName($validated['nama_mitra']);

        if ($mitra) {
            // Nama tetap memakai penulisan yang sudah ada di Data Kemitraan.
            $mitra->update(collect($validated)->except('nama_mitra')->all());

            return response(['success' => true, 'data' => $mitra->fresh(), 'message' => 'Master mitra updated successfully']);
        }

        $mitra = MasterMitra::create(array_merge(['aktif' => true], $validated, ['nama_mitra' => trim($validated['nama_mitra'])]));
        $resolver->linkOrphanedRecords($mitra);

        return response(['success' => true, 'data' => $mitra, 'message' => 'Master mitra created successfully'], 201);
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
            'data' => $query->with('kontak:id,mitra_id,nama,jabatan,email,telepon')->orderBy('nama_mitra')->get(),
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
            'whatsapp_mitra' => 'nullable|string|max:50',
            'no_telepon_mitra' => 'nullable|string|max:50',
            'nama_kontak_utama' => 'nullable|string|max:200',
            'jabatan_kontak_utama' => 'nullable|string|max:120',
            'email_kontak_utama' => 'nullable|email|max:255',
            'telepon_kontak_utama' => 'nullable|string|max:50',
            'aktif' => 'boolean',
        ]);

        $kontak = $this->validateKontak($request);

        try {
            $mitra = DB::transaction(function () use ($validated, $kontak) {
                $mitra = MasterMitra::create($validated);
                $this->syncKontak($mitra, $kontak);

                return $mitra;
            });
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal menyimpan master mitra.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        app(MasterMitraResolver::class)->linkOrphanedRecords($mitra);

        return response([
            'success' => true,
            'data' => $mitra->load('kontak'),
            'message' => 'Master mitra created successfully',
        ], 201);
    }

    public function show(MasterMitra $mitra): Response
    {
        return response([
            'success' => true,
            'data' => $mitra->load('kontak'),
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
            'whatsapp_mitra' => 'nullable|string|max:50',
            'no_telepon_mitra' => 'nullable|string|max:50',
            'nama_kontak_utama' => 'nullable|string|max:200',
            'jabatan_kontak_utama' => 'nullable|string|max:120',
            'email_kontak_utama' => 'nullable|email|max:255',
            'telepon_kontak_utama' => 'nullable|string|max:50',
            'aktif' => 'boolean',
        ]);

        $kontak = $this->validateKontak($request);

        try {
            DB::transaction(function () use ($mitra, $validated, $kontak) {
                $mitra->update($validated);
                $this->syncKontak($mitra, $kontak);
            });
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal mengubah master mitra.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        app(MasterMitraResolver::class)->linkOrphanedRecords($mitra);

        return response([
            'success' => true,
            'data' => $mitra->load('kontak'),
            'message' => 'Master mitra updated successfully',
        ]);
    }

    /**
     * Kontak tambahan dari form Data Kemitraan. null = field `kontak` tidak dikirim,
     * jadi kontak yang ada tidak diubah (mis. update dari halaman lain).
     */
    private function validateKontak(Request $request): ?array
    {
        if (! $request->has('kontak')) {
            return null;
        }

        return $request->validate([
            'kontak' => 'present|array|max:50',
            'kontak.*.id' => 'nullable|integer',
            'kontak.*.nama' => 'required|string|max:200',
            'kontak.*.jabatan' => 'nullable|string|max:120',
            'kontak.*.email' => 'nullable|email|max:255',
            'kontak.*.telepon' => 'nullable|string|max:50',
        ], [
            'kontak.*.nama.required' => 'Nama kontak tambahan wajib diisi.',
            'kontak.*.email.email' => 'Email kontak tambahan tidak valid.',
        ])['kontak'];
    }

    /**
     * Samakan kontak_mitra dengan daftar dari form: yang punya id diubah, yang
     * tanpa id ditambah, yang tidak ada lagi di daftar dihapus. id milik mitra
     * lain diabaikan (diperlakukan sebagai kontak baru).
     */
    private function syncKontak(MasterMitra $mitra, ?array $kontak): void
    {
        if ($kontak === null) {
            return;
        }

        $existing = $mitra->kontak()->get()->keyBy('id');
        $keptIds = [];

        foreach ($kontak as $item) {
            $data = [
                'nama' => trim($item['nama']),
                'jabatan' => filled($item['jabatan'] ?? null) ? trim($item['jabatan']) : null,
                'email' => filled($item['email'] ?? null) ? strtolower(trim($item['email'])) : null,
                'telepon' => filled($item['telepon'] ?? null) ? trim($item['telepon']) : null,
            ];

            $row = isset($item['id']) ? $existing->get((int) $item['id']) : null;
            if ($row) {
                $row->update($data);
                $keptIds[] = $row->id;
            } else {
                $keptIds[] = $mitra->kontak()->create($data)->id;
            }
        }

        $mitra->kontak()->whereNotIn('id', $keptIds)->delete();
        $mitra->unsetRelation('kontak');
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