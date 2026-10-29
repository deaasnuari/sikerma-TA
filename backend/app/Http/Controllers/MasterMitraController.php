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
        // Semua yang cocok diambil dulu baru diurutkan — kalau dipotong sebelum
        // diurutkan, nama yang paling pas bisa hilang dari daftar.
        $candidates = $query->orderBy('nama_mitra')->get(['id', 'nama_mitra']);

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
            ->take(50)
            ->values();

        return response(['success' => true, 'data' => $rows, 'total' => $candidates->count()]);
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
            'data' => $query->orderBy('nama_mitra')->get()->each->append('kontak'),
            'message' => 'Master mitra retrieved successfully',
        ]);
    }

    /**
     * Pencarian saran mitra untuk form TAMBAH di Data Kemitraan (khusus admin, tidak di-cache
     * seperti /public/mitra). Lebih peka dari pencarian publik: cocok sebagian per kata, dan
     * toleran salah ketik (mis. "infinion" menemukan "PT Infineon Technologies Batam").
     */
    public function cari(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $kata = mb_strtolower(trim((string) $request->query('q', '')));
        $tokens = array_values(array_filter(preg_split('/[^\p{L}\p{N}]+/u', $kata) ?: []));
        if (mb_strlen(implode('', $tokens)) < 2) {
            return response(['success' => true, 'data' => [], 'total' => 0]);
        }

        $kunci = MasterMitraResolver::normalize($kata);
        $hasil = [];
        foreach (DB::table('master_mitra')->select('id', 'nama_mitra', 'kode_mitra')->get() as $row) {
            $nama = mb_strtolower((string) $row->nama_mitra);
            $kataNama = array_values(array_filter(preg_split('/[^\p{L}\p{N}]+/u', $nama) ?: []));

            // Tiap kata yang diketik harus cocok dengan sebuah kata di nama: awalan/bagian kata,
            // atau salah ketik kecil untuk kata yang cukup panjang.
            $skor = 0;
            $semuaCocok = true;
            foreach ($tokens as $token) {
                $terbaik = null;
                foreach ($kataNama as $kn) {
                    if (str_starts_with($kn, $token)) {
                        $terbaik = 1;
                        break;
                    }
                    if (mb_strlen($token) >= 3 && str_contains($kn, $token)) {
                        $terbaik = min($terbaik ?? 2, 2);
                    }
                    $panjang = min(mb_strlen($token), mb_strlen($kn));
                    $batasTypo = $panjang >= 8 ? 2 : ($panjang >= 4 ? 1 : 0);
                    if ($batasTypo > 0 && levenshtein($token, $kn) <= $batasTypo) {
                        $terbaik = min($terbaik ?? 3, 3);
                    }
                }
                if ($terbaik === null) {
                    $semuaCocok = false;
                    break;
                }
                $skor += $terbaik;
            }
            if (! $semuaCocok) {
                continue;
            }

            $normal = MasterMitraResolver::normalize($nama);
            $peringkat = $normal === $kunci ? 0 : (str_starts_with($normal, $kunci) ? 1 : $skor + 1);
            $hasil[] = ['peringkat' => $peringkat, 'row' => $row];
        }

        usort($hasil, fn ($a, $b) => [$a['peringkat'], mb_strtolower((string) $a['row']->nama_mitra)] <=> [$b['peringkat'], mb_strtolower((string) $b['row']->nama_mitra)]);

        return response([
            'success' => true,
            'data' => array_map(
                fn ($h) => ['id' => $h['row']->id, 'nama_mitra' => $h['row']->nama_mitra, 'kode_mitra' => $h['row']->kode_mitra],
                array_slice($hasil, 0, 50),
            ),
            'total' => count($hasil),
        ]);
    }

    /**
     * Cek apakah sebuah nama sudah dipakai mitra lain (aturan sama dengan tolakKalauNamaGanda),
     * dipakai form Data Kemitraan untuk memberi peringatan langsung saat admin mengetik nama.
     */
    public function cekNama(Request $request): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $resolver = app(MasterMitraResolver::class);
        $nama = (string) $request->query('nama', '');
        $exceptId = $request->filled('except_id') ? (int) $request->query('except_id') : null;

        $ada = $resolver->findByName($nama, $exceptId);
        $mirip = $ada ? [] : array_map(
            fn ($m) => ['id' => $m->id, 'nama_mitra' => $m->nama_mitra, 'kode_mitra' => $m->kode_mitra],
            $resolver->findMirip($nama, $exceptId),
        );

        return response([
            'success' => true,
            'data' => [
                'ada' => (bool) $ada,
                'mitra' => $ada ? ['id' => $ada->id, 'nama_mitra' => $ada->nama_mitra, 'kode_mitra' => $ada->kode_mitra] : null,
                // Bukan pasti sama — hanya peringatan, penyimpanan tetap boleh.
                'mirip' => $mirip,
            ],
            'message' => 'Cek nama mitra',
        ]);
    }

    /**
     * Tolak nama yang sama dengan mitra lain yang sudah ada (abaikan huruf besar/kecil, tanda
     * baca, PT/CV, salah ketik kecil — aturan yang sama dengan penggabungan mitra ganda), supaya
     * satu instansi tidak masuk Data Kemitraan dua kali. Mengembalikan response 422 atau null.
     */
    private function tolakKalauNamaGanda(?string $nama, ?int $exceptId = null): ?Response
    {
        $ada = app(MasterMitraResolver::class)->findByName($nama, $exceptId);
        if (! $ada) {
            return null;
        }

        $kode = trim((string) $ada->kode_mitra) !== '' ? ' (kode '.$ada->kode_mitra.')' : '';

        return response([
            'success' => false,
            'message' => 'Mitra "'.$ada->nama_mitra.'"'.$kode.' sudah ada di Data Kemitraan. Gunakan data yang sudah ada atau ubah datanya, jangan buat mitra ganda.',
            'errors' => ['nama_mitra' => ['Nama mitra sudah ada: '.$ada->nama_mitra]],
            'data' => ['mitra_id' => $ada->id],
        ], 422);
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

        if ($response = $this->tolakKalauNamaGanda($validated['nama_mitra'])) {
            return $response;
        }

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
            'data' => $mitra->append('kontak'),
            'message' => 'Master mitra created successfully',
        ], 201);
    }

    public function show(MasterMitra $mitra): Response
    {
        return response([
            'success' => true,
            'data' => $mitra->append('kontak'),
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

        // Hanya diperiksa kalau namanya benar-benar diganti, supaya mengedit kolom lain tidak
        // terblokir.
        if (isset($validated['nama_mitra']) && trim($validated['nama_mitra']) !== trim((string) $mitra->nama_mitra)
            && ($response = $this->tolakKalauNamaGanda($validated['nama_mitra'], $mitra->id))) {
            return $response;
        }

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
            'data' => $mitra->append('kontak'),
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
     * Samakan kontak tambahan dengan daftar dari form: yang punya id lama diubah, yang tanpa id ditambah,
     * yang tidak ada lagi di daftar dibuang. id yang tidak dikenal di mitra ini diperlakukan sebagai kontak baru.
     */
    private function syncKontak(MasterMitra $mitra, ?array $kontak): void
    {
        if ($kontak === null) {
            return;
        }

        $idAda = array_column($mitra->kontak, 'id');
        $daftar = array_map(function (array $item) use ($idAda) {
            if (isset($item['id']) && ! in_array((int) $item['id'], $idAda, true)) {
                unset($item['id']);
            }

            return $item;
        }, $kontak);

        $mitra->setKontak($daftar);
    }

    /** Jumlah dokumen/pengajuan yang memakai mitra ini, untuk peringatan di modal hapus. */
    public function pemakaian(Request $request, MasterMitra $mitra): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $dok = DB::table('dokumen_kerjasama')->where('mitra_id', $mitra->id);

        return response([
            'success' => true,
            'data' => [
                'dokumen_aktif' => (clone $dok)->whereNull('dihapus_admin_pada')->whereNull('dihapus_user_pada')->count(),
                'dokumen_sampah' => (clone $dok)->where(fn ($q) => $q->whereNotNull('dihapus_admin_pada')->orWhereNotNull('dihapus_user_pada'))->count(),
                'pengajuan' => DB::table('pengajuan_v2')->where('mitra_id', $mitra->id)->count(),
                // Rincian untuk modal hapus (dibatasi 10 teratas; jumlah penuh ada di angka di atas).
                'daftar_dokumen' => (clone $dok)->orderByRaw('(dihapus_admin_pada is not null or dihapus_user_pada is not null)')->orderBy('id')->limit(10)
                    ->get(['id', 'nomor_dokumen', 'jenis_dokumen', 'status_siklus', 'dihapus_admin_pada', 'dihapus_user_pada'])
                    ->map(fn ($d) => [
                        'id' => $d->id,
                        'nomor_dokumen' => $d->nomor_dokumen,
                        'jenis_dokumen' => $d->jenis_dokumen,
                        'status_siklus' => $d->status_siklus,
                        'di_sampah' => (bool) ($d->dihapus_admin_pada || $d->dihapus_user_pada),
                    ])->values(),
                'daftar_pengajuan' => DB::table('pengajuan_v2')->where('mitra_id', $mitra->id)->orderBy('id')->limit(10)
                    ->get(['id', 'nomor_pengajuan', 'judul_pengajuan', 'status_pengajuan'])
                    ->map(fn ($p) => [
                        'id' => $p->id,
                        'nomor_pengajuan' => $p->nomor_pengajuan,
                        'judul_pengajuan' => $p->judul_pengajuan,
                        'status_pengajuan' => $p->status_pengajuan,
                    ])->values(),
            ],
        ]);
    }

    public function destroy(Request $request, MasterMitra $mitra): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        DB::transaction(function () use ($mitra) {
            // Dokumen yang menunjuk mitra ini akan kehilangan tautan (nullOnDelete). Supaya nama yang tertulis
            // di dokumen tidak hilang, snap_nama_mitra yang masih kosong diisi dengan nama mitra ini dulu.
            DB::table('dokumen_kerjasama')->where('mitra_id', $mitra->id)
                ->where(fn ($q) => $q->whereNull('snap_nama_mitra')->orWhere('snap_nama_mitra', ''))
                ->update(['snap_nama_mitra' => $mitra->nama_mitra]);
            // Sama dengan nullOnDelete di PostgreSQL, dibuat eksplisit supaya perilakunya tidak bergantung pada FK.
            DB::table('dokumen_kerjasama')->where('mitra_id', $mitra->id)->update(['mitra_id' => null]);
            DB::table('pengajuan_v2')->where('mitra_id', $mitra->id)->update(['mitra_id' => null]);

            $mitra->delete();
        });

        return response([
            'success' => true,
            'data' => null,
            'message' => 'Master mitra deleted successfully',
        ]);
    }
}