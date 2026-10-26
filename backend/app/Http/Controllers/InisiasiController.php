<?php

namespace App\Http\Controllers;

use App\Models\Inisiasi;
use App\Models\InisiasiDokumen;
use App\Models\InisiasiFoto;
use App\Models\MasterUnitProdi;
use App\Services\InisiasiAksesService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Inisiasi: dokumentasi kegiatan awal/penjajakan kerja sama dengan mitra. Mengelola (tambah/ubah/hapus)
 * hanya untuk admin; melihat daftar/detail juga boleh untuk pengguna internal, terbatas pada inisiasi
 * yang melibatkan unit dalam cakupan jabatannya dan tanpa foto/dokumen/peserta (dicek di sini, bukan
 * sekadar menyembunyikan menu). Foto disimpan di disk 'public'
 * folder inisiasi/ — folder ini tidak dibuka publik lewat /storage, foto dibuka lewat GET /berkas
 * (BerkasController) yang mewajibkan login dan, untuk berkas ini, hanya meluluskan admin.
 */
class InisiasiController extends Controller
{
    private const MAKS_FOTO = 10;

    private const FOLDER_FOTO = 'inisiasi';

    private const MAKS_DOKUMEN = 10;

    private const FOLDER_DOKUMEN = 'inisiasi/dokumen';

    private const STATUS_FINAL = ['disetujui', 'final_approved'];

    public function __construct(private InisiasiAksesService $akses) {}

    public function index(Request $request): JsonResponse
    {
        $admin = $this->pastikanBisaMelihat($request);

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'urut' => ['nullable', 'in:terbaru,terlama'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
            // unit: "id:<id master unit/prodi>" (jurusan ikut mencakup prodi di bawahnya) atau "nama:<unit bebas>".
            'unit' => ['nullable', 'string', 'max:220'],
            'tahun' => ['nullable', 'integer', 'min:1900', 'max:2200'],
            'bulan' => ['nullable', 'integer', 'min:1', 'max:12'],
            'status' => ['nullable', 'in:belum,diproses,kerja_sama,tidak_dilanjutkan'],
        ]);

        $query = Inisiasi::query()->with(['units', 'peserta', 'fotos', 'dokumens', 'pengajuan' => fn ($q) => $q->whereNull('dihapus_admin_pada')]);

        if (! $admin) {
            $this->akses->batasiUntuk($query, $request->user());
        }

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
        $this->terapkanFilterStatus($query, (string) ($validated['status'] ?? ''));

        if (($validated['urut'] ?? 'terbaru') === 'terlama') {
            $query->orderBy('tanggal_kegiatan')->orderBy('id');
        } else {
            $query->orderByDesc('tanggal_kegiatan')->orderByDesc('id');
        }

        $halaman = $query->paginate((int) ($validated['per_page'] ?? 12));

