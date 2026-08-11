<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DokumenLog extends Model
{
    protected $table = 'dokumen_log';

    public $timestamps = false;

    protected $fillable = [
        'dokumen_id',
        'tipe_log',
        'judul_log',
        'isi_log',
        'payload_json',
        'nomor',
        'mitra',
        'telepon',
        'tgl_mulai',
        'tgl_berakhir',
        'unit',
        'lingkup',
        'tingkat',
        'periode',
        'judul',
        'manfaat',
        'bukti',
        'status',
        'pic',
        'tgl_monitoring',
        'catatan_perpanjangan',
        'bukti_perpanjangan',
        'tanggal_mulai_perpanjangan',
        'tanggal_berakhir_perpanjangan',
        'status_perpanjangan',
        'requester_role',
        'notification_href',
        'diputuskan_pada',
        'diputuskan_oleh',
        'dibuat_oleh_user_id',
    ];

    protected $casts = [
        'payload_json' => 'array',
        'tgl_mulai' => 'date',
        'tgl_berakhir' => 'date',
        'tgl_monitoring' => 'date',
        'tanggal_mulai_perpanjangan' => 'date',
        'tanggal_berakhir_perpanjangan' => 'date',
        'dibuat_pada' => 'datetime',
        'diputuskan_pada' => 'datetime',
    ];

    public function dokumen(): BelongsTo
    {
        return $this->belongsTo(DokumenKerjasama::class, 'dokumen_id');
    }
}