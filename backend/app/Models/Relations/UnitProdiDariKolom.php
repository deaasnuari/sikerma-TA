<?php

namespace App\Models\Relations;

use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * Relasi ke master_unit_prodi yang id-nya disimpan di kolom JSON `unit_prodi_ids` pada
 * baris induk (tanpa tabel pivot). Mendukung eager loading, jadi
 * with('unitProdiItems:id,nama', 'unitProdiItems.parent') tetap bekerja seperti relasi biasa.
 *
 * Urutan hasil mengikuti urutan id di kolom; id pertama = node utama.
 */
class UnitProdiDariKolom extends Relation
{
    private const KOLOM = 'unit_prodi_ids';

    /**
     * @return array<int, int>
     */
    private function idsDari(Model $model): array
    {
        $ids = $model->getAttribute(self::KOLOM);

        return is_array($ids) ? array_values(array_unique(array_map('intval', $ids))) : [];
    }

    public function addConstraints()
    {
        if (static::$constraints) {
            $this->query->whereIn($this->related->getQualifiedKeyName(), $this->idsDari($this->parent) ?: [0]);
        }
    }

    public function addEagerConstraints(array $models)
    {
        $semua = [];
        foreach ($models as $model) {
            $semua = array_merge($semua, $this->idsDari($model));
        }

        $this->query->whereIn($this->related->getQualifiedKeyName(), array_values(array_unique($semua)) ?: [0]);
    }

    public function initRelation(array $models, $relation)
    {
        foreach ($models as $model) {
            $model->setRelation($relation, $this->related->newCollection());
        }

        return $models;
    }

    public function match(array $models, EloquentCollection $results, $relation)
    {
        $berdasarId = $results->keyBy(fn ($row) => (int) $row->getKey());

        foreach ($models as $model) {
            $model->setRelation($relation, $this->related->newCollection(
                collect($this->idsDari($model))
                    ->map(fn ($id) => $berdasarId->get($id))
                    ->filter()
                    ->values()
                    ->all()
            ));
        }

        return $models;
    }

    public function getResults()
    {
        $ids = $this->idsDari($this->parent);

        if ($ids === []) {
            return $this->related->newCollection();
        }

        $berdasarId = $this->query->get()->keyBy(fn ($row) => (int) $row->getKey());

        return $this->related->newCollection(
            collect($ids)->map(fn ($id) => $berdasarId->get($id))->filter()->values()->all()
        );
    }
}
