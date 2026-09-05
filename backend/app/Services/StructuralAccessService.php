<?php

namespace App\Services;

use App\Models\MasterUnitProdi;
use App\Models\User;
use Illuminate\Support\Facades\Log;

//ini adalah service untuk mengatur akses structural user (ketua jurusan, ketua prodi, kepala unit) ke pengajuan_v2 & dokumen_kerjasama.
class StructuralAccessService
{
    public function __construct(private CivitasStructureService $civitas)
    {
    }

    /**
     * @return array{role: string, structural_position: string, jurusan_id: ?int, program_studi_id: ?int, unit_id: ?int}
     */
    public function getUserStructuralAccess(User $user): array
    {
        $default = [
            'role' => (string) $user->role,
            'structural_position' => 'dosen',
            'jurusan_id' => null,
            'program_studi_id' => null,
            'unit_id' => null,
        ];

        // Fitur ini berlaku untuk role internal/unit/jurusan/prodi — role turunan hasil
        // deteksi otomatis (lihat determineCivitasRole()) atau yang di-set manual admin.
        // Deteksi Kajur/KPS/Kepala-Unit-nya sama untuk semuanya: dicocokkan by NIK, tidak
        // bergantung role spesifik apa. Role lain (admin/pimpinan/external) tetap pakai
        // mekanisme akses existing mereka masing-masing.
        if (!in_array(strtolower(trim((string) $user->role)), ['internal', 'unit', 'jurusan', 'prodi'], true)) {
            return $default;
        }

        // Identifier-nya NIK (bukan nama) — NIK didapat dari login LDAP (data.NIK, lihat
        // AuthController::loginLdap()) dan dicocokkan ke NIK_KAJUR/NIK_KPS/NIK_KEPALA_UNIT
        // dari API struktur kampus. NIK unik & stabil, beda dari nama yang bisa kembar/beda
        // ejaan. (Sebelumnya sempat pakai nama sebagai workaround karena versi API lama
        // punya field ID kepala yang beda id-space dari NIK login — sudah diperbaiki
        // UPA TIK, NIK_KAJUR/NIK_KPS/NIK_KEPALA_UNIT sekarang konsisten dengan NIK login.)
        $nikUser = $this->normalizeNik($user->nik);

        // Kalau NIK kosong (mis. akun 'unit' dibuat admin manual lewat Manajemen User,
        // bukan lewat login LDAP), tidak ada yang bisa dicocokkan ke Civitas — langsung
        // lompat ke fallback unit_prodi_id di bawah, jangan return $default di sini
        // (itu akan melewatkan fallback-nya sama sekali).
        if ($nikUser === '') {
            return $this->resolveAssignedUnitFallback($user) ?? $default;
        }

        // Ketua Jurusan
        foreach ($this->civitas->getJurusan() as $row) {
            if ($this->normalizeNik($row['NIK_KAJUR'] ?? '') === $nikUser) {
                $jurusanId = $this->resolveMasterUnitProdiId(
                    kodeKampus: (string) ($row['ID_JURUSAN'] ?? ''),
                    jenisNode: 'unit',
                    kategoriUnit: 'jurusan',
                    namaKampus: (string) ($row['NAMA_JURUSAN'] ?? ''),
                );

                if ($jurusanId !== null) {
                    return [
                        'role' => (string) $user->role,
                        'structural_position' => 'ketua_jurusan',
                        'jurusan_id' => $jurusanId,
                        'program_studi_id' => null,
                        'unit_id' => null,
                    ];
                }

                Log::warning('StructuralAccessService: user cocok sebagai Kajur tapi jurusan-nya belum termapping ke master_unit_prodi', [
                    'user_id' => $user->id,
                    'nama_jurusan' => $row['NAMA_JURUSAN'] ?? null,
                ]);
            }
        }

        // Ketua Program Studi
        foreach ($this->civitas->getProgramStudi() as $row) {
            if ($this->normalizeNik($row['NIK_KPS'] ?? '') === $nikUser) {
                $prodiId = $this->resolveMasterUnitProdiId(
                    kodeKampus: (string) ($row['ID_PROGRAM_STUDI'] ?? ''),
                    jenisNode: 'prodi',
                    kategoriUnit: null,
                    namaKampus: (string) ($row['NAMA_PROGRAM_STUDI'] ?? ''),
                );

                if ($prodiId !== null) {
                    return [
                        'role' => (string) $user->role,
                        'structural_position' => 'ketua_prodi',
                        'jurusan_id' => null,
                        'program_studi_id' => $prodiId,
                        'unit_id' => null,
                    ];
                }

                Log::warning('StructuralAccessService: user cocok sebagai KPS tapi prodi-nya belum termapping ke master_unit_prodi', [
                    'user_id' => $user->id,
                    'nama_program_studi' => $row['NAMA_PROGRAM_STUDI'] ?? null,
                ]);
            }
        }

        // Kepala Unit
        foreach ($this->civitas->getUnit() as $row) {
            if ($this->normalizeNik($row['NIK_KEPALA_UNIT'] ?? '') === $nikUser) {
                $unitId = $this->resolveMasterUnitProdiId(
                    kodeKampus: (string) ($row['ID_UNIT'] ?? ''),
                    jenisNode: 'unit',
                    kategoriUnit: 'unit_kerja',
                    namaKampus: (string) ($row['NAMA_UNIT'] ?? ''),
                );

                if ($unitId !== null) {
                    return [
                        'role' => (string) $user->role,
                        'structural_position' => 'kepala_unit',
                        'jurusan_id' => null,
                        'program_studi_id' => null,
                        'unit_id' => $unitId,
                    ];
                }

                Log::warning('StructuralAccessService: user cocok sebagai Kepala Unit tapi unit-nya belum termapping ke master_unit_prodi', [
                    'user_id' => $user->id,
                    'nama_unit' => $row['NAMA_UNIT'] ?? null,
                ]);
            }
        }

        // Tidak terdeteksi jabatan struktural apa pun via NIK (bukan Kajur/KPS/Kepala Unit
        // beneran di data resmi Civitas) — fallback ke Unit yang di-assign ADMIN secara
        // manual lewat Manajemen User (users.unit_prodi_id).
        return $this->resolveAssignedUnitFallback($user) ?? $default;
    }

