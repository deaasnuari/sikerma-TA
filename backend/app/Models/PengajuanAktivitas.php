<?php

namespace App\Models;

use App\Support\Triwulan;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PengajuanAktivitas extends Model
{
    protected $table = 'pengajuan_aktivitas';

    protected $fillable = [
        'pengajuan_id',
        'judul',
        'jenis_aktivitas',
        'tanggal',
        'jumlah_peserta',
        'deskripsi',
        'pic_polibatam',
        'pic_mitra',
        'status',
        'dibuat_oleh_user_id',
    ];

    protected $casts = [
        'tanggal' => 'date',
        'jumlah_peserta' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // `tahun`/`triwulan` SENGAJA tidak jadi kolom tersendiri — dihitung langsung dari
    // `tanggal` setiap kali dibaca, supaya aktivitas ini otomatis "pindah" Monev triwulan
    // saat tanggalnya diedit dan otomatis hilang dari Monev saat aktivitasnya dihapus,
    // tanpa perlu proses sinkronisasi terpisah (lihat PengajuanController::monev()).
    protected $appends = ['tahun', 'triwulan'];

    public function pengajuan(): BelongsTo
    {
        return $this->belongsTo(Pengajuan::class, 'pengajuan_id');
    }

    public function getTahunAttribute(): ?int
    {
        return $this->tanggal ? (int) $this->tanggal->format('Y') : null;
    }

    public function getTriwulanAttribute(): ?int
    {
        return $this->tanggal ? Triwulan::fromMonth((int) $this->tanggal->format('n')) : null;
    }
}
