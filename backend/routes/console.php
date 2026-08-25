<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('legacy:migrate-simplified {--truncate-new : Kosongkan tabel baru sebelum migrasi}', function () {
    $requiredTables = [
        'pengajuan',
        'pengajuan_log',
        'dokumen_kerjasama',
        'dokumen_file',
        'dokumen_log',
    ];

    foreach ($requiredTables as $table) {
        if (!Schema::hasTable($table)) {
            $this->error("Tabel {$table} belum ada. Jalankan migration terbaru terlebih dahulu.");
            return;
        }
    }

    $oldConnectionName = 'mysql_old';
    try {
        $old = DB::connection($oldConnectionName);
        $old->getPdo();
    } catch (\Throwable $exception) {
        $fallback = DB::connection();
        $fallbackSchema = $fallback->getSchemaBuilder();

        if ($fallbackSchema->hasTable('ajuan') && $fallbackSchema->hasTable('dokumen')) {
            $old = $fallback;
            $oldConnectionName = (string) config('database.default', 'default');
            $this->warn('Koneksi mysql_old gagal. Fallback menggunakan koneksi default: ' . $oldConnectionName);
        } else {
            $this->error('Koneksi mysql_old gagal: ' . $exception->getMessage());
            return;
        }
    }

    $this->info('Mulai migrasi data lama ke skema simplified dari koneksi: ' . $oldConnectionName);

    $orderedTableQuery = static function ($connection, string $table, array $candidateOrderColumns) {
        $query = $connection->table($table);
        $schema = $connection->getSchemaBuilder();
        foreach ($candidateOrderColumns as $column) {
            if ($schema->hasColumn($table, $column)) {
                return $query->orderBy($column);
            }
        }

        return $query->orderByRaw('1');
    };

    if ($this->option('truncate-new')) {
        DB::transaction(function () {
            DB::table('dokumen_log')->truncate();
            DB::table('dokumen_file')->truncate();
            DB::table('dokumen_kerjasama')->truncate();
            DB::table('pengajuan_log')->truncate();
            DB::table('pengajuan')->truncate();
        });
        $this->warn('Tabel baru telah dikosongkan karena opsi --truncate-new.');
    }

    $toDate = static function (?string $value): ?string {
        $raw = trim((string) $value);
        if ($raw === '' || $raw === '0000-00-00') {
            return null;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) === 1) {
            return $raw;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/', $raw) === 1) {
            return substr($raw, 0, 10);
        }
        return null;
    };

    $mapJenisDokumen = static function (?string $value): string {
        $raw = strtoupper(trim((string) $value));
        if (Str::contains($raw, 'MOA')) {
            return 'MOA';
        }
        if (Str::contains($raw, 'IA')) {
            return 'IA';
        }
        return 'MOU';
    };

    $mapStatusPengajuan = static function (?string $value): string {
        $raw = strtolower(trim((string) $value));
        if (in_array($raw, ['disetujui', 'approved', 'selesai'], true)) {
            return 'disetujui';
        }
        if (in_array($raw, ['ditolak', 'rejected'], true)) {
            return 'ditolak';
        }
        if (in_array($raw, ['diproses', 'proses', 'verifikasi'], true)) {
            return 'diproses';
        }
        return 'menunggu';
    };

    $masterUnit = DB::table('master_unit_prodi')->select(['id', 'nama', 'jenis_node'])->get();
    $unitByName = [];
    $prodiByName = [];
    foreach ($masterUnit as $row) {
        $key = strtolower(trim((string) $row->nama));
        if ($key === '') {
            continue;
        }
        if ($row->jenis_node === 'prodi') {
            $prodiByName[$key] = $row->id;
        } else {
            $unitByName[$key] = $row->id;
        }
    }

    $mitraByName = DB::table('master_mitra')->select(['id', 'nama_mitra'])->get()->mapWithKeys(
        static fn ($row) => [strtolower(trim((string) $row->nama_mitra)) => $row->id]
    );

    $ruangLingkupByName = DB::table('master_ruang_lingkup')->select(['id', 'nama_ruang_lingkup'])->get()->mapWithKeys(
        static fn ($row) => [strtolower(trim((string) $row->nama_ruang_lingkup)) => $row->id]
    );

    $pemohonByAjuan = [];
    if ($old->getSchemaBuilder()->hasTable('kerjasamapemohon')) {
        $orderedTableQuery($old, 'kerjasamapemohon', ['id', 'Id_Pemohon', 'id_ajuan'])->select([
            'id_ajuan',
            'Nama_Pemohon',
            'Jabatan_Pemohon',
            'Email_Pemohon',
            'No_Wa_Pemohon',
        ])->chunk(1000, function ($rows) use (&$pemohonByAjuan) {
            foreach ($rows as $row) {
                $noAjuan = trim((string) ($row->id_ajuan ?? ''));
                if ($noAjuan === '' || isset($pemohonByAjuan[$noAjuan])) {
                    continue;
                }
                $pemohonByAjuan[$noAjuan] = [
                    'nama' => trim((string) ($row->Nama_Pemohon ?? '')),
                    'jabatan' => trim((string) ($row->Jabatan_Pemohon ?? '')),
                    'email' => trim((string) ($row->Email_Pemohon ?? '')),
                    'wa' => trim((string) ($row->No_Wa_Pemohon ?? '')),
                ];
            }
        });
    }

    $pengajuanByNomor = [];
    $legacyAjuanNumberSet = Schema::hasTable('ajuan')
        ? DB::table('ajuan')->pluck('no_permohonan')->map(
            static fn ($value) => trim((string) $value)
        )->flip()
        : collect();

    $ensureLegacyAjuanExists = static function (string $noPermohonan) use (&$legacyAjuanNumberSet) {
        if (! Schema::hasTable('ajuan')) {
            return;
        }

        $key = trim($noPermohonan);
        if ($key === '' || $legacyAjuanNumberSet->has($key)) {
            return;
        }

        DB::table('ajuan')->insert([
            'no_permohonan' => $key,
            'nama_pemohon' => 'Migrasi Legacy',
            'jabatan_pemohon' => '-',
            'unit' => '-',
            'prodi' => '-',
            'email' => 'legacy@local.invalid',
            'wa_pemohon' => '-',
            'nama_institusi' => '-',
            'kategori_institusi' => 'eksternal',
            'negara' => 'Indonesia',
            'web_institusi' => '-',
            'nama_pic' => '-',
            'jabatan_pic' => '-',
            'wa_pic' => '-',
            'email_pic' => 'legacy-pic@local.invalid',
            'jenis_ajuan' => 'MOU',
            'ruang_lingkup' => '-',
            'catatan' => 'Auto-generated untuk memenuhi FK dokumen_kerjasama saat migrasi legacy',
            'status_ajuan' => 'diproses',
            'tgl_ajuan' => now()->toDateString(),
            'tgl_verifikasi' => now()->toDateString(),
            'tgl_disetujui' => now()->toDateString(),
            'tgl_selesai' => now()->toDateString(),
            'komentar' => 'Placeholder autogenerated',
        ]);

        $legacyAjuanNumberSet->put($key, true);
    };

    $migratedPengajuan = 0;
    if ($old->getSchemaBuilder()->hasTable('ajuan')) {
        $orderedTableQuery($old, 'ajuan', ['no_permohonan', 'id'])->chunk(500, function ($rows) use (
            &$pengajuanByNomor,
            &$migratedPengajuan,
            $pemohonByAjuan,
            $prodiByName,
            $unitByName,
            $mitraByName,
            $ruangLingkupByName,
            $mapJenisDokumen,
            $mapStatusPengajuan,
            $toDate
        ) {
            foreach ($rows as $row) {
                $noPermohonan = trim((string) ($row->no_permohonan ?? ''));
                if ($noPermohonan === '') {
                    continue;
                }

                $pemohon = $pemohonByAjuan[$noPermohonan] ?? null;
                $unitId = null;
                $prodiKey = strtolower(trim((string) ($row->prodi ?? '')));
                $unitKey = strtolower(trim((string) ($row->unit ?? '')));
                if ($prodiKey !== '' && isset($prodiByName[$prodiKey])) {
                    $unitId = $prodiByName[$prodiKey];
                } elseif ($unitKey !== '' && isset($unitByName[$unitKey])) {
                    $unitId = $unitByName[$unitKey];
                }

                $mitraId = null;
                $mitraKey = strtolower(trim((string) ($row->nama_institusi ?? '')));
                if ($mitraKey !== '' && $mitraByName->has($mitraKey)) {
                    $mitraId = $mitraByName->get($mitraKey);
                }

                $ruangLingkupIds = [];
                foreach (preg_split('/[,;]+/', (string) ($row->ruang_lingkup ?? '')) as $name) {
                    $key = strtolower(trim((string) $name));
                    if ($key !== '' && $ruangLingkupByName->has($key)) {
                        $ruangLingkupIds[] = (int) $ruangLingkupByName->get($key);
                    }
                }
                $ruangLingkupIds = array_values(array_unique($ruangLingkupIds));

                $payload = [
                    'nomor_pengajuan' => $noPermohonan,
                    'nama_pengusul' => ($pemohon['nama'] ?? '') !== '' ? $pemohon['nama'] : trim((string) ($row->nama_pemohon ?? '')),
                    'jabatan_pengusul' => ($pemohon['jabatan'] ?? '') !== '' ? $pemohon['jabatan'] : trim((string) ($row->jabatan_pemohon ?? '')),
                    'email_pengusul' => ($pemohon['email'] ?? '') !== '' ? $pemohon['email'] : trim((string) ($row->email ?? '')),
                    'whatsapp_pengusul' => ($pemohon['wa'] ?? '') !== '' ? $pemohon['wa'] : trim((string) ($row->wa_pemohon ?? '')),
                    'unit_prodi_id' => $unitId,
                    'mitra_id' => $mitraId,
                    'judul_pengajuan' => trim((string) ($row->jenis_ajuan ?? 'Pengajuan Kerjasama')),
                    'deskripsi_pengajuan' => trim((string) ($row->catatan ?? '')) ?: null,
                    'jenis_dokumen' => $mapJenisDokumen((string) ($row->jenis_ajuan ?? '')),
                    'kategori_pengajuan' => strtolower(trim((string) ($row->kategori_institusi ?? ''))) === 'internal' ? 'internal' : 'eksternal',
                    'ruang_lingkup_ids' => empty($ruangLingkupIds) ? null : json_encode($ruangLingkupIds),
                    'tanggal_mulai' => $toDate((string) ($row->tgl_disetujui ?? '')),
                    'tanggal_berakhir' => $toDate((string) ($row->tgl_selesai ?? '')),
                    'status_pengajuan' => $mapStatusPengajuan((string) ($row->status_ajuan ?? '')),
                    'diajukan_pada' => ($toDate((string) ($row->tgl_ajuan ?? '')) ?: now()->toDateString()) . ' 00:00:00',
                    'updated_at' => now(),
                ];

                DB::table('pengajuan')->updateOrInsert(
                    ['nomor_pengajuan' => $noPermohonan],
                    array_merge($payload, ['created_at' => now()])
                );

                $pengajuanId = DB::table('pengajuan')->where('nomor_pengajuan', $noPermohonan)->value('id');
                if ($pengajuanId) {
                    $pengajuanByNomor[$noPermohonan] = (int) $pengajuanId;
                }

                $migratedPengajuan++;
            }
        });
    }

    $migratedPengajuanLog = 0;
    if ($old->getSchemaBuilder()->hasTable('progres')) {
        $orderedTableQuery($old, 'progres', ['id', 'no_permohonan', 'tgl'])->chunk(500, function ($rows) use (&$migratedPengajuanLog, $pengajuanByNomor, $mapStatusPengajuan) {
            foreach ($rows as $row) {
                $noPermohonan = trim((string) ($row->no_permohonan ?? ''));
                if ($noPermohonan === '' || !isset($pengajuanByNomor[$noPermohonan])) {
                    continue;
                }

                DB::table('pengajuan_log')->insert([
                    'pengajuan_id' => $pengajuanByNomor[$noPermohonan],
                    'tipe_log' => 'status',
                    'status_baru' => $mapStatusPengajuan((string) ($row->status ?? '')),
                    'judul_log' => 'Migrasi progres lama',
                    'isi_log' => trim((string) ($row->komentar ?? '')) ?: null,
                    'dibuat_pada' => now(),
                ]);
                $migratedPengajuanLog++;
            }
        });
    }

    $dokumenLegacyByNomor = collect();
    if ($old->getSchemaBuilder()->hasTable('dokumen')) {
        $dokumenLegacyByNomor = $old->table('dokumen')->select([
            'no_dokumen',
            'mitra',
            'jenis_ajuan',
            'bidang',
            'tgl_mulai',
            'tgl_akhir',
            'file',
            'unit',
        ])->whereNotNull('no_dokumen')->get()->keyBy(static fn ($row) => trim((string) $row->no_dokumen));
    }

    $dokumenByNomor = [];
    $migratedDokumen = 0;
    $migratedDokumenFile = 0;

    if ($old->getSchemaBuilder()->hasTable('rekap')) {
        $orderedTableQuery($old, 'rekap', ['id', 'no_dokumen', 'no_permohonan'])->chunk(500, function ($rows) use (
            &$dokumenByNomor,
            &$migratedDokumen,
            &$migratedDokumenFile,
            $dokumenLegacyByNomor,
            $pengajuanByNomor,
            $mitraByName,
            $unitByName,
            $prodiByName,
            $mapJenisDokumen,
            $toDate,
            $ensureLegacyAjuanExists
        ) {
            foreach ($rows as $row) {
                $nomorDokumen = trim((string) ($row->no_dokumen ?? ''));
                if ($nomorDokumen === '') {
                    continue;
                }

                $legacy = $dokumenLegacyByNomor->get($nomorDokumen);
                $sumberNo = trim((string) ($row->no_permohonan ?? ''));
                $sumberPengajuanId = $sumberNo !== '' && isset($pengajuanByNomor[$sumberNo]) ? $pengajuanByNomor[$sumberNo] : null;

                $unitKey = strtolower(trim((string) (($legacy->unit ?? '') ?: '')));
                $unitId = $prodiByName[$unitKey] ?? $unitByName[$unitKey] ?? null;

                $mitraKey = strtolower(trim((string) (($legacy->mitra ?? '') ?: '')));
                $mitraId = $mitraKey !== '' && $mitraByName->has($mitraKey) ? $mitraByName->get($mitraKey) : null;

                $tanggalMulai = $toDate((string) ($row->tgl_awal ?? '')) ?: $toDate((string) ($legacy->tgl_mulai ?? ''));
                $tanggalBerakhir = $toDate((string) ($row->tgl_ahir ?? '')) ?: $toDate((string) ($legacy->tgl_akhir ?? ''));

                $statusSiklus = 'active';
                if ($tanggalBerakhir && $tanggalBerakhir < now()->toDateString()) {
                    $statusSiklus = 'archived';
                } elseif ($tanggalBerakhir && $tanggalBerakhir <= now()->addDays(90)->toDateString()) {
                    $statusSiklus = 'expiring';
                }

                $noPermohonanDokumen = $sumberNo !== '' ? $sumberNo : 'LEGACY-' . $nomorDokumen;
                $ensureLegacyAjuanExists($noPermohonanDokumen);

                $payload = [
                    'nomor_dokumen' => $nomorDokumen,
                    'no_dokumen' => $nomorDokumen,
                    'no_permohonan' => $noPermohonanDokumen,
                    'sumber_pengajuan_id' => $sumberPengajuanId,
                    'unit_prodi_id' => $unitId,
                    'mitra_id' => $mitraId,
                    'jenis_dokumen' => $mapJenisDokumen((string) (($legacy->jenis_ajuan ?? '') ?: 'MOU')),
                    'judul_dokumen' => trim((string) (($legacy->bidang ?? '') ?: 'Dokumen Kerjasama ' . $nomorDokumen)),
                    'nama_dokumen' => 'Dokumen Kerjasama ' . $nomorDokumen,
                    'tanggal_mulai' => $tanggalMulai,
                    'tanggal_berakhir' => $tanggalBerakhir,
                    'status_siklus' => $statusSiklus,
                    'keterangan' => 'Migrasi dari tabel rekap/dokumen lama',
                    'updated_at' => now(),
                ];

                $filePath = trim((string) ($row->file ?? ''));
                if ($filePath === '') {
                    $filePath = trim((string) ($legacy->file ?? ''));
                }
                $payload['file'] = $filePath !== '' ? $filePath : 'legacy/' . $nomorDokumen . '.pdf';

                DB::table('dokumen_kerjasama')->updateOrInsert(
                    ['nomor_dokumen' => $nomorDokumen],
                    array_merge($payload, ['created_at' => now()])
                );

                $dokumenId = DB::table('dokumen_kerjasama')->where('nomor_dokumen', $nomorDokumen)->value('id');
                if ($dokumenId) {
                    $dokumenByNomor[$nomorDokumen] = (int) $dokumenId;
                }

                if ($dokumenId && $filePath !== '') {
                    DB::table('dokumen_file')->updateOrInsert(
                        [
                            'dokumen_id' => $dokumenId,
                            'path_file' => $filePath,
                        ],
                        [
                            'peran_berkas' => 'final',
                            'nama_file' => basename($filePath),
                            'updated_at' => now(),
                            'created_at' => now(),
                        ]
                    );
                    $migratedDokumenFile++;
                }

                $migratedDokumen++;
            }
        });
    }

    if ($old->getSchemaBuilder()->hasTable('arsip')) {
        $orderedTableQuery($old, 'arsip', ['id', 'nama_file'])->chunk(500, function ($rows) use (&$migratedDokumen, &$migratedDokumenFile, $ensureLegacyAjuanExists) {
            foreach ($rows as $row) {
                $fileName = trim((string) ($row->nama_file ?? ''));
                if ($fileName === '') {
                    continue;
                }

                $arsipKey = trim((string) ($row->id ?? $row->nama_file));
                $nomorDokumen = 'ARSIP-' . md5($arsipKey);
                $noPermohonanArsip = 'LEGACY-' . $nomorDokumen;
                $ensureLegacyAjuanExists($noPermohonanArsip);
                DB::table('dokumen_kerjasama')->updateOrInsert(
                    ['nomor_dokumen' => $nomorDokumen],
                    [
                        'no_permohonan' => $noPermohonanArsip,
                        'no_dokumen' => $nomorDokumen,
                        'nama_dokumen' => 'Arsip ' . $nomorDokumen,
                        'jenis_dokumen' => 'MOU',
                        'judul_dokumen' => trim((string) ($row->jenis ?? 'Arsip Dokumen')),
                        'status_siklus' => 'archived',
                        'alasan_arsip' => trim((string) ($row->catatan ?? '')) ?: 'Migrasi tabel arsip lama',
                        'file' => $fileName,
                        'keterangan' => 'Migrasi dari tabel arsip lama',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]
                );

                $dokumenId = DB::table('dokumen_kerjasama')->where('nomor_dokumen', $nomorDokumen)->value('id');
                if ($dokumenId) {
                    DB::table('dokumen_file')->updateOrInsert(
                        [
                            'dokumen_id' => $dokumenId,
                            'path_file' => $fileName,
                        ],
                        [
                            'peran_berkas' => 'arsip',
                            'nama_file' => basename($fileName),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]
                    );
                    $migratedDokumenFile++;
                }

                $migratedDokumen++;
            }
        });
    }

    $migratedDokumenLog = 0;
    if ($old->getSchemaBuilder()->hasTable('monitoring')) {
        $orderedTableQuery($old, 'monitoring', ['id', 'nomor', 'tgl_monitoring'])->chunk(500, function ($rows) use (&$migratedDokumenLog, $dokumenByNomor) {
            foreach ($rows as $row) {
                $nomor = trim((string) ($row->nomor ?? ''));
                if ($nomor === '' || !isset($dokumenByNomor[$nomor])) {
                    continue;
                }

                DB::table('dokumen_log')->insert([
                    'dokumen_id' => $dokumenByNomor[$nomor],
                    'tipe_log' => 'aktivitas',
                    'judul_log' => trim((string) ($row->judul ?? 'Monitoring Lama')),
                    'isi_log' => trim((string) ($row->manfaat ?? '')) ?: null,
                    'payload_json' => json_encode([
                        'status' => $row->status,
                        'pic' => $row->pic,
                        'tgl_monitoring' => $row->tgl_monitoring,
                    ]),
                    'dibuat_pada' => now(),
                ]);

                $migratedDokumenLog++;
            }
        });
    }

    if ($old->getSchemaBuilder()->hasTable('monitoring_unit')) {
        $orderedTableQuery($old, 'monitoring_unit', ['id', 'no_dokumen', 'tanggal'])->chunk(500, function ($rows) use (&$migratedDokumenLog, $dokumenByNomor) {
            foreach ($rows as $row) {
                $nomor = trim((string) ($row->no_dokumen ?? ''));
                if ($nomor === '' || !isset($dokumenByNomor[$nomor])) {
                    continue;
                }

                DB::table('dokumen_log')->insert([
                    'dokumen_id' => $dokumenByNomor[$nomor],
                    'tipe_log' => 'aktivitas',
                    'judul_log' => trim((string) ($row->judul ?? 'Monitoring Unit Lama')),
                    'isi_log' => trim((string) ($row->manfaat ?? '')) ?: null,
                    'payload_json' => json_encode([
                        'mitra' => $row->mitra,
                        'unit' => $row->unit,
                        'tanggal' => $row->tanggal,
                    ]),
                    'dibuat_pada' => now(),
                ]);

                $migratedDokumenLog++;
            }
        });
    }

    if ($old->getSchemaBuilder()->hasTable('m_moa')) {
        $orderedTableQuery($old, 'm_moa', ['id', 'nomor'])->chunk(500, function ($rows) use (&$migratedDokumen, &$migratedDokumenLog, $dokumenByNomor, $mapJenisDokumen, $toDate, $ensureLegacyAjuanExists) {
            foreach ($rows as $row) {
                $nomor = trim((string) ($row->nomor ?? ''));
                if ($nomor === '') {
                    continue;
                }

                $noPermohonanMoa = 'LEGACY-' . $nomor;
                $ensureLegacyAjuanExists($noPermohonanMoa);

                DB::table('dokumen_kerjasama')->updateOrInsert(
                    ['nomor_dokumen' => $nomor],
                    [
                        'no_permohonan' => $noPermohonanMoa,
                        'no_dokumen' => $nomor,
                        'nama_dokumen' => 'Dokumen MOA ' . $nomor,
                        'jenis_dokumen' => $mapJenisDokumen('MOA'),
                        'judul_dokumen' => trim((string) ($row->judul_kegiatan ?? 'MOA Legacy')),
                        'tanggal_mulai' => $toDate((string) ($row->tgl_mulai ?? '')),
                        'tanggal_berakhir' => $toDate((string) ($row->tgl_berakhir ?? '')),
                        'keterangan' => 'Migrasi dari tabel m_moa lama',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]
                );

                $dokumenId = DB::table('dokumen_kerjasama')->where('nomor_dokumen', $nomor)->value('id');
                if ($dokumenId) {
                    DB::table('dokumen_log')->insert([
                        'dokumen_id' => $dokumenId,
                        'tipe_log' => 'aktivitas',
                        'judul_log' => 'Migrasi m_moa',
                        'isi_log' => trim((string) ($row->manfaat ?? '')) ?: null,
                        'payload_json' => json_encode([
                            'periode' => $row->periode,
                            'status' => $row->status,
                            'pic' => $row->pic,
                        ]),
                        'dibuat_pada' => now(),
                    ]);
                    $migratedDokumenLog++;
                }

                $migratedDokumen++;
            }
        });
    }

    $this->info('Migrasi selesai. Ringkasan:');
    $this->line('- pengajuan: ' . $migratedPengajuan);
    $this->line('- pengajuan_log: ' . $migratedPengajuanLog);
    $this->line('- dokumen_kerjasama: ' . $migratedDokumen);
    $this->line('- dokumen_file: ' . $migratedDokumenFile);
    $this->line('- dokumen_log: ' . $migratedDokumenLog);
})->purpose('Migrasi data tabel lama SIKERMA ke skema simplified v2');

