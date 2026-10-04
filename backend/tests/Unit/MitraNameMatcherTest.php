<?php

namespace Tests\Unit;

use App\Support\MitraNameMatcher;
use PHPUnit\Framework\TestCase;

class MitraNameMatcherTest extends TestCase
{
    public function test_tanda_baca_titik_huruf_besar_dan_badan_usaha_diabaikan(): void
    {
        $this->assertTrue(MitraNameMatcher::sama('PT. Bank Mandiri', 'PT Bank Mandiri (Persero) Tbk'));
        $this->assertTrue(MitraNameMatcher::sama('Cap Advisory Group PTE. LTD .', 'Cap Advisory Group'));
        $this->assertTrue(MitraNameMatcher::sama('PT SAT NUSAPERSADA', 'PT Sat Nusapersada Tbk'));
        $this->assertTrue(MitraNameMatcher::sama('Ultima Tekno Solusindo', 'PT Ultima Tekno Solusindo'));
    }

    public function test_salah_ketik_kecil_dianggap_sama(): void
    {
        $this->assertTrue(MitraNameMatcher::sama('Yayasa Ikbal-M-Yos Batam', 'Yayasan Ikbal-M-Yos Batam'));
        $this->assertTrue(MitraNameMatcher::sama('Nadhlatul Ulama', 'Nahdlatul Ulama'));
        $this->assertTrue(MitraNameMatcher::sama('Univeritas Darussalam Gontor', 'Universitas Darussalam Gontor'));
        $this->assertTrue(MitraNameMatcher::sama('PT Rajawali Angksa Showroom', 'PT Rajawali Angkasa Showroom'));
    }

    public function test_instansi_yang_berbeda_tidak_digabung(): void
    {
        // Angka berbeda.
        $this->assertFalse(MitraNameMatcher::sama('SMK Negeri 1 Tanjungpinang', 'SMK Negeri 4 Tanjungpinang'));
        // Nama tempat selisih 2 huruf bukan typo.
        $this->assertFalse(MitraNameMatcher::sama('Politeknik Negeri Padang', 'Politeknik Negeri Malang'));
        // Jumlah kata berbeda.
        $this->assertFalse(MitraNameMatcher::sama('Bank Indonesia', 'PT Bank KB Indonesia Tbk'));
        // Kata pendek harus persis.
        $this->assertFalse(MitraNameMatcher::sama('PT ABCD Indonesia', 'PT ABDC Indonesia'));
        // Kata utama berbeda.
        $this->assertFalse(MitraNameMatcher::sama('Universitas Sumatera Utara', 'Universitas Sumatera Barat'));
    }

    public function test_nama_kosong_atau_hanya_badan_usaha_tidak_pernah_cocok_dengan_sembarang_nama(): void
    {
        $this->assertFalse(MitraNameMatcher::sama('', 'PT Apa Saja'));
        $this->assertFalse(MitraNameMatcher::sama('PT', 'PT Apa Saja'));
    }

    public function test_pasangan_yang_ditetapkan_manual_dianggap_sama(): void
    {
        $this->assertTrue(MitraNameMatcher::sama('Bnk BTN Syariah', 'Bank BTN Syariah'));
        $this->assertTrue(MitraNameMatcher::sama('PT. KB BANK INDONESIA', 'PT Bank KB Indonesia Tbk'));
        $this->assertTrue(MitraNameMatcher::sama('PT SMOE Indonesia', 'PT. SOME Indonesia'));
        $this->assertTrue(MitraNameMatcher::sama('Yayasan Embun Pelangi', 'Yayasan Embun Pelangi Kota Batam'));
        $this->assertSame('ditetapkan manual', MitraNameMatcher::alasan('Bnk BTN Syariah', 'Bank BTN Syariah'));

        // Hanya pasangan yang ditetapkan: Bank Indonesia (bank sentral) tetap berbeda.
        $this->assertFalse(MitraNameMatcher::sama('Bank Indonesia', 'PT Bank KB Indonesia Tbk'));
        $this->assertFalse(MitraNameMatcher::sama('Bank Indonesia', 'PT. KB BANK INDONESIA'));
    }

