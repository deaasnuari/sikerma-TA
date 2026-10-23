<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InisiasiUnit extends Model
{
    protected $table = 'inisiasi_unit';

    protected $fillable = ['inisiasi_id', 'unit_prodi_id', 'nama'];

    public function inisiasi(): BelongsTo
    {
        return $this->belongsTo(Inisiasi::class, 'inisiasi_id');
    }
}
