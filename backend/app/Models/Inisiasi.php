<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Inisiasi extends Model
{
    protected $table = 'inisiasi';

    protected $fillable = [
        'tanggal_kegiatan',
        'judul',
        'nama_mitra',
        'deskripsi',
        'berita_kerjasama_id',
        'dibuat_oleh_user_id',
    ];

    protected $casts = [
        'tanggal_kegiatan' => 'date',
    ];

    public function units(): HasMany
    {
        return $this->hasMany(InisiasiUnit::class, 'inisiasi_id')->orderBy('id');
    }

    public function peserta(): HasMany
    {
        return $this->hasMany(InisiasiPeserta::class, 'inisiasi_id')->orderBy('id');
    }

    public function fotos(): HasMany
    {
        return $this->hasMany(InisiasiFoto::class, 'inisiasi_id')->orderBy('urutan')->orderBy('id');
    }

    public function dokumens(): HasMany
    {
        return $this->hasMany(InisiasiDokumen::class, 'inisiasi_id')->orderBy('urutan')->orderBy('id');
    }

    public function pengajuan(): HasMany
    {
        return $this->hasMany(Pengajuan::class, 'inisiasi_id')->orderBy('id');
    }

    public function pembuat(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dibuat_oleh_user_id');
    }
}
