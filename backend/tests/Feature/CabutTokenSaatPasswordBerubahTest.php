<?php

namespace Tests\Feature;

use App\Models\OtpCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

// Sesi lama tidak boleh tetap hidup setelah password diganti.
class CabutTokenSaatPasswordBerubahTest extends TestCase
{
    use RefreshDatabase;

    public function test_reset_password_mencabut_semua_token_login(): void
    {
        $user = User::factory()->create([
            'email' => 'resetme@test.com', 'password' => Hash::make('OldPassword@123'), 'role' => 'external',
        ]);
        $user->createToken('sesi-lama-1');
        $user->createToken('sesi-lama-2');
        $this->assertSame(2, $user->tokens()->count());

        $this->postJson('/api/forgot-password', ['email' => 'resetme@test.com'])->assertOk();
        $otp = OtpCode::where('email', 'resetme@test.com')->value('otp');

        $this->postJson('/api/reset-password', [
            'email' => 'resetme@test.com', 'otp' => $otp,
            'password' => 'NewPassword@456', 'password_confirmation' => 'NewPassword@456',
        ])->assertOk();

        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_admin_ganti_password_user_mencabut_token_user_itu(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['role' => 'external']);
        $target->createToken('sesi-lama');

        $this->actingAs($admin)->putJson("/api/admin/users/{$target->id}", [
            'name' => $target->name, 'institution_name' => $target->institution_name,
            'username' => $target->username, 'email' => $target->email, 'phone' => $target->phone,
            'password' => 'BrandNew@789',
        ])->assertOk();

        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_update_tanpa_ganti_password_tidak_mencabut_token(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['role' => 'external']);
        $target->createToken('sesi-aktif');

        $this->actingAs($admin)->putJson("/api/admin/users/{$target->id}", [
            'name' => 'Nama Baru', 'institution_name' => $target->institution_name,
            'username' => $target->username, 'email' => $target->email, 'phone' => $target->phone,
        ])->assertOk();

        $this->assertSame(1, $target->tokens()->count());
    }
}
