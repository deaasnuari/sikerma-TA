<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'institution_name', 'username', 'email', 'phone', 'position', 'role', 'account_type', 'approval_status', 'password', 'nik', 'nip', 'unit_kerja', 'auth_provider', 'unit_prodi_id'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    // Unit kerja (master_unit_prodi, jenis_node=unit & kategori_unit=unit_kerja) yang
    // di-assign ADMIN secara manual lewat Manajemen User untuk user ber-role 'unit' —
    // beda dari deteksi Kepala Unit otomatis via NIK di StructuralAccessService (yang
    // itu berbasis data resmi Civitas, ini berbasis penugasan admin di sistem sendiri).
    public function unitProdi(): BelongsTo
    {
        return $this->belongsTo(MasterUnitProdi::class, 'unit_prodi_id');
    }
}
