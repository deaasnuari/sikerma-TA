<?php

namespace App\Models;

use App\Models\DokumenFile;
use App\Support\KerjasamaStatus;
use App\Models\Concerns\HasMultiUnitProdi;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DokumenKerjasama extends Model
{
    use HasMultiUnitProdi;

    protected string $unitProdiPivotTable = 'dokumen_kerjasama_unit_prodi';
    protected string $unitProdiPivotForeignKey = 'dokumen_kerjasama_id';

    protected $table = 'dokumen_kerjasama';

    // status_efektif dihitung, BUKAN status_siklus mentah — lihat KerjasamaStatus untuk
    // kenapa ini perlu (status_siklus tersimpan bisa basi/tidak sinkron dengan
    // tanggal_berakhir). Semua halaman (Rekap Data, Monitoring, Status & Progres
    // Kerjasama, Arsip Dokumen) HARUS baca field ini, bukan status_siklus langsung,
    // supaya jumlah "Kadaluarsa" selalu konsisten di semua tempat.
    protected $appends = ['status_efektif'];

    protected $fillable = [
        'nomor_dokumen',
        'no_permohonan',
        'nama_dokumen',
        'jenis_dokumen',
        'judul_dokumen',
        'manfaat',
        'luaran_kerja_sama',
        'nilai_kerjasama',
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
        'snap_pic_polibatam_nama',
        'snap_pic_polibatam_jabatan',
        'snap_pic_polibatam_email',
        'snap_pic_polibatam_whatsapp',
        'dibuat_oleh_user_id',
        'file',
        'keterangan',
        'follow_up',
        'dihapus_admin_pada',
        'dihapus_user_pada',
    ];

    protected $casts = [
        'ruang_lingkup_ids' => 'array',
        'tanggal_mulai' => 'date',
        'tanggal_berakhir' => 'date',
        'tanggal_ttd' => 'date',
        'diarsipkan_pada' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'dihapus_admin_pada' => 'datetime',
        'dihapus_user_pada' => 'datetime',
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

    public function getStatusEfektifAttribute(): string
    {
        return KerjasamaStatus::fromTanggalBerakhir($this->tanggal_berakhir, $this->status_siklus);
    }
}