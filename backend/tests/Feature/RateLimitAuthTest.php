<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RateLimitAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_dibatasi_per_akun_setelah_5_percobaan_per_menit(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['email' => 'korban@example.com', 'password' => 'salah'])
                ->assertStatus(422);
        }

        $this->postJson('/api/login', ['email' => 'korban@example.com', 'password' => 'salah'])
            ->assertStatus(429);
    }

    public function test_tebak_otp_dibatasi_per_email_walau_dari_banyak_ip(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.($i + 1)])
                ->postJson('/api/otp/verify', ['email' => 'korban@example.com', 'otp' => '00000'.$i]);
        }

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.99'])
            ->postJson('/api/otp/verify', ['email' => 'korban@example.com', 'otp' => '123456'])
            ->assertStatus(429);
    }
}
