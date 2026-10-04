<?php

namespace Tests\Feature;

use App\Models\MasterMitra;
use App\Models\OtpCode;
use App\Models\User;
use App\Services\MasterMitraResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class RegistrasiMasterMitraTest extends TestCase
{
    use RefreshDatabase;

    private function daftar(string $instansi, array $override = []): void
    {
        Mail::fake();
        $this->postJson('/api/otp/send', array_merge([
            'name' => 'Sari Dewi', 'institution_name' => $instansi, 'negara' => 'Indonesia',
            'username' => 'saridewi', 'email' => 'sari@example.com', 'phone' => '082345678901',
            'position' => 'Manajer', 'account_type' => 'Industri',
            'password' => 'Password@123', 'password_confirmation' => 'Password@123',
        ], $override))->assertOk();

        $email = $override['email'] ?? 'sari@example.com';
        $otp = OtpCode::where('email', $email)->value('otp');
        $this->postJson('/api/otp/verify', ['email' => $email, 'otp' => $otp])->assertCreated();
    }

    public function test_pencarian_mitra_mengabaikan_badan_usaha_dan_salah_ketik_kecil(): void
    {
        $ada = MasterMitra::create(['nama_mitra' => 'PT Bank Mandiri (Persero) Tbk', 'aktif' => true]);
        $typo = MasterMitra::create(['nama_mitra' => 'Yayasan Ikbal-M-Yos Batam', 'aktif' => true]);
        $resolver = new MasterMitraResolver();

        $this->assertSame($ada->id, $resolver->findByName('PT. Bank Mandiri')?->id);
        $this->assertSame($typo->id, $resolver->findByName('Yayasa Ikbal M Yos Batam')?->id);
        $this->assertNull($resolver->findByName('Bank Indonesia'));
    }

    public function test_normalisasi_nama_abaikan_huruf_spasi_dan_tanda_baca(): void
    {
        $this->assertSame(
            MasterMitraResolver::normalize('PT Berkah Jaya'),
            MasterMitraResolver::normalize('  pt. BERKAH  jaya ')
        );
        $this->assertNotSame(MasterMitraResolver::normalize('PT Berkah Jaya'), MasterMitraResolver::normalize('CV Berkah Jaya'));
    }

    public function test_registrasi_instansi_baru_membuat_satu_mitra(): void
    {
        $this->daftar('CV Berkah Jaya');

        $this->assertSame(1, MasterMitra::count());
        $this->assertDatabaseHas('master_mitra', ['nama_mitra' => 'CV Berkah Jaya', 'kategori_mitra' => 'Industri', 'aktif' => true]);
    }

    public function test_registrasi_dengan_penulisan_nama_berbeda_tidak_membuat_mitra_ganda(): void
    {
        MasterMitra::create(['nama_mitra' => 'PT Berkah Jaya', 'aktif' => true]);

        $this->daftar('PT. BERKAH  JAYA');

        $this->assertSame(1, MasterMitra::count());
        $this->assertDatabaseHas('master_mitra', ['nama_mitra' => 'PT Berkah Jaya']);
    }

    public function test_registrasi_tidak_menimpa_data_mitra_yang_sudah_ada(): void
    {
        MasterMitra::create([
            'nama_mitra' => 'CV Berkah Jaya', 'alamat' => 'Jl. Lama 1', 'website' => 'https://berkah.id',
            'kategori_mitra' => 'Swasta', 'tingkat_perusahaan' => 'Nasional', 'aktif' => true,
        ]);

        $this->daftar('CV Berkah Jaya');

        $mitra = MasterMitra::sole();
        $this->assertSame('Jl. Lama 1', $mitra->alamat);
        $this->assertSame('https://berkah.id', $mitra->website);
        $this->assertSame('Swasta', $mitra->kategori_mitra);
        $this->assertSame('Nasional', $mitra->tingkat_perusahaan);
        // Kolom yang masih kosong tetap diisi dari data pendaftar.
        $this->assertSame('sari@example.com', $mitra->email_mitra);
        $this->assertSame('Sari Dewi', $mitra->nama_kontak_utama);
    }

    public function test_akun_kedua_dari_instansi_sama_jadi_kontak_tambahan_bukan_mitra_baru(): void
    {
        $this->daftar('Infinite Studios Batam');
        $this->daftar('infinite studios, batam', [
            'name' => 'Budi Santoso', 'username' => 'budis', 'email' => 'budi@example.com',
            'phone' => '081111111111', 'position' => 'HRD',
        ]);

        $mitra = MasterMitra::sole();
        // Kontak utama tetap pendaftar pertama.
        $this->assertSame('Sari Dewi', $mitra->nama_kontak_utama);
        $this->assertDatabaseCount('kontak_mitra', 1);
        $this->assertDatabaseHas('kontak_mitra', [
            'mitra_id' => $mitra->id, 'nama' => 'Budi Santoso', 'jabatan' => 'HRD',
            'email' => 'budi@example.com', 'telepon' => '081111111111',
            'user_id' => User::where('email', 'budi@example.com')->value('id'),
        ]);

        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin)->getJson('/api/master/mitra')
            ->assertOk()
            ->assertJsonPath('data.0.kontak.0.email', 'budi@example.com');
    }

    public function test_pendaftar_yang_mengisi_kontak_utama_kosong_tidak_dicatat_dobel(): void
    {
        MasterMitra::create(['nama_mitra' => 'CV Berkah Jaya', 'aktif' => true]);

        $this->daftar('CV Berkah Jaya');

        $this->assertSame('Sari Dewi', MasterMitra::sole()->nama_kontak_utama);
        $this->assertDatabaseCount('kontak_mitra', 0);
    }

    public function test_registrasi_memakai_mitra_yang_dipilih_dari_autocomplete(): void
    {
        $dipilih = MasterMitra::create(['nama_mitra' => 'Politeknik Contoh Nusantara', 'aktif' => true]);

        $this->daftar('Politeknik Contoh Nusantara', ['mitra_id' => $dipilih->id]);

        $this->assertSame(1, MasterMitra::count());
        $this->assertSame('sari@example.com', $dipilih->fresh()->email_mitra);
    }

    public function test_password_tidak_disimpan_sebagai_teks_di_otp_dan_form_dibersihkan_setelah_verifikasi(): void
    {
        Mail::fake();
        $this->postJson('/api/otp/send', [
            'name' => 'Sari Dewi', 'institution_name' => 'CV Berkah Jaya', 'negara' => 'Indonesia',
            'username' => 'saridewi', 'email' => 'sari@example.com', 'phone' => '082345678901',
            'position' => 'Manajer', 'account_type' => 'Industri',
            'password' => 'Password@123', 'password_confirmation' => 'Password@123',
        ])->assertOk();

        $record = OtpCode::where('email', 'sari@example.com')->sole();
        $this->assertArrayNotHasKey('password', $record->form_data);
        $this->assertArrayNotHasKey('password_confirmation', $record->form_data);
        $this->assertTrue(Hash::check('Password@123', $record->form_data['password_hash']));

        $this->postJson('/api/otp/verify', ['email' => 'sari@example.com', 'otp' => $record->otp])->assertCreated();

        $this->assertSame([], $record->fresh()->form_data);
        $this->assertTrue(Hash::check('Password@123', User::where('email', 'sari@example.com')->value('password')));
    }

    public function test_otp_lama_dengan_password_teks_masih_bisa_diverifikasi(): void
    {
        OtpCode::create([
            'email' => 'lama@example.com',
            'otp' => '123456',
            'form_data' => [
                'name' => 'Budi', 'institution_name' => 'CV Lama', 'negara' => 'Indonesia',
                'username' => 'budilama', 'email' => 'lama@example.com', 'phone' => '0811',
                'position' => 'Staf', 'account_type' => 'Industri', 'password' => 'Password@123',
            ],
            'expires_at' => now()->addMinutes(5),
            'is_used' => false,
        ]);

        $this->postJson('/api/otp/verify', ['email' => 'lama@example.com', 'otp' => '123456'])->assertCreated();

        $this->assertTrue(Hash::check('Password@123', User::where('email', 'lama@example.com')->value('password')));
    }

    public function test_pencarian_publik_hanya_mengembalikan_id_dan_nama(): void
    {
        MasterMitra::create(['nama_mitra' => 'PT Berkah Jaya', 'email_mitra' => 'rahasia@berkah.id', 'aktif' => true]);
        MasterMitra::create(['nama_mitra' => 'CV Lain', 'aktif' => true]);

        $this->getJson('/api/public/mitra?q=berkah')
            ->assertOk()
            ->assertExactJson(['success' => true, 'data' => [['id' => MasterMitra::where('nama_mitra', 'PT Berkah Jaya')->value('id'), 'nama_mitra' => 'PT Berkah Jaya']], 'total' => 1]);

        $this->getJson('/api/public/mitra?q=b')->assertOk()->assertJsonPath('data', []);
    }

    public function test_pencarian_publik_cocok_sebagian_per_kata_dan_abaikan_tanda_baca(): void
    {
        MasterMitra::create(['nama_mitra' => 'PT. Sumitomo Electric Indonesia', 'aktif' => true]);
        MasterMitra::create(['nama_mitra' => 'Asuransi Sumber Makmur', 'aktif' => true]);
        MasterMitra::create(['nama_mitra' => 'CV Lain', 'aktif' => true]);

        $names = fn (string $q) => array_column($this->getJson('/api/public/mitra?q=' . urlencode($q))->assertOk()->json('data'), 'nama_mitra');

        $this->assertSame(['PT. Sumitomo Electric Indonesia'], $names('sumi'));
        $this->assertSame(['PT. Sumitomo Electric Indonesia'], $names('pt sumitomo'));
        $this->assertSame(['PT. Sumitomo Electric Indonesia'], $names('sumitomo indo'));
        // "sum" kena dua-duanya; nama yang diawali/berisi kata berawalan ketikan tetap muncul.
        $this->assertEqualsCanonicalizing(['PT. Sumitomo Electric Indonesia', 'Asuransi Sumber Makmur'], $names('sum'));
        // Nama yang diawali ketikan diurutkan paling atas.
        $this->assertSame('Asuransi Sumber Makmur', $names('asu')[0]);
    }

    public function test_upsert_by_name_admin_memakai_mitra_yang_sama_walau_penulisan_beda(): void
    {
        $admin = User::factory()->admin()->create();
        $mitra = MasterMitra::create(['nama_mitra' => 'PT Berkah Jaya', 'aktif' => true]);

        $this->actingAs($admin)->postJson('/api/master/mitra/upsert-by-name', [
            'nama_mitra' => 'pt. berkah jaya', 'kategori_mitra' => 'Industri',
        ])->assertOk()->assertJsonPath('data.id', $mitra->id);

        $this->assertSame(1, MasterMitra::count());
        $this->assertSame('PT Berkah Jaya', $mitra->fresh()->nama_mitra);
        $this->assertSame('Industri', $mitra->fresh()->kategori_mitra);

        $this->actingAs($admin)->postJson('/api/master/mitra/upsert-by-name', ['nama_mitra' => 'CV Baru'])
            ->assertCreated();
        $this->assertSame(2, MasterMitra::count());
    }

    public function test_upsert_by_name_hanya_untuk_admin(): void
    {
        $external = User::factory()->create(['role' => 'external']);

        $this->actingAs($external)->postJson('/api/master/mitra/upsert-by-name', ['nama_mitra' => 'CV Baru'])
            ->assertForbidden();
    }
}
