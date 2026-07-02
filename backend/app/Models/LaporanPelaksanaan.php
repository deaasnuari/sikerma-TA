<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LaporanPelaksanaan extends Model
{
    protected $table = 'laporan_pelaksanaan';
    protected $guarded = [];

    public function pengajuan(): BelongsTo
    {
        return $this->belongsTo(Pengajuan::class, 'pengajuan_id');
    }

    public function dokumenKerjasama(): BelongsTo
    {
        return $this->belongsTo(DokumenKerjasama::class, 'dokumen_kerjasama_id');
    }

    public function dikirimOleh(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dikirim_oleh_user_id');
    }
}
