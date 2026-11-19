<?php

namespace Tests\Feature;

use App\Models\CatatanAdmin;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Hak akses Catatan Admin: admin kelola penuh; Internal/External hanya MEMBACA catatan pada
 * pengajuan miliknya (pengajuan.user_pengusul_id = akun login); role lain ditolak.
 */
class CatatanAdminAksesTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function pengajuanMilik(?User $pengusul): Pengajuan
    {
        return Pengajuan::create([
            'nama_pengusul'     => $pengusul?->name ?? 'Tanpa Akun',
            'judul_pengajuan'   => 'Pengajuan Uji',
            'jenis_dokumen'     => 'MOU',
            'status_pengajuan'  => 'menunggu',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id'  => $pengusul?->id,
        ]);
    }

    private function buatCatatan(int $pengajuanId, int $userId, string $teks = 'Catatan uji'): CatatanAdmin
    {
        return CatatanAdmin::create([
            'pengajuan_id'        => $pengajuanId,
            'teks'                => $teks,
            'dibuat_oleh_user_id' => $userId,
        ]);
    }

    public function test_admin_dan_admin_humas_melihat_seluruh_catatan(): void
    {
        $admin = $this->admin();
        $humas = User::factory()->create(['role' => 'admin-humas']);
        $pInt  = $this->pengajuanMilik(User::factory()->create());
        $pExt  = $this->pengajuanMilik(User::factory()->external()->create());
        $this->buatCatatan($pInt->id, $admin->id);
        $this->buatCatatan($pExt->id, $admin->id);

        foreach ([$admin, $humas] as $akun) {
            $this->actingAs($akun)->getJson("/api/catatan-admin?pengajuan_id={$pInt->id}")
                ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.dibuat_oleh_user_id', $admin->id);
            $this->actingAs($akun)->getJson("/api/catatan-admin?pengajuan_id={$pExt->id}")
                ->assertOk()->assertJsonCount(1, 'data');
        }
    }

    public function test_admin_humas_dapat_membuat_ubah_dan_hapus(): void
    {
        $humas = User::factory()->create(['role' => 'admin-humas']);
        $p     = $this->pengajuanMilik(User::factory()->create());

        $id = $this->actingAs($humas)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'a'])
            ->assertCreated()->json('data.id');
        $this->actingAs($humas)->putJson("/api/catatan-admin/{$id}", ['teks' => 'b'])->assertOk();
        $this->actingAs($humas)->deleteJson("/api/catatan-admin/{$id}")->assertOk();
    }

    public function test_admin_kirim_catatan_ke_internal_dan_internal_dapat_melihatnya(): void
    {
        $admin    = $this->admin();
        $internal = User::factory()->create();
        $p        = $this->pengajuanMilik($internal);

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'Mohon lengkapi lampiran', 'untuk_pengusul' => true])
            ->assertCreated();

        $res = $this->actingAs($internal)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")
            ->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('Mohon lengkapi lampiran', $res->json('data.0.teks'));
        // ID akun pembuat tidak dibocorkan ke pengusul.
        $this->assertArrayNotHasKey('dibuat_oleh_user_id', $res->json('data.0'));
    }

    public function test_admin_kirim_catatan_ke_external_dan_external_dapat_melihatnya(): void
    {
        $admin    = $this->admin();
        $external = User::factory()->external()->create();
        $p        = $this->pengajuanMilik($external);

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'Dokumen kurang', 'untuk_pengusul' => true])
            ->assertCreated();

        $this->actingAs($external)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.teks', 'Dokumen kurang');
    }

    public function test_internal_tidak_dapat_melihat_catatan_external_dan_sebaliknya(): void
    {
        $admin    = $this->admin();
        $internal = User::factory()->create();
        $external = User::factory()->external()->create();
        $pInt     = $this->pengajuanMilik($internal);
        $pExt     = $this->pengajuanMilik($external);
        $this->buatCatatan($pInt->id, $admin->id);
        $this->buatCatatan($pExt->id, $admin->id);

        $this->actingAs($internal)->getJson("/api/catatan-admin?pengajuan_id={$pExt->id}")->assertForbidden();
        $this->actingAs($external)->getJson("/api/catatan-admin?pengajuan_id={$pInt->id}")->assertForbidden();
    }

    public function test_internal_tidak_dapat_melihat_catatan_internal_lain(): void
    {
        $admin = $this->admin();
        $a     = User::factory()->create();
        $pB    = $this->pengajuanMilik(User::factory()->create());
        $this->buatCatatan($pB->id, $admin->id);

        $this->actingAs($a)->getJson("/api/catatan-admin?pengajuan_id={$pB->id}")->assertForbidden();
    }

    public function test_pengajuan_tanpa_pemilik_tidak_terbuka_untuk_internal_dan_external(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(null);
        $this->buatCatatan($p->id, $admin->id);

        $this->actingAs(User::factory()->create())->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertForbidden();
        $this->actingAs(User::factory()->external()->create())->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertForbidden();
    }

    public function test_internal_dan_external_tidak_dapat_membuat_ubah_atau_hapus_catatan(): void
    {
        $admin = $this->admin();

        foreach ([User::factory()->create(), User::factory()->external()->create()] as $akun) {
            $p       = $this->pengajuanMilik($akun);
            $catatan = $this->buatCatatan($p->id, $admin->id, 'asli');

            $this->actingAs($akun)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'palsu'])->assertForbidden();
            $this->actingAs($akun)->putJson("/api/catatan-admin/{$catatan->id}", ['teks' => 'diubah'])->assertForbidden();
            $this->actingAs($akun)->deleteJson("/api/catatan-admin/{$catatan->id}")->assertForbidden();

            $this->assertDatabaseHas('catatan_admin', ['id' => $catatan->id, 'teks' => 'asli']);
            $this->assertDatabaseMissing('catatan_admin', ['teks' => 'palsu']);
        }
    }

    public function test_pengusul_tidak_dapat_mengubah_atau_menghapus_catatan_pengguna_lain(): void
    {
        $admin    = $this->admin();
        $a        = User::factory()->create();
        $catatanB = $this->buatCatatan($this->pengajuanMilik(User::factory()->create())->id, $admin->id, 'milik b');

        $this->actingAs($a)->putJson("/api/catatan-admin/{$catatanB->id}", ['teks' => 'x'])->assertForbidden();
        $this->actingAs($a)->deleteJson("/api/catatan-admin/{$catatanB->id}")->assertForbidden();
        $this->assertDatabaseHas('catatan_admin', ['id' => $catatanB->id, 'teks' => 'milik b']);
    }

    public function test_id_penerima_dari_request_tidak_dipercaya(): void
    {
        $admin = $this->admin();
        $a     = User::factory()->create();
        $pB    = $this->pengajuanMilik(User::factory()->create());
        $this->buatCatatan($pB->id, $admin->id);

        $this->actingAs($a)
            ->getJson("/api/catatan-admin?pengajuan_id={$pB->id}&user_id={$a->id}&penerima_id={$a->id}")
            ->assertForbidden();
    }

    public function test_role_lain_ditolak(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(User::factory()->create());
        $c     = $this->buatCatatan($p->id, $admin->id);

        foreach (['pimpinan', 'jurusan', 'prodi', 'unit'] as $role) {
            $akun = User::factory()->create(['role' => $role]);
            $this->actingAs($akun)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertForbidden();
            $this->actingAs($akun)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'x'])->assertForbidden();
            $this->actingAs($akun)->putJson("/api/catatan-admin/{$c->id}", ['teks' => 'x'])->assertForbidden();
            $this->actingAs($akun)->deleteJson("/api/catatan-admin/{$c->id}")->assertForbidden();
        }
    }

    public function test_tanpa_autentikasi_semua_endpoint_401(): void
    {
        $this->getJson('/api/catatan-admin?pengajuan_id=1')->assertUnauthorized();
        $this->postJson('/api/catatan-admin', ['pengajuan_id' => 1, 'teks' => 'x'])->assertUnauthorized();
        $this->putJson('/api/catatan-admin/1', ['teks' => 'x'])->assertUnauthorized();
        $this->deleteJson('/api/catatan-admin/1')->assertUnauthorized();
    }
}
