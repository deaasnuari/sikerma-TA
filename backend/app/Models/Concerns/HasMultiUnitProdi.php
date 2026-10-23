<?php

namespace App\Models\Concerns;

use App\Models\MasterUnitProdi;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Pengajuan/dokumen boleh melibatkan banyak jurusan/prodi lewat tabel pivot.
 * Kolom unit_prodi_id tetap menyimpan satu node "utama" (yang pertama dipilih) —
 * dipakai kode lama (nomor dokumen, akses struktural, tampilan satu nama).
 *
 * Model pemakai wajib mengisi $unitProdiPivotTable dan $unitProdiPivotForeignKey.
 */
trait HasMultiUnitProdi
{
    public function unitProdiItems(): BelongsToMany
    {
        return $this->belongsToMany(
            MasterUnitProdi::class,
            $this->unitProdiPivotTable,
            $this->unitProdiPivotForeignKey,
            'unit_prodi_id'
        )->withTimestamps();
    }

    /**
     * Simpan seluruh pilihan sekaligus: pivot di-sync, unit_prodi_id jadi elemen pertama.
     * Daftar kosong mengosongkan keduanya.
     *
     * @param  array<int, int|string>  $ids
     */
    public function syncUnitProdi(array $ids): void
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($ids, fn ($id) => $id !== null && $id !== ''))));

        $this->unitProdiItems()->sync($ids);

        $utama = $ids[0] ?? null;
        if ($this->unit_prodi_id !== $utama) {
            $this->forceFill(['unit_prodi_id' => $utama])->save();
        }
    }

    /**
     * Semua id unit/prodi baris ini, node utama (unit_prodi_id) di urutan pertama.
     * Baris lama yang belum punya pivot tetap mengembalikan unit_prodi_id-nya.
     *
     * @return array<int, int>
     */
    public function unitProdiIdsUrut(): array
    {
        $semua = $this->unitProdiItems()->pluck('master_unit_prodi.id')->map(fn ($id) => (int) $id)->all();

        if ($this->unit_prodi_id !== null) {
            array_unshift($semua, (int) $this->unit_prodi_id);
        }

        return array_values(array_unique($semua));
    }

    /**
     * Baris yang unit/prodi-nya termasuk salah satu $ids — lewat kolom utama ATAU pivot.
     *
     * @param  array<int, int>  $ids
     */
    public function scopeDalamUnitProdi(Builder $query, array $ids): Builder
    {
        return $query->where(function (Builder $builder) use ($ids) {
            $builder->whereIn('unit_prodi_id', $ids)
                ->orWhereHas('unitProdiItems', fn (Builder $inner) => $inner->whereIn('master_unit_prodi.id', $ids));
        });
    }

    /**
     * Apakah baris ini masuk salah satu $ids (versi instance dari scopeDalamUnitProdi).
     *
     * @param  array<int, int|string>  $ids
     */
    public function termasukUnitProdi(array $ids): bool
    {
        $ids = array_map('intval', $ids);

        if ($this->unit_prodi_id !== null && in_array((int) $this->unit_prodi_id, $ids, true)) {
            return true;
        }

        return $this->unitProdiItems()->whereIn('master_unit_prodi.id', $ids)->exists();
    }
}
