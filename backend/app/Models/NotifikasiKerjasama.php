<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotifikasiKerjasama extends Model
{
    protected $table = 'notifikasi_kerjasama';

    protected $fillable = [
        'dokumen_kerjasama_id',
        'jenis',
        'tanggal_berakhir_acuan',
        'email_tujuan',
        'status',
        'keterangan',
        'dikirim_pada',
    ];

    protected $casts = [
        // tanggal_berakhir_acuan sengaja TIDAK di-cast 'date' — disimpan & dicocokkan
        // sebagai string 'Y-m-d' apa adanya supaya updateOrCreate() di
        // KerjasamaReminderService konsisten menemukan baris yang sama (hindari
        // mismatch '2026-03-31' vs '2026-03-31 00:00:00' di SQLite).
        'dikirim_pada' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function dokumen(): BelongsTo
    {
        return $this->belongsTo(DokumenKerjasama::class, 'dokumen_kerjasama_id');
    }
}
