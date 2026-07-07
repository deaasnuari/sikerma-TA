<?php

namespace App\Http\Controllers;

use App\Models\DokumenFile;
use App\Models\DokumenLog;
use App\Models\DokumenKerjasama;
use App\Models\MasterRuangLingkup;
use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PengajuanController extends Controller
{
    private static array $pengajuanColumnCache = [];
    private static ?bool $pengajuanFileTableExists = null;
    private static ?bool $dokumenKerjasamaTableExists = null;
    private static ?bool $dokumenFileTableExists = null;
    private static ?bool $dokumenLogTableExists = null;

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

        $unitName = null;
        if ($pengajuan->unit_prodi_id) {
            $unitName = MasterUnitProdi::query()
                ->where('id', $pengajuan->unit_prodi_id)
                ->value('nama');
        }

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

        $existingDokumen = DokumenKerjasama::query()
            ->where('sumber_pengajuan_id', $pengajuan->id)
            ->orWhere('no_permohonan', $nomorPengajuan)
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
        $snapTingkatPerusahaan = trim((string) ($pengajuan->tingkat_perusahaan ?? ''));
        if ($snapTingkatPerusahaan === '' && $masterMitraRow) {
            $snapTingkatPerusahaan = (string) ($masterMitraRow->tingkat_perusahaan ?? '');
        }

        $dokumenPayload = [
            'no_permohonan' => $nomorPengajuan,
            'nomor_dokumen' => $nomorDokumen,
            'nama_dokumen' => trim((string) ($pengajuan->judul_pengajuan ?? 'Dokumen Kerjasama ' . $nomorPengajuan)),
            'jenis_dokumen' => strtoupper((string) ($pengajuan->jenis_dokumen ?? 'MOU')),
            'judul_dokumen' => trim((string) ($pengajuan->judul_pengajuan ?? '')),
            'ruang_lingkup_ids' => $pengajuan->ruang_lingkup_ids,
            'tanggal_mulai' => $pengajuan->tanggal_mulai,
            'tanggal_berakhir' => $pengajuan->tanggal_berakhir,
            'status_siklus' => 'active',
            'sumber_pengajuan_id' => $pengajuan->id,
            'unit_prodi_id' => $pengajuan->unit_prodi_id,
            'mitra_id' => $pengajuan->mitra_id,
            // Snapshot data pengajuan — tetap tersimpan meski record pengajuan dihapus.
            'snap_nama_mitra' => $snapNamaMitra !== '' ? $snapNamaMitra : null,
            'snap_whatsapp_pengusul' => trim((string) ($pengajuan->whatsapp_pengusul ?? '')) ?: null,
            'snap_nama_pengusul' => trim((string) ($pengajuan->nama_pengusul ?? '')) ?: null,
            'snap_email_pengusul' => trim((string) ($pengajuan->email_pengusul ?? '')) ?: null,
            'snap_jenis_mitra' => $snapJenisMitra !== '' ? $snapJenisMitra : null,
            'snap_tingkat_perusahaan' => $snapTingkatPerusahaan !== '' ? $snapTingkatPerusahaan : null,
            'dibuat_oleh_user_id' => $request->user()?->id,
            'file' => $primaryPath,
            'keterangan' => trim((string) ($pengajuan->deskripsi_pengajuan ?? '')),
        ];

        if ($existingDokumen) {
            $existingDokumen->update($dokumenPayload);
            $dokumen = $existingDokumen->fresh();
        } else {
            $dokumen = DokumenKerjasama::create($dokumenPayload);
        }

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

            $path = $this->persistDataUrlAttachment($attachment) ?? $this->normalizeAttachmentPath($attachment);

            $payload[] = [
                'peran_berkas' => isset($attachment['peran_berkas']) && is_string($attachment['peran_berkas']) ? $attachment['peran_berkas'] : 'pengajuan_awal',
                'nama_file' => $name,
                'path_file' => $path,
                'mime_type' => isset($attachment['type']) && is_string($attachment['type']) ? $attachment['type'] : null,
                'ukuran_file_bytes' => isset($attachment['size']) && is_numeric($attachment['size']) ? (int) $attachment['size'] : null,
                'diunggah_oleh_user_id' => $request->user()?->id,
            ];
        }

        $pengajuan->pengajuanFiles()->delete();

        if (! empty($payload)) {
            $pengajuan->pengajuanFiles()->createMany($payload);
        }
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

            $path = $this->persistDataUrlAttachment($attachment) ?? $this->normalizeAttachmentPath($attachment);

            $payload[] = [
                'peran_berkas' => 'dokumen_final',
                'nama_file' => $name,
                'path_file' => $path,
                'mime_type' => isset($attachment['type']) && is_string($attachment['type']) ? $attachment['type'] : null,
                'ukuran_file_bytes' => isset($attachment['size']) && is_numeric($attachment['size']) ? (int) $attachment['size'] : null,
                'diunggah_oleh_user_id' => $request->user()?->id,
            ];
        }

        if (! empty($payload)) {
            // Replace existing dokumen_final entries so re-submissions don't accumulate duplicates.
            $pengajuan->pengajuanFiles()->where('peran_berkas', 'dokumen_final')->delete();
            $pengajuan->pengajuanFiles()->createMany($payload);
        }
    }

    private function shouldLoadPengajuanRelations(): bool
    {
        return $this->hasPengajuanColumn('unit_prodi_id') && $this->hasPengajuanColumn('mitra_id');
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

        if ($this->shouldLoadPengajuanRelations()) {
            $query->with([
                'unitProdi:id,nama,jenis_node,kategori_unit',
                'mitra:id,nama_mitra,kategori_mitra,tingkat_perusahaan,negara,alamat,email_mitra,telepon_mitra',
                'dokumenFiles',
                'dokumenKerjasama:id,no_permohonan,nomor_dokumen,file',
                'dokumenKerjasama.dokumenFiles' => function ($q) {
                    $q->select(['id', 'dokumen_id', 'nama_file', 'path_file', 'peran_berkas', 'mime_type', 'ukuran_file_bytes'])
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

    public function show(Pengajuan $pengajuan): Response
    {
        if ($this->shouldLoadPengajuanRelations()) {
            $pengajuan->load([
                'unitProdi:id,nama,jenis_node,kategori_unit',
                'mitra:id,nama_mitra,kategori_mitra,tingkat_perusahaan,negara,alamat,email_mitra,telepon_mitra',
                'dokumenFiles',
                'dokumenKerjasama:id,no_permohonan,nomor_dokumen,file',
                'dokumenKerjasama.dokumenFiles' => function ($q) {
                    $q->select(['id', 'dokumen_id', 'nama_file', 'path_file', 'peran_berkas', 'mime_type', 'ukuran_file_bytes'])
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
            'unit_prodi_id' => ['nullable', 'integer', 'exists:master_unit_prodi,id'],
            'mitra_id' => ['nullable', 'integer', 'exists:master_mitra,id'],
            'nama_mitra' => ['nullable', 'string', 'max:255'],
            'jenis_mitra' => ['nullable', 'string', 'max:150'],
            'tingkat_perusahaan' => ['nullable', 'string', 'max:50'],
            'telepon_mitra' => ['nullable', 'string', 'max:50'],
            'judul_pengajuan' => ['required', 'string', 'max:255'],
            'deskripsi_pengajuan' => ['nullable', 'string', 'max:100'],
            'jenis_dokumen' => ['required', 'in:MOU,MOA,IA,LAINNYA'],
            'kategori_pengajuan' => ['nullable', 'in:internal,eksternal'],
            'tanggal_mulai' => ['nullable', 'date'],
            'tanggal_berakhir' => ['nullable', 'date', 'after_or_equal:tanggal_mulai'],
            'status_pengajuan' => ['nullable', 'in:menunggu,diproses,disetujui,ditolak'],
            'diajukan_pada' => ['nullable', 'date'],
            'email_terverifikasi_pada' => ['nullable', 'date'],
        ]);

        $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);
        $validated['ruang_lingkup_ids'] = $ruangLingkupIds;

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

        try {
            $pengajuan = Pengajuan::create($validated);

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
                'unitProdi:id,nama,jenis_node,kategori_unit',
                'mitra:id,nama_mitra,kategori_mitra,tingkat_perusahaan,negara,alamat,email_mitra,telepon_mitra',
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

    public function update(Request $request, Pengajuan $pengajuan): Response
    {
        if ($response = $this->ensureAdmin($request)) {
            return $response;
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
            'unit_prodi_id' => ['nullable', 'integer', 'exists:master_unit_prodi,id'],
            'mitra_id' => ['nullable', 'integer', 'exists:master_mitra,id'],
            'nama_mitra' => ['nullable', 'string', 'max:255'],
            'jenis_mitra' => ['nullable', 'string', 'max:150'],
            'tingkat_perusahaan' => ['nullable', 'string', 'max:50'],
            'telepon_mitra' => ['nullable', 'string', 'max:50'],
            'judul_pengajuan' => ['sometimes', 'required', 'string', 'max:255'],
            'deskripsi_pengajuan' => ['nullable', 'string', 'max:100'],
            'jenis_dokumen' => ['sometimes', 'required', 'in:MOU,MOA,IA,LAINNYA'],
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
        ]);

        if (array_key_exists('jenis_dokumen', $validated)) {
            $validated['jenis_dokumen'] = strtoupper((string) $validated['jenis_dokumen']);
        }

        if ($request->has('ruang_lingkup_ids')) {
            $validated['ruang_lingkup_ids'] = $ruangLingkupIds;
        }

        if ($this->hasPengajuanColumn('file_name') && $request->has('file_name')) {
            $validated['file_name'] = (string) $request->input('file_name', '');
        }

        if ($this->hasPengajuanColumn('file_attachments') && $request->has('file_attachments')) {
            $validated['file_attachments'] = $request->input('file_attachments');
        }

        $statusColumn = $this->hasPengajuanColumn('status_pengajuan') ? 'status_pengajuan' : 'status';
        $statusLama = (string) ($pengajuan->{$statusColumn} ?? 'menunggu');
        $statusBaru = (string) ($validated[$statusColumn] ?? $statusLama);

        try {
            DB::transaction(function () use ($pengajuan, $validated, $statusBaru, $statusLama, $request) {
                $pengajuan->update($validated);

                // Write to pengajuan_log when status changes.
                if ($statusBaru !== $statusLama) {
                    try {
                        DB::transaction(function () use ($pengajuan, $statusLama, $statusBaru, $request) {
                            $this->writeReviewLog(
                                $pengajuan,
                                $statusLama,
                                $statusBaru,
                                $request->input('review_comment') ?? $request->input('catatan'),
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

                try {
                    DB::transaction(function () use ($pengajuan, $request) {
                        $this->syncAccFiles($pengajuan, $request);
                    });
                } catch (\Throwable $ignored) {
                    // Do not fail main update when acc file sync fails.
                }

                $statusBaruNormalized = strtolower(trim($statusBaru));

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
                'unitProdi:id,nama,jenis_node,kategori_unit',
                'mitra:id,nama_mitra,kategori_mitra,tingkat_perusahaan,negara,alamat,email_mitra,telepon_mitra',
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
        if ($response = $this->ensureAdmin($request)) {
            return $response;
        }

        $pengajuan->delete();

        return response([
            'success' => true,
            'data' => null,
            'message' => 'Pengajuan deleted successfully',
        ]);
    }
}
