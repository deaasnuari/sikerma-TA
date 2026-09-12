<?php

namespace App\Http\Controllers;

use App\Models\DokumenFile;
use App\Models\DokumenLog;
use App\Models\DokumenKerjasama;
use App\Models\LaporanPelaksanaan;
use App\Models\Pengajuan;
use App\Models\PengajuanAktivitas;
use App\Services\StructuralAccessService;
use App\Support\Triwulan;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class DokumenKerjasamaController extends Controller
{
    private function persistDataUrlFile(string $dataUrl, string $folder): ?string
    {
        if (!preg_match('/^data:([\w\/+.-]+);base64,(.+)$/', $dataUrl, $matches)) {
            return null;
        }

        $mimeType = strtolower($matches[1]);
        $base64 = preg_replace('/\s+/', '', $matches[2]) ?? '';
        $binary = base64_decode($base64, true);

        if ($binary === false || $binary === '') {
            return null;
        }

        $ext = match ($mimeType) {
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/msword' => 'doc',
            default => 'bin',
        };

        $relativePath = $folder . '/' . date('Y/m') . '/' . Str::random(16) . '.' . $ext;
        Storage::disk('public')->put($relativePath, $binary);

        return $relativePath;
    }

    private function ensureAdmin(Request $request): ?Response
    {
        $user = $request->user();
        $rawRole = (string) ($user?->role ?? '');
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim($rawRole)));

        if (!in_array($normalizedRole, ['admin', 'admin-humas'], true)) {
            return response([
                'success' => false,
                'message' => 'Only admin can modify dokumen kerjasama',
            ], 403);
        }

        return null;
    }

    /**
     * Monev (Monitoring dan Evaluasi) Triwulan untuk satu kerjasama, dipakai di
     * Rekap Data -> Detail Kerjasama -> Monev.
     *
     * Diikat ke DokumenKerjasama (bukan Pengajuan) karena itulah yang selalu ada untuk
     * setiap baris di Detail Kerjasama — banyak dokumen (terutama data lama/import)
     * tidak punya `sumber_pengajuan_id`, jadi Monev manual TIDAK BOLEH bergantung pada
     * pengajuan sumbernya. Menggabungkan (bukan menyalin) dua sumber data, per
     * tahun+triwulan:
     * - Aktivitas dari Story (pengajuan_aktivitas) — read-only di sini, cuma tersedia
     *   kalau dokumen ini punya pengajuan sumber (relasi `pengajuan()`); triwulannya
     *   dihitung otomatis dari tanggal aktivitas lewat accessor di model
     *   PengajuanAktivitas, jadi otomatis ikut berubah/hilang saat aktivitasnya
     *   diedit/dihapus di Story, tanpa sinkronisasi manual.
     * - Entri Monev manual (laporan_pelaksanaan) yang terhubung ke dokumen ini lewat
     *   dokumen_kerjasama_id — SELALU tersedia untuk diisi apa pun status pengajuan
     *   sumbernya.
     */
    public function monev(Request $request, DokumenKerjasama $dokumen_kerjasama): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $pengajuan = $dokumen_kerjasama->sumber_pengajuan_id
            ? Pengajuan::find($dokumen_kerjasama->sumber_pengajuan_id)
            : null;

        // Aktivitas Story bisa menempel ke dokumen ini langsung (kerja sama tanpa pengajuan
        // sumber) ATAU ke pengajuan sumbernya (data lama). Ambil keduanya.
        $aktivitas = PengajuanAktivitas::query()
            ->where('dokumen_kerjasama_id', $dokumen_kerjasama->id)
            ->when($pengajuan, fn ($builder) => $builder->orWhere('pengajuan_id', $pengajuan->id))
            ->orderBy('tanggal')
            ->get();

        $monevEntries = LaporanPelaksanaan::query()
            ->where('dokumen_kerjasama_id', $dokumen_kerjasama->id)
            ->when($pengajuan, fn ($builder) => $builder->orWhere('pengajuan_id', $pengajuan->id))
            ->with('dikirimOleh:id,name,role')
            ->orderByDesc('created_at')
            ->get();

        $buckets = [];

        foreach ($aktivitas as $item) {
            if (!$item->tahun || !$item->triwulan) {
                continue;
            }

            $key = $item->tahun . '-' . $item->triwulan;
            $buckets[$key] ??= ['tahun' => $item->tahun, 'triwulan' => $item->triwulan, 'aktivitas' => [], 'monev' => []];
            $buckets[$key]['aktivitas'][] = $item;
        }

        foreach ($monevEntries as $entry) {
            $periode = $entry->tahun && $entry->triwulan
                ? ['tahun' => $entry->tahun, 'triwulan' => $entry->triwulan]
                : Triwulan::fromDate($entry->created_at);

            if (!$periode) {
                continue;
            }

            $key = $periode['tahun'] . '-' . $periode['triwulan'];
            $buckets[$key] ??= ['tahun' => $periode['tahun'], 'triwulan' => $periode['triwulan'], 'aktivitas' => [], 'monev' => []];
            $buckets[$key]['monev'][] = $entry;
        }

        // Selalu sediakan Triwulan I-IV untuk tahun berjalan supaya UI tidak "kosong total"
        // walau belum ada aktivitas/monev sama sekali untuk kerjasama ini.
        $currentYear = (int) now()->format('Y');
        for ($q = 1; $q <= 4; $q++) {
            $key = $currentYear . '-' . $q;
            $buckets[$key] ??= ['tahun' => $currentYear, 'triwulan' => $q, 'aktivitas' => [], 'monev' => []];
        }

        $quarters = collect($buckets)
            ->map(fn (array $bucket) => [
                'tahun' => $bucket['tahun'],
                'triwulan' => $bucket['triwulan'],
                'label' => Triwulan::label($bucket['triwulan']),
                'aktivitas' => $bucket['aktivitas'],
                'monev' => $bucket['monev'],
            ])
            ->sortBy([['tahun', 'desc'], ['triwulan', 'desc']])
            ->values();

        return response([
            'success' => true,
            'data' => [
                'dokumen_kerjasama_id' => $dokumen_kerjasama->id,
                'pengajuan_id' => $pengajuan?->id,
                'quarters' => $quarters,
            ],
            'message' => 'Data monev berhasil diambil',
        ]);
    }

    public function index(Request $request): Response
    {
        $query = DokumenKerjasama::query()->with([
            'pengajuan:id,nomor_pengajuan,nama_pengusul,whatsapp_pengusul,nama_mitra,email_pengusul,user_pengusul_id',
            'pengajuan.userPengusul:id,role',
            // parent dimuat supaya Jurusan bisa diturunkan saat unitProdi-nya berupa Prodi (anak dari Jurusan).
            'unitProdi:id,nama,jenis_node,kategori_unit,parent_id',
            'unitProdi.parent:id,nama,jenis_node,kategori_unit',
            'mitra:id,nama_mitra,kode_mitra,kategori_mitra,bidang_usaha,tingkat_perusahaan,negara,email_mitra,email_kontak_utama,alamat,nama_kontak_utama,jabatan_kontak_utama,telepon_kontak_utama,whatsapp_mitra,no_telepon_mitra',
            'dokumenFiles' => function ($q) {
                $q->whereIn('peran_berkas', ['dokumen_final', 'dokumen_perpanjangan', 'dokumen_pendukung', 'bukti_tidak_diperpanjang']);
            },
            // Dipakai untuk kolom "Hasil Monitoring Triwulan 1-4" & "Laporan Kegiatan" di Rekap Data.
            'laporanPelaksanaan:id,dokumen_kerjasama_id,tahun,triwulan,file_path,file_nama',
        ]);

        $user = $request->user();
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));

        // "Hapus" oleh admin di Rekap Data cuma menyembunyikan dari daftar kelola admin & dari
        // pengguna lain — BUKAN hard delete — supaya akun internal/eksternal/kampus-LDAP yang
        // pengajuan sumbernya masih tetap punya riwayat dokumen kerjasamanya sendiri. Admin sendiri
        // TIDAK ikut pengecualian ini (kalau tidak, dokumen buatan admin sendiri yang dihapus admin
        // akan tetap nampak balik ke admin yang sama).
        if (Schema::hasColumn('dokumen_kerjasama', 'dihapus_admin_pada')) {
            $isAdmin = in_array($normalizedRole, ['admin', 'admin-humas'], true);
            $query->where(function ($builder) use ($user, $isAdmin) {
                $builder->whereNull('dihapus_admin_pada');
                if ($user && !$isAdmin) {
                    $builder->orWhere('dibuat_oleh_user_id', $user->id)
                        ->orWhereHas('pengajuan', function ($inner) use ($user) {
                            $inner->where('user_pengusul_id', $user->id);
                        });
                }
            });

            // Pemilik (internal/eksternal/kampus-LDAP) juga bisa hapus dokumen kerjasamanya
            // sendiri — kebalikan dari dihapus_admin_pada: cuma sembunyi dari akunnya sendiri,
            // admin tetap melihatnya untuk keperluan audit/rekap institusi.
            if (Schema::hasColumn('dokumen_kerjasama', 'dihapus_user_pada') && !$isAdmin) {
                $query->whereNull('dihapus_user_pada');
            }
        }

        if (in_array($normalizedRole, ['internal', 'unit', 'jurusan', 'prodi'], true)) {
            // Ketua Jurusan/Ketua Prodi/Kepala Unit (role internal ATAU unit — lihat
            // StructuralAccessService, deteksi jabatan berdasarkan NIK bukan role
            // spesifik) ikut boleh lihat dokumen kerjasama dalam cakupan
            // jurusan/prodi/unit yang dia pimpin, selain dokumen milik sendiri.
            $scopedUnitProdiIds = null;
            if ($user && Schema::hasColumn('dokumen_kerjasama', 'unit_prodi_id')) {
                $access = app(StructuralAccessService::class)->getUserStructuralAccess($user);
                $scopedUnitProdiIds = app(StructuralAccessService::class)->resolveScopedUnitProdiIds($access);
            }

            $query->where(function ($builder) use ($user, $scopedUnitProdiIds) {
                $builder->whereHas('pengajuan', function ($inner) use ($user) {
                    $inner->where(function ($q) use ($user) {
                        $q->where('user_pengusul_id', $user->id)
                            ->orWhereJsonContains('distribusi_user_ids', $user->id);
                    });
                });

                if ($scopedUnitProdiIds) {
                    $builder->orWhereIn('unit_prodi_id', $scopedUnitProdiIds);
                }
            });
        }

        if ($request->filled('status_siklus')) {
            $query->where('status_siklus', $request->string('status_siklus')->toString());
        }

        if ($request->filled('jenis_dokumen')) {
            $query->where('jenis_dokumen', strtoupper($request->string('jenis_dokumen')->toString()));
        }

        if ($request->filled('search')) {
            $keyword = strtolower($request->string('search')->trim()->toString());
            $query->where(function ($builder) use ($keyword) {
                $builder
                    ->whereRaw('LOWER(COALESCE(nomor_dokumen, \'\')) LIKE ?', ['%' . $keyword . '%'])
                    ->orWhereRaw('LOWER(COALESCE(nama_dokumen, \'\')) LIKE ?', ['%' . $keyword . '%'])
                    ->orWhereRaw('LOWER(COALESCE(judul_dokumen, \'\')) LIKE ?', ['%' . $keyword . '%']);
            });
        }

        $data = $query->orderByDesc('id')->paginate((int) $request->integer('per_page', 20));

        return response([
            'success' => true,
            'data' => $data,
            'message' => 'Dokumen kerjasama retrieved successfully',
        ]);
    }

    public function show(Request $request, DokumenKerjasama $dokumen_kerjasama): Response
    {
        //ini guard untuk memastikan dokumen kerjasama yang diakses user memang bisa dilihat oleh user tersebut
        $user = $request->user();
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));
        $isAdmin = in_array($normalizedRole, ['admin', 'admin-humas'], true);
        $isOwner = $user && (
            (int) $dokumen_kerjasama->dibuat_oleh_user_id === (int) $user->id
            || (int) $dokumen_kerjasama->pengajuan?->user_pengusul_id === (int) $user->id
        );

        if ($dokumen_kerjasama->dihapus_admin_pada || $dokumen_kerjasama->dihapus_user_pada) {
            $visible = $isAdmin
                ? !$dokumen_kerjasama->dihapus_admin_pada
                : (!$dokumen_kerjasama->dihapus_admin_pada || $isOwner) && !$dokumen_kerjasama->dihapus_user_pada;

            if (!$visible) {
                return response([
                    'success' => false,
                    'message' => 'Dokumen kerjasama tidak ditemukan.',
                ], 404);
            }
        }

        // Otorisasi kepemilikan/struktural untuk dokumen yang TIDAK dihapus — cerminan
        // dari index(). admin/admin-humas & pimpinan tetap akses penuh (tidak diubah).
        // Sebelumnya endpoint ini cuma cek kepemilikan untuk dokumen yang sudah dihapus —
        // dokumen normal bisa dibuka siapa saja yang login; ini menutup celah itu.
        if (!$isAdmin && $normalizedRole !== 'pimpinan') {
            $isDistribusi = $user
                && is_array($dokumen_kerjasama->pengajuan?->distribusi_user_ids)
                && in_array($user->id, $dokumen_kerjasama->pengajuan->distribusi_user_ids, false);

            $isInStructuralScope = false;
            if (!$isOwner && !$isDistribusi && in_array($normalizedRole, ['internal', 'unit', 'jurusan', 'prodi'], true) && $user) {
                $access = app(StructuralAccessService::class)->getUserStructuralAccess($user);
                $scopedUnitProdiIds = app(StructuralAccessService::class)->resolveScopedUnitProdiIds($access);
                $isInStructuralScope = $scopedUnitProdiIds
                    && in_array($dokumen_kerjasama->unit_prodi_id, $scopedUnitProdiIds, false);
            }

            if (!$isOwner && !$isDistribusi && !$isInStructuralScope) {
                return response([
                    'success' => false,
                    'message' => 'Dokumen kerjasama tidak ditemukan.',
                ], 404);
            }
        }

        $dokumen_kerjasama->load([
            'pengajuan:id,nomor_pengajuan,nama_pengusul,whatsapp_pengusul,nama_mitra,email_pengusul',
            'unitProdi:id,nama,jenis_node,kategori_unit,parent_id',
            'unitProdi.parent:id,nama,jenis_node,kategori_unit',
            'mitra:id,nama_mitra,kode_mitra,kategori_mitra,bidang_usaha,tingkat_perusahaan,negara,email_mitra,email_kontak_utama,alamat,nama_kontak_utama,jabatan_kontak_utama,telepon_kontak_utama,whatsapp_mitra,no_telepon_mitra',
        ]);

        return response([
            'success' => true,
            'data' => $dokumen_kerjasama,
            'message' => 'Dokumen kerjasama retrieved successfully',
        ]);
    }

    /**
     * Cari path fisik dokumen di disk 'public'. Dokumen lama hasil import dari sistem sikerma
     * sebelumnya cuma menyimpan NAMA FILE POLOS di kolom `file`/`path_file` (tanpa folder),
     * padahal berkas fisiknya diletakkan di subfolder storage/app/public/dokumen/ — jadi kalau
     * path aslinya tidak ketemu langsung di root disk public, coba juga di dalam folder
     * dokumen/ sebelum dianggap benar-benar hilang. Path baru (mis. pengajuan/2026/08/xxx.pdf)
     * tetap ketemu langsung di percobaan pertama, tidak terpengaruh fallback ini.
     */
    private function resolveDokumenFilePath(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        $trimmed = ltrim($path, '/');

        if (Storage::disk('public')->exists($trimmed)) {
            return $trimmed;
        }

        $legacyCandidate = 'dokumen/' . basename($trimmed);
        if (Storage::disk('public')->exists($legacyCandidate)) {
            return $legacyCandidate;
        }

        return null;
    }

    /**
     //ini guard untuk memastikan dokumen kerjasama yang diakses user memang bisa dilihat oleh user tersebut
     */
    public function documents(Request $request, DokumenKerjasama $dokumen_kerjasama): Response
    {
        if ($response = $this->guardVisibility($request, $dokumen_kerjasama)) {
            return $response;
        }

        $files = $dokumen_kerjasama->dokumenFiles()->orderByDesc('diunggah_pada')->get();

        if ($files->isEmpty() && $dokumen_kerjasama->file) {
            // Record lama yang belum punya baris dokumen_file — jatuhkan ke kolom 'file' legacy.
            $path = $dokumen_kerjasama->file;
            $exists = $this->resolveDokumenFilePath($path) !== null;
            $items = [[
                'id' => null,
                'peran_berkas' => 'final',
                'nama_file' => basename($path),
                'mime_type' => str_ends_with(strtolower($path), '.pdf') ? 'application/pdf' : null,
                'ukuran_file_bytes' => null,
                // 'view_url' hanya diisi kalau filenya beneran ada di disk — kalau tidak, dibiarkan
                // null (bukan link mentah ke storage) supaya klik "Lihat Dokumen" tidak berujung ke
                // halaman 404 polos dari webserver; frontend tinggal cek exists/view_url === null.
                'view_url' => $exists ? route('dokumen-kerjasama.documents.view', [
                    'dokumen_kerjasama' => $dokumen_kerjasama->id,
                    'dokumen_file' => 'legacy',
                ]) : null,
                'download_url' => route('dokumen-kerjasama.documents.download', [
                    'dokumen_kerjasama' => $dokumen_kerjasama->id,
                    'dokumen_file' => 'legacy',
                ]),
                'exists' => $exists,
            ]];
        } else {
            $items = $files->map(function (DokumenFile $f) use ($dokumen_kerjasama) {
                $exists = $this->resolveDokumenFilePath($f->path_file) !== null;

                return [
                    'id' => $f->id,
                    'peran_berkas' => $f->peran_berkas,
                    'nama_file' => $f->nama_file,
                    'mime_type' => $f->mime_type,
                    'ukuran_file_bytes' => $f->ukuran_file_bytes,
                    'view_url' => $exists ? route('dokumen-kerjasama.documents.view', [
                        'dokumen_kerjasama' => $dokumen_kerjasama->id,
                        'dokumen_file' => $f->id,
                    ]) : null,
                    'download_url' => route('dokumen-kerjasama.documents.download', [
                        'dokumen_kerjasama' => $dokumen_kerjasama->id,
                        'dokumen_file' => $f->id,
                    ]),
                    'exists' => $exists,
                ];
            })->values()->all();
        }

        return response([
            'success' => true,
            'data' => $items,
            'message' => 'Dokumen retrieved successfully',
        ]);
    }

    /**
     * Paksa unduh salah satu dokumen milik dokumen kerjasama (dipakai tombol "Download Dokumen").
     * $dokumen_file boleh berupa id baris dokumen_file, atau literal "legacy" untuk record lama
     * yang hanya punya kolom 'file'.
     */
    public function downloadDocument(Request $request, DokumenKerjasama $dokumen_kerjasama, string $dokumen_file): Response|\Symfony\Component\HttpFoundation\StreamedResponse
    {
        if ($response = $this->guardVisibility($request, $dokumen_kerjasama)) {
            return $response;
        }

        $path = null;
        $displayName = null;

        if ($dokumen_file === 'legacy') {
            $path = $dokumen_kerjasama->file;
            $displayName = $path ? basename($path) : null;
        } else {
            $file = DokumenFile::query()
                ->where('id', $dokumen_file)
                ->where('dokumen_id', $dokumen_kerjasama->id)
                ->first();
            if ($file) {
                $path = $file->path_file;
                $displayName = $file->nama_file ?: basename((string) $path);
            }
        }

        $resolvedPath = $this->resolveDokumenFilePath($path);
        if (!$resolvedPath) {
            return response([
                'success' => false,
                'message' => 'File dokumen tidak ditemukan.',
            ], 404);
        }

        return Storage::disk('public')->download($resolvedPath, $displayName);
    }

    /**
     * Tampilkan salah satu dokumen inline di tab baru (dipakai tombol "Lihat Dokumen"). Sengaja
     * dibuatkan endpoint terpisah dari raw storage URL supaya kalau filenya sudah hilang dari
     * disk, yang muncul adalah 404 JSON yang jelas ("File dokumen tidak ditemukan.") — bukan
     * halaman 404 polos dari webserver atau viewer PDF yang gagal diam-diam.
     */
    public function viewDocument(Request $request, DokumenKerjasama $dokumen_kerjasama, string $dokumen_file): Response|\Symfony\Component\HttpFoundation\StreamedResponse
    {
        if ($response = $this->guardVisibility($request, $dokumen_kerjasama)) {
            return $response;
        }

        $path = null;
        $displayName = null;

        if ($dokumen_file === 'legacy') {
            $path = $dokumen_kerjasama->file;
            $displayName = $path ? basename($path) : null;
        } else {
            $file = DokumenFile::query()
                ->where('id', $dokumen_file)
                ->where('dokumen_id', $dokumen_kerjasama->id)
                ->first();
            if ($file) {
                $path = $file->path_file;
                $displayName = $file->nama_file ?: basename((string) $path);
            }
        }

        $resolvedPath = $this->resolveDokumenFilePath($path);
        if (!$resolvedPath) {
            return response([
                'success' => false,
                'message' => 'File dokumen tidak ditemukan.',
            ], 404);
        }

        return Storage::disk('public')->response($resolvedPath, $displayName);
    }

    //fungsi untuk memeriksa apakah dokumen kerjasama sudah dihapus oleh admin atau user, dan apakah user yang mengakses adalah admin atau pemilik dokumen
    private function guardVisibility(Request $request, DokumenKerjasama $dokumen_kerjasama): ?Response
    {
        if (!$dokumen_kerjasama->dihapus_admin_pada && !$dokumen_kerjasama->dihapus_user_pada) {
            return null;
        }

        $user = $request->user();
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));
        $isAdmin = in_array($normalizedRole, ['admin', 'admin-humas'], true);
        $isOwner = $user && (
            (int) $dokumen_kerjasama->dibuat_oleh_user_id === (int) $user->id
            || (int) $dokumen_kerjasama->pengajuan?->user_pengusul_id === (int) $user->id
        );

        $visible = $isAdmin
            ? !$dokumen_kerjasama->dihapus_admin_pada
            : (!$dokumen_kerjasama->dihapus_admin_pada || $isOwner) && !$dokumen_kerjasama->dihapus_user_pada;

        if ($visible) {
            return null;
        }

        return response([
            'success' => false,
            'message' => 'Dokumen kerjasama tidak ditemukan.',
        ], 404);
    }

    //fungsi untuk menandai dokumen kerjasama sebagai dihapus oleh admin atau user
    public function publicStats(): Response
    {
        $total = DB::table('dokumen_kerjasama')->count();

        $luarNegeri = DB::table('dokumen_kerjasama')
            ->join('master_mitra', 'dokumen_kerjasama.mitra_id', '=', 'master_mitra.id')
            ->where('master_mitra.negara', '!=', 'Indonesia')
            ->whereNotNull('master_mitra.negara')
            ->where('master_mitra.negara', '!=', '')
            ->count();

        // DUDI = Industri / Perusahaan category
        $dudiNasional = DB::table('dokumen_kerjasama')
            ->join('master_mitra', 'dokumen_kerjasama.mitra_id', '=', 'master_mitra.id')
            ->where(function ($q) {
                $q->where('master_mitra.kategori_mitra', 'LIKE', '%Industri%')
                  ->orWhere('master_mitra.kategori_mitra', 'LIKE', '%Perusahaan%');
            })
            ->where(function ($q) {
                $q->where('master_mitra.negara', 'Indonesia')
                  ->orWhereNull('master_mitra.negara')
                  ->orWhere('master_mitra.negara', '');
            })
            ->count();

        $dudiInternasional = DB::table('dokumen_kerjasama')
            ->join('master_mitra', 'dokumen_kerjasama.mitra_id', '=', 'master_mitra.id')
            ->where(function ($q) {
                $q->where('master_mitra.kategori_mitra', 'LIKE', '%Industri%')
                  ->orWhere('master_mitra.kategori_mitra', 'LIKE', '%Perusahaan%');
            })
            ->where('master_mitra.negara', '!=', 'Indonesia')
            ->whereNotNull('master_mitra.negara')
            ->where('master_mitra.negara', '!=', '')
            ->count();

        // Instansi = non-Industri / non-Perusahaan category
        $instansiNasional = DB::table('dokumen_kerjasama')
            ->join('master_mitra', 'dokumen_kerjasama.mitra_id', '=', 'master_mitra.id')
            ->where('master_mitra.kategori_mitra', 'NOT LIKE', '%Industri%')
            ->where('master_mitra.kategori_mitra', 'NOT LIKE', '%Perusahaan%')
            ->where(function ($q) {
                $q->where('master_mitra.negara', 'Indonesia')
                  ->orWhereNull('master_mitra.negara')
                  ->orWhere('master_mitra.negara', '');
            })
            ->count();

        $instansiInternasional = DB::table('dokumen_kerjasama')
            ->join('master_mitra', 'dokumen_kerjasama.mitra_id', '=', 'master_mitra.id')
            ->where('master_mitra.kategori_mitra', 'NOT LIKE', '%Industri%')
            ->where('master_mitra.kategori_mitra', 'NOT LIKE', '%Perusahaan%')
            ->where('master_mitra.negara', '!=', 'Indonesia')
            ->whereNotNull('master_mitra.negara')
            ->where('master_mitra.negara', '!=', '')
            ->count();

        return response([
            'success' => true,
            'data'    => [
                'total'                  => $total,
                'dalam_negeri'           => $total - $luarNegeri,
                'luar_negeri'            => $luarNegeri,
                'dudi_nasional'          => $dudiNasional,
                'dudi_internasional'     => $dudiInternasional,
                'instansi_nasional'      => $instansiNasional,
                'instansi_internasional' => $instansiInternasional,
            ],
            'message' => 'Kerjasama stats retrieved successfully',
        ]);
    }

    /**
     * Statistik "Jenis Mitra" & "Wilayah" untuk Dashboard Admin.
     *
     * Beda dari publicStats() yang menghitung jumlah dokumen kerjasama,
     * di sini SEMUA mitra di Data Kemitraan (master_mitra) dihitung apa
     * adanya — tidak peduli mitra itu sudah punya dokumen/pengajuan
     * kerjasama atau belum, dan tidak dobel-hitung walau 1 mitra punya
     * banyak dokumen/pengajuan.
     *
     * Data Kemitraan (halaman admin/master_mitra) sengaja TIDAK menggabungkan
     * baris yang nama mitranya kebetulan sama — mitra yang terinput dobel
     * tetap tampil sebagai baris terpisah supaya admin bisa hapus manual
     * satu-satu. Statistik ini ikut prinsip yang sama: dihitung apa adanya
     * per baris di master_mitra, tanpa dedup nama, supaya total di sini
     * selalu sama persis dengan jumlah baris yang tampil di Data Kemitraan.
     * Kalau sebuah mitra dihapus di Data Kemitraan, angka di sini otomatis
     * ikut turun karena query di bawah selalu baca langsung dari tabel
     * (tidak ada cache).
     *
     * "Dalam Negeri" / "Luar Negeri" di sini ikut kartu "Nasional/Lokal" &
     * "Internasional/Multinasional" di Data Kemitraan — dihitung dari
     * `tingkat_perusahaan` (skala bisnis), BUKAN `negara` (lokasi negara).
     * Keduanya bisa beda: mitra yang berkantor di Indonesia tapi berskala
     * "Internasional" tetap dihitung "Luar Negeri" di sini, karena itu juga
     * cara Data Kemitraan menghitungnya. `negara` cuma dipakai sebagai
     * fallback kalau `tingkat_perusahaan` kosong (mitra baru yang belum
     * diisi tingkatnya) — sama seperti fallback di admin/master_mitra/page.tsx.
     */
    public function mitraStats(): Response
    {
        // kategori_mitra di data nyata bercampur antara label lama
        // ("Swasta/Dunia Usaha dan Dunia Industri (DUDI)") dan label baru
        // ("dudi dalam negeri" / "dudi luar negeri"), jadi deteksi DUDI
        // memakai kata kunci "dudi" selain "industri"/"perusahaan".
        $isDudiKategori = function (?string $kategori) {
            $kategori = mb_strtolower((string) $kategori);

            return str_contains($kategori, 'dudi')
                || str_contains($kategori, 'industri')
                || str_contains($kategori, 'perusahaan');
        };

        $isLuarNegeri = function (?string $tingkatPerusahaan, ?string $negara) {
            $tingkat = trim((string) $tingkatPerusahaan);
            if ($tingkat === 'Internasional' || $tingkat === 'Multinasional') {
                return true;
            }
            if ($tingkat === 'Nasional' || $tingkat === 'Lokal') {
                return false;
            }

            // tingkat_perusahaan belum diisi -> fallback ke negara (casing di
            // data nyata bercampur "Indonesia"/"INDONESIA"/"indonesia", dan
            // kosong/null dianggap dalam negeri).
            $negara = mb_strtolower(trim((string) $negara));

            return $negara !== '' && $negara !== 'indonesia';
        };

        $total = 0;
        $luarNegeri = 0;
        $dudiNasional = 0;
        $dudiInternasional = 0;
        $instansiNasional = 0;
        $instansiInternasional = 0;

        DB::table('master_mitra')
            ->select('id', 'kategori_mitra', 'negara', 'tingkat_perusahaan')
            ->orderBy('id')
            ->each(function ($row) use (
                $isDudiKategori,
                $isLuarNegeri,
                &$total,
                &$luarNegeri,
                &$dudiNasional,
                &$dudiInternasional,
                &$instansiNasional,
                &$instansiInternasional
            ) {
                $total++;

                $luar = $isLuarNegeri($row->tingkat_perusahaan, $row->negara);
                $dudi = $isDudiKategori($row->kategori_mitra);

                if ($luar) {
                    $luarNegeri++;
                }

                if ($dudi && $luar) {
                    $dudiInternasional++;
                } elseif ($dudi) {
                    $dudiNasional++;
                } elseif ($luar) {
                    $instansiInternasional++;
                } else {
                    $instansiNasional++;
                }
            });

        return response([
            'success' => true,
            'data'    => [
                'total'                  => $total,
                'dalam_negeri'           => $total - $luarNegeri,
                'luar_negeri'            => $luarNegeri,
                'dudi_nasional'          => $dudiNasional,
                'dudi_internasional'     => $dudiInternasional,
                'instansi_nasional'      => $instansiNasional,
                'instansi_internasional' => $instansiInternasional,
            ],
            'message' => 'Mitra stats (mitra dari Data Kemitraan) retrieved successfully',
        ]);
    }

    public function publicIndex(Request $request): Response
    {
        $perPage = min(max((int) $request->integer('per_page', 1000), 1), 1000);

        $query = DokumenKerjasama::query()
            ->with([
                'mitra:id,nama_mitra,negara',
                'unitProdi:id,nama',
            ])
            ->select('id', 'jenis_dokumen', 'snap_nama_mitra', 'mitra_id', 'unit_prodi_id', 'ruang_lingkup_ids', 'keterangan');

        $ruangLingkupMap = DB::table('master_ruang_lingkup')
            ->pluck('nama_ruang_lingkup', 'id')
            ->all();

        $data = $query->orderByDesc('updated_at')->paginate($perPage);

        $items = $data->getCollection()->map(function (DokumenKerjasama $row) use ($ruangLingkupMap) {
            $namaMitra = $row->mitra?->nama_mitra ?? $row->snap_nama_mitra;

            if (!$namaMitra && $row->keterangan && str_contains((string) $row->keterangan, 'Mitra:')) {
                if (preg_match('/Mitra:\s*(.*?)(?:\s*\|\s*Bidang:|$)/i', (string) $row->keterangan, $m)) {
                    $namaMitra = trim($m[1]);
                }
            }

            $namaMitra = $namaMitra ?: '-';

            $unit   = $row->unitProdi?->nama ?? '-';
            $negara = $row->mitra?->negara ?? null;
            $wilayah = (!$negara || strtolower(trim($negara)) === 'indonesia')
                ? 'Dalam Negeri'
                : 'Luar Negeri';

            $jenis = match (strtoupper((string) ($row->jenis_dokumen ?? ''))) {
                'MOA'    => 'MoA',
                'IA'     => 'IA',
                default  => 'MoU',
            };

            $bidangIds = is_array($row->ruang_lingkup_ids) ? $row->ruang_lingkup_ids : [];
            $bidang = implode(', ', array_filter(
                array_map(fn ($id) => $ruangLingkupMap[$id] ?? null, $bidangIds)
            ));
            $bidang = $bidang ?: '-';

            return [
                'id'      => $row->id,
                'nama'    => $namaMitra,
                'bidang'  => $bidang,
                'jenis'   => $jenis,
                'unit'    => $unit,
                'wilayah' => $wilayah,
            ];
        });

        return response([
            'success' => true,
            'data' => [
                'data'         => $items->values(),
                'total'        => $data->total(),
                'per_page'     => $data->perPage(),
                'current_page' => $data->currentPage(),
                'last_page'    => $data->lastPage(),
            ],
            'message' => 'Data kerjasama public retrieved successfully',
        ]);
    }

    public function store(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'nomor_dokumen' => ['required', 'string', 'max:100', 'unique:dokumen_kerjasama,nomor_dokumen'],
            'no_permohonan' => ['required', 'string', 'exists:pengajuan_v2,nomor_pengajuan'],
            'nama_dokumen' => ['required', 'string', 'max:255'],
            'jenis_dokumen' => ['required', 'in:MOU,MOA,IA,LAINNYA'],
            'judul_dokumen' => ['nullable', 'string', 'max:255'],
            'manfaat' => ['nullable', 'string'],
            'luaran_kerja_sama' => ['nullable', 'string'],
            'ruang_lingkup_ids' => ['nullable', 'array'],
            'ruang_lingkup_ids.*' => ['integer', 'exists:master_ruang_lingkup,id'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_berakhir' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'tanggal_ttd' => ['nullable', 'date'],
            'status_siklus' => ['nullable', 'in:active,expiring,archived'],
            'diarsipkan_pada' => ['nullable', 'date'],
            'alasan_arsip' => ['nullable', 'string'],
            'sumber_pengajuan_id' => ['nullable', 'integer', 'exists:pengajuan_v2,id'],
            'unit_prodi_id' => ['nullable', 'integer', 'exists:master_unit_prodi,id'],
            'mitra_id' => ['nullable', 'integer', 'exists:master_mitra,id'],
            'dibuat_oleh_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'file' => ['required', 'string', 'max:255'],
            'keterangan' => ['nullable', 'string'],
            'follow_up' => ['nullable', 'string'],
        ]);

        $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);

        try {
            $dokumen = DokumenKerjasama::create($validated);
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal menyimpan dokumen kerjasama.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        return response([
            'success' => true,
            'data' => $dokumen,
            'message' => 'Dokumen kerjasama created successfully',
        ], 201);
    }

    //fungsi untuk menyimpan dokumen kerjasama secara manual tanpa melalui pengajuan
    public function storeManual(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'nomor_dokumen' => ['required', 'string', 'max:100', 'unique:dokumen_kerjasama,nomor_dokumen'],
            'nama_dokumen' => ['required', 'string', 'max:255'],
            'judul_dokumen' => ['nullable', 'string', 'max:255'],
            'jenis_dokumen' => ['required', 'in:MOU,MOA,IA,LAINNYA'],
            'unit_prodi_id' => ['required', 'integer', 'exists:master_unit_prodi,id'],
            'mitra_id' => ['nullable', 'integer', 'exists:master_mitra,id'],
            'manfaat' => ['nullable', 'string'],
            'luaran_kerja_sama' => ['nullable', 'string'],
            'ruang_lingkup_ids' => ['nullable', 'array'],
            'ruang_lingkup_ids.*' => ['integer', 'exists:master_ruang_lingkup,id'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_berakhir' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'status_siklus' => ['nullable', 'in:active,expiring,archived'],
            'keterangan' => ['nullable', 'string'],
            'follow_up' => ['nullable', 'string'],
            'file' => ['nullable', 'string', 'max:255'],
        ]);

        $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);
        $validated['file'] = $validated['file'] ?? 'pending-upload';
        $validated['dibuat_oleh_user_id'] = $request->user()?->id;

        try {
            $dokumen = DokumenKerjasama::create($validated);
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal menyimpan dokumen kerjasama.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        $dokumen->load(['unitProdi:id,nama,jenis_node,kategori_unit', 'mitra:id,nama_mitra,kode_mitra']);

        return response([
            'success' => true,
            'data' => $dokumen,
            'message' => 'Dokumen kerjasama created successfully',
        ], 201);
    }

    public function update(Request $request, DokumenKerjasama $dokumen_kerjasama): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'nomor_dokumen' => ['sometimes', 'required', 'string', 'max:100', 'unique:dokumen_kerjasama,nomor_dokumen,' . $dokumen_kerjasama->id],
            'no_permohonan' => ['sometimes', 'required', 'string', 'exists:pengajuan_v2,nomor_pengajuan'],
            'nama_dokumen' => ['sometimes', 'required', 'string', 'max:255'],
            'jenis_dokumen' => ['sometimes', 'required', 'in:MOU,MOA,IA,LAINNYA'],
            'judul_dokumen' => ['nullable', 'string', 'max:255'],
            'manfaat' => ['nullable', 'string'],
            'luaran_kerja_sama' => ['nullable', 'string'],
            'ruang_lingkup_ids' => ['nullable', 'array'],
            'ruang_lingkup_ids.*' => ['integer', 'exists:master_ruang_lingkup,id'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_berakhir' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'tanggal_ttd' => ['nullable', 'date'],
            'status_siklus' => ['nullable', 'in:active,expiring,archived'],
            'diarsipkan_pada' => ['nullable', 'date'],
            'alasan_arsip' => ['nullable', 'string'],
            'sumber_pengajuan_id' => ['nullable', 'integer', 'exists:pengajuan_v2,id'],
            'unit_prodi_id' => ['nullable', 'integer', 'exists:master_unit_prodi,id'],
            'mitra_id' => ['nullable', 'integer', 'exists:master_mitra,id'],
            'dibuat_oleh_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'file' => ['sometimes', 'required', 'string', 'max:255'],
            'keterangan' => ['nullable', 'string'],
            'follow_up' => ['nullable', 'string'],
        ]);

        if (array_key_exists('jenis_dokumen', $validated)) {
            $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);
        }

        try {
            $dokumen_kerjasama->update($validated);
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal mengubah dokumen kerjasama.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        return response([
            'success' => true,
            'data' => $dokumen_kerjasama,
            'message' => 'Dokumen kerjasama updated successfully',
        ]);
    }

    public function uploadFile(Request $request, DokumenKerjasama $dokumen_kerjasama): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            // 'bukti_tidak_diperpanjang' butuh mime lebih longgar (bisa foto/scan bukti, bukan
            // cuma PDF) — dipakai saat admin menandai kerja sama TIDAK diperpanjang di Monitoring.
            'file' => ['required', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png', 'max:10240'],
            // 'dokumen_pendukung' dipakai buat TOR/KAK/Proposal (peran terpisah dari dokumen utama
            // 'dokumen_final') supaya upload keduanya tidak saling timpa — lihat delete-by-peran di bawah.
            'peran_berkas' => ['nullable', 'in:dokumen_final,dokumen_pendukung,bukti_tidak_diperpanjang'],
        ]);

        $peranBerkas = $validated['peran_berkas'] ?? 'dokumen_final';
        $uploadedFile = $request->file('file');
        $path = $uploadedFile->store('pengajuan/' . now()->format('Y/m'), 'public');

        DokumenFile::query()
            ->where('dokumen_id', $dokumen_kerjasama->id)
            ->where('peran_berkas', $peranBerkas)
            ->delete();

        $dokumenFile = DokumenFile::create([
            'dokumen_id'           => $dokumen_kerjasama->id,
            'peran_berkas'         => $peranBerkas,
            'nama_file'            => $uploadedFile->getClientOriginalName(),
            'path_file'            => $path,
            'mime_type'            => $uploadedFile->getMimeType(),
            'ukuran_file_bytes'    => $uploadedFile->getSize(),
            'diunggah_oleh_user_id' => $request->user()?->id,
        ]);

        return response([
            'success' => true,
            'data'    => $dokumenFile,
            'message' => 'File uploaded successfully',
        ]);
    }

    public function destroy(Request $request, DokumenKerjasama $dokumen_kerjasama): Response
    {
        //ini guard untuk memastikan dokumen kerjasama yang diakses user memang bisa dihapus oleh user tersebut
        $user = $request->user();
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));
        $isAdmin = in_array($normalizedRole, ['admin', 'admin-humas'], true);
        $isOwner = $user && (
            (int) $dokumen_kerjasama->dibuat_oleh_user_id === (int) $user->id
            || (int) $dokumen_kerjasama->pengajuan?->user_pengusul_id === (int) $user->id
        );

        if (!$isAdmin && !$isOwner) {
            return response([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk menghapus dokumen kerjasama ini.',
            ], 403);
        }

        // Hapus PERMANEN dari database — baik dihapus admin maupun dihapus pemiliknya sendiri
        // (internal/eksternal/kampus-LDAP, tombol Hapus di Rekap Data mereka). Rekap Data dan
        // Data Pengajuan (pengajuan_v2) masing-masing dihapus terpisah lewat halamannya
        // sendiri-sendiri — hapus di sini TIDAK ikut menghapus pengajuan sumbernya.
        $dokumen_kerjasama->delete();

        return response([
            'success' => true,
            'data' => null,
            'message' => 'Dokumen kerjasama deleted successfully',
        ]);
    }

    public function renewalRequests(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $logs = DokumenLog::query()
            ->with(['dokumen:id,nomor_dokumen,mitra_id', 'dokumen.mitra:id,nama_mitra'])
            ->where('tipe_log', 'perpanjangan')
            ->orderByDesc('dibuat_pada')
            ->get();

        return response([
            'success' => true,
            'data' => $logs->map(fn (DokumenLog $log) => $this->mapRenewalLogToResponse($log))->values(),
            'message' => 'Renewal requests retrieved successfully',
        ]);
    }

    public function submitRenewalRequest(Request $request, DokumenKerjasama $dokumen_kerjasama): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'tanggal_mulai_baru' => ['required', 'date'],
            'tanggal_berakhir_baru' => ['required', 'date', 'after_or_equal:tanggal_mulai_baru'],
            'catatan_perpanjangan' => ['required', 'string'],
            'bukti_perpanjangan' => ['nullable', 'string'],
            'ruang_lingkup' => ['nullable', 'array'],
            'ruang_lingkup.*' => ['string', 'max:150'],
            'requester_role' => ['nullable', 'in:admin,internal,eksternal,pimpinan'],
            'notification_href' => ['nullable', 'string', 'max:255'],
        ]);

        $dokumen_kerjasama->loadMissing(['mitra:id,nama_mitra', 'unitProdi:id,nama', 'pengajuan:id,whatsapp_pengusul']);

        $nomorDokumen = $dokumen_kerjasama->nomor_dokumen;
        $namaMitra = $dokumen_kerjasama->mitra?->nama_mitra
            ?: $dokumen_kerjasama->snap_nama_mitra
            ?: $dokumen_kerjasama->nama_dokumen;
        $nomorTelepon = $dokumen_kerjasama->pengajuan?->whatsapp_pengusul
            ?: $dokumen_kerjasama->snap_whatsapp_pengusul;
        $unitNama = $dokumen_kerjasama->unitProdi?->nama;
        $lingkup = is_array($dokumen_kerjasama->ruang_lingkup_ids)
            ? implode(', ', array_map(static fn ($id) => (string) $id, $dokumen_kerjasama->ruang_lingkup_ids))
            : null;

        $startRenewal = Carbon::parse($validated['tanggal_mulai_baru']);
        $month = (int) $startRenewal->format('n');
        $quarter = (int) floor(($month - 1) / 3) + 1;
        $quarterLabels = [1 => 'Jan-Mar', 2 => 'Apr-Jun', 3 => 'Jul-Sep', 4 => 'Okt-Des'];
        $periodeLabel = sprintf('Triwulan %d(%s)', $quarter, $quarterLabels[$quarter] ?? 'Jan-Mar');

        // Persist dokumen perpanjangan jika dikirim sebagai data URL base64.
        $buktiRaw = $validated['bukti_perpanjangan'] ?? null;
        $buktiPath = null;
        $buktiNama = null;
        if ($buktiRaw !== null && str_starts_with($buktiRaw, 'data:')) {
            $buktiPath = $this->persistDataUrlFile($buktiRaw, 'perpanjangan');
        } elseif ($buktiRaw !== null && !str_starts_with($buktiRaw, 'data:')) {
            // Fallback: simpan nama file saja jika bukan data URL.
            $buktiNama = $buktiRaw;
        }

        $ruangLingkupBaru = $validated['ruang_lingkup'] ?? [];

        $log = DokumenLog::create([
            'dokumen_id' => $dokumen_kerjasama->id,
            'tipe_log' => 'perpanjangan',
            'judul_log' => 'Pengajuan perpanjangan dokumen',
            'isi_log' => 'Permintaan perpanjangan diajukan dari modul Monitoring Kerjasama.',
            'payload_json' => ['ruang_lingkup' => $ruangLingkupBaru],
            // Struktur lama JSON monitoring dipisah ke kolom tabel dokumen_log.
            'nomor' => $nomorDokumen,
            'mitra' => $namaMitra,
            'telepon' => $nomorTelepon,
            'tgl_mulai' => $dokumen_kerjasama->tanggal_mulai,
            'tgl_berakhir' => $dokumen_kerjasama->tanggal_berakhir,
            'unit' => $unitNama,
            'lingkup' => $lingkup,
            'tingkat' => 'lokal/wilayah',
            'periode' => $periodeLabel,
            'judul' => $dokumen_kerjasama->judul_dokumen,
            'manfaat' => $validated['catatan_perpanjangan'],
            'bukti' => $buktiPath ?? $buktiNama,
            'status' => 'aktif',
            'pic' => null,
            'tgl_monitoring' => Carbon::today(),
            'catatan_perpanjangan' => $validated['catatan_perpanjangan'],
            'bukti_perpanjangan' => $buktiPath ?? $buktiNama,
            'tanggal_mulai_perpanjangan' => $validated['tanggal_mulai_baru'],
            'tanggal_berakhir_perpanjangan' => $validated['tanggal_berakhir_baru'],
            'status_perpanjangan' => 'menunggu',
            'requester_role' => $validated['requester_role'] ?? 'admin',
            'notification_href' => $validated['notification_href'] ?? '/admin/monitoring/perpanjangan',
            'dibuat_oleh_user_id' => $request->user()?->id,
        ]);

        $log->load(['dokumen:id,nomor_dokumen,mitra_id', 'dokumen.mitra:id,nama_mitra']);

        return response([
            'success' => true,
            'data' => $this->mapRenewalLogToResponse($log),
            'message' => 'Renewal request created successfully',
        ], 201);
    }

    public function decideRenewalRequest(Request $request, DokumenLog $dokumen_log): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'status' => ['required', 'in:disetujui,ditolak'],
            'diputuskan_oleh' => ['nullable', 'string', 'max:100'],
        ]);

        if ($dokumen_log->tipe_log !== 'perpanjangan') {
            return response([
                'success' => false,
                'message' => 'Log yang dipilih bukan log perpanjangan.',
            ], 422);
        }

        $dokumen_log->status_perpanjangan = $validated['status'];
        $dokumen_log->diputuskan_pada = Carbon::now();
        $dokumen_log->diputuskan_oleh = $validated['diputuskan_oleh']
            ?? (string) ($request->user()?->name ?: 'Admin SIKERMA');
        $dokumen_log->save();

        if ($validated['status'] === 'disetujui') {
            $dokumen = $dokumen_log->dokumen;

            if ($dokumen) {
                $dokumen->tanggal_mulai = $dokumen_log->tanggal_mulai_perpanjangan;
                $dokumen->tanggal_berakhir = $dokumen_log->tanggal_berakhir_perpanjangan;
                $dokumen->status_siklus = 'active';

                // Sync ruang lingkup baru jika ada di payload_json.
                $payload = $dokumen_log->payload_json ?? [];
                $ruangLingkupBaru = $payload['ruang_lingkup'] ?? null;
                if (!empty($ruangLingkupBaru)) {
                    $dokumen->ruang_lingkup_ids = $ruangLingkupBaru;
                }

                $dokumen->save();

                // Sync dokumen perpanjangan ke dokumen_file jika ada.
                $buktiPath = $dokumen_log->bukti_perpanjangan;
                if ($buktiPath && !str_starts_with($buktiPath, 'data:') && Schema::hasTable('dokumen_file')) {
                    $ext = strtolower(pathinfo($buktiPath, PATHINFO_EXTENSION));
                    $mimeMap = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc' => 'application/msword'];
                    DokumenFile::create([
                        'dokumen_id' => $dokumen->id,
                        'peran_berkas' => 'dokumen_perpanjangan',
                        'nama_file' => basename($buktiPath),
                        'path_file' => $buktiPath,
                        'mime_type' => $mimeMap[$ext] ?? null,
                        'diunggah_oleh_user_id' => $request->user()?->id,
                        'diunggah_pada' => now(),
                    ]);
                }

                // Catat perpanjangan yang disetujui sebagai aktivitas baru di Story & Aktivitas,
                // supaya riwayat kerjasama tetap lengkap (bukan cuma penandatanganan awal).
                if ($dokumen->sumber_pengajuan_id && Schema::hasTable('pengajuan_aktivitas')) {
                    $namaMitra = $dokumen->mitra?->nama_mitra ?? $dokumen->snap_nama_mitra ?? 'mitra';
                    $tanggalBerakhirBaru = optional($dokumen_log->tanggal_berakhir_perpanjangan)->format('d-m-Y');

                    PengajuanAktivitas::create([
                        'pengajuan_id' => $dokumen->sumber_pengajuan_id,
                        'judul' => 'Perpanjangan Kerja Sama',
                        'jenis_aktivitas' => 'Lainnya',
                        'tanggal' => now()->toDateString(),
                        'jumlah_peserta' => 0,
                        'deskripsi' => "Kerja sama dengan {$namaMitra} telah disetujui untuk diperpanjang"
                            . ($tanggalBerakhirBaru ? " hingga {$tanggalBerakhirBaru}." : '.'),
                        'pic_polibatam' => $request->user()?->name ?: 'Admin SIKERMA',
                        'pic_mitra' => $namaMitra,
                        'status' => 'selesai',
                        'dibuat_oleh_user_id' => $request->user()?->id,
                    ]);
                }

                // Update tanggal mulai/berakhir di tabel pengajuan jika dokumen ini terkait dengan pengajuan.
                if ($dokumen->sumber_pengajuan_id) {
                    Pengajuan::query()->where('id', $dokumen->sumber_pengajuan_id)->update([
                        'tanggal_mulai' => $dokumen_log->tanggal_mulai_perpanjangan,
                        'tanggal_berakhir' => $dokumen_log->tanggal_berakhir_perpanjangan,
                    ]);
                }
            }
        }

        $dokumen_log->load(['dokumen:id,nomor_dokumen,mitra_id', 'dokumen.mitra:id,nama_mitra']);

        return response([
            'success' => true,
            'data' => $this->mapRenewalLogToResponse($dokumen_log),
            'message' => 'Renewal request updated successfully',
        ]);
    }

    private function mapRenewalLogToResponse(DokumenLog $log): array
    {
        $dokumen = $log->dokumen;
        $namaMitra = $dokumen?->mitra?->nama_mitra
            ?? $dokumen?->nama_dokumen
            ?? '-';
        $noDokumen = $dokumen?->nomor_dokumen ?? '-';

        return [
            'id' => (int) $log->id,
            'kerjasamaId' => (int) $log->dokumen_id,
            'namaMitra' => $namaMitra,
            'noDokumen' => $noDokumen,
            'monitoringFields' => [
                'nomor' => $log->nomor,
                'mitra' => $log->mitra,
                'telepon' => $log->telepon,
                'tgl_mulai' => $log->tgl_mulai?->format('Y-m-d'),
                'tgl_berakhir' => $log->tgl_berakhir?->format('Y-m-d'),
                'unit' => $log->unit,
                'lingkup' => $log->lingkup,
                'tingkat' => $log->tingkat,
                'periode' => $log->periode,
                'judul' => $log->judul,
                'manfaat' => $log->manfaat,
                'bukti' => $log->bukti,
                'status' => $log->status,
                'pic' => $log->pic,
                'tgl_monitoring' => $log->tgl_monitoring?->format('d-m-Y'),
            ],
            'tanggalMulaiBaru' => $log->tanggal_mulai_perpanjangan?->format('Y-m-d') ?? null,
            'tanggalBerakhirBaru' => $log->tanggal_berakhir_perpanjangan?->format('Y-m-d') ?? null,
            'catatan' => $log->catatan_perpanjangan,
            'buktiPerpanjangan' => $log->bukti_perpanjangan,
            'buktiPerpanjanganUrl' => $log->bukti_perpanjangan
                ? (str_starts_with($log->bukti_perpanjangan, 'http')
                    ? $log->bukti_perpanjangan
                    : url('storage/' . ltrim($log->bukti_perpanjangan, '/')))
                : null,
            'ruangLingkup' => $log->payload_json['ruang_lingkup'] ?? [],
            'status' => $log->status_perpanjangan ?: 'menunggu',
            'requestedAt' => optional($log->dibuat_pada)->toIso8601String(),
            'requesterRole' => $log->requester_role ?: 'admin',
            'notificationHref' => $log->notification_href ?: '/admin/monitoring/perpanjangan',
            'decidedAt' => optional($log->diputuskan_pada)->toIso8601String(),
            'decidedBy' => $log->diputuskan_oleh,
        ];
    }
}
