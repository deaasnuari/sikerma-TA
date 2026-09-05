<?php

namespace Tests\Feature;

use App\Models\MasterUnitProdi;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminUserTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function internal(): User
    {
        return User::factory()->create(['role' => 'internal']);
    }

    private function dataUser(array $override = []): array
    {
        return array_merge([
            'name'             => 'John Doe',
            'institution_name' => 'Polibatam',
            'username'         => 'johndoe',
            'email'            => 'john@polibatam.ac.id',
            'phone'            => '081234567890',
            'position'         => 'Dosen',
            'role'             => 'internal',
            'approval_status'  => 'active',
            'password'         => 'Password@123',
        ], $override);
    }

    // ------------------------------------------------------------------
    // index
    // ------------------------------------------------------------------

    public function test_admin_dapat_melihat_daftar_user(): void
    {
        $admin = $this->admin();
        User::factory()->count(3)->create();

        $response = $this->actingAs($admin)->getJson('/api/admin/users');

        $response->assertOk()->assertJsonStructure(['data']);
        $this->assertGreaterThanOrEqual(4, count($response->json('data')));
    }

    public function test_daftar_user_menampilkan_jabatan_struktural_dan_nama_unit(): void
    {
        // Manajemen User harus langsung nampilin bagian/jabatan struktural user (Ketua
        // Jurusan/Ketua Prodi/Kepala Unit) hasil deteksi NIK vs data Civitas — bukan cuma
        // role mentah. Dicek untuk role 'unit' juga, bukan cuma 'internal'.
        $admin = $this->admin();

        $upaTik = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => 'UPA TIK', 'aktif' => true]);
        $kepalaUnit = User::factory()->create(['role' => 'unit', 'nik' => '221318']);
        $dosenBiasa = User::factory()->create(['role' => 'internal', 'nik' => '000000']);

        $this->mock(\App\Services\CivitasStructureService::class, function ($mock) {
            $mock->shouldReceive('getJurusan')->andReturn([]);
            $mock->shouldReceive('getProgramStudi')->andReturn([]);
            $mock->shouldReceive('getUnit')->andReturn([[
                'ID_UNIT' => '18', 'NAMA_UNIT' => 'UPA TIK', 'NIK_KEPALA_UNIT' => '221318', 'NAMA_KEPALA_UNIT' => 'Agus Prasetyo',
            ]]);
        });

        $response = $this->actingAs($admin)->getJson('/api/admin/users');
        $response->assertOk();

        $data = collect($response->json('data'));
        $kepalaUnitPayload = $data->firstWhere('id', (string) $kepalaUnit->id);
        $dosenPayload = $data->firstWhere('id', (string) $dosenBiasa->id);

        $this->assertEquals('kepala_unit', $kepalaUnitPayload['structural_position']);
        $this->assertEquals('Kepala Unit', $kepalaUnitPayload['structural_position_label']);
        $this->assertEquals($upaTik->id, $kepalaUnitPayload['structural_unit_id']);
        $this->assertEquals('UPA TIK', $kepalaUnitPayload['structural_unit_name']);

        $this->assertNull($dosenPayload['structural_position']);
        $this->assertNull($dosenPayload['structural_unit_name']);
    }

    public function test_bukan_admin_ditolak_melihat_daftar_user(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->getJson('/api/admin/users')
            ->assertForbidden();
    }

    public function test_tanpa_token_ditolak_melihat_daftar_user(): void
    {
        $this->getJson('/api/admin/users')->assertUnauthorized();
    }

    // ------------------------------------------------------------------
    // store
    // ------------------------------------------------------------------

    public function test_admin_dapat_membuat_user_baru(): void
    {
        $admin = $this->admin();

        $response = $this->actingAs($admin)->postJson('/api/admin/users', $this->dataUser());

        $response->assertCreated()
            ->assertJson(['message' => 'User berhasil dibuat.'])
            ->assertJsonPath('user.email', 'john@polibatam.ac.id');

        $this->assertDatabaseHas('users', ['email' => 'john@polibatam.ac.id']);
    }

    public function test_buat_user_gagal_duplikat_email(): void
    {
        $admin = $this->admin();
        User::factory()->create(['email' => 'john@polibatam.ac.id']);

        $this->actingAs($admin)->postJson('/api/admin/users', $this->dataUser())
            ->assertUnprocessable();
    }

    public function test_buat_user_gagal_duplikat_username(): void
    {
        $admin = $this->admin();
        User::factory()->create(['username' => 'johndoe']);

        $this->actingAs($admin)->postJson('/api/admin/users', $this->dataUser())
            ->assertUnprocessable();
    }

    public function test_buat_user_gagal_field_wajib_kosong(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/admin/users', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'username', 'phone', 'role', 'approval_status', 'password']);
    }

    public function test_buat_user_gagal_role_tidak_valid(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/admin/users', $this->dataUser(['role' => 'superadmin']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['role']);
    }

    private function unitKerja(string $nama = 'UPA TIK'): MasterUnitProdi
    {
        return MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'unit_kerja', 'nama' => $nama, 'aktif' => true]);
    }

    public function test_admin_dapat_buat_dan_update_user_role_unit(): void
    {
        $admin = $this->admin();
        $unit = $this->unitKerja();

        $response = $this->actingAs($admin)->postJson('/api/admin/users', $this->dataUser([
            'email' => 'unit-test@polibatam.ac.id',
            'username' => 'unittest',
            'role' => 'unit',
            'unit_prodi_id' => $unit->id,
        ]));
        $response->assertStatus(201)
            ->assertJsonPath('user.role', 'unit')
            ->assertJsonPath('user.unit_prodi_id', $unit->id)
            ->assertJsonPath('user.unit_prodi_nama', $unit->nama);

        $userId = $response->json('user.id');
        $this->actingAs($admin)->putJson("/api/admin/users/{$userId}", [
            'name' => 'John Doe', 'email' => 'unit-test@polibatam.ac.id', 'role' => 'unit', 'unit_prodi_id' => $unit->id,
        ])->assertOk()->assertJsonPath('user.role', 'unit');
    }

    public function test_buat_user_role_unit_gagal_tanpa_unit_prodi_id(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/admin/users', $this->dataUser([
            'email' => 'unit-wajib@polibatam.ac.id',
            'username' => 'unitwajib',
            'role' => 'unit',
        ]))->assertUnprocessable()->assertJsonValidationErrors(['unit_prodi_id']);
    }

    public function test_buat_user_role_unit_gagal_unit_prodi_id_menunjuk_prodi(): void
    {
        $admin = $this->admin();
        $prodi = MasterUnitProdi::create(['jenis_node' => 'prodi', 'nama' => 'D3 Teknik Informatika', 'aktif' => true]);

        $this->actingAs($admin)->postJson('/api/admin/users', $this->dataUser([
            'email' => 'unit-salah-node@polibatam.ac.id',
            'username' => 'unitsalahnode',
            'role' => 'unit',
            'unit_prodi_id' => $prodi->id,
        ]))->assertUnprocessable()->assertJsonValidationErrors(['unit_prodi_id']);
    }

    public function test_buat_user_role_selain_unit_tidak_wajib_isi_unit_prodi_id(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/admin/users', $this->dataUser([
            'email' => 'internal-tanpa-unit@polibatam.ac.id',
            'username' => 'internaltanpaunit',
            'role' => 'internal',
        ]))->assertStatus(201)->assertJsonPath('user.unit_prodi_id', null);
    }

    public function test_update_user_role_unit_gagal_ganti_role_lain_tanpa_unit_prodi_id(): void
    {
        // Kalau role user diubah JADI 'unit' lewat update(), Unit tetap wajib diisi —
        // bukan cuma dicek pas create.
        $admin = $this->admin();
        $target = User::factory()->create(['role' => 'internal']);

        $this->actingAs($admin)->putJson("/api/admin/users/{$target->id}", [
            'name' => $target->name, 'email' => $target->email, 'role' => 'unit',
        ])->assertUnprocessable()->assertJsonValidationErrors(['unit_prodi_id']);
    }

    public function test_bukan_admin_tidak_bisa_membuat_user(): void
    {
        $user = $this->internal();

        $this->actingAs($user)->postJson('/api/admin/users', $this->dataUser())
            ->assertForbidden();
    }

    // ------------------------------------------------------------------
    // update
    // ------------------------------------------------------------------

    public function test_admin_dapat_update_user(): void
    {
        $admin  = $this->admin();
        $target = User::factory()->create(['name' => 'Lama']);

        $response = $this->actingAs($admin)->putJson("/api/admin/users/{$target->id}", [
            'name'             => 'Baru',
            'institution_name' => $target->institution_name,
            'username'         => $target->username,
            'email'            => $target->email,
            'phone'            => $target->phone,
        ]);

        $response->assertOk()->assertJsonPath('user.name', 'Baru');
        $this->assertDatabaseHas('users', ['id' => $target->id, 'name' => 'Baru']);
    }

    public function test_update_user_gagal_bukan_admin(): void
    {
        $user   = $this->internal();
        $target = User::factory()->create();

        $this->actingAs($user)->putJson("/api/admin/users/{$target->id}", ['name' => 'Baru'])
            ->assertForbidden();
    }

    public function test_admin_tidak_bisa_ubah_role_admin_terakhir(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->putJson("/api/admin/users/{$admin->id}", [
            'name'             => $admin->name,
            'institution_name' => $admin->institution_name,
            'username'         => $admin->username,
            'email'            => $admin->email,
            'phone'            => $admin->phone,
            'role'             => 'internal',
        ])->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // updateApprovalStatus
    // ------------------------------------------------------------------

    public function test_admin_dapat_update_approval_status(): void
    {
        $admin  = $this->admin();
        $target = User::factory()->external()->create(['approval_status' => 'pending']);

        $response = $this->actingAs($admin)->patchJson(
            "/api/admin/users/{$target->id}/approval-status",
            ['approval_status' => 'active']
        );

        $response->assertOk()->assertJsonPath('user.approval_status', 'active');
        $this->assertDatabaseHas('users', ['id' => $target->id, 'approval_status' => 'active']);
    }

    public function test_approval_status_tidak_valid_gagal(): void
    {
        $admin  = $this->admin();
        $target = User::factory()->create();

        $this->actingAs($admin)->patchJson(
            "/api/admin/users/{$target->id}/approval-status",
            ['approval_status' => 'diterima']
        )->assertUnprocessable()->assertJsonValidationErrors(['approval_status']);
    }

    // ------------------------------------------------------------------
    // destroy
    // ------------------------------------------------------------------

    public function test_admin_dapat_hapus_user(): void
    {
        $admin  = $this->admin();
        $target = User::factory()->create();

        $this->actingAs($admin)->deleteJson("/api/admin/users/{$target->id}")
            ->assertOk()->assertJsonFragment(['message' => 'User berhasil dihapus.']);

        $this->assertDatabaseMissing('users', ['id' => $target->id]);
    }

    public function test_admin_tidak_bisa_hapus_diri_sendiri_jika_admin_terakhir(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->deleteJson("/api/admin/users/{$admin->id}")
            ->assertStatus(422);
    }

    public function test_bukan_admin_tidak_bisa_hapus_user(): void
    {
        $user   = $this->internal();
        $target = User::factory()->create();

        $this->actingAs($user)->deleteJson("/api/admin/users/{$target->id}")
            ->assertForbidden();
    }
}
