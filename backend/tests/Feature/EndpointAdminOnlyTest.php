<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EndpointAdminOnlyTest extends TestCase
{
    use RefreshDatabase;

    private function payloadEmail(): array
    {
        return [
            'email' => 'mitra@example.com', 'subject' => 'Tes', 'body' => 'Isi',
            'jenis' => 'urgent', 'noDokumen' => '001', 'namaMitra' => 'PT Contoh',
        ];
    }

    public function test_kirim_email_tanpa_login_ditolak(): void
    {
        Mail::fake();
        $this->postJson('/api/notifications/send-email', $this->payloadEmail())->assertStatus(401);
        $this->postJson('/api/notifications/send-bulk', [])->assertStatus(401);
        Mail::assertNothingSent();
    }

    public function test_kirim_email_oleh_non_admin_ditolak(): void
    {
        Mail::fake();
        Sanctum::actingAs(User::factory()->create(['role' => 'internal']));
        $this->postJson('/api/notifications/send-email', $this->payloadEmail())->assertStatus(403);
        Mail::assertNothingSent();
    }

    public function test_carousel_tanpa_login_atau_non_admin_ditolak(): void
    {
        $this->postJson('/api/admin/carousel-images', [])->assertStatus(401);
        $this->patchJson('/api/admin/carousel-images/1', ['sort_order' => 1])->assertStatus(401);
        $this->deleteJson('/api/admin/carousel-images/1')->assertStatus(401);

        Sanctum::actingAs(User::factory()->create(['role' => 'internal']));
        $this->postJson('/api/admin/carousel-images', [])->assertStatus(403);
    }
}
