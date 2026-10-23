<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InisiasiFoto extends Model
{
    protected $table = 'inisiasi_foto';

    protected $fillable = ['inisiasi_id', 'path_file', 'nama_asli', 'urutan'];

    public function inisiasi(): BelongsTo
    {
        return $this->belongsTo(Inisiasi::class, 'inisiasi_id');
    }
}
