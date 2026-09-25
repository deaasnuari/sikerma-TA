<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterMitra extends Model
{
    protected $table = 'master_mitra';

    protected $fillable = [
        'kode_mitra',
        'nama_mitra',
        'kategori_mitra',
        'bidang_usaha',
        'tingkat_perusahaan',
        'negara',
        'website',
        'alamat',
        'email_mitra',
        'whatsapp_mitra',
        'no_telepon_mitra',
        'nama_kontak_utama',
        'jabatan_kontak_utama',
        'email_kontak_utama',
        'telepon_kontak_utama',
        'aktif',
    ];

    protected $casts = [
        'aktif' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /** Kontak tambahan (akun lain dari instansi yang sama), selain kontak utama. */
    public function kontak(): HasMany
    {
        return $this->hasMany(KontakMitra::class, 'mitra_id')->orderBy('id');
    }
}