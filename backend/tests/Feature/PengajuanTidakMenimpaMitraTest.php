<?php

namespace Tests\Feature;

use App\Models\MasterMitra;
use App\Services\MasterMitraResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// PIC/data mitra dari pengajuan tidak boleh menimpa Data Kemitraan.
class PengajuanTidakMenimpaMitraTest extends TestCase
{
    use RefreshDatabase;

    private function mitra(array $attrs = []): MasterMitra
    {
        return MasterMitra::create(array_merge([
            'nama_mitra' => 'PT Contoh', 'aktif' => true,
            'nama_kontak_utama' => 'Selta', 'email_kontak_utama' => 'selta@contoh.id',
            'telepon_kontak_utama' => '83170160344', 'alamat' => 'Jl. Asli 1',
        ], $attrs));
    }

    public function test_kontak_utama_dan_alamat_yang_sudah_ada_tidak_ditimpa(): void
    {
        $mitra = $this->mitra();

        app(MasterMitraResolver::class)->lengkapiDariPengajuan($mitra, [
            'nama_kontak_utama' => 'Dea Asnuari', 'email_kontak_utama' => 'dea@contoh.id',
            'telepon_kontak_utama' => '34567', 'alamat' => 'Alamat Lain',
        ]);

        $mitra->refresh();
        $this->assertSame('Selta', $mitra->nama_kontak_utama);
        $this->assertSame('selta@contoh.id', $mitra->email_kontak_utama);
        $this->assertSame('83170160344', $mitra->telepon_kontak_utama);
        $this->assertSame('Jl. Asli 1', $mitra->alamat);
    }

    public function test_pic_berbeda_dicatat_sebagai_kontak_tambahan_tanpa_dobel(): void
    {
        $mitra = $this->mitra();
        $data = ['nama_kontak_utama' => 'Dea Asnuari', 'email_kontak_utama' => 'dea@contoh.id'];

        $resolver = app(MasterMitraResolver::class);
        $resolver->lengkapiDariPengajuan($mitra, $data);
        $resolver->lengkapiDariPengajuan($mitra->fresh(), $data);

        $this->assertSame(1, $mitra->kontak()->count());
        $this->assertSame('Dea Asnuari', $mitra->kontak()->first()->nama);
    }

    public function test_kolom_kosong_diisi_dan_pic_yang_sama_tidak_jadi_kontak_tambahan(): void
    {
        $mitra = $this->mitra(['nama_kontak_utama' => null, 'email_kontak_utama' => null, 'alamat' => null]);

        app(MasterMitraResolver::class)->lengkapiDariPengajuan($mitra, [
            'nama_kontak_utama' => 'Dea Asnuari', 'email_kontak_utama' => 'dea@contoh.id', 'alamat' => 'Jl. Baru 2',
        ]);

        $mitra->refresh();
        $this->assertSame('Dea Asnuari', $mitra->nama_kontak_utama);
        $this->assertSame('Jl. Baru 2', $mitra->alamat);
        $this->assertSame(0, $mitra->kontak()->count());
    }
}
