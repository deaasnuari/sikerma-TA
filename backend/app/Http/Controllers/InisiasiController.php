<?php

namespace App\Http\Controllers;

use App\Models\Inisiasi;
use App\Models\InisiasiFoto;
use App\Models\MasterUnitProdi;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Inisiasi: dokumentasi kegiatan awal/penjajakan kerja sama dengan mitra. Seluruh endpoint hanya
 * untuk admin (dicek di sini, bukan sekadar menyembunyikan menu). Foto disimpan di disk 'public'
 * folder inisiasi/ — folder ini tidak dibuka publik lewat /storage, foto dibuka lewat GET /berkas
 * (BerkasController) yang mewajibkan login dan, untuk berkas ini, hanya meluluskan admin.
 */
class InisiasiController extends Controller
{
    private const MAKS_FOTO = 10;

    private const FOLDER_FOTO = 'inisiasi';

    public function index(Request $request): JsonResponse
    {
        $this->pastikanAdmin($request);

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'urut' => ['nullable', 'in:terbaru,terlama'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
            // unit: "id:<id master unit/prodi>" (jurusan ikut mencakup prodi di bawahnya) atau "nama:<unit bebas>".
            'unit' => ['nullable', 'string', 'max:220'],
            'tahun' => ['nullable', 'integer', 'min:1900', 'max:2200'],
            'bulan' => ['nullable', 'integer', 'min:1', 'max:12'],
        ]);

        $query = Inisiasi::query()->with(['units', 'peserta', 'fotos']);

