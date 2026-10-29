<?php

namespace App\Http\Controllers;

use App\Exceptions\PengajuanKonflikException;
use App\Models\DokumenFile;
use App\Models\DokumenLog;
use App\Models\DokumenKerjasama;
use App\Models\MasterMitra;
use App\Services\MasterMitraResolver;
use App\Models\MasterRuangLingkup;
use App\Models\MasterUnitProdi;
use App\Support\JenisDokumenSelection;
use App\Support\UnitProdiSelection;
use App\Models\Pengajuan;
use App\Models\User;
use App\Services\CivitasStructureService;
use App\Services\StructuralAccessService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PengajuanController extends Controller
{
    /** Status di mana pengusul masih boleh mengubah pengajuannya sendiri. */
    private const STATUS_BOLEH_DIUBAH_PENGUSUL = ['menunggu', 'revisi'];

    /** Field yang hanya boleh diubah admin lewat update(). */
    private const FIELD_KHUSUS_ADMIN = [
        'nomor_pengajuan',
        'user_pengusul_id',
        'kategori_pengajuan',
        'status_pengajuan',
        'catatan',
        'catatan_revisi',
        'keputusan',
        'final_file_name',
        'final_file_path',
        'acc_actor',
        'diajukan_pada',
        'email_terverifikasi_pada',
        'distribusi_user_ids',
    ];

    private static array $pengajuanColumnCache = [];
    private static ?bool $pengajuanFileTableExists = null;
    private static ?bool $dokumenKerjasamaTableExists = null;
    private static ?bool $dokumenFileTableExists = null;
    private static ?bool $dokumenLogTableExists = null;

    /**
     * Tautkan pengajuan ke master_mitra tanpa mengubah Data Kemitraan: isian form pengajuan
     * (alamat, kontak, WhatsApp, kategori, dst) tidak pernah ditulis ke master_mitra; perubahan
     * data mitra hanya lewat Data Kemitraan (admin).
     *
     * Mitra yang dipilih dari daftar dipakai apa adanya. Nama yang diketik manual dicocokkan
     * dengan mitra yang ada (aturan MasterMitraResolver: abaikan huruf besar/kecil, spasi &
     * tanda baca); bila belum ada, dibuat baris baru yang hanya berisi nama supaya pengajuan
     * punya mitra_id.
     */
    private function syncMasterMitraFromPengajuanInput(array $input): ?int
    {
        $namaMitra = trim((string) ($input['nama_mitra'] ?? ''));
        $mitraId = $input['mitra_id'] ?? null;

        if ($mitraId) {
            $mitra = MasterMitra::find($mitraId);
            if ($mitra) {
                return $mitra->id;
            }
        }

        if ($namaMitra === '') {
            return $mitraId;
        }

        $mitra = app(MasterMitraResolver::class)->findByName($namaMitra)
            ?? MasterMitra::create(['nama_mitra' => $namaMitra, 'aktif' => true]);

        return $mitra->id;
    }

    private function generateNomorPMH(): string
    {
        // Cari nomor PMH tertinggi yang sudah ada di database
        $lastNomor = DB::table('pengajuan_v2')
            ->where('nomor_pengajuan', 'LIKE', 'PMH-%')
            ->orderByRaw("LENGTH(nomor_pengajuan) DESC, nomor_pengajuan DESC")
            ->value('nomor_pengajuan');

        $nextNum = 1;
        if ($lastNomor) {
            $numPart = (int) substr($lastNomor, 4); // strip "PMH-"
            $nextNum = $numPart + 1;
        }

        // Pastikan unik 
        do {
            $nomor = 'PMH-' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);
            $exists = DB::table('pengajuan_v2')->where('nomor_pengajuan', $nomor)->exists();
            if ($exists) $nextNum++;
        } while ($exists);

        return $nomor;
    }

    private function hasPengajuanColumn(string $column): bool
    {
        if (array_key_exists($column, self::$pengajuanColumnCache)) {
            return self::$pengajuanColumnCache[$column];
        }

        self::$pengajuanColumnCache[$column] = Schema::hasColumn((new Pengajuan)->getTable(), $column);

        return self::$pengajuanColumnCache[$column];
    }

    private function useNewPengajuanSchema(): bool
    {
        return $this->hasPengajuanColumn('nomor_pengajuan');
    }

    private function hasPengajuanFileTable(): bool
    {
        if (self::$pengajuanFileTableExists !== null) {
            return self::$pengajuanFileTableExists;
        }

        self::$pengajuanFileTableExists = Schema::hasTable('pengajuan_file');

        return self::$pengajuanFileTableExists;
    }

    private function hasDokumenKerjasamaTable(): bool
    {
        if (self::$dokumenKerjasamaTableExists !== null) {
            return self::$dokumenKerjasamaTableExists;
        }

        self::$dokumenKerjasamaTableExists = Schema::hasTable('dokumen_kerjasama');

        return self::$dokumenKerjasamaTableExists;
    }

    private function hasDokumenFileTable(): bool
    {
        if (self::$dokumenFileTableExists !== null) {
            return self::$dokumenFileTableExists;
        }

        self::$dokumenFileTableExists = Schema::hasTable('dokumen_file');

        return self::$dokumenFileTableExists;
    }

    private function hasDokumenLogTable(): bool
    {
        if (self::$dokumenLogTableExists !== null) {
            return self::$dokumenLogTableExists;
        }

        self::$dokumenLogTableExists = Schema::hasTable('dokumen_log');

        return self::$dokumenLogTableExists;
    }

    private function resolveLingkupLabel($ruangLingkupIds): ?string
    {
        if (! is_array($ruangLingkupIds) || empty($ruangLingkupIds)) {
            return null;
        }

        $ids = array_values(array_unique(array_filter(array_map(static function ($id) {
            if (is_numeric($id)) {
                return (int) $id;
            }

            return null;
        }, $ruangLingkupIds))));

        if (empty($ids)) {
            return null;
        }

        $labels = MasterRuangLingkup::query()
            ->whereIn('id', $ids)
            ->pluck('nama_ruang_lingkup')
            ->filter()
            ->values()
            ->all();

        return empty($labels) ? null : implode(', ', $labels);
    }

    private function writeInitialDokumenLogFromPengajuan(
        Pengajuan $pengajuan,
        DokumenKerjasama $dokumen,
        ?int $userId,
        ?string $buktiPath
    ): void {
        if (! $this->hasDokumenLogTable()) {
            return;
        }

        $unitName = MasterUnitProdi::query()
            ->whereIn('id', $pengajuan->unitProdiIdsUrut())
            ->pluck('nama')
            ->implode(', ') ?: null;

        $mitraName = trim((string) ($pengajuan->nama_mitra ?? ''));
        if ($mitraName === '' && $pengajuan->mitra_id) {
            $mitraName = (string) (DB::table('master_mitra')->where('id', $pengajuan->mitra_id)->value('nama_mitra') ?? '');
        }

        $logPayload = [
            'judul_log' => 'Data awal pengajuan disalin ke dokumen',
            'isi_log' => 'Data awal dari form pengajuan otomatis dicatat saat pengajuan disetujui.',
            'payload_json' => null,
            'nomor' => (string) ($dokumen->nomor_dokumen ?? ''),
            'mitra' => $mitraName !== '' ? $mitraName : null,
            'telepon' => $pengajuan->whatsapp_pengusul,
            'tgl_mulai' => $pengajuan->tanggal_mulai,
            'tgl_berakhir' => $pengajuan->tanggal_berakhir,
            'unit' => $unitName,
            'lingkup' => $this->resolveLingkupLabel($pengajuan->ruang_lingkup_ids),
            'tingkat' => strtolower((string) ($pengajuan->kategori_pengajuan ?? '')) === 'eksternal'
                ? 'lokal/wilayah'
                : 'internal',
            'periode' => null,
            'judul' => $pengajuan->judul_pengajuan,
            'manfaat' => $pengajuan->deskripsi_pengajuan,
            'bukti' => $buktiPath,
            'status' => 'aktif',
            'pic' => $pengajuan->nama_pengusul,
            'tgl_monitoring' => now()->toDateString(),
            'dibuat_oleh_user_id' => $userId,
        ];

        $existing = DokumenLog::query()
            ->where('dokumen_id', $dokumen->id)
            ->where('tipe_log', 'pengajuan_awal')
            ->first();

        if ($existing) {
            $existing->update($logPayload);
            return;
        }

        DokumenLog::query()->create(array_merge($logPayload, [
            'dokumen_id' => $dokumen->id,
            'tipe_log' => 'pengajuan_awal',
        ]));
    }

    private function resolveDirekturCode(?string $unitName): string
    {
        $normalized = strtolower(trim((string) $unitName));
        if ($normalized === '') {
            return 'PL29';
        }

        $patterns = [
            'PL29.5' => ['spi', 'satuan pengawas internal'],
            'PL29.6' => ['p4m', 'penjaminan mutu'],
            'PL29.7' => ['p3m', 'penelitian dan pengabdian'],
            'PL29.8' => ['akademik', 'subag akademik'],
            'PL29.9' => ['sbum', 'sub bagian umum'],
            'PL29.10' => ['teknik elektro'],
            'PL29.11' => ['teknik informatika'],
            'PL29.12' => ['teknik mesin'],
            'PL29.13' => ['manajemen dan bisnis'],
            'PL29.14' => ['shilau'],
            'PL29.15' => ['upa perpustakaan'],
            'PL29.16' => ['upa tik'],
            'PL29.17' => ['upa pp', 'perawatan dan perbaikan'],
            'PL29.18' => ['upa pkk', 'pengembangan karier'],
            'PL29.19' => ['osdm', 'organisasi dan sdm'],
            'PL29.20' => ['pokja keuangan'],
            'PL29.21' => ['pokja perencanaan'],
            'PL29.22' => ['pokja bmn', 'pengadaan'],
            'PL29.23' => ['pokja kemahasiswaan'],
            'PL29.24' => ['pokja humas', 'kerja sama'],
        ];

        foreach ($patterns as $code => $keywords) {
            foreach ($keywords as $keyword) {
                if (str_contains($normalized, $keyword)) {
                    return $code;
                }
            }
        }

        return 'PL29';
    }

    private function toRomanMonth(int $month): string
    {
        $roman = [
            1 => 'I', 2 => 'II', 3 => 'III', 4 => 'IV', 5 => 'V', 6 => 'VI',
            7 => 'VII', 8 => 'VIII', 9 => 'IX', 10 => 'X', 11 => 'XI', 12 => 'XII',
        ];

        return $roman[$month] ?? 'I';
    }

    private function generateNomorDokumen(Pengajuan $pengajuan): string
    {
        $jenis = strtoupper((string) ($pengajuan->jenis_dokumen ?? 'MOU'));
        $jenis = in_array($jenis, ['MOU', 'MOA', 'IA'], true) ? $jenis : 'MOU';

        $unitName = null;
        if ($pengajuan->unit_prodi_id) {
            $unitName = MasterUnitProdi::query()->where('id', $pengajuan->unit_prodi_id)->value('nama');
        }

        $kodeDirektur = $this->resolveDirekturCode($unitName);
        $tanggalMulai = trim((string) ($pengajuan->tanggal_mulai ?? ''));
        $bulan = $tanggalMulai !== '' ? (int) date('n', strtotime($tanggalMulai)) : (int) now()->format('n');
        if ($bulan < 1 || $bulan > 12) {
            $bulan = (int) now()->format('n');
        }

        $bulanRomawi = $this->toRomanMonth($bulan);
        $tahunPengajuan = (string) ($pengajuan->created_at?->format('Y') ?? now()->format('Y'));

        // Ambil semua nomor dokumen tahun ini, lalu cari max urutan yg ≤100 (format baru).
        // Data lama dengan angka besar (mis. 975) diabaikan dari hitungan.
        $nomorThisYear = DokumenKerjasama::query()
            ->whereRaw("nomor_dokumen ~ ?", ["^[0-9]+/[^/]+/[^/]+/{$tahunPengajuan}(-[0-9]+)?\$"])
            ->pluck('nomor_dokumen');

        $maxUrutan = 0;
        foreach ($nomorThisYear as $nomor) {
            if (preg_match('/^(\d+)\//', $nomor, $matches)) {
                $num = (int) $matches[1];
                if ($num <= 100) {
                    $maxUrutan = max($maxUrutan, $num);
                }
            }
        }

        $urutan = str_pad((string) ($maxUrutan + 1), 3, '0', STR_PAD_LEFT);

        return $urutan . '/' . $jenis . '.' . $kodeDirektur . '/' . $bulanRomawi . '/' . $tahunPengajuan;
    }

    private function isStandardNomorDokumen(string $nomorDokumen): bool
    {
        $nomor = strtoupper(trim($nomorDokumen));
        if ($nomor === '') {
            return false;
        }

        return (bool) preg_match('/^\d+\/((MOU)|(MOA)|(IA))\.PL29(?:\.\d+)?\/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\/\d{4}(?:-\d+)?$/', $nomor);
    }

    private function ensureUniqueNomorDokumen(string $candidate, ?int $ignoreId = null): string
    {
        $final = $candidate;
        $suffix = 1;

        while (true) {
            $query = DokumenKerjasama::query()->where(function ($q) use ($final) {
                $q->where('nomor_dokumen', $final);
            });
            if ($ignoreId !== null) {
                $query->where('id', '!=', $ignoreId);
            }

            if (! $query->exists()) {
                return $final;
            }

            $final = $candidate . '-' . $suffix;
            $suffix++;
        }
    }

    private function moveApprovedPengajuanToDokumen(Pengajuan $pengajuan, Request $request): void
    {
        if (! $this->hasDokumenKerjasamaTable()) {
            return;
        }

        $nomorPengajuan = trim((string) ($pengajuan->nomor_pengajuan ?? ''));
        if ($nomorPengajuan === '') {
            $nomorPengajuan = 'PGJ-' . $pengajuan->id;
        }

        // Dokumen milik pengajuan INI dicari lewat sumber_pengajuan_id. Pencocokan lewat nomor pengajuan
        // hanya untuk dokumen lama yang belum punya sumber dan masih aktif: nomor PMH bisa dipakai ulang
        // (mis. pengajuan terakhir dihapus permanen, lalu pengajuan baru mendapat nomor yang sama), jadi
        // dokumen bekas pengajuan lain — terutama yang sudah di Sampah — TIDAK boleh dipakai ulang, kalau
        // tidak pengajuan baru "tertelan" ke dokumen terhapus dan tidak pernah muncul di Rekap Data.
        $existingDokumen = DokumenKerjasama::query()
            ->where('sumber_pengajuan_id', $pengajuan->id)
            ->first()
            ?? DokumenKerjasama::query()
                ->where('no_permohonan', $nomorPengajuan)
                ->whereNull('sumber_pengajuan_id')
                ->whereNull('dihapus_admin_pada')
                ->whereNull('dihapus_user_pada')
                ->first();

        $requestedNomorDokumen = trim((string) $request->input('nomor_dokumen', ''));
        $existingNomorDokumen = trim((string) ($existingDokumen?->nomor_dokumen ?? ''));

        // Existing nomor_dokumen di database dipertahankan apa adanya.
        $nomorDokumenBase = $existingNomorDokumen !== ''
            ? $existingNomorDokumen
            : ($requestedNomorDokumen !== '' ? $requestedNomorDokumen : $this->generateNomorDokumen($pengajuan));

        $nomorDokumen = $this->ensureUniqueNomorDokumen($nomorDokumenBase, $existingDokumen?->id);

        $pengajuanFiles = $this->hasPengajuanFileTable()
            ? $pengajuan->pengajuanFiles()->get()
            : collect();

        // Hanya masuk Rekap Data jika sudah ada Dokumen Final (di-ACC).
        // Data lama di database tidak dihapus; guard ini hanya berlaku untuk record baru.
        $hasDokumenFinal = $pengajuanFiles->where('peran_berkas', 'dokumen_final')->isNotEmpty()
            || !empty(trim((string) ($pengajuan->final_file_name ?? '')));

        if (!$hasDokumenFinal) {
            return;
        }

        // Jenis dokumen yang tersimpan mengikuti jenis BERKAS FINAL yang dipilih admin (MoU / MoA / IA). Pengajuan
        // multi-jenis (MoU + MoA) wajib: semua berkas final harus sudah diberi jenisnya sebelum ACC.
        $jenisPengajuan = array_map('strtoupper', (array) $pengajuan->jenis_dokumen_list);
        $jenisUtamaDokumen = strtoupper((string) ($pengajuan->jenis_dokumen ?? 'MOU'));
        $jenisListDokumen = $pengajuan->jenis_dokumen_list ?: null;
        $berkasFinal = $pengajuanFiles->where('peran_berkas', 'dokumen_final');
        $jenisValid = ['MOU', 'MOA', 'IA'];

        if (count($jenisPengajuan) > 1) {
            $tanpaJenis = $berkasFinal->filter(fn ($f) => ! in_array(strtoupper((string) $f->jenis_dokumen), $jenisValid, true));
            if ($tanpaJenis->isNotEmpty()) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'acc_file_attachments' => 'Pilih jenis dokumen (MoU / MoA / IA) untuk setiap berkas final sebelum ACC: '
                        .$tanpaJenis->pluck('nama_file')->implode(', ').'.',
                ]);
            }
        }

        // Urutan: jenis pilihan pengajuan dulu, lalu MoU, MoA, IA — jenis pertama jadi jenis utama dokumen.
        $urutanJenis = array_values(array_unique(array_merge($jenisPengajuan, $jenisValid)));
        $jenisBerkasFinal = array_values(array_filter(
            $urutanJenis,
            fn ($j) => $berkasFinal->contains(fn ($f) => strtoupper((string) $f->jenis_dokumen) === $j)
        ));
        if ($jenisBerkasFinal !== []) {
            $jenisUtamaDokumen = $jenisBerkasFinal[0];
            $jenisListDokumen = count($jenisBerkasFinal) > 1 ? $jenisBerkasFinal : null;
        }

        $primaryPath = trim((string) ($pengajuanFiles->where('peran_berkas', 'dokumen_final')->first()?->path_file ?? ''));
        if ($primaryPath === '') {
            $primaryPath = trim((string) ($pengajuanFiles->first()?->path_file ?? ''));
        }
        if ($primaryPath === '') {
            $primaryPath = trim((string) ($pengajuan->file_name ?? ''));
        }
        if ($primaryPath === '') {
            $primaryPath = 'pending-file';
        }

        // Resolusi nama mitra: dari field teks pengajuan, atau fallback ke master_mitra.
        $snapNamaMitra = trim((string) ($pengajuan->nama_mitra ?? ''));
        $masterMitraRow = $pengajuan->mitra_id
            ? DB::table('master_mitra')->where('id', $pengajuan->mitra_id)->first()
            : null;
        if ($snapNamaMitra === '' && $masterMitraRow) {
            $snapNamaMitra = (string) ($masterMitraRow->nama_mitra ?? '');
        }

        // Jenis Mitra & Tingkat Perusahaan: utamakan data pengajuan (bisa beda per pengajuan),
        // fallback ke data master_mitra jika pengajuan tidak mengisinya.
        $snapJenisMitra = trim((string) ($pengajuan->jenis_mitra ?? ''));
        if ($snapJenisMitra === '' && $masterMitraRow) {
            $snapJenisMitra = (string) ($masterMitraRow->kategori_mitra ?? '');
        }
        $snapBidangUsaha = trim((string) ($pengajuan->bidang_usaha ?? ''));
        if ($snapBidangUsaha === '' && $masterMitraRow) {
            $snapBidangUsaha = (string) ($masterMitraRow->bidang_usaha ?? '');
        }
        $snapTingkatPerusahaan = trim((string) ($pengajuan->tingkat_perusahaan ?? ''));
        if ($snapTingkatPerusahaan === '' && $masterMitraRow) {
            $snapTingkatPerusahaan = (string) ($masterMitraRow->tingkat_perusahaan ?? '');
        }

        $dokumenPayload = [
            'no_permohonan' => $nomorPengajuan,
            'nomor_dokumen' => $nomorDokumen,
            'nama_dokumen' => trim((string) ($pengajuan->judul_pengajuan ?? 'Dokumen Kerjasama ' . $nomorPengajuan)),
            'jenis_dokumen' => $jenisUtamaDokumen,
            'jenis_dokumen_list' => $jenisListDokumen,
            'judul_dokumen' => trim((string) ($pengajuan->judul_pengajuan ?? '')),
            'manfaat' => trim((string) ($pengajuan->manfaat ?? '')) ?: null,
            'luaran_kerja_sama' => trim((string) ($pengajuan->luaran_kerja_sama ?? '')) ?: null,
            'ruang_lingkup_ids' => $pengajuan->ruang_lingkup_ids,
            'tanggal_mulai' => $pengajuan->tanggal_mulai,
            'tanggal_berakhir' => $pengajuan->tanggal_berakhir,
            'status_siklus' => 'active',
            'sumber_pengajuan_id' => $pengajuan->id,
            'unit_prodi_ids' => $pengajuan->unitProdiIdsUrut() ?: null,
            'mitra_id' => $pengajuan->mitra_id,
            // Snapshot data pengajuan — tetap tersimpan meski record pengajuan dihapus.
            'snap_nama_mitra' => $snapNamaMitra !== '' ? $snapNamaMitra : null,
            'snap_whatsapp_pengusul' => trim((string) ($pengajuan->whatsapp_pengusul ?? '')) ?: null,
            'snap_nama_pengusul' => trim((string) ($pengajuan->nama_pengusul ?? '')) ?: null,
            'snap_email_pengusul' => trim((string) ($pengajuan->email_pengusul ?? '')) ?: null,
            'snap_jenis_mitra' => $snapJenisMitra !== '' ? $snapJenisMitra : null,
            'snap_bidang_usaha' => $snapBidangUsaha !== '' ? $snapBidangUsaha : null,
            'snap_tingkat_perusahaan' => $snapTingkatPerusahaan !== '' ? $snapTingkatPerusahaan : null,
            'snap_pic_polibatam_nama' => trim((string) ($pengajuan->pic_polibatam_nama ?? '')) ?: null,
            'snap_pic_polibatam_jabatan' => trim((string) ($pengajuan->pic_polibatam_jabatan ?? '')) ?: null,
            'snap_pic_polibatam_email' => trim((string) ($pengajuan->pic_polibatam_email ?? '')) ?: null,
            'snap_pic_polibatam_whatsapp' => trim((string) ($pengajuan->pic_polibatam_whatsapp ?? '')) ?: null,
            'dibuat_oleh_user_id' => $request->user()?->id,
            'file' => $primaryPath,
            'keterangan' => trim((string) ($pengajuan->deskripsi_pengajuan ?? '')),
        ];

        // Pengajuan difinalkan (lagi) = dokumennya harus tampil di Rekap Data, termasuk bila dokumen
        // lamanya pernah dihapus ke Sampah.
        if ($existingDokumen) {
            $dokumenPayload['dihapus_admin_pada'] = null;
            $dokumenPayload['dihapus_user_pada'] = null;
        }

        if ($existingDokumen) {
            $existingDokumen->update($dokumenPayload);
            $dokumen = $existingDokumen->fresh();
        } else {
            $dokumen = DokumenKerjasama::create($dokumenPayload);
        }

        $dokumen->syncUnitProdi($pengajuan->unitProdiIdsUrut());

        if ($this->hasDokumenFileTable()) {
            DokumenFile::query()->where('dokumen_id', $dokumen->id)->delete();

            if ($pengajuanFiles->isNotEmpty()) {
                // Deduplicate by path_file to prevent inserting duplicate documents.
                $seen = [];
                $dokumenFilesPayload = $pengajuanFiles
                    ->filter(function ($file) use (&$seen) {
                        $key = (string) $file->path_file;
                        if (isset($seen[$key])) {
                            return false;
                        }
                        $seen[$key] = true;
                        return true;
                    })
                    ->map(fn ($file) => [
                        'dokumen_id' => $dokumen->id,
                        'peran_berkas' => $file->peran_berkas ?? 'lampiran',
                        'jenis_dokumen' => $file->jenis_dokumen,
                        'nama_file' => (string) $file->nama_file,
                        'path_file' => (string) $file->path_file,
                        'mime_type' => $file->mime_type,
                        'ukuran_file_bytes' => $file->ukuran_file_bytes,
                        'diunggah_oleh_user_id' => $file->diunggah_oleh_user_id ?? $request->user()?->id,
                        'diunggah_pada' => $file->diunggah_pada ?? now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ])->values()->all();

                DokumenFile::query()->insert($dokumenFilesPayload);
            }
        }

        try {
            $this->writeInitialDokumenLogFromPengajuan(
                $pengajuan,
                $dokumen,
                $request->user()?->id,
                $primaryPath !== 'pending-file' ? $primaryPath : null
            );
        } catch (\Throwable $exception) {
            report($exception);
        }

        // Pertahankan lampiran di pengajuan_file agar detail pengajuan internal/admin
        // tetap bisa mengakses dokumen setelah data dipindahkan ke dokumen_kerjasama.
    }

    private function normalizeAttachmentPath(array $row): string
    {
        $rawPath = trim((string) ($row['path'] ?? $row['path_file'] ?? ''));
        // Path dari klien tidak boleh keluar dari folder penyimpanan (path traversal / nol-byte).
        if ($rawPath !== '' && (str_contains($rawPath, chr(0)) || preg_match('#(^|[/\\\\])\.\.([/\\\\]|$)#', $rawPath))) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'file_attachments' => 'Path berkas tidak valid.',
            ]);
        }
        if ($rawPath !== '') {
            // If a relative storage path was passed directly, keep it.
            if (!str_starts_with($rawPath, 'http') && !str_starts_with($rawPath, 'data:')) {
                return $rawPath;
            }
            // Full URL passed as path_file — extract relative path from /storage/... segment.
            $parsed = parse_url($rawPath, PHP_URL_PATH);
            if ($parsed && preg_match('#^/storage/(.+)$#', $parsed, $m)) {
                return $m[1];
            }
            return $rawPath;
        }

        $rawUrl = trim((string) ($row['url'] ?? ''));
        if ($rawUrl !== '' && !str_starts_with($rawUrl, 'data:')) {
            // Extract relative path from absolute storage URL (e.g. http://host/storage/pengajuan/...)
            $parsed = parse_url($rawUrl, PHP_URL_PATH);
            if ($parsed && preg_match('#^/storage/(.+)$#', $parsed, $m)) {
                return $m[1];
            }
            return $rawUrl;
        }

        return trim((string) ($row['name'] ?? $row['nama_file'] ?? 'lampiran'));
    }

    private function sanitizeAttachmentBasename(string $name): string
    {
        $clean = trim($name);
        $clean = preg_replace('/[^A-Za-z0-9._-]+/', '-', $clean) ?? '';
        $clean = trim($clean, '-_.');

        if ($clean === '') {
            return 'lampiran';
        }

        return Str::limit($clean, 120, '');
    }

    private function guessAttachmentExtensionFromMime(?string $mime): string
    {
        if (! is_string($mime) || trim($mime) === '') {
            return 'bin';
        }

        $normalized = strtolower(trim($mime));

        return match ($normalized) {
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'bin',
        };
    }

    /**
     * Lampiran yang dikirim klien berupa PATH (bukan unggahan baru) hanya boleh merujuk berkas yang
     * memang sudah menjadi milik pengajuan ini. Tanpa ini, pengguna bisa menulis path berkas milik
     * pengajuan lain lalu membukanya lewat /berkas karena sekarang "tercatat" di pengajuannya sendiri.
     * Tautan http(s) biasa (bukan berkas di storage) dibiarkan.
     *
     * @param  array<int, string>  $pathMilikPengajuan  path_file yang sudah ada pada pengajuan ini
     */
    private function pastikanRujukanBerkasMilikPengajuan(string $path, array $pathMilikPengajuan): void
    {
        if (preg_match('#^https?://#i', $path) === 1) {
            return;
        }

        if (! in_array($path, $pathMilikPengajuan, true)) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'file_attachments' => 'Berkas yang dirujuk tidak termasuk pengajuan ini.',
            ]);
        }
    }

    /** @return array<int, string> */
    private function pathBerkasMilik(Pengajuan $pengajuan): array
    {
        return $pengajuan->pengajuanFiles()->pluck('path_file')->filter()->map(fn ($p) => (string) $p)->all();
    }

    private const EKSTENSI_LAMPIRAN_DIIZINKAN = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp'];

    private const UKURAN_LAMPIRAN_MAKS_BYTE = 10 * 1024 * 1024;

    private function persistDataUrlAttachment(array $attachment): ?string
    {
        $rawUrl = trim((string) ($attachment['url'] ?? ''));
        if (! str_starts_with($rawUrl, 'data:')) {
            return null;
        }

        if (! preg_match('/^data:([\w\/+.-]+);base64,(.+)$/', $rawUrl, $matches)) {
            return null;
        }

        $mimeType = strtolower($matches[1]);
        $base64 = preg_replace('/\s+/', '', $matches[2]) ?? '';
        $binary = base64_decode($base64, true);

        if ($binary === false || $binary === '') {
            return null;
        }

        $name = trim((string) ($attachment['name'] ?? $attachment['nama_file'] ?? 'lampiran'));
        $base = pathinfo($name, PATHINFO_FILENAME);
        $extFromName = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        $extension = $extFromName !== '' ? $extFromName : $this->guessAttachmentExtensionFromMime($mimeType);

        // Nama berkas dikirim klien, jadi ekstensinya tidak boleh dipercaya begitu saja: hanya tipe
        // dokumen/gambar biasa yang diterima (bukan .php/.html/.svg/.js yang bisa dieksekusi atau
        // dirender sebagai halaman), dan ukurannya dibatasi.
        if (! in_array($extension, self::EKSTENSI_LAMPIRAN_DIIZINKAN, true)) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'file_attachments' => "Jenis berkas \"{$extension}\" tidak diizinkan. Gunakan PDF, Word, Excel, PowerPoint, atau gambar (JPG/PNG/WEBP).",
            ]);
        }
        if (strlen($binary) > self::UKURAN_LAMPIRAN_MAKS_BYTE) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'file_attachments' => 'Ukuran berkas maksimal 10 MB.',
            ]);
        }
        $fileName = $this->sanitizeAttachmentBasename($base) . '-' . Str::random(10) . '.' . $extension;

        $relativePath = 'pengajuan/' . date('Y/m') . '/' . $fileName;
        Storage::disk('public')->put($relativePath, $binary);

        return $relativePath;
    }

    private static ?bool $pengajuanLogTableExists = null;

    private function hasPengajuanLogTable(): bool
    {
        if (self::$pengajuanLogTableExists !== null) {
            return self::$pengajuanLogTableExists;
        }

        self::$pengajuanLogTableExists = Schema::hasTable('pengajuan_log');

        return self::$pengajuanLogTableExists;
    }

    private function writeReviewLog(
        Pengajuan $pengajuan,
        string $statusLama,
        string $statusBaru,
        ?string $comment,
        ?int $userId
    ): void {
        if (! $this->hasPengajuanLogTable()) {
            return;
        }

        $labelMap = [
            'menunggu' => 'Menunggu Review',
            'diproses' => 'Diproses',
            'disetujui' => 'Disetujui',
            'ditolak' => 'Ditolak',
            'revisi' => 'Revisi',
            'disetujui_internal' => 'Disetujui Internal',
            'disetujui_mitra' => 'Disetujui Mitra',
            'final_approved' => 'Final Approved',
        ];

        $judul = 'Status diperbarui: '
            . ($labelMap[$statusLama] ?? $statusLama)
            . ' → '
            . ($labelMap[$statusBaru] ?? $statusBaru);

        $isiParts = [];
        if ($comment !== null && trim($comment) !== '') {
            $isiParts[] = 'Komentar: ' . trim($comment);
        }
        $isi = implode("\n", $isiParts) ?: null;

        $pengajuan->pengajuanLogs()->create([
            'tipe_log'           => 'status',
            'status_lama'        => $statusLama,
            'status_baru'        => $statusBaru,
            'judul_log'          => $judul,
            'isi_log'            => $isi,
            'payload_json'       => [
                'review_comment' => $comment,
                'updated_by'     => $userId,
            ],
            'dibuat_oleh_user_id' => $userId,
        ]);
    }

    private function syncPengajuanFiles(Pengajuan $pengajuan, Request $request): void
    {
        if (! $this->hasPengajuanFileTable()) {
            return;
        }

        if (! $request->has('file_attachments')) {
            return;
        }

        $attachments = $request->input('file_attachments');
        if (! is_array($attachments)) {
            return;
        }

        // Diambil SEBELUM lampiran lama dihapus/diganti di bawah.
        $pathMilik = $this->pathBerkasMilik($pengajuan);

        $payload = [];
        foreach ($attachments as $attachment) {
            if (! is_array($attachment)) {
                continue;
            }

            $name = trim((string) ($attachment['name'] ?? $attachment['nama_file'] ?? ''));
            if ($name === '') {
                continue;
            }

            // Lewati lampiran yang belum benar-benar berisi file (mis. FileReader di
            // browser belum selesai membaca file saat form disubmit) — daripada menyimpan
            // path palsu berupa nama file saja, yang nanti jadi link 404/403 saat dibuka.
            $hasUsableSource = trim((string) ($attachment['path'] ?? $attachment['path_file'] ?? '')) !== ''
                || trim((string) ($attachment['url'] ?? '')) !== '';
            if (! $hasUsableSource) {
                continue;
            }

            $path = $this->persistDataUrlAttachment($attachment);
            if ($path === null) {
                $path = $this->normalizeAttachmentPath($attachment);
                $this->pastikanRujukanBerkasMilikPengajuan($path, $pathMilik);
            }

            $payload[] = [
                'peran_berkas' => isset($attachment['peran_berkas']) && is_string($attachment['peran_berkas']) ? $attachment['peran_berkas'] : 'pengajuan_awal',
                'nama_file' => $name,
                'path_file' => $path,
                'mime_type' => isset($attachment['type']) && is_string($attachment['type']) ? $attachment['type'] : null,
                'ukuran_file_bytes' => isset($attachment['size']) && is_numeric($attachment['size']) ? (int) $attachment['size'] : null,
                'diunggah_oleh_user_id' => $request->user()?->id,
            ];
        }

        // Berkas revisi dari admin bukan lampiran pengusul — jangan ikut terhapus saat pengusul
        // mengirim ulang lampirannya.
        $pengajuan->pengajuanFiles()
            ->where(fn ($q) => $q->whereNull('peran_berkas')->orWhere('peran_berkas', '!=', 'dokumen_revisi'))
            ->delete();

        if (! empty($payload)) {
            $pengajuan->pengajuanFiles()->createMany($payload);
        }
    }

    /**
     * Berkas revisi yang dilampirkan admin saat meminta revisi (peran 'dokumen_revisi'), supaya
     * pengusul (internal/mitra) bisa mengunduhnya lalu mengunggah perbaikannya. Satu berkas;
     * unggahan baru menggantikan yang lama. Validasi format (.doc/.docx) ada di update().
     */
    private function syncRevisiFiles(Pengajuan $pengajuan, Request $request): void
    {
        if (! $this->hasPengajuanFileTable() || ! $request->has('revisi_file_attachments')) {
            return;
        }

        $attachment = collect($request->input('revisi_file_attachments'))->first(fn ($item) => is_array($item));
        if (! $attachment) {
            return;
        }

        $path = $this->persistDataUrlAttachment($attachment);
        if ($path === null) {
            $path = $this->normalizeAttachmentPath($attachment);
            $this->pastikanRujukanBerkasMilikPengajuan($path, $this->pathBerkasMilik($pengajuan));
        }

        $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_revisi')->delete();
        $pengajuan->pengajuanFiles()->create([
            'peran_berkas' => 'dokumen_revisi',
            'nama_file' => trim((string) $attachment['name']),
            'path_file' => $path,
            'mime_type' => isset($attachment['type']) && is_string($attachment['type']) ? $attachment['type'] : null,
            'ukuran_file_bytes' => isset($attachment['size']) && is_numeric($attachment['size']) ? (int) $attachment['size'] : null,
            'diunggah_oleh_user_id' => $request->user()?->id,
        ]);
    }

    private function syncAccFiles(Pengajuan $pengajuan, Request $request): void
    {
        if (! $this->hasPengajuanFileTable()) {
            return;
        }

        if (! $request->has('acc_file_attachments')) {
            return;
        }

        $attachments = $request->input('acc_file_attachments');
        if (! is_array($attachments)) {
            return;
        }

        // Diambil SEBELUM lampiran lama dihapus/diganti di bawah.
        $pathMilik = $this->pathBerkasMilik($pengajuan);

        $payload = [];
        foreach ($attachments as $attachment) {
            if (! is_array($attachment)) {
                continue;
            }

            $name = trim((string) ($attachment['name'] ?? $attachment['nama_file'] ?? ''));
            if ($name === '') {
                continue;
            }

            $hasUsableSource = trim((string) ($attachment['path'] ?? $attachment['path_file'] ?? '')) !== ''
                || trim((string) ($attachment['url'] ?? '')) !== '';
            if (! $hasUsableSource) {
                continue;
            }

            $path = $this->persistDataUrlAttachment($attachment);
            if ($path === null) {
                $path = $this->normalizeAttachmentPath($attachment);
                $this->pastikanRujukanBerkasMilikPengajuan($path, $pathMilik);
            }

            // Admin memilih jenis tiap berkas: MoU/MoA/IA = dokumen final; TOR/KAK/Proposal/Laporan Kegiatan/Lainnya
            // = dokumen pendukung (tidak dihitung sebagai dokumen kerja sama).
            $jenisBerkas = JenisDokumenSelection::untukBerkas($attachment['jenis_dokumen'] ?? null);
            $payload[] = [
                'peran_berkas' => JenisDokumenSelection::adalahPendukung($jenisBerkas) ? 'dokumen_pendukung' : 'dokumen_final',
                'jenis_dokumen' => $jenisBerkas,
                'nama_file' => $name,
                'path_file' => $path,
                'mime_type' => isset($attachment['type']) && is_string($attachment['type']) ? $attachment['type'] : null,
                'ukuran_file_bytes' => isset($attachment['size']) && is_numeric($attachment['size']) ? (int) $attachment['size'] : null,
                'diunggah_oleh_user_id' => $request->user()?->id,
            ];
        }

        if (! empty($payload)) {
            // Ganti berkas hasil ACC sebelumnya supaya pengiriman ulang tidak menumpuk: dokumen final, dan dokumen
            // pendukung yang diberi jenis lewat ACC. Dokumen pendukung dari pengusul (tanpa jenis) dibiarkan.
            $pengajuan->pengajuanFiles()
                ->where(fn ($q) => $q->where('peran_berkas', 'dokumen_final')
                    ->orWhere(fn ($q2) => $q2->where('peran_berkas', 'dokumen_pendukung')->whereNotNull('jenis_dokumen')))
                ->delete();
            $pengajuan->pengajuanFiles()->createMany($payload);
        }
    }

    private function shouldLoadPengajuanRelations(): bool
    {
        return $this->hasPengajuanColumn('unit_prodi_ids') && $this->hasPengajuanColumn('mitra_id');
    }

    private function ensureAdmin(Request $request): ?Response
    {
        $user = $request->user();
        $rawRole = (string) ($user?->role ?? '');
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim($rawRole)));

        if (!in_array($normalizedRole, ['admin', 'admin-humas'], true)) {
            return response([
                'success' => false,
                'message' => 'Only admin can modify pengajuan',
            ], 403);
        }

        return null;
    }

    private function normalizeRuangLingkupIds(Request $request, bool $required = false): array
    {
        $rules = $required
            ? ['required', 'array']
            : ['sometimes', 'array'];

        $request->validate([
            'ruang_lingkup_ids' => $rules,
            'ruang_lingkup_ids.*' => ['integer', 'exists:master_ruang_lingkup,id'],
        ]);

        $values = $request->input('ruang_lingkup_ids');
        if ($values === null) {
            return [];
        }

        return array_values(array_unique(array_map('intval', $values)));
    }

    private function normalizeLegacyStatus(string $status): string
    {
        return strtolower(trim($status));
    }

    private function normalizeLegacyKategori(?string $kategori): ?string
    {
        if ($kategori === null || trim($kategori) === '') {
            return null;
        }

        return strtolower(trim($kategori)) === 'eksternal' ? 'Eksternal' : 'Internal';
    }

    private function validateLegacyStore(Request $request): array
    {
        $validated = $request->validate([
            'judul' => ['required', 'string', 'max:255'],
            'deskripsi' => ['nullable', 'string', 'max:100'],
            'pengusul' => ['required', 'string', 'max:200'],
            'tanggal' => ['nullable', 'date'],
            'mitra' => ['required', 'string', 'max:255'],
            'jenis_dokumen' => ['required', 'in:MOU,MOA,IA,LAINNYA'],
            'jurusan' => ['nullable', 'string', 'max:150'],
            'kategori' => ['nullable', 'string', 'in:Internal,Eksternal'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_berakhir' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'email_pengusul' => ['nullable', 'email', 'max:255'],
            'whatsapp_pengusul' => ['nullable', 'string', 'max:50'],
            'ruang_lingkup' => ['nullable', 'array'],
            'status' => ['nullable', 'in:menunggu,diproses,disetujui,ditolak'],
            'is_from_admin' => ['nullable', 'boolean'],
            'source_role' => ['nullable', 'string', 'max:50'],
            'created_by_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'review_comment' => ['nullable', 'string'],
            'reviewed_at' => ['nullable', 'date'],
            'reviewed_by' => ['nullable', 'string', 'max:200'],
            'file_name' => ['nullable', 'string', 'max:500'],
            'file_attachments' => ['nullable', 'array'],
            'alamat_mitra' => ['nullable', 'string'],
            'negara' => ['nullable', 'string', 'max:100'],
            'email_terverifikasi' => ['nullable', 'boolean'],
        ]);

        $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);
        $validated['tanggal'] = $validated['tanggal'] ?? now()->toDateString();
        $validated['status'] = $this->normalizeLegacyStatus((string) ($validated['status'] ?? 'menunggu'));
        $validated['kategori'] = $this->normalizeLegacyKategori($validated['kategori'] ?? null);
        $validated['email_terverifikasi'] = (bool) ($validated['email_terverifikasi'] ?? false);

        return $validated;
    }

    private function validateLegacyUpdate(Request $request): array
    {
        $validated = $request->validate([
            'judul' => ['sometimes', 'required', 'string', 'max:255'],
            'deskripsi' => ['nullable', 'string', 'max:100'],
            'pengusul' => ['sometimes', 'required', 'string', 'max:200'],
            'tanggal' => ['nullable', 'date'],
            'mitra' => ['sometimes', 'required', 'string', 'max:255'],
            'jenis_dokumen' => ['sometimes', 'required', 'in:MOU,MOA,IA,LAINNYA'],
            'jurusan' => ['nullable', 'string', 'max:150'],
            'kategori' => ['nullable', 'string', 'in:Internal,Eksternal'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_berakhir' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'email_pengusul' => ['nullable', 'email', 'max:255'],
            'whatsapp_pengusul' => ['nullable', 'string', 'max:50'],
            'ruang_lingkup' => ['nullable', 'array'],
            'status' => ['nullable', 'in:menunggu,diproses,disetujui,ditolak'],
            'is_from_admin' => ['nullable', 'boolean'],
            'source_role' => ['nullable', 'string', 'max:50'],
            'created_by_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'review_comment' => ['nullable', 'string'],
            'reviewed_at' => ['nullable', 'date'],
            'reviewed_by' => ['nullable', 'string', 'max:200'],
            'file_name' => ['nullable', 'string', 'max:500'],
            'file_attachments' => ['nullable', 'array'],
            'alamat_mitra' => ['nullable', 'string'],
            'negara' => ['nullable', 'string', 'max:100'],
            'email_terverifikasi' => ['nullable', 'boolean'],
        ]);

        if (array_key_exists('jenis_dokumen', $validated)) {
            $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);
        }

        if (array_key_exists('status', $validated)) {
            $validated['status'] = $this->normalizeLegacyStatus((string) $validated['status']);
        }

        if (array_key_exists('kategori', $validated)) {
            $validated['kategori'] = $this->normalizeLegacyKategori($validated['kategori']);
        }

        if (array_key_exists('email_terverifikasi', $validated)) {
            $validated['email_terverifikasi'] = (bool) $validated['email_terverifikasi'];
        }

        return $validated;
    }

    private function legacyPayloadFromRequest(Request $request): array
    {
        $currentUser = $request->user();
        $defaultSourceRole = $currentUser?->role ? (string) $currentUser->role : 'internal';

        $legacyPayload = [
            'status' => $request->input('status_pengajuan', $request->input('status', 'menunggu')),
            'review_comment' => $request->input('review_comment', null),
            'reviewed_at' => $request->input('reviewed_at', null),
            'reviewed_by' => $request->input('reviewed_by', null),
            'is_from_admin' => $request->input('is_from_admin', false),
            'source_role' => $request->input('source_role', $defaultSourceRole),
            'created_by_user_id' => $request->input('created_by_user_id', $currentUser?->id),
            'email_terverifikasi' => $request->filled('email_terverifikasi_pada')
                ? true
                : $request->input('email_terverifikasi', false),
        ];

        $conditionalFields = [
            'judul' => 'judul_pengajuan',
            'deskripsi' => 'deskripsi_pengajuan',
            'pengusul' => 'nama_pengusul',
            'tanggal' => 'diajukan_pada',
            'mitra' => 'mitra',
            'jenis_dokumen' => 'jenis_dokumen',
            'jurusan' => 'jurusan',
            'kategori' => 'kategori',
            'tanggal_mulai' => 'tanggal_mulai',
            'tanggal_berakhir' => 'tanggal_berakhir',
            'email_pengusul' => 'email_pengusul',
            'whatsapp_pengusul' => 'whatsapp_pengusul',
            'ruang_lingkup' => 'ruang_lingkup',
            'file_name' => 'file_name',
            'file_attachments' => 'file_attachments',
            'alamat_mitra' => 'alamat_mitra',
            'negara' => 'negara',
        ];

        foreach ($conditionalFields as $legacyKey => $requestKey) {
            if ($request->has($requestKey)) {
                $legacyPayload[$legacyKey] = $request->input($requestKey);
            }
        }

        if (array_key_exists('tanggal', $legacyPayload)) {
            if (is_string($legacyPayload['tanggal']) && trim($legacyPayload['tanggal']) !== '') {
                $legacyPayload['tanggal'] = trim($legacyPayload['tanggal']);
            } else {
                $legacyPayload['tanggal'] = null;
            }
        }

        return $legacyPayload;
    }

    public function index(Request $request): Response
    {
        $query = Pengajuan::query();

        $user = $request->user();
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));

        // "Hapus" oleh admin cuma menyembunyikan dari daftar kelola admin & dari pengguna lain —
        // BUKAN hard delete — supaya akun internal/eksternal/kampus-LDAP yang mengajukannya sendiri
        // tetap punya riwayat pengajuan pribadinya (lihat migrasi dihapus_admin_pada). Jadi baris
        // yang sudah "dihapus" tetap disembunyikan dari semua orang KECUALI dari pemilik aslinya —
        // dan admin sendiri TIDAK termasuk pengecualian ini (kalau tidak, pengajuan yang dibuat
        // oleh admin sendiri lalu dihapus admin akan tetap nampak balik ke admin yang sama).
        if ($this->hasPengajuanColumn('dihapus_admin_pada')) {
            // Pimpinan ikut diperlakukan seperti admin di sini — dashboard Pimpinan harus
            // menampilkan data yang sama persis dengan Admin (lihat show(), yang sudah lebih
            // dulu memberi pimpinan akses penuh untuk otorisasi kepemilikan).
            $isAdmin = in_array($normalizedRole, ['admin', 'admin-humas', 'pimpinan'], true);
            $query->where(function ($builder) use ($user, $isAdmin) {
                $builder->whereNull('dihapus_admin_pada');
                if ($user && !$isAdmin) {
                    $builder->orWhere('user_pengusul_id', $user->id);
                }
            });

            // Pemilik (internal/eksternal/kampus-LDAP) juga bisa hapus pengajuannya sendiri —
            // sifatnya kebalikan dari dihapus_admin_pada: cuma sembunyi dari akun pemiliknya
            // sendiri, admin tetap melihatnya (untuk keperluan audit/rekap institusi).
            if ($this->hasPengajuanColumn('dihapus_user_pada') && !$isAdmin) {
                $query->whereNull('dihapus_user_pada');
            }
        }

        // Internal, unit, & external cuma boleh lihat pengajuan milik sendiri (atau yang
        // di-CC admin lewat distribusi_user_ids). Admin/admin-humas tetap lihat semua.
        // Catatan: role user eksternal tersimpan sebagai 'external' (Inggris) di kolom
        // users.role, beda dari 'eksternal' (Indonesia) yang dipakai untuk kategori_pengajuan.
        //
        // Untuk role internal ATAU unit yang terdeteksi sebagai Ketua Jurusan/Ketua
        // Prodi/Kepala Unit (lihat StructuralAccessService — deteksi jabatan struktural
        // berdasarkan NIK, tidak mengubah role) scope-nya diperluas ke seluruh pengajuan
        // dalam jurusan/prodi/unit yang dia pimpin, di luar pengajuan milik sendiri.
        if (in_array($normalizedRole, ['internal', 'external', 'unit', 'jurusan', 'prodi'], true)) {
            $ownerColumn = $this->hasPengajuanColumn('user_pengusul_id')
                ? 'user_pengusul_id'
                : ($this->hasPengajuanColumn('dibuat_oleh_user_id') ? 'dibuat_oleh_user_id' : null);
            $hasDistribusiColumn = $this->hasPengajuanColumn('distribusi_user_ids');

            $scopedUnitProdiIds = null;
            if (in_array($normalizedRole, ['internal', 'unit', 'jurusan', 'prodi'], true) && $user && $this->hasPengajuanColumn('unit_prodi_ids')) {
                $access = app(StructuralAccessService::class)->getUserStructuralAccess($user);
                $scopedUnitProdiIds = app(StructuralAccessService::class)->resolveScopedUnitProdiIds($access);
            }

            if ($ownerColumn) {
                $query->where(function ($builder) use ($ownerColumn, $hasDistribusiColumn, $user, $scopedUnitProdiIds) {
                    $builder->where($ownerColumn, $user->id);

                    if ($hasDistribusiColumn) {
                        $builder->orWhereJsonContains('distribusi_user_ids', $user->id);
                    }

                    if ($scopedUnitProdiIds) {
                        $builder->orWhere(fn ($q) => $q->dalamUnitProdi($scopedUnitProdiIds));
                    }
                });
            }
        }

        if ($this->shouldLoadPengajuanRelations()) {
            $query->with([
                'unitProdi:id,nama,jenis_node,kategori_unit,parent_id',
                'unitProdiItems:id,nama,jenis_node,kategori_unit,parent_id',
                'mitra:id,nama_mitra,kategori_mitra,tingkat_perusahaan,negara,alamat,email_mitra,whatsapp_mitra,no_telepon_mitra,nama_kontak_utama,jabatan_kontak_utama,email_kontak_utama,telepon_kontak_utama',
                'userPengusul:id,name,username',
                'dokumenFiles',
                'dokumenKerjasama:id,sumber_pengajuan_id,no_permohonan,nomor_dokumen,file',
                'dokumenKerjasama.dokumenFiles' => function ($q) {
                    $q->select(['id', 'dokumen_id', 'nama_file', 'path_file', 'peran_berkas', 'jenis_dokumen', 'mime_type', 'ukuran_file_bytes'])
                      ->whereIn('peran_berkas', ['dokumen_final', 'dokumen_perpanjangan']);
                },
            ]);
        }

        if ($request->filled('status_pengajuan')) {
            $statusColumn = $this->hasPengajuanColumn('status_pengajuan') ? 'status_pengajuan' : 'status';
            $query->where($statusColumn, $request->string('status_pengajuan')->toString());
        }

        if ($request->filled('jenis_dokumen')) {
            $query->where('jenis_dokumen', strtoupper($request->string('jenis_dokumen')->toString()));
        }

        if ($request->filled('search')) {
            $keyword = strtolower($request->string('search')->trim()->toString());
            $nomorColumn = $this->hasPengajuanColumn('nomor_pengajuan') ? 'nomor_pengajuan' : null;
            $namaColumn = $this->hasPengajuanColumn('nama_pengusul') ? 'nama_pengusul' : 'pengusul';
            $judulColumn = $this->hasPengajuanColumn('judul_pengajuan') ? 'judul_pengajuan' : 'judul';

            $query->where(function ($builder) use ($keyword, $nomorColumn, $namaColumn, $judulColumn) {
                if ($nomorColumn) {
                    $builder->whereRaw("LOWER({$nomorColumn}) LIKE ?", ['%' . $keyword . '%']);
                }

                $builder
                    ->orWhereRaw("LOWER({$namaColumn}) LIKE ?", ['%' . $keyword . '%'])
                    ->orWhereRaw("LOWER({$judulColumn}) LIKE ?", ['%' . $keyword . '%']);
            });
        }

        $orderColumn = $this->hasPengajuanColumn('diajukan_pada')
            ? 'diajukan_pada'
            : ($this->hasPengajuanColumn('tanggal') ? 'tanggal' : 'created_at');

        $data = $query->orderByDesc($orderColumn)->paginate((int) $request->integer('per_page', 20));

        return response([
            'success' => true,
            'data' => $data,
            'message' => 'Pengajuan retrieved successfully',
        ]);
    }

    public function show(Request $request, Pengajuan $pengajuan): Response
    {
        $user = $request->user();
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));
        $isAdmin = in_array($normalizedRole, ['admin', 'admin-humas'], true);
        $isOwner = $user && (int) $pengajuan->user_pengusul_id === (int) $user->id;

        // Cerminan persis dari filter visibilitas di index(): pengajuan yang sudah "dihapus"
        // admin tetap bisa diakses lewat detail HANYA oleh pemiliknya sendiri (bukan admin lain);
        // yang "dihapus" pemiliknya sendiri cuma bisa diakses lewat admin — selain itu 404.
        if ($pengajuan->dihapus_admin_pada || $pengajuan->dihapus_user_pada) {
            $visible = $isAdmin
                ? !$pengajuan->dihapus_admin_pada
                : (!$pengajuan->dihapus_admin_pada || $isOwner) && !$pengajuan->dihapus_user_pada;

            if (!$visible) {
                return response([
                    'success' => false,
                    'message' => 'Pengajuan tidak ditemukan.',
                ], 404);
            }
        }

        // Kepemilikan/otorisasi untuk detail — cerminan dari index(): admin/admin-humas &
        // pimpinan tetap akses penuh (tidak diubah). internal/external/unit cuma boleh
        // buka pengajuan miliknya sendiri, yang di-CC lewat distribusi_user_ids, ATAU
        // (khusus internal/unit yang terdeteksi Ketua Jurusan/Ketua Prodi/Kepala Unit)
        // pengajuan dalam cakupan jurusan/prodi/unit yang dia pimpin. Sebelumnya endpoint
        // ini TIDAK punya pengecekan ini sama sekali — siapa pun yang login bisa buka
        // pengajuan siapa saja asal tahu ID-nya; ini menutup celah itu sekaligus
        // menerapkan aturan struktural.
        if (!$isAdmin && $normalizedRole !== 'pimpinan') {
            $isDistribusi = $user
                && is_array($pengajuan->distribusi_user_ids)
                && in_array($user->id, $pengajuan->distribusi_user_ids, false);

            $isInStructuralScope = false;
            if (!$isOwner && !$isDistribusi && in_array($normalizedRole, ['internal', 'unit', 'jurusan', 'prodi'], true) && $user) {
                $access = app(StructuralAccessService::class)->getUserStructuralAccess($user);
                $scopedUnitProdiIds = app(StructuralAccessService::class)->resolveScopedUnitProdiIds($access);
                $isInStructuralScope = $scopedUnitProdiIds
                    && $pengajuan->termasukUnitProdi($scopedUnitProdiIds);
            }

            if (!$isOwner && !$isDistribusi && !$isInStructuralScope) {
                return response([
                    'success' => false,
                    'message' => 'Pengajuan tidak ditemukan.',
                ], 404);
            }
        }

        if ($this->shouldLoadPengajuanRelations()) {
            $pengajuan->load([
                'unitProdi:id,nama,jenis_node,kategori_unit,parent_id',
                'unitProdiItems:id,nama,jenis_node,kategori_unit,parent_id',
                'mitra:id,nama_mitra,kategori_mitra,tingkat_perusahaan,negara,alamat,email_mitra,whatsapp_mitra,no_telepon_mitra,nama_kontak_utama,jabatan_kontak_utama,email_kontak_utama,telepon_kontak_utama',
                'userPengusul:id,name,username',
                'dokumenFiles',
                'dokumenKerjasama:id,sumber_pengajuan_id,no_permohonan,nomor_dokumen,file',
                'dokumenKerjasama.dokumenFiles' => function ($q) {
                    $q->select(['id', 'dokumen_id', 'nama_file', 'path_file', 'peran_berkas', 'jenis_dokumen', 'mime_type', 'ukuran_file_bytes'])
                      ->whereIn('peran_berkas', ['dokumen_final', 'dokumen_perpanjangan']);
                },
            ]);
        }

        return response([
            'success' => true,
            'data' => $pengajuan,
            'message' => 'Pengajuan retrieved successfully',
        ]);
    }

    public function store(Request $request): Response
    {
        if (! $this->useNewPengajuanSchema()) {
            $legacyRequest = new Request($this->legacyPayloadFromRequest($request));
            $legacyRequest->setUserResolver(fn () => $request->user());
            $validated = $this->validateLegacyStore($legacyRequest);

            try {
                $pengajuan = Pengajuan::create($validated);
            } catch (QueryException $exception) {
                return response([
                    'success' => false,
                    'message' => 'Gagal menyimpan pengajuan.',
                    'error' => $exception->getMessage(),
                ], 422);
            }

            return response([
                'success' => true,
                'data' => $pengajuan,
                'message' => 'Pengajuan created successfully',
            ], 201);
        }

        $ruangLingkupIds = $this->normalizeRuangLingkupIds($request);

        $validated = $request->validate([
            'nomor_pengajuan' => ['nullable', 'string', 'max:50', 'unique:pengajuan_v2,nomor_pengajuan'],
            'user_pengusul_id' => ['nullable', 'integer', 'exists:users,id'],
            'nama_pengusul' => ['required', 'string', 'max:200'],
            'jabatan_pengusul' => ['nullable', 'string', 'max:150'],
            'email_pengusul' => ['nullable', 'email', 'max:255'],
            'whatsapp_pengusul' => ['nullable', 'string', 'max:50'],
            'pic_polibatam_nama' => ['nullable', 'string', 'max:200'],
            'pic_polibatam_jabatan' => ['nullable', 'string', 'max:150'],
            'pic_polibatam_email' => ['nullable', 'email', 'max:255'],
            'pic_polibatam_whatsapp' => ['nullable', 'string', 'max:50'],
            'unit_prodi_id' => ['nullable', 'integer', 'exists:master_unit_prodi,id'],
            ...UnitProdiSelection::rules(),
            'mitra_id' => ['nullable', 'integer', 'exists:master_mitra,id'],
            'nama_mitra' => ['nullable', 'string', 'max:255'],
            'jenis_mitra' => ['nullable', 'string', 'max:150'],
            'bidang_usaha' => ['nullable', 'string', 'max:150'],
            'tingkat_perusahaan' => ['nullable', 'string', 'max:50'],
            'whatsapp_mitra' => ['nullable', 'string', 'max:50'],
            'no_telepon_mitra' => ['nullable', 'string', 'max:50'],
    
            'mitra_alamat' => ['nullable', 'string'],
            'mitra_nama_kontak_utama' => ['nullable', 'string', 'max:200'],
            'mitra_jabatan_kontak_utama' => ['nullable', 'string', 'max:120'],
            'mitra_email_kontak_utama' => ['nullable', 'email', 'max:255'],
            'mitra_telepon_kontak_utama' => ['nullable', 'string', 'max:50'],
            'judul_pengajuan' => ['required', 'string', 'max:255'],
            'deskripsi_pengajuan' => ['nullable', 'string', 'max:100'],
            'manfaat' => ['nullable', 'string'],
            'luaran_kerja_sama' => ['nullable', 'string'],
            'jenis_dokumen' => ['required', 'in:MOU,MOA,IA,LAINNYA'],
            ...JenisDokumenSelection::rules(),
            'kategori_pengajuan' => ['nullable', 'in:internal,eksternal'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_berakhir' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'status_pengajuan' => ['nullable', 'in:menunggu,diproses,disetujui,ditolak'],
            'diajukan_pada' => ['nullable', 'date'],
            'email_terverifikasi_pada' => ['nullable', 'date'],
        ]);

        $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);
        JenisDokumenSelection::apply($validated);
        $validated['ruang_lingkup_ids'] = $ruangLingkupIds;
        $unitProdiIds = UnitProdiSelection::extract($validated);

        // Catat siapa yang membuat pengajuan ini dari sesi login, bukan dari input klien
        // (supaya nanti bisa dibedakan pengajuan yang dibuat admin vs internal vs eksternal).
        if (empty($validated['user_pengusul_id']) && $request->user()) {
            $validated['user_pengusul_id'] = $request->user()->id;
        }

        // Auto-generate nomor PMH jika tidak dikirim dari frontend
        if (empty($validated['nomor_pengajuan'])) {
            $validated['nomor_pengajuan'] = $this->generateNomorPMH();
        }

        if ($this->hasPengajuanColumn('file_name') && $request->has('file_name')) {
            $validated['file_name'] = (string) $request->input('file_name', '');
        }

        if ($this->hasPengajuanColumn('file_attachments') && $request->has('file_attachments')) {
            $validated['file_attachments'] = $request->input('file_attachments');
        }

        $validated['mitra_id'] = $this->syncMasterMitraFromPengajuanInput($validated);
        unset(
            $validated['mitra_alamat'],
            $validated['mitra_nama_kontak_utama'],
            $validated['mitra_jabatan_kontak_utama'],
            $validated['mitra_email_kontak_utama'],
            $validated['mitra_telepon_kontak_utama'],
        );

        try {
            $pengajuan = Pengajuan::create($validated);

            if ($unitProdiIds !== null) {
                $pengajuan->syncUnitProdi($unitProdiIds);
            }

            // Set tahapan awal "Pengajuan Awal" secara otomatis
            if ($this->hasPengajuanColumn('tahapan_stage')) {
                $pengajuan->update([
                    'tahapan_stage'   => 'Pengajuan Awal',
                    'tahapan_group'   => 'todo',
                    'tahapan_riwayat' => [[
                        'stage'      => 'Pengajuan Awal',
                        'group'      => 'todo',
                        'changed_at' => now()->toISOString(),
                        'changed_by' => 'Sistem (pengajuan baru)',
                    ]],
                ]);
            }

            try {
                $this->syncPengajuanFiles($pengajuan, $request);
            } catch (\Throwable $ignored) {
                // Do not fail main pengajuan creation when optional attachment sync is incompatible.
            }
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal menyimpan pengajuan.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        if ($this->shouldLoadPengajuanRelations()) {
            $pengajuan->load([
                'unitProdi:id,nama,jenis_node,kategori_unit,parent_id',
                'unitProdiItems:id,nama,jenis_node,kategori_unit,parent_id',
                'mitra:id,nama_mitra,kategori_mitra,tingkat_perusahaan,negara,alamat,email_mitra,whatsapp_mitra,no_telepon_mitra,nama_kontak_utama,jabatan_kontak_utama,email_kontak_utama,telepon_kontak_utama',
                'dokumenFiles',
            ]);
        }

        return response([
            'success' => true,
            'data' => $pengajuan,
            'message' => 'Pengajuan created successfully',
        ], 201);
    }

    public function updateTahapan(Request $request, Pengajuan $pengajuan): Response
    {
        if (! $this->hasPengajuanColumn('tahapan_stage')) {
            return response([
                'success' => false,
                'message' => 'Fitur tahapan belum tersedia di server ini.',
            ], 422);
        }

        $validated = $request->validate([
            'stage' => ['required', 'string', 'max:100'],
            'group' => ['required', 'string', 'in:todo,in_progress,complete'],
        ]);

        $currentRiwayat = is_array($pengajuan->tahapan_riwayat) ? $pengajuan->tahapan_riwayat : [];
        $currentRiwayat[] = [
            'stage'      => $validated['stage'],
            'group'      => $validated['group'],
            'changed_at' => now()->toISOString(),
            'changed_by' => $request->user()?->name ?? 'Admin',
        ];

        $pengajuan->update([
            'tahapan_stage'   => $validated['stage'],
            'tahapan_group'   => $validated['group'],
            'tahapan_riwayat' => $currentRiwayat,
        ]);

        return response([
            'success' => true,
            'data'    => [
                'id'               => $pengajuan->id,
                'tahapan_stage'    => $pengajuan->tahapan_stage,
                'tahapan_group'    => $pengajuan->tahapan_group,
                'tahapan_riwayat'  => $pengajuan->tahapan_riwayat,
            ],
            'message' => 'Tahapan berhasil diperbarui',
        ]);
    }

    private function parseLockToken(Request $request): ?int
    {
        $raw = $request->input('updated_at');
        if (! is_string($raw) || trim($raw) === '') {
            return null;
        }

        try {
            return \Carbon\Carbon::parse($raw)->getTimestamp();
        } catch (\Throwable) {
            return null;
        }
    }

    private function isPengajuanStale(?Pengajuan $current, int $tokenTimestamp): bool
    {
        if (! $current || ! $current->updated_at) {
            return false;
        }

        return $current->updated_at->getTimestamp() !== $tokenTimestamp;
    }

    private function konflikResponse(): Response
    {
        return response([
            'success' => false,
            'conflict' => true,
            'message' => 'Pengajuan ini sudah diubah oleh pengguna lain sejak Anda membukanya. Muat ulang data lalu ulangi perubahan Anda.',
        ], 409);
    }

    public function update(Request $request, Pengajuan $pengajuan): Response
    {
        // Admin boleh ubah apa saja. Pemilik pengajuan (internal/eksternal) boleh memperbaiki
        // isi pengajuannya sendiri, tapi hanya selama masih Menunggu Review atau diminta Revisi —
        // begitu admin mulai memproses / menyetujui, pengajuan terkunci untuk pengusul.
        $isAdmin = $this->ensureAdmin($request) === null;
        if (! $isAdmin) {
            $user = $request->user();
            $isOwner = $user && (int) $pengajuan->user_pengusul_id === (int) $user->id;
            if (! $isOwner || ! $this->useNewPengajuanSchema()) {
                return response([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses untuk mengubah pengajuan ini.',
                ], 403);
            }

            $statusSekarang = strtolower(trim((string) ($pengajuan->status_pengajuan ?? 'menunggu')));
            if (! in_array($statusSekarang, self::STATUS_BOLEH_DIUBAH_PENGUSUL, true)) {
                return response([
                    'success' => false,
                    'message' => 'Pengajuan sedang diproses admin sehingga tidak bisa diubah lagi.',
                ], 422);
            }
        }

        if (! $this->useNewPengajuanSchema()) {
            $legacyRequest = new Request($this->legacyPayloadFromRequest($request));
            $legacyRequest->setUserResolver(fn () => $request->user());
            $validated = $this->validateLegacyUpdate($legacyRequest);

            try {
                $pengajuan->update($validated);
            } catch (QueryException $exception) {
                return response([
                    'success' => false,
                    'message' => 'Gagal mengubah pengajuan.',
                    'error' => $exception->getMessage(),
                ], 422);
            }

            return response([
                'success' => true,
                'data' => $pengajuan,
                'message' => 'Pengajuan updated successfully',
            ]);
        }

        $ruangLingkupIds = $this->normalizeRuangLingkupIds($request);

        $validated = $request->validate([
            'nomor_pengajuan' => ['sometimes', 'required', 'string', 'max:50', 'unique:pengajuan_v2,nomor_pengajuan,' . $pengajuan->id],
            'user_pengusul_id' => ['nullable', 'integer', 'exists:users,id'],
            'nama_pengusul' => ['sometimes', 'required', 'string', 'max:200'],
            'jabatan_pengusul' => ['nullable', 'string', 'max:150'],
            'email_pengusul' => ['nullable', 'email', 'max:255'],
            'whatsapp_pengusul' => ['nullable', 'string', 'max:50'],
            'pic_polibatam_nama' => ['nullable', 'string', 'max:200'],
            'pic_polibatam_jabatan' => ['nullable', 'string', 'max:150'],
            'pic_polibatam_email' => ['nullable', 'email', 'max:255'],
            'pic_polibatam_whatsapp' => ['nullable', 'string', 'max:50'],
            'unit_prodi_id' => ['nullable', 'integer', 'exists:master_unit_prodi,id'],
            ...UnitProdiSelection::rules(),
            'mitra_id' => ['nullable', 'integer', 'exists:master_mitra,id'],
            'nama_mitra' => ['nullable', 'string', 'max:255'],
            'jenis_mitra' => ['nullable', 'string', 'max:150'],
            'bidang_usaha' => ['nullable', 'string', 'max:150'],
            'tingkat_perusahaan' => ['nullable', 'string', 'max:50'],
            'whatsapp_mitra' => ['nullable', 'string', 'max:50'],
            'no_telepon_mitra' => ['nullable', 'string', 'max:50'],
            // Field transien (bukan kolom pengajuan_v2) — cuma dipakai untuk sinkron ke
            // master_mitra di bawah, supaya internal/eksternal (yang tidak boleh akses
            // endpoint /master/mitra langsung) tetap bisa melengkapi data mitra lewat
            // pengajuan mereka sendiri.
            'mitra_alamat' => ['nullable', 'string'],
            'mitra_nama_kontak_utama' => ['nullable', 'string', 'max:200'],
            'mitra_jabatan_kontak_utama' => ['nullable', 'string', 'max:120'],
            'mitra_email_kontak_utama' => ['nullable', 'email', 'max:255'],
            'mitra_telepon_kontak_utama' => ['nullable', 'string', 'max:50'],
            'judul_pengajuan' => ['sometimes', 'required', 'string', 'max:255'],
            'deskripsi_pengajuan' => ['nullable', 'string', 'max:100'],
            'manfaat' => ['nullable', 'string'],
            'luaran_kerja_sama' => ['nullable', 'string'],
            'jenis_dokumen' => ['sometimes', 'required', 'in:MOU,MOA,IA,LAINNYA'],
            ...JenisDokumenSelection::rules(),
            'kategori_pengajuan' => ['nullable', 'in:internal,eksternal'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_berakhir' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'status_pengajuan' => ['nullable', 'in:menunggu,diproses,disetujui,ditolak,revisi,disetujui_internal,disetujui_mitra,final_approved'],
            'catatan' => ['nullable', 'string'],
            'catatan_revisi' => ['nullable', 'string'],
            'keputusan' => ['nullable', 'string'],
            'final_file_name' => ['nullable', 'string', 'max:500'],
            'final_file_path' => ['nullable', 'string', 'max:1000'],
            'acc_actor' => ['nullable', 'in:internal,mitra'],
            'diajukan_pada' => ['nullable', 'date'],
            'email_terverifikasi_pada' => ['nullable', 'date'],
            'distribusi_user_ids' => ['nullable', 'array'],
            'distribusi_user_ids.*' => ['integer', 'exists:users,id'],
            // Berkas revisi dari admin (mis. draf yang sudah dicoret-coret): hanya Word, satu file.
            'revisi_file_attachments' => ['nullable', 'array', 'max:1'],
            'revisi_file_attachments.*.name' => ['required', 'string', 'max:255', 'regex:/\.docx?$/i'],
            'revisi_file_attachments.*.url' => ['required', 'string'],
            'revisi_file_attachments.*.size' => ['nullable', 'integer', 'max:10485760'],
        ], [
            'revisi_file_attachments.*.name.regex' => 'File revisi harus berformat Word (.doc atau .docx).',
            'revisi_file_attachments.*.size.max' => 'File revisi maksimal 10 MB.',
        ]);
        unset($validated['revisi_file_attachments']);

        // Berkas final (ACC) yang diunggah sebagai file wajib PDF; tautan (bukan data URL) tidak dicek.
        foreach ((array) $request->input('acc_file_attachments', []) as $index => $accFile) {
            if (is_array($accFile)
                && str_starts_with(trim((string) ($accFile['url'] ?? '')), 'data:')
                && ! preg_match('/\.pdf$/i', trim((string) ($accFile['name'] ?? '')))) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "acc_file_attachments.{$index}.name" => 'Berkas final harus berformat PDF.',
                ]);
            }
        }

        // Jenis tiap berkas final dipilih admin dari MoU / MoA / IA — dashboard menghitung dari jenis ini.
        // Pengajuan yang memuat beberapa jenis (MoU + MoA) WAJIB memilihnya di setiap berkas; pengajuan satu
        // jenis boleh mengosongkannya, tetapi kalau diisi harus salah satu dari ketiganya.
        $pengajuanMultiJenis = count((array) (
            array_key_exists('jenis_dokumen_list', $validated) ? $validated['jenis_dokumen_list'] : $pengajuan->jenis_dokumen_list
        )) > 1;
        $adaDokumenUtama = false;
        $adaBerkas = false;
        foreach ((array) $request->input('acc_file_attachments', []) as $index => $accFile) {
            $adaBerkas = true;
            $jenisDikirim = is_array($accFile) ? trim((string) ($accFile['jenis_dokumen'] ?? '')) : '';
            $jenisBerkas = JenisDokumenSelection::untukBerkas($jenisDikirim);

            if (($pengajuanMultiJenis && $jenisBerkas === null) || ($jenisDikirim !== '' && $jenisBerkas === null)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "acc_file_attachments.{$index}.jenis_dokumen" => 'Pilih jenis dokumen untuk setiap berkas final (MoU / MoA / IA, atau TOR / KAK / Proposal / Laporan Kegiatan / Lainnya).',
                ]);
            }
            if (! JenisDokumenSelection::adalahPendukung($jenisBerkas)) {
                $adaDokumenUtama = true;
            }
        }
        // Hanya berkas pendukung (TOR dst.) tanpa satu pun dokumen final tidak membentuk dokumen kerja sama.
        if ($adaBerkas && ! $adaDokumenUtama) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'acc_file_attachments' => 'Unggah minimal satu dokumen final bertipe MoU, MoA, atau IA.',
            ]);
        }

        if (! $isAdmin) {
            // Field keputusan/administrasi tetap milik admin — diabaikan kalau dikirim pengusul.
            foreach (self::FIELD_KHUSUS_ADMIN as $field) {
                unset($validated[$field]);
            }
        }

        // Optimistic locking: klien boleh mengirim `updated_at` yang ia terima saat memuat data.
        // Kalau pengajuan sudah diubah orang lain sejak itu, tolak (409) supaya tidak menimpa
        // perubahan tersebut. Tanpa token, perilaku lama (tanpa cek) tetap berlaku.
        // Cek cepat di sini (sebelum efek samping seperti sinkron master mitra), lalu dicek
        // ulang dengan row lock di dalam transaksi.
        $tokenUpdatedAt = $this->parseLockToken($request);
        if ($tokenUpdatedAt !== null && $this->isPengajuanStale($pengajuan->fresh(), $tokenUpdatedAt)) {
            return $this->konflikResponse();
        }

        if (array_key_exists('jenis_dokumen', $validated)) {
            $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);
            // Edit yang hanya mengirim ulang jenis utama yang SAMA tidak boleh menghapus daftar jenis
            // (MoU + MoA); jenis utama yang berubah berarti daftar lama tidak berlaku lagi.
            if (! array_key_exists('jenis_dokumen_list', $validated)
                && ($pengajuan->jenis_dokumen_list[0] ?? null) !== $validated['jenis_dokumen']) {
                $validated['jenis_dokumen_list'] = null;
            }
        }
        JenisDokumenSelection::apply($validated);

        $unitProdiIds = UnitProdiSelection::extract($validated, $pengajuan->unit_prodi_id);

        if ($request->has('ruang_lingkup_ids')) {
            $validated['ruang_lingkup_ids'] = $ruangLingkupIds;
        }

        if ($this->hasPengajuanColumn('file_name') && $request->has('file_name')) {
            $validated['file_name'] = (string) $request->input('file_name', '');
        }

        if ($this->hasPengajuanColumn('file_attachments') && $request->has('file_attachments')) {
            $validated['file_attachments'] = $request->input('file_attachments');
        }

        if (array_key_exists('nama_mitra', $validated) || array_key_exists('mitra_id', $validated) || array_key_exists('mitra_alamat', $validated)) {
            $validated['mitra_id'] = $this->syncMasterMitraFromPengajuanInput($validated + ['nama_mitra' => $validated['nama_mitra'] ?? $pengajuan->nama_mitra]);
        }
        unset(
            $validated['mitra_alamat'],
            $validated['mitra_nama_kontak_utama'],
            $validated['mitra_jabatan_kontak_utama'],
            $validated['mitra_email_kontak_utama'],
            $validated['mitra_telepon_kontak_utama'],
        );

        $statusColumn = $this->hasPengajuanColumn('status_pengajuan') ? 'status_pengajuan' : 'status';
        $statusLama = (string) ($pengajuan->{$statusColumn} ?? 'menunggu');
        $logComment = $request->input('review_comment') ?? $request->input('catatan');

        // Pengusul memperbaiki pengajuan yang diminta Revisi -> otomatis kembali antre review admin.
        if (! $isAdmin && strtolower(trim($statusLama)) === 'revisi') {
            $validated[$statusColumn] = 'menunggu';
            if ($this->hasPengajuanColumn('direvisi_pengusul_pada')) {
                $validated['direvisi_pengusul_pada'] = now();
            }
            $logComment = 'Revisi dikirim ulang oleh pengusul';
        }

        $statusBaru = (string) ($validated[$statusColumn] ?? $statusLama);

        try {
            DB::transaction(function () use ($pengajuan, $validated, $unitProdiIds, $statusBaru, $statusLama, $request, $logComment, $isAdmin, $tokenUpdatedAt) {
                if ($tokenUpdatedAt !== null) {
                    $terkunci = Pengajuan::whereKey($pengajuan->id)->lockForUpdate()->first();
                    if (! $terkunci || $this->isPengajuanStale($terkunci, $tokenUpdatedAt)) {
                        throw new PengajuanKonflikException('Pengajuan sudah diubah orang lain.');
                    }
                }

                $pengajuan->update($validated);

                if ($unitProdiIds !== null) {
                    $pengajuan->syncUnitProdi($unitProdiIds);
                }

                // Write to pengajuan_log when status changes.
                if ($statusBaru !== $statusLama) {
                    try {
                        DB::transaction(function () use ($pengajuan, $statusLama, $statusBaru, $request, $logComment) {
                            $this->writeReviewLog(
                                $pengajuan,
                                $statusLama,
                                $statusBaru,
                                $logComment,
                                $request->user()?->id
                            );
                        });
                    } catch (\Throwable $exception) {
                        report($exception);
                    }
                }

                try {
                    DB::transaction(function () use ($pengajuan, $request) {
                        $this->syncPengajuanFiles($pengajuan, $request);
                    });
                } catch (\Throwable $ignored) {
                    // Do not fail main pengajuan update when optional attachment sync is incompatible.
                }

                if ($isAdmin) {
                    try {
                        DB::transaction(function () use ($pengajuan, $request) {
                            $this->syncAccFiles($pengajuan, $request);
                            $this->syncRevisiFiles($pengajuan, $request);
                        });
                    } catch (\Throwable $ignored) {
                        // Do not fail main update when acc file sync fails.
                    }
                }

                $statusBaruNormalized = strtolower(trim($statusBaru));

                if (! $isAdmin) {
                    // Sisanya (ACC, berkas final, pindah ke Rekap Data) hanya untuk keputusan admin.
                    return;
                }

                if ($statusBaruNormalized === 'revisi' && $request->filled('catatan_revisi')) {
                    $pengajuan->catatan_revisi = (string) $request->input('catatan_revisi');
                    $pengajuan->save();
                }

                if ($statusBaruNormalized === 'disetujui_internal') {
                    $pengajuan->acc_internal_at = now();
                    $pengajuan->save();
                }

                if ($statusBaruNormalized === 'disetujui_mitra') {
                    $pengajuan->acc_mitra_at = now();
                    $pengajuan->save();
                }

                if ($request->filled('acc_actor')) {
                    $actor = (string) $request->input('acc_actor');
                    if ($actor === 'internal') {
                        $pengajuan->acc_internal_at = now();
                    } elseif ($actor === 'mitra') {
                        $pengajuan->acc_mitra_at = now();
                    }
                }

                if ($request->filled('final_file_name')) {
                    $pengajuan->final_file_name = (string) $request->input('final_file_name');
                }

                if ($request->filled('final_file_path')) {
                    $pengajuan->final_file_path = (string) $request->input('final_file_path');
                }

                if (!empty($pengajuan->acc_internal_at) && !empty($pengajuan->acc_mitra_at)) {
                    $pengajuan->status_pengajuan = 'final_approved';
                    $pengajuan->final_approved_at = now();
                }

                $pengajuan->save();

                if (in_array(strtolower(trim((string) $pengajuan->status_pengajuan)), ['disetujui', 'final_approved'], true)) {
                    $this->moveApprovedPengajuanToDokumen($pengajuan->fresh(), $request);
                }
            });
        } catch (PengajuanKonflikException) {
            return $this->konflikResponse();
        } catch (\Illuminate\Validation\ValidationException $exception) {
            throw $exception;
        } catch (QueryException $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal mengubah pengajuan.',
                'error' => $exception->getMessage(),
            ], 422);
        } catch (\Throwable $exception) {
            return response([
                'success' => false,
                'message' => 'Gagal sinkronisasi pengajuan ke rekap dokumen.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        $freshPengajuan = $pengajuan->fresh();

        // Load relations so the response mirrors what index() returns.
        // Without this, unit_prodi / mitra objects are absent and the frontend
        // would map namaUnitProdi / namaMitra to '-', overwriting existing state.
        if ($freshPengajuan && $this->shouldLoadPengajuanRelations()) {
            $freshPengajuan->load([
                'unitProdi:id,nama,jenis_node,kategori_unit,parent_id',
                'unitProdiItems:id,nama,jenis_node,kategori_unit,parent_id',
                'mitra:id,nama_mitra,kategori_mitra,tingkat_perusahaan,negara,alamat,email_mitra,whatsapp_mitra,no_telepon_mitra',
                'dokumenFiles',
            ]);
        }

        $message = 'Pengajuan updated successfully';
        if (!empty($freshPengajuan?->acc_internal_at) && !empty($freshPengajuan?->acc_mitra_at)) {
            $message = 'Berkas final telah disetujui oleh kedua belah pihak.';
        }

        return response([
            'success' => true,
            'data' => $freshPengajuan,
            'message' => $message,
        ]);
    }

    public function destroy(Request $request, Pengajuan $pengajuan): Response
    {
        // Admin boleh hapus pengajuan siapapun; internal/eksternal/kampus-LDAP boleh hapus
        // pengajuan MEREKA SENDIRI (tombol Hapus di Rekap Data/Daftar Kerjasama masing-masing).
        $user = $request->user();
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));
        $isAdmin = in_array($normalizedRole, ['admin', 'admin-humas'], true);
        $isOwner = $user && (int) $pengajuan->user_pengusul_id === (int) $user->id;

        if (!$isAdmin && !$isOwner) {
            return response([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk menghapus pengajuan ini.',
            ], 403);
        }

        // Mitra eksternal boleh menghapus pengajuannya sendiri (semua status). Sifatnya hanya menyembunyikan dari
        // akun mitra lewat dihapus_user_pada: dokumen kerja sama di Rekap Data dan data admin tidak ikut terhapus,
        // admin tetap melihatnya untuk keperluan audit. (Role eksternal tersimpan sebagai 'external' di users.role.)
        if (!$isAdmin && in_array($normalizedRole, ['external', 'eksternal'], true)) {
            if (! $this->hasPengajuanColumn('dihapus_user_pada')) {
                return response([
                    'success' => false,
                    'message' => 'Penghapusan pengajuan belum tersedia.',
                ], 422);
            }

            $pengajuan->dihapus_user_pada = now();
            $pengajuan->save();

            return response([
                'success' => true,
                'data' => null,
                'message' => 'Pengajuan dihapus dari daftar Anda.',
            ]);
        }

        // Hapus oleh admin (Data Pengajuan) hanya MENYEMBUNYIKAN dari admin & pengguna lain lewat
        // dihapus_admin_pada — pengusul internal/eksternal tetap melihat pengajuannya sendiri di
        // Data Pengajuan / Daftar Kerjasama mereka (filter visibilitasnya ada di index() & show()).
        // Dihapus permanen hanya kalau memang tidak ada lagi yang perlu melihatnya: pengajuan
        // buatan admin sendiri / tanpa pemilik, atau yang sudah disembunyikan pemiliknya.
        if ($isAdmin && $this->hasPengajuanColumn('dihapus_admin_pada')) {
            $pemilik = $pengajuan->user_pengusul_id ? User::find($pengajuan->user_pengusul_id) : null;
            $pemilikRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($pemilik?->role ?? ''))));
            $pemilikMasihPerlu = $pemilik
                && !in_array($pemilikRole, ['admin', 'admin-humas'], true)
                && empty($pengajuan->dihapus_user_pada);

            if ($pemilikMasihPerlu) {
                $pengajuan->dihapus_admin_pada = now();
                $pengajuan->save();

                return response([
                    'success' => true,
                    'data' => null,
                    'message' => 'Pengajuan dihapus dari Data Pengajuan admin (tetap terlihat oleh pengusul).',
                ]);
            }
        }

        // Hapus PERMANEN — dipakai saat pemilik menghapus pengajuannya sendiri, atau admin
        // menghapus pengajuan yang tidak lagi dilihat siapa pun. Hapus di sini TIDAK ikut
        // menghapus dokumen kerjasama terkait (FK sumber_pengajuan_id nullOnDelete).
        $pengajuan->delete();

        return response([
            'success' => true,
            'data' => null,
            'message' => 'Pengajuan deleted successfully',
        ]);
    }

    private function ensureDistribusiAccess(Request $request): ?Response
    {
        $user = $request->user();
        $normalizedRole = strtolower(str_replace([' ', '_'], '-', trim((string) ($user?->role ?? ''))));

        if (!in_array($normalizedRole, ['admin', 'admin-humas'], true)) {
            return response([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk fitur ini.',
            ], 403);
        }

        return null;
    }

    /**
     * Kandidat "Distribusi (CC)" untuk modal review pengajuan — gabungan Ketua Jurusan/
     * Ketua Prodi/Kepala Unit yang SUDAH pernah login (ada di tabel users) DENGAN yang
     * belum pernah login sama sekali tapi datanya sudah ada di Civitas
     * (NIK_KAJUR/NIK_KPS/NIK_KEPALA_UNIT pada GET /api/sikerma/jurusan,
     * /api/sikerma/program-studi, & /api/sikerma/unit). Sebelumnya list ini cuma ambil dari
     * tabel users role=jurusan/prodi — jadi Kajur/Kaprodi/Kepala Unit yang belum pernah
     * login ke SIKERMA sama sekali tidak bisa dipilih untuk di-CC, walau jabatannya resmi
     * dan datanya sudah ada di sistem kampus.
     *
     * Satu NIK bisa muncul lebih dari sekali kalau orangnya kebetulan merangkap jabatan
     * (mis. Kajur sekaligus Kepala Unit) — sengaja tidak di-dedup, masing-masing jabatan
     * tetap kandidat terpisah (lihat juga penanganan key di frontend).
     *
     * Kandidat yang belum pernah login dikirim dengan `id: null` — frontend wajib panggil
     * provisionDistribusiUser() dulu buat dapat id user sebelum bisa disimpan ke
     * distribusi_user_ids (kolom itu FK ke users.id).
     */
    public function distribusiKandidat(Request $request): Response
    {
        if ($response = $this->ensureDistribusiAccess($request)) {
            return $response;
        }

        $localByNik = User::query()
            ->whereIn('role', ['jurusan', 'prodi', 'unit'])
            ->whereNotNull('nik')
            ->get(['id', 'name', 'nik'])
            ->keyBy(fn (User $u) => trim((string) $u->nik));

        $civitas = app(CivitasStructureService::class);
        $candidates = [];
        $consumedUserIds = [];

        foreach ($civitas->getJurusan() as $row) {
            $nik = trim((string) ($row['NIK_KAJUR'] ?? ''));
            $namaCivitas = trim((string) ($row['NAMA_KAJUR'] ?? ''));
            if ($nik === '' || $namaCivitas === '') {
                continue;
            }

            $localUser = $localByNik->get($nik);
            $candidates[] = [
                'id' => $localUser?->id,
                'nama' => $localUser->name ?? $namaCivitas,
                'nik' => $nik,
                'jabatan' => 'ketua_jurusan',
                'unit_nama' => trim((string) ($row['NAMA_JURUSAN'] ?? '')),
                'sudah_terdaftar' => $localUser !== null,
            ];

            if ($localUser) {
                $consumedUserIds[] = $localUser->id;
            }
        }

        foreach ($civitas->getProgramStudi() as $row) {
            $nik = trim((string) ($row['NIK_KPS'] ?? ''));
            $namaCivitas = trim((string) ($row['NAMA_KPS'] ?? ''));
            if ($nik === '' || $namaCivitas === '') {
                continue;
            }

            $localUser = $localByNik->get($nik);
            $candidates[] = [
                'id' => $localUser?->id,
                'nama' => $localUser->name ?? $namaCivitas,
                'nik' => $nik,
                'jabatan' => 'ketua_prodi',
                'unit_nama' => trim((string) ($row['NAMA_PROGRAM_STUDI'] ?? '')),
                'sudah_terdaftar' => $localUser !== null,
            ];

            if ($localUser) {
                $consumedUserIds[] = $localUser->id;
            }
        }

        foreach ($civitas->getUnit() as $row) {
            $nik = trim((string) ($row['NIK_KEPALA_UNIT'] ?? ''));
            $namaCivitas = trim((string) ($row['NAMA_KEPALA_UNIT'] ?? ''));
            if ($nik === '' || $namaCivitas === '') {
                continue;
            }

            $localUser = $localByNik->get($nik);
            $candidates[] = [
                'id' => $localUser?->id,
                'nama' => $localUser->name ?? $namaCivitas,
                'nik' => $nik,
                'jabatan' => 'kepala_unit',
                'unit_nama' => trim((string) ($row['NAMA_UNIT'] ?? '')),
                'sudah_terdaftar' => $localUser !== null,
            ];

            if ($localUser) {
                $consumedUserIds[] = $localUser->id;
            }
        }

        // Fallback: user role jurusan/prodi/unit yang NIK-nya tidak match Kajur/KPS/Kepala
        // Unit resmi Civitas (mis. role di-set manual admin lewat Manajemen User, akun
        // dummy Pokja/UPA tanpa NIK asli, atau API kampus lagi tidak bisa dihubungi) — tetap
        // disertakan supaya cakupan yang sudah ada sebelumnya tidak hilang gara-gara
        // perubahan ini.
        $sisaLocalUsers = User::query()
            ->whereIn('role', ['jurusan', 'prodi', 'unit'])
            ->whereNotIn('id', $consumedUserIds ?: [0])
            ->get(['id', 'name', 'role']);

        foreach ($sisaLocalUsers as $sisa) {
            $candidates[] = [
                'id' => $sisa->id,
                'nama' => $sisa->name,
                'nik' => null,
                'jabatan' => match ($sisa->role) {
                    'jurusan' => 'ketua_jurusan',
                    'prodi' => 'ketua_prodi',
                    default => 'kepala_unit',
                },
                'unit_nama' => null,
                'sudah_terdaftar' => true,
            ];
        }

        usort($candidates, fn ($a, $b) => strcasecmp((string) $a['nama'], (string) $b['nama']));

        return response([
            'success' => true,
            'data' => $candidates,
            'message' => 'Kandidat distribusi berhasil diambil',
        ]);
    }

    /**
     * Provisioning akun untuk Ketua Jurusan/Ketua Prodi/Kepala Unit yang dipilih dari
     * distribusiKandidat() tapi belum pernah login (belum ada baris users). Dibuat dengan
     * NIK yang sama persis dengan data Civitas — begitu orangnya beneran login lewat
     * "Login dengan Akun Kampus", AuthController::loginLdap() mencocokkan by NIK duluan
     * (lihat AuthController.php) jadi akan REUSE baris ini, bukan bikin akun dobel.
     *
     * Email diisi placeholder unik (bukan email asli — Civitas tidak mengirim email di
     * endpoint jurusan/program-studi/unit, cuma di login-staff) karena kolom users.email
     * NOT NULL + unique. Ini aman karena distribusi_user_ids cuma dipakai untuk
     * visibilitas in-app (lihat PengajuanController::index()/show()), TIDAK pernah dipakai
     * untuk mengirim email — placeholder ini tidak akan pernah benar-benar dikirimi apa pun.
     */
    public function provisionDistribusiUser(Request $request): Response
    {
        if ($response = $this->ensureDistribusiAccess($request)) {
            return $response;
        }

        $validated = $request->validate([
            'nik' => ['required', 'string', 'max:50'],
            'nama' => ['required', 'string', 'max:200'],
            'jabatan' => ['required', Rule::in(['ketua_jurusan', 'ketua_prodi', 'kepala_unit'])],
        ]);

        $nik = trim($validated['nik']);
        $target = User::query()->where('nik', $nik)->first();

        if (!$target) {
            $role = match ($validated['jabatan']) {
                'ketua_jurusan' => 'jurusan',
                'ketua_prodi' => 'prodi',
                default => 'unit',
            };

            $target = User::create([
                'name' => $validated['nama'],
                'username' => null,
                'email' => "civitas-{$nik}@no-email.sikerma.local",
                'nik' => $nik,
                'role' => $role,
                'approval_status' => 'active',
                'auth_provider' => 'ldap',
                'password' => Hash::make(Str::random(40)),
            ]);
        }

        return response([
            'success' => true,
            'data' => ['id' => $target->id, 'nama' => $target->name],
            'message' => 'Kandidat distribusi berhasil disiapkan',
        ]);
    }
}
