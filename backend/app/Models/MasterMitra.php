<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

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
        'kontak_tambahan',
        'aktif',
    ];

    protected $casts = [
        'aktif' => 'boolean',
        'kontak_tambahan' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Kontak tambahan baru tampil di respons lewat append('kontak') — hanya di endpoint admin —
    // supaya data kontak tidak ikut terbawa ke endpoint lain yang mengembalikan model mitra.
    protected $hidden = ['kontak_tambahan'];

    /**
     * Kontak tambahan (akun lain dari instansi yang sama), selain kontak utama:
     * [{id, user_id, nama, jabatan, email, telepon}]. Disimpan di kolom JSON kontak_tambahan.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getKontakAttribute(): array
    {
        return array_values($this->kontak_tambahan ?? []);
    }

    /**
     * Ganti seluruh daftar kontak tambahan. Entri yang membawa id lama mempertahankan id-nya; yang tanpa id
     * (atau id yang bentrok) diberi id baru yang unik di mitra ini.
     *
     * @param  array<int, array<string, mixed>>  $daftar
     */
    public function setKontak(array $daftar): void
    {
        $dipakai = [];
        $hasil = [];
        foreach ($daftar as $item) {
            $id = isset($item['id']) ? (int) $item['id'] : 0;
            if ($id <= 0 || isset($dipakai[$id])) {
                $id = 0;
            } else {
                $dipakai[$id] = true;
            }
            $hasil[] = ['id' => $id] + $this->rapikanKontak($item);
        }

        // id baru selalu lebih besar dari semua id di daftar sebelumnya (termasuk yang baru dibuang), supaya id kontak
        // yang dihapus tidak dipakai ulang oleh kontak lain.
        $berikutnya = max([0, ...array_keys($dipakai), ...array_map('intval', array_column($this->kontak, 'id'))]) + 1;
        foreach ($hasil as &$kontak) {
            if ($kontak['id'] === 0) {
                $kontak['id'] = $berikutnya++;
            }
        }
        unset($kontak);

        $this->forceFill(['kontak_tambahan' => $hasil !== [] ? $hasil : null])->save();
    }

    /**
     * Tambah satu kontak tambahan (id dibuat otomatis) dan simpan.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed> kontak yang ditambahkan
     */
    public function tambahKontak(array $data): array
    {
        $daftar = $this->kontak;
        $daftar[] = $data;
        $this->setKontak($daftar);

        return $this->kontak[count($this->kontak) - 1];
    }

    /** @param  array<string, mixed>  $item */
    private function rapikanKontak(array $item): array
    {
        $teks = fn ($nilai) => filled($nilai) ? trim((string) $nilai) : null;

        return [
            'user_id' => isset($item['user_id']) ? (int) $item['user_id'] : null,
            'nama' => trim((string) ($item['nama'] ?? '')),
            'jabatan' => $teks($item['jabatan'] ?? null),
            'email' => filled($item['email'] ?? null) ? strtolower(trim((string) $item['email'])) : null,
            'telepon' => $teks($item['telepon'] ?? null),
        ];
    }
}