        return response()->json([
            'success' => true,
            'data' => $halaman->getCollection()->map(fn (Inisiasi $item) => $this->format($item, $request, $admin))->values(),
            'opsi_filter' => $admin ? $this->opsiFilter() : ['tahun' => [], 'unit' => []],
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
        $admin = $this->pastikanBisaMelihat($request);

        if (! $admin && ! $this->akses->bisaMelihat($request->user(), $inisiasi)) {
            abort(403, 'Akses ditolak. Inisiasi ini tidak melibatkan unit Anda.');
        }

        return response()->json([
            'success' => true,
            'data' => $this->format($inisiasi->load(['units', 'peserta', 'fotos', 'dokumens', 'pengajuan' => fn ($q) => $q->whereNull('dihapus_admin_pada')]), $request, $admin),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->pastikanAdmin($request);

        $validated = $this->validasi($request);
        $fileBaru = $request->file('fotos', []);
        $dokumenBaru = $request->file('dokumens', []);
        $tersimpan = [];

        try {
            $inisiasi = DB::transaction(function () use ($request, $validated, $fileBaru, $dokumenBaru, &$tersimpan) {
                $inisiasi = Inisiasi::create([
                    'tanggal_kegiatan' => $validated['tanggal_kegiatan'],
                    'judul' => trim($validated['judul']),
                    'nama_mitra' => trim($validated['nama_mitra']),
                    'deskripsi' => trim($validated['deskripsi']),
                    'dibuat_oleh_user_id' => $request->user()->id,
                ]);

                $this->simpanUnitDanPeserta($inisiasi, $validated);
                $this->simpanFoto($inisiasi, $fileBaru, $tersimpan);
                $this->simpanDokumen($inisiasi, $dokumenBaru, $tersimpan);

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
            'data' => $this->format($inisiasi->load(['units', 'peserta', 'fotos', 'dokumens', 'pengajuan']), $request, true),
        ], 201);
    }

    public function update(Request $request, Inisiasi $inisiasi): JsonResponse
    {
        $this->pastikanAdmin($request);

        $validated = $this->validasi($request);
        $fileBaru = $request->file('fotos', []);
        $dokumenBaru = $request->file('dokumens', []);

        $hapusIds = collect($validated['hapus_foto_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values();
        $fotoDihapus = $inisiasi->fotos()->whereIn('id', $hapusIds)->get();

        $sisa = $inisiasi->fotos()->count() - $fotoDihapus->count() + count($fileBaru);
        if ($sisa > self::MAKS_FOTO) {
            throw ValidationException::withMessages([
                'fotos' => 'Maksimal '.self::MAKS_FOTO.' foto per kegiatan.',
            ]);
        }

        $hapusDokumenIds = collect($validated['hapus_dokumen_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values();
        $dokumenDihapus = $inisiasi->dokumens()->whereIn('id', $hapusDokumenIds)->get();

        $sisaDokumen = $inisiasi->dokumens()->count() - $dokumenDihapus->count() + count($dokumenBaru);
        if ($sisaDokumen > self::MAKS_DOKUMEN) {
            throw ValidationException::withMessages([
                'dokumens' => 'Maksimal '.self::MAKS_DOKUMEN.' dokumen per kegiatan.',
            ]);
        }

        $tersimpan = [];

        try {
            DB::transaction(function () use ($inisiasi, $validated, $fileBaru, $fotoDihapus, $dokumenBaru, $dokumenDihapus, &$tersimpan) {
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

                InisiasiDokumen::query()->whereIn('id', $dokumenDihapus->pluck('id'))->delete();
                $this->simpanDokumen($inisiasi, $dokumenBaru, $tersimpan);
            });
        } catch (\Throwable $e) {
            Storage::disk('public')->delete($tersimpan);
            throw $e;
        }

        // CC baru di inisiasi ikut diteruskan ke pengajuan yang sudah dibuat dari inisiasi ini.
        $this->akses->teruskanCcKePengajuan($inisiasi);

        // Berkas foto yang dihapus dibuang dari disk hanya setelah perubahan di database berhasil.
        Storage::disk('public')->delete(array_merge(
            $fotoDihapus->pluck('path_file')->all(),
            $dokumenDihapus->pluck('path_file')->all(),
        ));

        return response()->json([
            'success' => true,
            'message' => 'Data inisiasi berhasil diperbarui.',
            'data' => $this->format($inisiasi->fresh()->load(['units', 'peserta', 'fotos', 'dokumens', 'pengajuan']), $request, true),
        ]);
    }

    public function destroy(Request $request, Inisiasi $inisiasi): JsonResponse
    {
        $this->pastikanAdmin($request);

        $paths = array_merge(
            $inisiasi->fotos()->pluck('path_file')->all(),
            $inisiasi->dokumens()->pluck('path_file')->all(),
        );

        // Anak dihapus eksplisit (selain cascade di database) supaya hasilnya sama di semua driver.
        DB::transaction(function () use ($inisiasi) {
            $inisiasi->fotos()->delete();
            $inisiasi->dokumens()->delete();
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

    /** Hapus banyak inisiasi sekaligus (khusus admin), dengan perlakuan yang sama seperti hapus satuan. */
    public function hapusMassal(Request $request): JsonResponse
    {
        $this->pastikanAdmin($request);

        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'distinct'],
        ], [
            'ids.required' => 'Pilih minimal satu inisiasi.',
            'ids.max' => 'Maksimal 100 inisiasi sekali hapus.',
        ]);

        $daftar = Inisiasi::query()->whereIn('id', $validated['ids'])->get();
        $paths = [];

        DB::transaction(function () use ($daftar, &$paths) {
            foreach ($daftar as $inisiasi) {
                $paths = array_merge(
                    $paths,
                    $inisiasi->fotos()->pluck('path_file')->all(),
                    $inisiasi->dokumens()->pluck('path_file')->all(),
                );
                $inisiasi->fotos()->delete();
                $inisiasi->dokumens()->delete();
                $inisiasi->peserta()->delete();
                $inisiasi->units()->delete();
                $inisiasi->delete();
            }
        });

        Storage::disk('public')->delete($paths);

        return response()->json([
            'success' => true,
            'message' => $daftar->count().' data inisiasi berhasil dihapus.',
            'jumlah' => $daftar->count(),
        ]);
    }

    /** Status tindak lanjut dihitung dari pengajuan yang menunjuk inisiasi (yang belum disembunyikan admin). */
    private function terapkanFilterStatus($query, string $status): void
    {
        $aktif = fn ($q) => $q->whereNull('dihapus_admin_pada');
        $final = fn ($q) => $q->whereNull('dihapus_admin_pada')->whereIn('status_pengajuan', self::STATUS_FINAL);
        $berjalan = fn ($q) => $q->whereNull('dihapus_admin_pada')->whereNotIn('status_pengajuan', [...self::STATUS_FINAL, 'ditolak']);

        match ($status) {
            'belum' => $query->whereDoesntHave('pengajuan', $aktif),
            'kerja_sama' => $query->whereHas('pengajuan', $final),
            'diproses' => $query->whereDoesntHave('pengajuan', $final)->whereHas('pengajuan', $berjalan),
            'tidak_dilanjutkan' => $query->whereHas('pengajuan', $aktif)->whereDoesntHave('pengajuan', $final)->whereDoesntHave('pengajuan', $berjalan),
            default => null,
        };
    }

    /**
     * belum = belum ada pengajuan; kerja_sama = ada yang disetujui; diproses = ada yang masih berjalan;
     * tidak_dilanjutkan = semua pengajuannya ditolak.
     */
    private function hitungStatus(Inisiasi $inisiasi): string
    {
        $pengajuan = $inisiasi->pengajuan->filter(fn ($p) => $p->dihapus_admin_pada === null);

        if ($pengajuan->isEmpty()) {
            return 'belum';
        }
        if ($pengajuan->contains(fn ($p) => in_array($p->status_pengajuan, self::STATUS_FINAL, true))) {
            return 'kerja_sama';
        }
        if ($pengajuan->contains(fn ($p) => $p->status_pengajuan !== 'ditolak')) {
            return 'diproses';
        }

        return 'tidak_dilanjutkan';
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
        $user = $request->user();

        if (! $user || ! $this->akses->isAdmin($user)) {
            abort(403, 'Akses ditolak. Hanya admin yang dapat mengelola data inisiasi.');
        }
    }

    /** Admin atau pengguna internal boleh melihat; mengembalikan true bila admin. */
    private function pastikanBisaMelihat(Request $request): bool
    {
        $user = $request->user();

        if ($user && $this->akses->isAdmin($user)) {
            return true;
        }
        if ($user && $this->akses->isInternal($user)) {
            return false;
        }

        abort(403, 'Akses ditolak.');
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
            // CC: id akun untuk peserta yang dipilih dari kandidat, dikunci dengan nomor urut peserta[] yang sama.
            'peserta_user_ids' => ['nullable', 'array', 'max:100'],
            'peserta_user_ids.*' => ['nullable', 'integer', 'exists:users,id'],
            'fotos' => ['nullable', 'array', 'max:'.self::MAKS_FOTO],
            'fotos.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'hapus_foto_ids' => ['nullable', 'array'],
            'hapus_foto_ids.*' => ['integer'],
            'dokumens' => ['nullable', 'array', 'max:'.self::MAKS_DOKUMEN],
            'dokumens.*' => ['file', 'mimes:pdf', 'max:10240'],
            'hapus_dokumen_ids' => ['nullable', 'array'],
            'hapus_dokumen_ids.*' => ['integer'],
        ], [
            'tanggal_kegiatan.required' => 'Tanggal kegiatan wajib diisi.',
            'judul.required' => 'Judul kegiatan wajib diisi.',
            'nama_mitra.required' => 'Nama mitra wajib diisi.',
            'deskripsi.required' => 'Deskripsi kegiatan wajib diisi.',
            'fotos.*.image' => 'Foto harus berupa gambar.',
            'fotos.*.mimes' => 'Format foto harus JPG, JPEG, PNG, atau WebP.',
            'fotos.*.max' => 'Ukuran tiap foto maksimal 5 MB.',
            'fotos.max' => 'Maksimal '.self::MAKS_FOTO.' foto per kegiatan.',
            'dokumens.*.file' => 'Dokumen harus berupa berkas PDF.',
            'dokumens.*.mimes' => 'Format dokumen harus PDF.',
            'dokumens.*.max' => 'Ukuran tiap dokumen maksimal 10 MB.',
            'dokumens.max' => 'Maksimal '.self::MAKS_DOKUMEN.' dokumen per kegiatan.',
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

        // Urutan nama dipakai mengaitkan akun CC, jadi dicocokkan sebelum daftar dibersihkan dari duplikat/kosong.
        $akunPerNama = [];
        foreach ((array) ($validated['peserta'] ?? []) as $indeks => $nama) {
            $akun = $validated['peserta_user_ids'][$indeks] ?? null;
            $kunci = mb_strtolower(trim((string) $nama));
            if ($akun && $kunci !== '' && ! isset($akunPerNama[$kunci])) {
                $akunPerNama[$kunci] = (int) $akun;
            }
        }

        foreach ($this->bersihkan($validated['peserta'] ?? []) as $nama) {
            $inisiasi->peserta()->create(['nama' => $nama, 'user_id' => $akunPerNama[mb_strtolower($nama)] ?? null]);
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
     * @param  array<int, \Illuminate\Http\UploadedFile>  $files
     * @param  array<int, string>  $tersimpan  diisi path tiap berkas yang berhasil ditulis (untuk pembersihan bila gagal)
     */
    private function simpanDokumen(Inisiasi $inisiasi, array $files, array &$tersimpan): void
    {
        $urutan = (int) $inisiasi->dokumens()->max('urutan');

        foreach ($files as $file) {
            $path = $file->store(self::FOLDER_DOKUMEN, 'public');
            $tersimpan[] = $path;

            $inisiasi->dokumens()->create([
                'path_file' => $path,
                'nama_asli' => mb_substr($file->getClientOriginalName(), 0, 255),
                'ukuran' => $file->getSize(),
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
    private function format(Inisiasi $inisiasi, Request $request, bool $admin): array
    {
        $host = $request->getSchemeAndHttpHost();
        $pengajuanAktif = $inisiasi->pengajuan->filter(fn ($p) => $p->dihapus_admin_pada === null);

        $ringkas = [
            'id' => $inisiasi->id,
            'tanggal_kegiatan' => $inisiasi->tanggal_kegiatan?->toDateString(),
            'judul' => $inisiasi->judul,
            'nama_mitra' => $inisiasi->nama_mitra,
            'deskripsi' => $inisiasi->deskripsi,
            'units' => $inisiasi->units->map(fn ($unit) => [
                'id' => $unit->id,
                'unit_prodi_id' => $unit->unit_prodi_id,
                'nama' => $unit->nama,
            ])->values(),
            'status_tindak_lanjut' => $this->hitungStatus($inisiasi),
            'jumlah_pengajuan' => $pengajuanAktif->count(),
        ];

        // Pengguna internal hanya mendapat ringkasan; foto, dokumen, dan peserta khusus admin.
        if (! $admin) {
            return $ringkas;
        }

        return [
            'status_tindak_lanjut' => $ringkas['status_tindak_lanjut'],
            'jumlah_pengajuan' => $ringkas['jumlah_pengajuan'],
            'pengajuan' => $pengajuanAktif->map(fn ($p) => [
                'id' => $p->id,
                'nomor_pengajuan' => $p->nomor_pengajuan,
                'judul_pengajuan' => $p->judul_pengajuan,
                'status_pengajuan' => $p->status_pengajuan,
            ])->values(),
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
            'peserta' => $inisiasi->peserta->map(fn ($peserta) => ['id' => $peserta->id, 'nama' => $peserta->nama, 'user_id' => $peserta->user_id])->values(),
            'fotos' => $inisiasi->fotos->map(fn ($foto) => [
                'id' => $foto->id,
                'path_file' => $foto->path_file,
                'url' => $host.'/storage/'.ltrim($foto->path_file, '/'),
                'nama_asli' => $foto->nama_asli,
            ])->values(),
            'dokumens' => $inisiasi->dokumens->map(fn ($dokumen) => [
                'id' => $dokumen->id,
                'path_file' => $dokumen->path_file,
                'nama_asli' => $dokumen->nama_asli,
                'ukuran' => $dokumen->ukuran,
            ])->values(),
            'created_at' => $inisiasi->created_at?->toISOString(),
            'updated_at' => $inisiasi->updated_at?->toISOString(),
        ];
    }
}
