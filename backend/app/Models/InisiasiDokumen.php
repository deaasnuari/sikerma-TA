<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InisiasiDokumen extends Model
{
    protected $table = 'inisiasi_dokumen';

    protected $fillable = ['inisiasi_id', 'path_file', 'nama_asli', 'ukuran', 'urutan'];

    public function inisiasi(): BelongsTo
    {
        return $this->belongsTo(Inisiasi::class, 'inisiasi_id');
    }
}
