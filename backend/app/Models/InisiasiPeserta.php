<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InisiasiPeserta extends Model
{
    protected $table = 'inisiasi_peserta';

    protected $fillable = ['inisiasi_id', 'nama', 'user_id'];

    public function inisiasi(): BelongsTo
    {
        return $this->belongsTo(Inisiasi::class, 'inisiasi_id');
    }
}
