<?php

namespace App\Http\Controllers;

use App\Models\DokumenFile;
use App\Models\DokumenLog;
use App\Models\DokumenKerjasama;
use App\Models\Pengajuan;
use App\Models\PengajuanAktivitas;
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

    public function index(Request $request): Response
    {
        $query = DokumenKerjasama::query()->with([
            'pengajuan:id,nomor_pengajuan,nama_pengusul,whatsapp_pengusul,nama_mitra,email_pengusul,user_pengusul_id',
            'pengajuan.userPengusul:id,role',
            'unitProdi:id,nama,jenis_node,kategori_unit',
            'mitra:id,nama_mitra,kode_mitra,kategori_mitra,tingkat_perusahaan,negara,email_mitra,email_kontak_utama',
            'dokumenFiles' => function ($q) {
                $q->whereIn('peran_berkas', ['dokumen_final', 'dokumen_perpanjangan']);
            },
        ]);

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

    public function show(DokumenKerjasama $dokumen_kerjasama): Response
    {
        $dokumen_kerjasama->load([
            'pengajuan:id,nomor_pengajuan,nama_pengusul,whatsapp_pengusul,nama_mitra,email_pengusul',
            'unitProdi:id,nama,jenis_node,kategori_unit',
            'mitra:id,nama_mitra,kode_mitra,kategori_mitra,tingkat_perusahaan,negara,email_mitra,email_kontak_utama',
        ]);

        return response([
            'success' => true,
            'data' => $dokumen_kerjasama,
            'message' => 'Dokumen kerjasama retrieved successfully',
        ]);
    }

    /**
     * Public landing page stats — no auth.
     * Returns total/wilayah counts + hero breakdown by mitra category.
     */
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

        // Instansi = everything that is not DUDI
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
     * Public landing page – returns non-sensitive kerjasama data without authentication.
     */
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

    /**
     * Tambah dokumen kerjasama secara manual oleh admin, tanpa melalui alur pengajuan.
     * Berbeda dari store(): no_permohonan tidak wajib, unit_prodi_id wajib (kolom NOT NULL di DB),
     * dan file PDF diunggah terpisah lewat uploadFile() setelah record dibuat.
     */
    public function storeManual(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $validated = $request->validate([
            'nomor_dokumen' => ['required', 'string', 'max:100', 'unique:dokumen_kerjasama,nomor_dokumen'],
            'nama_dokumen' => ['required', 'string', 'max:255'],
            'jenis_dokumen' => ['required', 'in:MOU,MOA,IA,LAINNYA'],
            'unit_prodi_id' => ['required', 'integer', 'exists:master_unit_prodi,id'],
            'mitra_id' => ['nullable', 'integer', 'exists:master_mitra,id'],
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

        $request->validate([
            'file' => ['required', 'file', 'mimes:pdf', 'max:10240'],
        ]);

        $uploadedFile = $request->file('file');
        $path = $uploadedFile->store('pengajuan/' . now()->format('Y/m'), 'public');

        DokumenFile::query()
            ->where('dokumen_id', $dokumen_kerjasama->id)
            ->where('peran_berkas', 'dokumen_final')
            ->delete();

        $dokumenFile = DokumenFile::create([
            'dokumen_id'           => $dokumen_kerjasama->id,
            'peran_berkas'         => 'dokumen_final',
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
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

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

                // Sinkronkan tanggal mulai/berakhir ke pengajuan sumbernya juga —
                // Story & Aktivitas dan halaman lain membaca masa berlaku dari data
                // pengajuan, bukan dari dokumen_kerjasama, jadi tanpa ini tanggalnya
                // akan tetap menampilkan periode lama meski perpanjangan sudah disetujui.
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
