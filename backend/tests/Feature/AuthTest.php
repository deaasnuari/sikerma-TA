<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private function dataRegister(array $override = []): array
    {
        return array_merge([
            'name'                  => 'Budi Santoso',
            'institution_name'      => 'PT Maju Bersama',
            'negara'                => 'Indonesia',
            'username'              => 'budisantoso',
            'email'                 => 'budi@example.com',
            'phone'                 => '081234567890',
            'position'              => 'Direktur',
            'account_type'          => 'Industri',
            'role'                  => 'external',
            'password'              => 'Password@123',
            'password_confirmation' => 'Password@123',
        ], $override);
    }

    private function buatUserLogin(array $override = []): User
    {
        return User::factory()->create(array_merge([
            'email'    => 'budi@example.com',
            'username' => 'budisantoso',
            'password' => Hash::make('Password@123'),
            'role'     => 'external',
        ], $override));
    }

    // -------------------------------------------------------------------------
    // Register
    // -------------------------------------------------------------------------

    public function test_registrasi_pengguna_baru_berhasil(): void
    {
        $response = $this->postJson('/api/register', $this->dataRegister());

        $response->assertStatus(201)
            ->assertJsonPath('message', 'Registrasi mitra berhasil. Akun Anda sudah aktif dan bisa langsung login.')
            ->assertJsonStructure([
                'message',
                'user' => ['id', 'name', 'email', 'username', 'role', 'approval_status'],
            ]);

        $this->assertDatabaseHas('users', [
            'email' => 'budi@example.com',
            'role'  => 'external',
        ]);
    }

    public function test_registrasi_gagal_jika_email_sudah_terdaftar(): void
    {
        User::factory()->create(['email' => 'budi@example.com']);

        $response = $this->postJson('/api/register', $this->dataRegister());

        $response->assertStatus(422);
    }

    public function test_registrasi_gagal_jika_username_sudah_dipakai(): void
    {
        User::factory()->create(['username' => 'budisantoso']);

        $response = $this->postJson('/api/register', $this->dataRegister());

        $response->assertStatus(422);
    }

    public function test_registrasi_gagal_jika_field_wajib_kosong(): void
    {
        $response = $this->postJson('/api/register', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'email', 'password', 'username', 'institution_name', 'phone', 'position', 'account_type']);
    }

    public function test_registrasi_gagal_jika_password_tidak_cukup_kuat(): void
    {
        $response = $this->postJson('/api/register', $this->dataRegister([
            'password'              => '12345678',
            'password_confirmation' => '12345678',
        ]));

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_registrasi_gagal_jika_konfirmasi_password_tidak_cocok(): void
    {
        $response = $this->postJson('/api/register', $this->dataRegister([
            'password'              => 'Password@123',
            'password_confirmation' => 'BedaPassword@999',
        ]));

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_registrasi_gagal_jika_email_tidak_valid(): void
    {
        $response = $this->postJson('/api/register', $this->dataRegister([
            'email' => 'bukan-email',
        ]));

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    // -------------------------------------------------------------------------
    // Login
    // -------------------------------------------------------------------------

    public function test_login_berhasil_dengan_email_dan_password_benar(): void
    {
        $this->buatUserLogin();

        $response = $this->postJson('/api/login', [
            'email'    => 'budi@example.com',
            'password' => 'Password@123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['access_token', 'token_type', 'user'])
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('user.role', 'external');
    }

    public function test_login_berhasil_menggunakan_username(): void
    {
        $this->buatUserLogin();

        $response = $this->postJson('/api/login', [
            'email'    => 'budisantoso',
            'password' => 'Password@123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['access_token']);
    }

    public function test_login_role_diambil_otomatis_dari_akun_bukan_dari_request(): void
    {
        $this->buatUserLogin(['role' => 'admin']);

        $response = $this->postJson('/api/login', [
            'email'    => 'budi@example.com',
            'password' => 'Password@123',
        ]);

        $response->assertStatus(200)->assertJsonPath('user.role', 'admin');
    }

    public function test_login_gagal_jika_password_salah(): void
    {
        $this->buatUserLogin();

        $response = $this->postJson('/api/login', [
            'email'    => 'budi@example.com',
            'password' => 'PasswordSalah!99',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_login_gagal_jika_email_tidak_terdaftar(): void
    {
        $response = $this->postJson('/api/login', [
            'email'    => 'tidakada@example.com',
            'password' => 'Password@123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_login_akun_internal_hasil_ldap_ditolak_harus_pakai_ldap(): void
    {
        $this->buatUserLogin(['role' => 'internal', 'auth_provider' => 'ldap']);

        $response = $this->postJson('/api/login', [
            'email'    => 'budi@example.com',
            'password' => 'Password@123',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_login_akun_pimpinan_hasil_ldap_ditolak_harus_pakai_ldap(): void
    {
        $this->buatUserLogin(['role' => 'pimpinan', 'auth_provider' => 'ldap']);

        $response = $this->postJson('/api/login', [
            'email'    => 'budi@example.com',
            'password' => 'Password@123',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_login_akun_internal_lama_non_ldap_tetap_bisa_login_manual(): void
    {
        // Akun demo/testing lama (auth_provider bukan 'ldap') tetap boleh login manual
        // walau role-nya internal, supaya akun-akun testing yang sudah ada tidak hilang aksesnya.
        $this->buatUserLogin(['role' => 'internal', 'auth_provider' => 'local']);

        $response = $this->postJson('/api/login', [
            'email'    => 'budi@example.com',
            'password' => 'Password@123',
        ]);

        $response->assertStatus(200)->assertJsonPath('user.role', 'internal');
    }

    public function test_login_akun_pimpinan_lama_non_ldap_tetap_bisa_login_manual(): void
    {
        $this->buatUserLogin(['role' => 'pimpinan', 'auth_provider' => 'local']);

        $response = $this->postJson('/api/login', [
            'email'    => 'budi@example.com',
            'password' => 'Password@123',
        ]);

        $response->assertStatus(200)->assertJsonPath('user.role', 'pimpinan');
    }

    // -------------------------------------------------------------------------
    // Login LDAP (akun kampus)
    // -------------------------------------------------------------------------

    private function mockCivitas(array $data): void
    {
        $this->mock(\App\Services\CivitasAuthService::class, function ($mock) use ($data) {
            $mock->shouldReceive('loginStaff')->once()->andReturn($data);
        });
    }

    public function test_login_ldap_berhasil_untuk_akun_yang_sudah_terdaftar(): void
    {
        $user = User::factory()->create([
            'role' => 'internal',
            'nik'  => '1234567890',
            'email' => 'dosen@polibatam.ac.id',
        ]);

        $this->mockCivitas([
            'NIK'   => '1234567890',
            'NAMA'  => $user->name,
            'EMAIL' => 'dosen@polibatam.ac.id',
        ]);

        $response = $this->postJson('/api/login-kampus', [
            'username' => 'dosen.polibatam',
            'password' => 'PasswordKampus123',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('user.id', (string) $user->id)
            ->assertJsonPath('user.role', 'internal');
    }

    public function test_login_ldap_membuat_akun_baru_jika_belum_terdaftar(): void
    {
        $this->mockCivitas([
            'NIK'        => '9988776655',
            'NAMA'       => 'Dosen Baru',
            'EMAIL'      => 'dosenbaru@polibatam.ac.id',
            'NIP'        => '198001012020',
            'UNIT_KERJA' => 'Teknik Informatika',
            'STAFF'      => 'Dosen',
        ]);

        $response = $this->postJson('/api/login-kampus', [
            'username' => 'dosenbaru',
            'password' => 'PasswordKampus123',
        ]);

        $response->assertStatus(200)->assertJsonPath('user.role', 'internal');

        $this->assertDatabaseHas('users', [
            'nik'  => '9988776655',
            'role' => 'internal',
            'auth_provider' => 'ldap',
        ]);
    }

    public function test_login_ldap_gagal_jika_kredensial_kampus_salah(): void
    {
        $this->mock(\App\Services\CivitasAuthService::class, function ($mock) {
            $mock->shouldReceive('loginStaff')
                ->once()
                ->andThrow(new \RuntimeException('Username atau password kampus salah.'));
        });

        $response = $this->postJson('/api/login-kampus', [
            'username' => 'dosen.polibatam',
            'password' => 'salah',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    public function test_login_ldap_ditolak_untuk_akun_admin(): void
    {
        User::factory()->create([
            'role'  => 'admin',
            'nik'   => '1234567890',
            'email' => 'admin-civitas@polibatam.ac.id',
        ]);

        $this->mockCivitas([
            'NIK'   => '1234567890',
            'NAMA'  => 'Admin Civitas',
            'EMAIL' => 'admin-civitas@polibatam.ac.id',
        ]);

        $response = $this->postJson('/api/login-kampus', [
            'username' => 'admin.civitas',
            'password' => 'PasswordKampus123',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    public function test_login_ldap_gagal_tanpa_username_atau_password(): void
    {
        $this->postJson('/api/login-kampus', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['username', 'password']);
    }

    // -------------------------------------------------------------------------
    // Me
    // -------------------------------------------------------------------------

    public function test_me_mengembalikan_data_pengguna_yang_sedang_login(): void
    {
        $user = User::factory()->create(['role' => 'internal']);

        $response = $this->actingAs($user)->getJson('/api/me');

        $response->assertStatus(200)
            ->assertJsonPath('user.email', $user->email)
            ->assertJsonPath('user.role', 'internal')
            ->assertJsonStructure(['user' => ['id', 'name', 'email', 'role', 'approval_status']]);
    }

    public function test_me_mengembalikan_401_jika_tidak_ada_token(): void
    {
        $response = $this->getJson('/api/me');

        $response->assertStatus(401);
    }

    // -------------------------------------------------------------------------
    // Logout
    // -------------------------------------------------------------------------

    public function test_logout_berhasil_dan_token_dihapus(): void
    {
        $user  = User::factory()->create();
        $token = $user->createToken('test-token')->plainTextToken;

        $this->withToken($token)->postJson('/api/logout')
            ->assertStatus(200)
            ->assertJsonPath('message', 'Logout berhasil.');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_logout_gagal_tanpa_token(): void
    {
        $response = $this->postJson('/api/logout');

        $response->assertStatus(401);
    }
}