        $kata = mb_strtolower(trim((string) ($validated['q'] ?? '')));
        if ($kata !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $kata).'%';
            $query->where(function ($builder) use ($like) {
                $builder->whereRaw('LOWER(judul) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(nama_mitra) LIKE ?', [$like]);
            });
        }

        $this->terapkanFilterUnit($query, (string) ($validated['unit'] ?? ''));
        $this->terapkanFilterWaktu($query, $validated['tahun'] ?? null, $validated['bulan'] ?? null);

        if (($validated['urut'] ?? 'terbaru') === 'terlama') {
            $query->orderBy('tanggal_kegiatan')->orderBy('id');
        } else {
            $query->orderByDesc('tanggal_kegiatan')->orderByDesc('id');
        }

        $halaman = $query->paginate((int) ($validated['per_page'] ?? 12));

        return response()->json([
            'success' => true,
            'data' => $halaman->getCollection()->map(fn (Inisiasi $item) => $this->format($item, $request))->values(),
            'opsi_filter' => $this->opsiFilter(),
            'meta' => [
                'current_page' => $halaman->currentPage(),
                'last_page' => $halaman->lastPage(),
                'per_page' => $halaman->perPage(),
                'total' => $halaman->total(),
            ],
        ]);
    }

    public function show(Request $request, Inisiasi $inisiasi): JsonResponse
    {
        $this->pastikanAdmin($request);

        return response()->json([
            'success' => true,
            'data' => $this->format($inisiasi->load(['units', 'peserta', 'fotos']), $request),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->pastikanAdmin($request);

        $validated = $this->validasi($request);
        $fileBaru = $request->file('fotos', []);
        $tersimpan = [];

        try {
            $inisiasi = DB::transaction(function () use ($request, $validated, $fileBaru, &$tersimpan) {
                $inisiasi = Inisiasi::create([
                    'tanggal_kegiatan' => $validated['tanggal_kegiatan'],
                    'judul' => trim($validated['judul']),
                    'nama_mitra' => trim($validated['nama_mitra']),
                    'deskripsi' => trim($validated['deskripsi']),
                    'dibuat_oleh_user_id' => $request->user()->id,
                ]);

                $this->simpanUnitDanPeserta($inisiasi, $validated);
                $this->simpanFoto($inisiasi, $fileBaru, $tersimpan);

                return $inisiasi;
            });
        } catch (\Throwable $e) {
            // Transaksi dibatalkan: berkas yang sempat tertulis ke disk dibuang agar tidak jadi yatim.
            Storage::disk('public')->delete($tersimpan);
            throw $e;
        }

        return response()->json([
            'success' => true,
            'message' => 'Data inisiasi berhasil ditambahkan.',
            'data' => $this->format($inisiasi->load(['units', 'peserta', 'fotos']), $request),
        ], 201);
    }

    public function update(Request $request, Inisiasi $inisiasi): JsonResponse
    {
        $this->pastikanAdmin($request);

        $validated = $this->validasi($request);
        $fileBaru = $request->file('fotos', []);

        $hapusIds = collect($validated['hapus_foto_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values();
        $fotoDihapus = $inisiasi->fotos()->whereIn('id', $hapusIds)->get();

        $sisa = $inisiasi->fotos()->count() - $fotoDihapus->count() + count($fileBaru);
        if ($sisa > self::MAKS_FOTO) {
            throw ValidationException::withMessages([
                'fotos' => 'Maksimal '.self::MAKS_FOTO.' foto per kegiatan.',
            ]);
        }

        $tersimpan = [];

        try {
            DB::transaction(function () use ($inisiasi, $validated, $fileBaru, $fotoDihapus, &$tersimpan) {
                $inisiasi->update([
                    'tanggal_kegiatan' => $validated['tanggal_kegiatan'],
                    'judul' => trim($validated['judul']),
                    'nama_mitra' => trim($validated['nama_mitra']),
                    'deskripsi' => trim($validated['deskripsi']),
                ]);

                // Form selalu mengirim daftar lengkap; yang tidak dikirim berarti dikosongkan.
                $inisiasi->units()->delete();
                $inisiasi->peserta()->delete();
                $this->simpanUnitDanPeserta($inisiasi, $validated);

                InisiasiFoto::query()->whereIn('id', $fotoDihapus->pluck('id'))->delete();
                $this->simpanFoto($inisiasi, $fileBaru, $tersimpan);
            });
        } catch (\Throwable $e) {
            Storage::disk('public')->delete($tersimpan);
            throw $e;
        }

        // Berkas foto yang dihapus dibuang dari disk hanya setelah perubahan di database berhasil.
        Storage::disk('public')->delete($fotoDihapus->pluck('path_file')->all());

        return response()->json([
            'success' => true,
            'message' => 'Data inisiasi berhasil diperbarui.',
            'data' => $this->format($inisiasi->fresh()->load(['units', 'peserta', 'fotos']), $request),
        ]);
    }

    public function destroy(Request $request, Inisiasi $inisiasi): JsonResponse
    {
        $this->pastikanAdmin($request);

        $paths = $inisiasi->fotos()->pluck('path_file')->all();

        // Anak dihapus eksplisit (selain cascade di database) supaya hasilnya sama di semua driver.
        DB::transaction(function () use ($inisiasi) {
            $inisiasi->fotos()->delete();
            $inisiasi->peserta()->delete();
            $inisiasi->units()->delete();
            $inisiasi->delete();
        });

        Storage::disk('public')->delete($paths);

        return response()->json([
            'success' => true,
            'message' => 'Data inisiasi berhasil dihapus.',
        ]);
    }

    private function terapkanFilterUnit($query, string $unit): void
    {
        $unit = trim($unit);

        if (str_starts_with($unit, 'id:') && ctype_digit(substr($unit, 3))) {
            $id = (int) substr($unit, 3);
            // Jurusan mencakup prodi di bawahnya; prodi/unit kerja hanya dirinya sendiri.
            $ids = MasterUnitProdi::query()->where('id', $id)->orWhere('parent_id', $id)->pluck('id')->all();
            $query->whereHas('units', fn ($q) => $q->whereIn('unit_prodi_id', $ids ?: [$id]));
        } elseif (str_starts_with($unit, 'nama:') && trim(substr($unit, 5)) !== '') {
            $nama = mb_strtolower(trim(substr($unit, 5)));
            $query->whereHas('units', fn ($q) => $q->whereNull('unit_prodi_id')->whereRaw('LOWER(nama) = ?', [$nama]));
        }
    }

    private function terapkanFilterWaktu($query, mixed $tahun, mixed $bulan): void
    {
        if ($tahun !== null && $tahun !== '') {
            $tahun = (int) $tahun;
            if ($bulan !== null && $bulan !== '') {
                $awal = sprintf('%04d-%02d-01', $tahun, (int) $bulan);
                $query->whereBetween('tanggal_kegiatan', [$awal, date('Y-m-t', strtotime($awal))]);
            } else {
                $query->whereBetween('tanggal_kegiatan', ["{$tahun}-01-01", "{$tahun}-12-31"]);
            }

            return;
        }

        if ($bulan !== null && $bulan !== '') {
            // Bulan tanpa tahun = bulan itu di tahun mana pun.
            $ekspresi = DB::connection()->getDriverName() === 'sqlite'
                ? "CAST(strftime('%m', tanggal_kegiatan) AS INTEGER)"
                : 'EXTRACT(MONTH FROM tanggal_kegiatan)';
            $query->whereRaw("{$ekspresi} = ?", [(int) $bulan]);
        }
    }

    /**
     * Pilihan untuk dropdown filter: hanya tahun dan unit yang benar-benar dipakai data inisiasi
     * (tidak bergantung pada filter yang sedang aktif).
     *
     * @return array<string, mixed>
     */
    private function opsiFilter(): array
    {
        $tahun = Inisiasi::query()->pluck('tanggal_kegiatan')
            ->map(fn ($tanggal) => (int) $tanggal->format('Y'))
            ->unique()->sortDesc()->values()->all();

        $unitRows = \App\Models\InisiasiUnit::query()->get(['unit_prodi_id', 'nama']);
        $masterIds = $unitRows->pluck('unit_prodi_id')->filter()->unique()->values();
        $master = MasterUnitProdi::query()->whereIn('id', $masterIds)->get(['id', 'nama', 'jenis_node', 'kategori_unit', 'parent_id']);

        // Jurusan induk dari prodi yang dipakai ikut jadi pilihan, supaya bisa memfilter per jurusan.
        $induk = MasterUnitProdi::query()->whereIn('id', $master->pluck('parent_id')->filter()->unique())->get(['id', 'nama', 'jenis_node', 'kategori_unit', 'parent_id']);

        $unit = $master->merge($induk)->unique('id')->map(fn ($row) => [
            'value' => 'id:'.$row->id,
            'nama' => $row->nama,
            'group' => $row->jenis_node === 'prodi' ? 'Program Studi' : ($row->kategori_unit === 'jurusan' ? 'Jurusan' : 'Unit Kerja'),
        ]);

        $lainnya = $unitRows->whereNull('unit_prodi_id')->pluck('nama')
            ->unique(fn ($nama) => mb_strtolower($nama))
            ->map(fn ($nama) => ['value' => 'nama:'.$nama, 'nama' => $nama, 'group' => 'Lainnya']);

        return [
            'tahun' => $tahun,
            'unit' => $unit->merge($lainnya)->sortBy([['group', 'asc'], ['nama', 'asc']])->values()->all(),
        ];
    }

    private function pastikanAdmin(Request $request): void
    {
        $role = strtolower(str_replace([' ', '_'], '-', trim((string) ($request->user()?->role ?? ''))));

        if (! in_array($role, ['admin', 'admin-humas'], true)) {
            abort(403, 'Akses ditolak. Hanya admin yang dapat mengelola data inisiasi.');
        }
    }

    /** @return array<string, mixed> */
    private function validasi(Request $request): array
    {
        return $request->validate([
            'tanggal_kegiatan' => ['required', 'date'],
            'judul' => ['required', 'string', 'max:255'],
            'nama_mitra' => ['required', 'string', 'max:255'],
            'deskripsi' => ['required', 'string', 'max:10000'],
            'unit_prodi_ids' => ['nullable', 'array', 'max:30'],
            'unit_prodi_ids.*' => ['integer', 'distinct', 'exists:master_unit_prodi,id'],
            'unit_lainnya' => ['nullable', 'array', 'max:30'],
            'unit_lainnya.*' => ['nullable', 'string', 'max:200'],
            'peserta' => ['nullable', 'array', 'max:100'],
            'peserta.*' => ['nullable', 'string', 'max:200'],
            'fotos' => ['nullable', 'array', 'max:'.self::MAKS_FOTO],
            'fotos.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'hapus_foto_ids' => ['nullable', 'array'],
            'hapus_foto_ids.*' => ['integer'],
        ], [
            'tanggal_kegiatan.required' => 'Tanggal kegiatan wajib diisi.',
            'judul.required' => 'Judul kegiatan wajib diisi.',
            'nama_mitra.required' => 'Nama mitra wajib diisi.',
            'deskripsi.required' => 'Deskripsi kegiatan wajib diisi.',
            'fotos.*.image' => 'Foto harus berupa gambar.',
            'fotos.*.mimes' => 'Format foto harus JPG, JPEG, PNG, atau WebP.',
            'fotos.*.max' => 'Ukuran tiap foto maksimal 5 MB.',
            'fotos.max' => 'Maksimal '.self::MAKS_FOTO.' foto per kegiatan.',
        ]);
    }

    /** @param array<string, mixed> $validated */
    private function simpanUnitDanPeserta(Inisiasi $inisiasi, array $validated): void
    {
        $unitIds = collect($validated['unit_prodi_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values();
        $master = MasterUnitProdi::query()->whereIn('id', $unitIds)->pluck('nama', 'id');

        foreach ($unitIds as $id) {
            $inisiasi->units()->create(['unit_prodi_id' => $id, 'nama' => (string) $master[$id]]);
        }

        $sudah = $master->map(fn ($nama) => mb_strtolower($nama))->values()->all();
        foreach ($this->bersihkan($validated['unit_lainnya'] ?? []) as $nama) {
            if (in_array(mb_strtolower($nama), $sudah, true)) {
                continue;
            }
            $inisiasi->units()->create(['unit_prodi_id' => null, 'nama' => $nama]);
            $sudah[] = mb_strtolower($nama);
        }

        foreach ($this->bersihkan($validated['peserta'] ?? []) as $nama) {
            $inisiasi->peserta()->create(['nama' => $nama]);
        }
    }

    /**
     * @param  array<int, \Illuminate\Http\UploadedFile>  $files
     * @param  array<int, string>  $tersimpan  diisi path tiap berkas yang berhasil ditulis (untuk pembersihan bila gagal)
     */
    private function simpanFoto(Inisiasi $inisiasi, array $files, array &$tersimpan): void
    {
        $urutan = (int) $inisiasi->fotos()->max('urutan');

        foreach ($files as $file) {
            $path = $file->store(self::FOLDER_FOTO, 'public');
            $tersimpan[] = $path;

            $inisiasi->fotos()->create([
                'path_file' => $path,
                'nama_asli' => mb_substr($file->getClientOriginalName(), 0, 255),
                'urutan' => ++$urutan,
            ]);
        }
    }

    /**
     * @param  array<int, mixed>  $daftar
     * @return array<int, string>
     */
    private function bersihkan(array $daftar): array
    {
        return collect($daftar)
            ->map(fn ($nama) => trim((string) $nama))
            ->filter()
            ->unique(fn ($nama) => mb_strtolower($nama))
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    private function format(Inisiasi $inisiasi, Request $request): array
    {
        $host = $request->getSchemeAndHttpHost();

        return [
            'id' => $inisiasi->id,
            'tanggal_kegiatan' => $inisiasi->tanggal_kegiatan?->toDateString(),
            'judul' => $inisiasi->judul,
            'nama_mitra' => $inisiasi->nama_mitra,
            'deskripsi' => $inisiasi->deskripsi,
            'berita_kerjasama_id' => $inisiasi->berita_kerjasama_id,
            'units' => $inisiasi->units->map(fn ($unit) => [
                'id' => $unit->id,
                'unit_prodi_id' => $unit->unit_prodi_id,
                'nama' => $unit->nama,
            ])->values(),
            'peserta' => $inisiasi->peserta->map(fn ($peserta) => ['id' => $peserta->id, 'nama' => $peserta->nama])->values(),
            'fotos' => $inisiasi->fotos->map(fn ($foto) => [
                'id' => $foto->id,
                'path_file' => $foto->path_file,
                'url' => $host.'/storage/'.ltrim($foto->path_file, '/'),
                'nama_asli' => $foto->nama_asli,
            ])->values(),
            'created_at' => $inisiasi->created_at?->toISOString(),
            'updated_at' => $inisiasi->updated_at?->toISOString(),
        ];
    }
}
