<?php

namespace Tests\Feature;

use App\Models\MasterMitra;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class KontakMitraMigrasiTest extends TestCase
{
    use RefreshDatabase;

    private function migrasi(): object
    {
        return require database_path('migrations/2026_10_29_000003_merge_kontak_mitra_into_master_mitra.php');
    }

    public function test_kontak_mitra_digabung_ke_kolom_json_dan_salinan_kontak_utama_dilewati(): void
    {
        $migrasi = $this->migrasi();
        // Kembali ke bentuk lama (tabel kontak_mitra) untuk menguji data lama.
        $migrasi->down();
        $this->assertTrue(Schema::hasTable('kontak_mitra'));
        $this->assertFalse(Schema::hasColumn('master_mitra', 'kontak_tambahan'));

        $sari = DB::table('master_mitra')->insertGetId(['nama_mitra' => 'PT A', 'nama_kontak_utama' => 'Sari', 'email_kontak_utama' => 'sari@a.id', 'aktif' => true, 'created_at' => now(), 'updated_at' => now()]);
        $tanpaKontak = DB::table('master_mitra')->insertGetId(['nama_mitra' => 'PT B', 'aktif' => true, 'created_at' => now(), 'updated_at' => now()]);
        $baris = fn (int $mitra, string $nama, ?string $email, ?string $jabatan = null) => [
            'mitra_id' => $mitra, 'nama' => $nama, 'email' => $email, 'jabatan' => $jabatan, 'telepon' => '081', 'created_at' => now(), 'updated_at' => now(),
        ];
        DB::table('kontak_mitra')->insert([
            $baris($sari, 'Sari', '-'),                 // salinan kontak utama (nama sama, tanpa email lain): dilewati
            $baris($sari, 'Sari Lagi', 'SARI@a.id'),    // email sama dengan kontak utama: dilewati
            $baris($sari, 'Budi', 'Budi@A.id', 'HRD'),  // kontak baru: dipindah
            $baris($sari, 'Citra', null),               // kontak baru tanpa email: dipindah
        ]);

        $migrasi->up();

        $this->assertFalse(Schema::hasTable('kontak_mitra'), 'tabel lama dihapus');
        $kontak = MasterMitra::findOrFail($sari)->kontak;
        $this->assertSame(['Budi', 'Citra'], array_column($kontak, 'nama'));
        $this->assertSame([1, 2], array_column($kontak, 'id'));
        $this->assertSame('budi@a.id', $kontak[0]['email']);
        $this->assertSame('HRD', $kontak[0]['jabatan']);
        $this->assertSame([], MasterMitra::findOrFail($tanpaKontak)->kontak);

        // Arah turun mengembalikan tabel dari isi kolom JSON.
        $migrasi->down();
        $this->assertSame(['Budi', 'Citra'], DB::table('kontak_mitra')->where('mitra_id', $sari)->orderBy('id')->pluck('nama')->all());
        $this->assertFalse(Schema::hasColumn('master_mitra', 'kontak_tambahan'));

        $migrasi->up(); // kembali ke bentuk baru supaya state tes konsisten
        $this->assertTrue(Schema::hasColumn('master_mitra', 'kontak_tambahan'));
    }

    public function test_respons_publik_tidak_membawa_kontak_tambahan(): void
    {
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Rahasia', 'aktif' => true]);
        $mitra->tambahKontak(['nama' => 'Budi', 'email' => 'budi@x.id']);

        // Tanpa append('kontak'), kolom JSON tidak ikut terserialisasi.
        $this->assertArrayNotHasKey('kontak_tambahan', $mitra->fresh()->toArray());
        $this->assertArrayNotHasKey('kontak', $mitra->fresh()->toArray());
        $this->assertArrayHasKey('kontak', $mitra->fresh()->append('kontak')->toArray());
    }
}