    public function test_sekolah_dengan_jenis_nomor_dan_kota_sama_dianggap_sama(): void
    {
        $this->assertTrue(MitraNameMatcher::sama('SMKN 1 Tanjung Pinang', 'Sekolah SMK Negeri 1 Tanjung Pinang'));
        $this->assertTrue(MitraNameMatcher::sama('SMK NEGERI 1 TANJUNGPINANG', 'SMKN 1 Tanjung Pinang'));
        $this->assertTrue(MitraNameMatcher::sama('SMK 1 Negeri Batam', 'SMK Negeri 1 Batam'));
        $this->assertTrue(MitraNameMatcher::sama('SMK N 9 BATAM', 'Sekolah SMK Negeri 9 Batam'));
        $this->assertTrue(MitraNameMatcher::sama('SMKN 4 Kota Malang', 'Sekolah SMK Negeri 4 Malang'));
    }

    public function test_sekolah_beda_nomor_kota_atau_jenis_tidak_digabung(): void
    {
        $this->assertFalse(MitraNameMatcher::sama('SMK Negeri 1 Batam', 'SMK Negeri 3 Batam'));
        $this->assertFalse(MitraNameMatcher::sama('SMK Negeri 1 Batam', 'SMK Negeri 1 Garut'));
        $this->assertFalse(MitraNameMatcher::sama('SMA Negeri 9 Batam', 'SMK Negeri 9 Batam'));
        // Bukan nama sekolah bernomor -> tidak ada kunci sekolah.
        $this->assertNull(MitraNameMatcher::kunciSekolah('Politeknik Negeri Batam'));
        $this->assertNull(MitraNameMatcher::kunciSekolah('SMANGGI Batam 5'));
    }

    public function test_awalan_sekolah_di_depan_smk_diabaikan_tapi_sekolah_tinggi_tidak(): void
    {
        $this->assertTrue(MitraNameMatcher::sama('SMK DIRGANTARA RIAU', 'Sekolah SMK Dirgantara Riau'));
        $this->assertTrue(MitraNameMatcher::sama('SMK Pertiwi Batam', 'Sekolah SMK Pertiwi Batam'));
        $this->assertFalse(MitraNameMatcher::sama('Tinggi Ilmu Ekonomi Bentara Persada', 'Sekolah Tinggi Ilmu Ekonomi Bentara Persada'));
    }

    public function test_kelompok_pii_dan_direktorat_dianggap_satu_instansi(): void
    {
        $this->assertTrue(MitraNameMatcher::sama('PII Cabang Kota Batam', 'PERSATUAN INSINYUR INDONESIA PENGURUS CABANG BATAM'));
        $this->assertTrue(MitraNameMatcher::sama('PII Cabang Batam Kota', 'Persatuan Insinyur Indonesia (PII) Cabang Kota Batam'));
        $this->assertTrue(MitraNameMatcher::sama('Direktorat Pembelajaran dan Kemahasiswaan', 'Direktorat Pembelajaran dan Kemahasiswaan Direktorat Jendral Pendidikan Tinggi'));
        $this->assertFalse(MitraNameMatcher::sama('PII Cabang Kota Batam', 'Direktorat Pembelajaran dan Kemahasiswaan'));
    }

    public function test_nama_mirip_nama_pendek_yang_ada_di_nama_panjang(): void
    {
        $this->assertTrue(MitraNameMatcher::mirip('Infineon', 'PT Infineon Technologies Batam'));
        $this->assertTrue(MitraNameMatcher::mirip('Perpustakaan Nasional', 'Perpustakaan Nasional Republik Indonesia'));

        // Jenis instansi berbeda / angka berbeda / hanya kata umum -> tidak mirip.
        $this->assertFalse(MitraNameMatcher::mirip('Universitas Jambi', 'Politeknik Jambi'));
        $this->assertFalse(MitraNameMatcher::mirip('SMK Negeri 1 Batam', 'SMK Negeri 3 Batam'));
        $this->assertFalse(MitraNameMatcher::mirip('Universitas Batam', 'Politeknik Batam'));
    }

    public function test_infineon_ditetapkan_sama_dengan_pt_infineon_technologies_batam(): void
    {
        $this->assertTrue(MitraNameMatcher::sama('infineon', 'PT Infineon Technologies Batam'));
    }
}