    /**
     * Unit yang di-assign ADMIN secara manual lewat Manajemen User (users.unit_prodi_id) —
     * cuma berlaku untuk role 'unit'. Ini melayani akun 'unit' yang memang sengaja dibuat
     * admin untuk mewakili sebuah unit kerja (mis. akun bersama Pokja/UPA), bukan personel
     * yang terverifikasi sebagai Kepala Unit resmi lewat NIK. Null kalau tidak ada
     * assignment (pemanggil fallback ke $default).
     *
     * @return array{role: string, structural_position: string, jurusan_id: ?int, program_studi_id: ?int, unit_id: ?int}|null
     */
    private function resolveAssignedUnitFallback(User $user): ?array
    {
        if (strtolower(trim((string) $user->role)) !== 'unit' || $user->unit_prodi_id === null) {
            return null;
        }

        return [
            'role' => (string) $user->role,
            'structural_position' => 'unit_ditugaskan',
            'jurusan_id' => null,
            'program_studi_id' => null,
            'unit_id' => (int) $user->unit_prodi_id,
        ];
    }

    /**
     * Tentukan role civitas yang seharusnya dipasang ke user (dipanggil tiap login LDAP
     * berhasil, lihat AuthController::loginLdap()) — 'jurusan'/'prodi'/'unit' kalau dia
     * ketua/kepala (dicocokkan by NIK, sama seperti getUserStructuralAccess()), atau
     * best-effort dari UNIT_KERJA (teks bebas dari Civitas) kalau bukan ketua tapi
     * "rumahnya" ketemu di Jurusan/Prodi/Unit tertentu (lihat resolveAffiliationFromFreeText()
     * — Prodi cuma dicocokkan exact, bukan longgar, karena nama-nama Prodi sering mirip
     * satu sama lain, mis. "Diploma 3 Teknik Informatika" vs prodi lain di jurusan yang
     * sama — matching longgar berisiko salah pilih di antara keduanya). Gagal match sama
     * sekali -> tetap 'internal', tidak dipaksakan.
     *
     * PENTING: ini cuma menentukan LABEL role, bukan hak akses — hak akses/scope tetap
     * dihitung live oleh getUserStructuralAccess() tiap request berdasarkan NIK, jadi
     * dosen yang "rumahnya" di Jurusan X (role jadi 'jurusan') TIDAK otomatis dapat akses
     * seluas Ketua Jurusan X kalau dia sendiri bukan Kajur-nya (NIK-nya tidak cocok
     * NIK_KAJUR) — getUserStructuralAccess() tetap akan balikin 'dosen' buat dia.
     */
    public function determineCivitasRole(User $user, ?string $unitKerjaFreeText): string
    {
        $access = $this->getUserStructuralAccess($user);

        $roleFromPosition = match ($access['structural_position']) {
            'ketua_jurusan' => 'jurusan',
            'ketua_prodi'   => 'prodi',
            'kepala_unit'   => 'unit',
            default         => null,
        };

        if ($roleFromPosition !== null) {
            return $roleFromPosition;
        }

        return $this->resolveAffiliationFromFreeText($unitKerjaFreeText) ?? 'internal';
    }

