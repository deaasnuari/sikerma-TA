<?php

namespace App\Services;

use App\Models\MasterUnitProdi;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Menentukan jabatan struktural (Ketua Jurusan / Ketua Prodi / Kepala Unit / Dosen biasa)
 * untuk user role `internal`, berdasarkan data dari Civitas API (Jurusan/Prodi/Unit) —
 * BUKAN dengan menambah role database baru. Role tetap `internal`; ini cuma level akses
 * di dalamnya (lihat instruksi user: "Ketua Jurusan, Ketua Prodi, Kepala Unit, Dosen biasa
 * adalah level akses/scoping di dalam role internal").
 *
 * CATATAN PENTING (sementara, sampai UPA TIK kasih ID yang konsisten — lihat pesan yang
 * sudah disiapkan untuk ditanyakan): field ID_KAJUR/ID_KPS/ID_KEPALA_UNIT dari Civitas API
 * TERBUKTI beda ID-space dari NIK yang dikembalikan saat login (dicek dengan akun nyata:
 * NIK login Ridwan Purwanto = 210084, tapi ID_KEPALA_UNIT dia = 179). Karena itu pencocokan
 * di sini SEMENTARA pakai NAMA (case-insensitive), bukan ID — punya risiko salah kalau ada
 * nama kembar/beda ejaan. Ganti ke pencocokan by-ID begitu field yang konsisten tersedia.
 */
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

        // Fitur ini cuma berlaku untuk role internal (dosen/staf civitas) — role lain
        // (admin/pimpinan/external) tetap pakai mekanisme akses existing mereka masing-masing.
        if (strtolower(trim((string) $user->role)) !== 'internal') {
            return $default;
        }

        $namaUser = $this->normalizeNama($user->name);
        if ($namaUser === '') {
            return $default;
        }

        // Ketua Jurusan
        foreach ($this->civitas->getJurusan() as $row) {
            if ($this->normalizeNama($row['NAMA_KAJUR'] ?? '') === $namaUser && $namaUser !== '') {
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
            if ($this->normalizeNama($row['NAMA_KPS'] ?? '') === $namaUser) {
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
            if ($this->normalizeNama($row['NAMA_KEPALA_UNIT'] ?? '') === $namaUser) {
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

        return $default;
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
            'kepala_unit' => [(int) $access['unit_id']],
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
}
