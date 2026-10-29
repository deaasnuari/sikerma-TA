<?php

namespace App\Models\Concerns;

use App\Models\MasterUnitProdi;
use App\Models\Relations\UnitProdiDariKolom;
use Illuminate\Database\Eloquent\Builder;

/**
 * Pengajuan/dokumen boleh melibatkan banyak jurusan/prodi. Semua id disimpan di SATU kolom JSON,
 * unit_prodi_ids (tanpa tabel pivot); id pertama = node utama.
 *
 * unit_prodi_id BUKAN kolom lagi: ia atribut turunan (id pertama dari unit_prodi_ids) supaya kode
 * lama (nomor dokumen, tampilan satu nama, klien yang hanya kenal satu unit) tetap bisa membacanya.
 * Menulis unit_prodi_id = mengganti seluruh daftar dengan satu unit itu.
 *
 * Model pemakai wajib punya kolom unit_prodi_ids.
 */
trait HasMultiUnitProdi
{
    public function initializeHasMultiUnitProdi(): void
    {
        $this->mergeCasts(['unit_prodi_ids' => 'array']);
        $this->mergeFillable(['unit_prodi_id', 'unit_prodi_ids']);
        $this->append('unit_prodi_id');
    }

    public function getUnitProdiIdAttribute(): ?int
    {
        $ids = $this->unit_prodi_ids;

        return is_array($ids) && $ids !== [] ? (int) $ids[0] : null;
    }

    public function setUnitProdiIdAttribute(mixed $value): void
    {
        // null tidak menimpa daftar yang sudah diisi dalam satu fill() yang sama.
        if ($value === null || $value === '') {
            $this->unit_prodi_ids ??= null;

            return;
        }

        $this->unit_prodi_ids = [(int) $value];
    }

    public function unitProdiItems(): UnitProdiDariKolom
    {
        return new UnitProdiDariKolom((new MasterUnitProdi())->newQuery(), $this);
    }

    /**
     * Simpan seluruh pilihan sekaligus: unit_prodi_ids diganti, id pertama jadi unit utama.
     * Daftar kosong mengosongkannya.
     *
     * @param  array<int, int|string>  $ids
     */
    public function syncUnitProdi(array $ids): void
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($ids, fn ($id) => $id !== null && $id !== ''))));

        $this->forceFill(['unit_prodi_ids' => $ids ?: null])->save();
        $this->unsetRelation('unitProdiItems');
    }

    /**
     * Semua id unit/prodi baris ini, node utama di urutan pertama.
     *
     * @return array<int, int>
     */
    public function unitProdiIdsUrut(): array
    {
        return array_values(array_unique(array_map('intval', $this->unit_prodi_ids ?? [])));
    }

    /**
     * Baris yang unit/prodi-nya termasuk salah satu $ids.
     *
     * @param  array<int, int>  $ids
     */
    public function scopeDalamUnitProdi(Builder $query, array $ids): Builder
    {
        return $query->where(function (Builder $builder) use ($ids) {
            foreach ($ids as $id) {
                $builder->orWhereJsonContains('unit_prodi_ids', (int) $id);
            }
        });
    }

    /**
     * Versi instance dari scopeDalamUnitProdi.
     *
     * @param  array<int, int|string>  $ids
     */
    public function termasukUnitProdi(array $ids): bool
    {
        return array_intersect($this->unitProdiIdsUrut(), array_map('intval', $ids)) !== [];
    }
}
