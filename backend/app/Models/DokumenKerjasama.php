<?php

namespace App\Models;

use App\Models\DokumenFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DokumenKerjasama extends Model
{
    protected $table = 'dokumen_kerjasama';

    protected $fillable = [
        'nomor_dokumen',
        'no_permohonan',
        'nama_dokumen',
        'jenis_dokumen',
        'judul_dokumen',
        'manfaat',
        'luaran_kerja_sama',
        'ruang_lingkup_ids',
        'tanggal_mulai',
        'tanggal_berakhir',
        'tanggal_ttd',
        'status_siklus',
        'diarsipkan_pada',
        'alasan_arsip',
        'sumber_pengajuan_id',
        'unit_prodi_id',
        'mitra_id',
        'snap_nama_mitra',
        'snap_whatsapp_pengusul',
        'snap_nama_pengusul',
        'snap_email_pengusul',
        'snap_jenis_mitra',
        'snap_bidang_usaha',
        'snap_tingkat_perusahaan',
        'dibuat_oleh_user_id',
        'file',
        'keterangan',
        'follow_up',
    ];

    protected $casts = [
        'ruang_lingkup_ids' => 'array',
        'tanggal_mulai' => 'date',
        'tanggal_berakhir' => 'date',
        'tanggal_ttd' => 'date',
        'diarsipkan_pada' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function pengajuan(): BelongsTo
    {
        return $this->belongsTo(Pengajuan::class, 'sumber_pengajuan_id');
    }

    public function unitProdi(): BelongsTo
    {
        return $this->belongsTo(MasterUnitProdi::class, 'unit_prodi_id');
    }

    public function mitra(): BelongsTo
    {
        return $this->belongsTo(MasterMitra::class, 'mitra_id');
    }

    public function dokumenFiles(): HasMany
    {
        return $this->hasMany(DokumenFile::class, 'dokumen_id');
    }

    public function dokumenLogs(): HasMany
    {
        return $this->hasMany(DokumenLog::class, 'dokumen_id');
    }

    public function laporanPelaksanaan(): HasMany
    {
        return $this->hasMany(LaporanPelaksanaan::class, 'dokumen_kerjasama_id');
    }
}