Artisan::command('legacy:backfill-relasi-from-sikerma', function () {
    $sourceHost = (string) env('SOURCE_PG_HOST', env('DB_HOST', '127.0.0.1'));
    $sourcePort = (string) env('SOURCE_PG_PORT', env('DB_PORT', '5432'));
    $sourceDb = (string) env('SOURCE_PG_DATABASE', 'Sikerma');
    $sourceUser = (string) env('SOURCE_PG_USERNAME', env('DB_USERNAME', 'postgres'));
    $sourcePass = (string) env('SOURCE_PG_PASSWORD', env('DB_PASSWORD', ''));

    try {
        $pdo = new PDO(
            "pgsql:host={$sourceHost};port={$sourcePort};dbname={$sourceDb}",
            $sourceUser,
            $sourcePass,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    } catch (\Throwable $e) {
        $this->error('Gagal konek ke source PG: ' . $e->getMessage());
        return;
    }

    $this->info("Backfill relasi dari source DB: {$sourceDb}");

    try {
        $rows = $pdo->query(
            'SELECT no_permohonan, nama_pemohon, nama_institusi, kategori_institusi, unit, prodi, email, wa_pemohon FROM ajuan'
        )->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
        $this->error('Gagal baca tabel ajuan dari source DB: ' . $e->getMessage());
        return;
    }

    if (empty($rows)) {
        $this->warn('Data ajuan source kosong, tidak ada yang dibackfill.');
        return;
    }

    $masterUnit = DB::table('master_unit_prodi')->select(['id', 'nama', 'jenis_node'])->get();
    $unitByName = [];
    $prodiByName = [];
    foreach ($masterUnit as $row) {
        $key = strtolower(trim((string) $row->nama));
        if ($key === '') {
            continue;
        }
        if ($row->jenis_node === 'prodi') {
            $prodiByName[$key] = (int) $row->id;
        } else {
            $unitByName[$key] = (int) $row->id;
        }
    }

    $createdMitra = 0;
    $updatedPengajuan = 0;
    $updatedMitraId = 0;
    $updatedUnitId = 0;
    $updatedNamaPengusul = 0;

    DB::transaction(function () use (
        $rows,
        &$createdMitra,
        &$updatedPengajuan,
        &$updatedMitraId,
        &$updatedUnitId,
        &$updatedNamaPengusul,
        $prodiByName,
        $unitByName
    ) {
        foreach ($rows as $row) {
            $noPermohonan = trim((string) ($row['no_permohonan'] ?? ''));
            if ($noPermohonan === '') {
                continue;
            }

            $namaInstitusi = trim((string) ($row['nama_institusi'] ?? ''));
            $mitraId = null;
            if ($namaInstitusi !== '' && $namaInstitusi !== '-') {
                $existingMitra = DB::table('master_mitra')
                    ->whereRaw('LOWER(TRIM(nama_mitra)) = ?', [strtolower($namaInstitusi)])
                    ->first();

                if (!$existingMitra) {
                    $mitraId = DB::table('master_mitra')->insertGetId([
                        'nama_mitra' => $namaInstitusi,
                        'kategori_mitra' => trim((string) ($row['kategori_institusi'] ?? '')) ?: null,
                        'email_mitra' => trim((string) ($row['email'] ?? '')) ?: null,
                        'telepon_mitra' => trim((string) ($row['wa_pemohon'] ?? '')) ?: null,
                        'aktif' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $createdMitra++;
                } else {
                    $mitraId = (int) $existingMitra->id;
                }
            }

            $unitKey = strtolower(trim((string) ($row['unit'] ?? '')));
            $prodiKey = strtolower(trim((string) ($row['prodi'] ?? '')));
            $unitProdiId = null;
            if ($prodiKey !== '' && $prodiKey !== '-' && isset($prodiByName[$prodiKey])) {
                $unitProdiId = $prodiByName[$prodiKey];
            } elseif ($unitKey !== '' && $unitKey !== '-' && isset($unitByName[$unitKey])) {
                $unitProdiId = $unitByName[$unitKey];
            }

            $pengajuan = DB::table('pengajuan')
                ->select(['id', 'mitra_id', 'unit_prodi_id', 'nama_pengusul'])
                ->where('nomor_pengajuan', $noPermohonan)
                ->first();

            if (!$pengajuan) {
                continue;
            }

            $payload = ['updated_at' => now()];
            $changed = false;

            if ($mitraId && (int) ($pengajuan->mitra_id ?? 0) !== $mitraId) {
                $payload['mitra_id'] = $mitraId;
                $updatedMitraId++;
                $changed = true;
            }

            if ($unitProdiId && (int) ($pengajuan->unit_prodi_id ?? 0) !== $unitProdiId) {
                $payload['unit_prodi_id'] = $unitProdiId;
                $updatedUnitId++;
                $changed = true;
            }

            $namaPemohon = trim((string) ($row['nama_pemohon'] ?? ''));
            if ($namaPemohon !== '' && $namaPemohon !== '-' && trim((string) ($pengajuan->nama_pengusul ?? '')) !== $namaPemohon) {
                $payload['nama_pengusul'] = $namaPemohon;
                $updatedNamaPengusul++;
                $changed = true;
            }

            if ($changed) {
                DB::table('pengajuan')->where('id', $pengajuan->id)->update($payload);
                $updatedPengajuan++;
            }
        }
    });

    $this->info('Backfill selesai. Ringkasan:');
    $this->line('- master_mitra dibuat: ' . $createdMitra);
    $this->line('- pengajuan terupdate: ' . $updatedPengajuan);
    $this->line('- pengajuan.mitra_id terisi: ' . $updatedMitraId);
    $this->line('- pengajuan.unit_prodi_id terisi: ' . $updatedUnitId);
    $this->line('- pengajuan.nama_pengusul terupdate: ' . $updatedNamaPengusul);
})->purpose('Backfill relasi pengajuan (mitra/unit) dari database source Sikerma');

Artisan::command('master-mitra:bersihkan-whitespace-nama {--apply : Terapkan perubahan ke database (default hanya preview/dry-run)}', function () {
    // Sebagian nama_mitra di data lama diawali/diakhiri karakter whitespace
    // tidak standar (non-breaking space U+00A0, tab, dsb) — bukan spasi biasa.
    // JS `.trim()` di halaman Data Kemitraan (frontend) membuang karakter itu
    // saat menggabungkan baris bernama sama, tapi baris di database tetap
    // menyimpan karakter itu apa adanya. Command ini merapikan nama_mitra
    // supaya konsisten, tanpa mengubah/menghapus baris (tidak menggabungkan
    // baris yang memang benar-benar terinput dobel).
    $apply = (bool) $this->option('apply');

    $normalize = static function (?string $nama): string {
        $nama = (string) $nama;
        $nama = preg_replace('/[\x{00A0}\x{FEFF}\t\n\r]+/u', ' ', $nama) ?? $nama;

        return trim($nama);
    };

    $changes = [];
    foreach (DB::table('master_mitra')->select('id', 'nama_mitra')->orderBy('id')->get() as $row) {
        $clean = $normalize($row->nama_mitra);
        if ($clean !== '' && $clean !== $row->nama_mitra) {
            $changes[] = ['id' => $row->id, 'before' => $row->nama_mitra, 'after' => $clean];
        }
    }

    if (empty($changes)) {
        $this->info('Tidak ada nama_mitra yang perlu dibersihkan.');
        return;
    }

    $this->info(count($changes) . ' nama_mitra mengandung whitespace tidak standar:');
    foreach ($changes as $c) {
        $this->line(sprintf('  #%d: [%s] -> "%s"', $c['id'], bin2hex($c['before']), $c['after']));
    }

    if (!$apply) {
        $this->warn('Ini baru preview (dry-run). Jalankan ulang dengan --apply untuk benar-benar mengubah data.');
        return;
    }

    DB::transaction(function () use ($changes) {
        foreach ($changes as $c) {
            DB::table('master_mitra')->where('id', $c['id'])->update([
                'nama_mitra' => $c['after'],
                'updated_at' => now(),
            ]);
        }
    });

    $this->info(count($changes) . ' nama_mitra berhasil dibersihkan.');
})->purpose('Bersihkan whitespace tidak standar (non-breaking space/tab) di nama_mitra');

Artisan::command('legacy:audit-simplified', function () {
    $requiredTables = ['pengajuan', 'pengajuan_log', 'dokumen_kerjasama', 'dokumen_file', 'dokumen_log'];
    foreach ($requiredTables as $table) {
        if (!Schema::hasTable($table)) {
            $this->error("Tabel {$table} belum ada. Jalankan migration terlebih dahulu.");
            return;
        }
    }

    $summary = [
        'pengajuan' => DB::table('pengajuan')->count(),
        'pengajuan_log' => DB::table('pengajuan_log')->count(),
        'dokumen_kerjasama' => DB::table('dokumen_kerjasama')->count(),
        'dokumen_file' => DB::table('dokumen_file')->count(),
        'dokumen_log' => DB::table('dokumen_log')->count(),
    ];

    $orphanPengajuanLog = DB::table('pengajuan_log as pl')
        ->leftJoin('pengajuan as p', 'p.id', '=', 'pl.pengajuan_id')
        ->whereNull('p.id')
        ->count();

    $orphanDokumenFile = DB::table('dokumen_file as df')
        ->leftJoin('dokumen_kerjasama as dk', 'dk.id', '=', 'df.dokumen_id')
        ->whereNull('dk.id')
        ->count();

    $orphanDokumenLog = DB::table('dokumen_log as dl')
        ->leftJoin('dokumen_kerjasama as dk', 'dk.id', '=', 'dl.dokumen_id')
        ->whereNull('dk.id')
        ->count();

    $dokumenTanpaFile = DB::table('dokumen_kerjasama as dk')
        ->leftJoin('dokumen_file as df', 'df.dokumen_id', '=', 'dk.id')
        ->whereNull('df.id')
        ->count();

    $dokumenTanggalTidakValid = DB::table('dokumen_kerjasama')
        ->whereNotNull('tanggal_mulai')
        ->whereNotNull('tanggal_berakhir')
        ->whereColumn('tanggal_berakhir', '<', 'tanggal_mulai')
        ->count();

    $this->info('Ringkasan data simplified:');
    foreach ($summary as $key => $value) {
        $this->line("- {$key}: {$value}");
    }

    $this->info('Pemeriksaan integritas:');
    $this->line('- orphan pengajuan_log: ' . $orphanPengajuanLog);
    $this->line('- orphan dokumen_file: ' . $orphanDokumenFile);
    $this->line('- orphan dokumen_log: ' . $orphanDokumenLog);
    $this->line('- dokumen_kerjasama tanpa dokumen_file: ' . $dokumenTanpaFile);
    $this->line('- dokumen_kerjasama tanggal tidak valid: ' . $dokumenTanggalTidakValid);
})->purpose('Audit integritas data pada skema simplified v2');
