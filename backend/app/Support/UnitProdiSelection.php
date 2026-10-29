<?php

namespace App\Support;

use App\Models\MasterUnitProdi;
use Illuminate\Validation\ValidationException;

/**
 * Pilihan jurusan/prodi majemuk pada form pengajuan & dokumen kerja sama.
 *
 * Request membawa unit_prodi_ids (prodi/unit terpilih, urutan pertama = utama) dan opsional
 * jurusan_ids; keduanya BUKAN kolom tabel, jadi dicabut dari data tervalidasi di sini lalu
 * disimpan lewat HasMultiUnitProdi::syncUnitProdi().
 */
class UnitProdiSelection
{
    /** Aturan validasi yang ditambahkan ke endpoint yang menerima pilihan majemuk. */
    public static function rules(): array
    {
        return [
            'unit_prodi_ids' => ['nullable', 'array'],
            'unit_prodi_ids.*' => ['integer', 'distinct', 'exists:master_unit_prodi,id'],
            'jurusan_ids' => ['nullable', 'array'],
            'jurusan_ids.*' => ['integer', 'distinct', 'exists:master_unit_prodi,id'],
        ];
    }

    /**
     * Cabut unit_prodi_ids/jurusan_ids dari $validated dan kembalikan daftar id yang harus disimpan.
     *
     * Null = klien tidak menyentuh pilihan unit/prodi sama sekali. Klien lama yang hanya mengirim
     * unit_prodi_id dianggap pilihan tunggal. Kalau jurusan_ids dikirim, setiap prodi wajib anak
     * dari salah satu jurusan itu.
     *
     * @param  array<string, mixed>  $validated
     * @param  int|null  $currentPrimaryId  unit_prodi_id baris yang sedang di-update (null saat membuat baru)
     * @return array<int, int>|null
     */
    public static function extract(array &$validated, ?int $currentPrimaryId = null): ?array
    {
        $ids = $validated['unit_prodi_ids'] ?? null;
        $jurusanIds = $validated['jurusan_ids'] ?? null;
        $kirimUnitTunggal = array_key_exists('unit_prodi_id', $validated);
        $unitTunggal = $validated['unit_prodi_id'] ?? null;
        // unit_prodi_id bukan kolom lagi (turunan dari unit_prodi_ids), jadi tidak boleh ikut ke create/update.
        unset($validated['unit_prodi_ids'], $validated['jurusan_ids'], $validated['unit_prodi_id']);

        // Array kosong + unit_prodi_id tunggal (klien lama / asal "Unit") = pilihan tunggal, bukan "hapus semua".
        if (! is_array($ids) || ($ids === [] && ! empty($unitTunggal))) {
            // Edit dari form yang cuma kenal satu unit (mis. Rekap Data) mengirim ulang unit_prodi_id
            // yang SAMA dengan node utama saat ini; itu bukan perintah mengubah pilihan, jadi pilihan
            // majemuk yang sudah tersimpan tidak boleh ikut terhapus.
            if ($currentPrimaryId !== null && (int) ($unitTunggal ?? 0) === $currentPrimaryId) {
                return null;
            }

            return $kirimUnitTunggal
                ? array_values(array_filter([$unitTunggal]))
                : null;
        }

        $ids = array_values(array_unique(array_map('intval', $ids)));

        if (is_array($jurusanIds) && $ids !== []) {
            $jurusanIds = array_map('intval', $jurusanIds);
            $prodiTanpaJurusan = MasterUnitProdi::query()
                ->whereIn('id', $ids)
                ->where('jenis_node', 'prodi')
                ->get(['id', 'nama', 'parent_id'])
                ->filter(fn ($prodi) => ! in_array((int) $prodi->parent_id, $jurusanIds, true));

            if ($prodiTanpaJurusan->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'unit_prodi_ids' => 'Prodi '.$prodiTanpaJurusan->pluck('nama')->implode(', ').' bukan bagian dari jurusan yang dipilih.',
                ]);
            }
        }

        return $ids;
    }
}
