<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use App\Casts\PgArrayCast;

class Pengajuan extends Model
{
    protected $table = 'pengajuan_v2';

    protected $fillable = [
        // Legacy schema columns
        'judul',
        'deskripsi',
        'pengusul',
        'tanggal',
        'mitra',
        'jurusan',
        'kategori',
        'ruang_lingkup',
        'status',
        'email_terverifikasi',
        'file_name',
        'file_attachments',
        'review_comment',
        'reviewed_at',
        'reviewed_by',
        'alamat_mitra',
        'negara',
        'is_from_admin',
        'source_role',
        'created_by_user_id',

        // New schema columns
        'nomor_pengajuan',
        'user_pengusul_id',
        'nama_pengusul',
        'jabatan_pengusul',
        'email_pengusul',
        'whatsapp_pengusul',
        'unit_prodi_id',
        'mitra_id',
        'judul_pengajuan',
        'deskripsi_pengajuan',
        'manfaat',
        'luaran_kerja_sama',
        'jenis_dokumen',
        'kategori_pengajuan',
        'ruang_lingkup_ids',
        'tanggal_mulai',
        'tanggal_berakhir',
        'status_pengajuan',
        'diajukan_pada',
        'email_terverifikasi_pada',
        'nama_mitra',
        'jenis_mitra',
        'bidang_usaha',
        'tingkat_perusahaan',
        'whatsapp_mitra',
        'no_telepon_mitra',
        'catatan',
        'keputusan',
        'catatan_revisi',
        'acc_internal_at',
        'acc_mitra_at',
        'final_approved_at',
        'final_file_name',
        'final_file_path',
        'tahapan_stage',
        'tahapan_group',
        'tahapan_riwayat',
        'direvisi_pengusul_pada',
        'distribusi_user_ids',
        'dihapus_admin_pada',
        'dihapus_user_pada',
    ];

    protected $casts = [
        // Legacy schema casts
        'tanggal' => 'date',
        'ruang_lingkup' => 'array',
        'email_terverifikasi' => 'boolean',
        'file_attachments' => 'array',
        'reviewed_at' => 'date',
        'is_from_admin' => 'boolean',

        // New schema casts
        'ruang_lingkup_ids' => PgArrayCast::class,
        // 'ruang_lingkup_ids' => 'array',
        'tanggal_mulai' => 'date',
        'tanggal_berakhir' => 'date',
        'diajukan_pada' => 'datetime',
        'email_terverifikasi_pada' => 'datetime',
        'acc_internal_at' => 'datetime',
        'acc_mitra_at' => 'datetime',
        'final_approved_at' => 'datetime',
        'tahapan_riwayat' => 'array',
        'direvisi_pengusul_pada' => 'datetime',
        'distribusi_user_ids' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'dihapus_admin_pada' => 'datetime',
        'dihapus_user_pada' => 'datetime',
    ];

    public function unitProdi(): BelongsTo
    {
        return $this->belongsTo(MasterUnitProdi::class, 'unit_prodi_id');
    }

    public function userPengusul(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_pengusul_id');
    }

    public function mitra(): BelongsTo
    {
        return $this->belongsTo(MasterMitra::class, 'mitra_id');
    }

    public function pengajuanFiles(): HasMany
    {
        return $this->hasMany(PengajuanFile::class, 'pengajuan_id', 'id');
    }

    public function dokumenFiles(): HasMany
    {
        // Keep legacy relation name so existing API payload still exposes "dokumen_files".
        return $this->pengajuanFiles();
    }

    public function dokumenKerjasama(): HasOne
    {
        return $this->hasOne(DokumenKerjasama::class, 'no_permohonan', 'nomor_pengajuan');
    }

    public function pengajuanLogs(): HasMany
    {
        return $this->hasMany(PengajuanLog::class, 'pengajuan_id', 'id');
    }

    public function aktivitas(): HasMany
    {
        return $this->hasMany(PengajuanAktivitas::class, 'pengajuan_id', 'id');
    }

    public function laporanPelaksanaan(): HasMany
    {
        return $this->hasMany(LaporanPelaksanaan::class, 'pengajuan_id', 'id');
    }
}
