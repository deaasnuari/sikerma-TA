<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu baris = satu notifikasi untuk satu penerima (user_id). Notifikasi untuk banyak admin dibuat sebagai
 * banyak baris (satu per akun admin) sehingga status baca tiap akun independen.
 */
class Notifikasi extends Model
{
    protected $table = 'notifikasi';

    protected $fillable = [
        'user_id', 'judul', 'pesan', 'dari', 'href', 'kategori',
        'jenis_aktivitas', 'actor_id', 'pengajuan_id', 'kunci', 'dibaca_pada',
    ];

    protected function casts(): array
    {
        return ['dibaca_pada' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function pengajuan(): BelongsTo
    {
        return $this->belongsTo(Pengajuan::class);
    }
}