    /**
     * Cocokkan teks bebas (UNIT_KERJA dari Civitas) ke nama Prodi/Jurusan/Unit Kerja yang
     * ada di master_unit_prodi — best-effort, bukan pencarian ID resmi (tidak ada
     * kode_kampus buat dicocokkan di sini, cuma nama).
     *
     * Urutan: Prodi (EXACT match saja) dicoba duluan — kalau UNIT_KERJA persis sama
     * dengan nama sebuah Prodi (mis. "Diploma 3 Teknik Informatika"), itu sinyal paling
     * spesifik & akurat. Prodi SENGAJA tidak dicoba dengan matching longgar (substring) —
     * nama-nama Prodi sering mirip satu sama lain/dengan nama Jurusan induknya (mis.
     * Jurusan "Teknik Informatika" vs Prodi "Diploma 3 Teknik Informatika"), matching
     * longgar berisiko salah pilih Prodi. Kalau tidak ketemu exact match Prodi, baru coba
     * Jurusan (longgar), lalu Unit Kerja (longgar) — sama seperti sebelumnya. Null kalau
     * tidak ketemu match sama sekali — sengaja tidak dipaksakan.
     */
    private function resolveAffiliationFromFreeText(?string $unitKerjaFreeText): ?string
    {
        $target = $this->normalizeNama($unitKerjaFreeText);
        if ($target === '') {
            return null;
        }

        $adaProdiCocokPersis = MasterUnitProdi::query()
            ->where('jenis_node', 'prodi')
            ->pluck('nama')
            ->contains(fn ($nama) => $this->normalizeNama($nama) === $target);
        if ($adaProdiCocokPersis) {
            return 'prodi';
        }

        $matchesTarget = function (string $nama) use ($target): bool {
            $candidate = $this->normalizeNama($nama);

            return $candidate === $target
                || str_contains($candidate, $target)
                || str_contains($target, $candidate);
        };

        $adaJurusanCocok = MasterUnitProdi::query()
            ->where('jenis_node', 'unit')->where('kategori_unit', 'jurusan')
            ->pluck('nama')
            ->contains($matchesTarget);
        if ($adaJurusanCocok) {
            return 'jurusan';
        }

        $adaUnitCocok = MasterUnitProdi::query()
            ->where('jenis_node', 'unit')->where('kategori_unit', 'unit_kerja')
            ->pluck('nama')
            ->contains($matchesTarget);
        if ($adaUnitCocok) {
            return 'unit';
        }

        return null;
    }

