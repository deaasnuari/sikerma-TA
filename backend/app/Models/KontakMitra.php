<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KontakMitra extends Model
{
    protected $table = 'kontak_mitra';

    protected $fillable = [
        'mitra_id',
        'user_id',
        'nama',
        'jabatan',
        'email',
        'telepon',
    ];

    public function mitra(): BelongsTo
    {
        return $this->belongsTo(MasterMitra::class, 'mitra_id');
    }
}
