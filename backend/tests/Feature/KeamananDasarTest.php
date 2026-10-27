<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KeamananDasarTest extends TestCase
{
    use RefreshDatabase;

    public function test_respons_api_membawa_header_keamanan(): void
    {
        $response = $this->getJson('/api/public/unit-prodi');

        $response->assertOk();
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'no-referrer');
        $this->assertStringContainsString('frame-ancestors', (string) $response->headers->get('Content-Security-Policy'));
    }

    public function test_input_sql_injection_di_pencarian_diperlakukan_sebagai_teks_biasa(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $payload = "' OR '1'='1'; DROP TABLE users; --";
        $this->actingAs($admin)->getJson('/api/master/mitra?search='.urlencode($payload))->assertOk();
        $this->actingAs($admin)->getJson('/api/dokumen-kerjasama?search='.urlencode($payload))->assertOk();
        $this->actingAs($admin)->getJson('/api/pengajuan?search='.urlencode($payload))->assertOk();

        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }

    private function panggilPrivat(string $metode, array $argumen)
    {
        $controller = app(\App\Http\Controllers\PengajuanController::class);
        $ref = new \ReflectionMethod($controller, $metode);
        $ref->setAccessible(true);

        return $ref->invoke($controller, ...$argumen);
    }

    public function test_lampiran_dengan_ekstensi_berbahaya_ditolak(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->panggilPrivat('persistDataUrlAttachment', [[
            'name' => 'shell.php',
            'url' => 'data:text/plain;base64,'.base64_encode('<?php echo 1;'),
        ]]);
    }

    public function test_lampiran_pdf_diterima(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');

        $path = $this->panggilPrivat('persistDataUrlAttachment', [[
            'name' => 'surat.pdf',
            'url' => 'data:application/pdf;base64,'.base64_encode('%PDF-1.4 test'),
        ]]);

        $this->assertStringEndsWith('.pdf', $path);
        \Illuminate\Support\Facades\Storage::disk('public')->assertExists($path);
    }

    public function test_path_lampiran_dengan_traversal_ditolak(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->panggilPrivat('normalizeAttachmentPath', [['path' => '../../.env']]);
    }

    public function test_rujukan_berkas_milik_pengajuan_lain_ditolak(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);

        $this->panggilPrivat('pastikanRujukanBerkasMilikPengajuan', [
            'pengajuan/2026/10/milik-orang-lain.pdf',
            ['pengajuan/2026/10/milik-saya.pdf'],
        ]);
    }

    public function test_rujukan_berkas_milik_sendiri_dan_tautan_http_diterima(): void
    {
        $this->panggilPrivat('pastikanRujukanBerkasMilikPengajuan', [
            'pengajuan/2026/10/milik-saya.pdf',
            ['pengajuan/2026/10/milik-saya.pdf'],
        ]);
        $this->panggilPrivat('pastikanRujukanBerkasMilikPengajuan', ['https://drive.google.com/x', []]);

        $this->addToAssertionCount(1);
    }
}