    /**
     * Daftar id master_unit_prodi yang boleh dilihat user, berdasarkan hasil
     * getUserStructuralAccess() — dipakai untuk filter kolom unit_prodi_id di
     * pengajuan_v2 & dokumen_kerjasama. null artinya "bukan pejabat struktural,
     * tidak ada scope tambahan" (pemanggil tetap pakai filter kepemilikan sendiri).
     *
     * @param  array{structural_position: string, jurusan_id: ?int, program_studi_id: ?int, unit_id: ?int}  $access
     * @return array<int, int>|null
     */
    public function resolveScopedUnitProdiIds(array $access): ?array
    {
        return match ($access['structural_position']) {
            'ketua_jurusan' => $this->jurusanAndChildProdiIds((int) $access['jurusan_id']),
            'ketua_prodi' => [(int) $access['program_studi_id']],
            'kepala_unit', 'unit_ditugaskan' => [(int) $access['unit_id']],
            default => null,
        };
    }

    /**
     * Ketua Jurusan boleh lihat pengajuan Jurusan-nya sendiri MAUPUN seluruh
     * Prodi di bawah jurusan itu (parent_id), sesuai instruksi user (skenario 2).
     *
     * @return array<int, int>
     */
    private function jurusanAndChildProdiIds(int $jurusanId): array
    {
        $childProdiIds = MasterUnitProdi::query()
            ->where('parent_id', $jurusanId)
            ->pluck('id')
            ->all();

        return array_values(array_unique([$jurusanId, ...$childProdiIds]));
    }

    /**
     * Cari baris master_unit_prodi yang berkorespondensi dengan baris dari Civitas API.
     * Prioritas: kode_kampus (kalau sudah pernah di-sync/dipetakan manual oleh admin) —
     * fallback ke pencocokan nama (case-insensitive, longgar) untuk yang belum di-sync.
     */
    private function resolveMasterUnitProdiId(
        string $kodeKampus,
        string $jenisNode,
        ?string $kategoriUnit,
        string $namaKampus,
    ): ?int {
        $query = MasterUnitProdi::query()->where('jenis_node', $jenisNode);
        if ($kategoriUnit !== null) {
            $query->where('kategori_unit', $kategoriUnit);
        }

        if ($kodeKampus !== '') {
            $byKode = (clone $query)->where('kode_kampus', $kodeKampus)->first();
            if ($byKode) {
                return $byKode->id;
            }
        }

        $namaTarget = $this->normalizeNama($namaKampus);
        if ($namaTarget === '') {
            return null;
        }

        foreach ((clone $query)->get(['id', 'nama']) as $candidate) {
            $namaCandidate = $this->normalizeNama($candidate->nama);
            if ($namaCandidate === $namaTarget
                || str_contains($namaCandidate, $namaTarget)
                || str_contains($namaTarget, $namaCandidate)
            ) {
                return $candidate->id;
            }
        }

        return null;
    }

    private function normalizeNama(?string $nama): string
    {
        $nama = (string) $nama;
        $nama = preg_replace('/[\x{00A0}\x{FEFF}\t\n\r]+/u', ' ', $nama) ?? $nama;

        return mb_strtolower(trim($nama));
    }

    /**
     * NIK dibandingkan apa adanya (bukan lowercase — NIK cuma angka), tapi tetap dibuang
     * whitespace tak standar di pinggirnya (kasus yang sama seperti nama_mitra: sebagian
     * data dari API/DB bisa kebawa spasi/tab nyempil).
     */
    private function normalizeNik(?string $nik): string
    {
        $nik = (string) $nik;
        $nik = preg_replace('/[\x{00A0}\x{FEFF}\t\n\r]+/u', ' ', $nik) ?? $nik;

        return trim($nik);
    }
}
