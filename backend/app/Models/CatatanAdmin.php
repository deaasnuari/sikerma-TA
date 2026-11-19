<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CatatanAdmin extends Model
{
    protected $table = 'catatan_admin';

    protected $fillable = [
        'pengajuan_id',
        'teks',
        'untuk_pengusul',
        'dibuat_oleh_user_id',
    ];

    protected function casts(): array
    {
        return ['untuk_pengusul' => 'boolean'];
    }

    public function pengajuan(): BelongsTo
    {
        return $this->belongsTo(Pengajuan::class);
    }

    public function dibuatOleh(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dibuat_oleh_user_id');
    }
}
