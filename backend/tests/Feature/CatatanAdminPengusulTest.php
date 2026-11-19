<?php

namespace Tests\Feature;

use App\Models\CatatanAdmin;
use App\Models\Notifikasi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Catatan Admin: visibilitas untuk pengusul (kolom untuk_pengusul, default privat), perlindungan catatan
 * lama, dan notifikasi lonceng ke pemilik pengajuan.
 */
class CatatanAdminPengusulTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function pengajuanMilik(?User $pengusul, string $judul = 'Kerja Sama Uji'): Pengajuan
    {
        return Pengajuan::create([
            'nama_pengusul'     => $pengusul?->name ?? 'Tanpa Akun',
            'judul_pengajuan'   => $judul,
            'jenis_dokumen'     => 'MOU',
            'status_pengajuan'  => 'menunggu',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id'  => $pengusul?->id,
        ]);
    }

    // ------------------------------------------------------------------
    // Visibilitas
    // ------------------------------------------------------------------

    public function test_catatan_baru_default_privat(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(User::factory()->create());

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'Catatan internal'])
            ->assertCreated()->assertJsonPath('data.untuk_pengusul', false);

        $this->assertDatabaseHas('catatan_admin', ['pengajuan_id' => $p->id, 'untuk_pengusul' => false]);
    }

    public function test_pengusul_hanya_melihat_catatan_untuk_pengusul(): void
    {
        $admin    = $this->admin();
        $internal = User::factory()->create();
        $p        = $this->pengajuanMilik($internal);

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'PRIVAT admin'])->assertCreated();
        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'Untuk pengusul', 'untuk_pengusul' => true])->assertCreated();

        $res = $this->actingAs($internal)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('Untuk pengusul', $res->json('data.0.teks'));
        $this->assertStringNotContainsString('PRIVAT admin', $res->getContent());

        // Admin tetap melihat keduanya.
        $this->actingAs($admin)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertOk()->assertJsonCount(2, 'data');
        $humas = User::factory()->create(['role' => 'admin-humas']);
        $this->actingAs($humas)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_external_hanya_melihat_catatan_untuk_pengusul_miliknya(): void
    {
        $admin    = $this->admin();
        $external = User::factory()->external()->create();
        $lain     = User::factory()->external()->create();
        $p        = $this->pengajuanMilik($external);

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'PRIVAT'])->assertCreated();
        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'Terbuka', 'untuk_pengusul' => true])->assertCreated();

        $this->actingAs($external)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($lain)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertForbidden();
    }

    public function test_catatan_lama_tetap_privat_dan_isinya_tidak_berubah(): void
    {
        $admin    = $this->admin();
        $internal = User::factory()->create();
        $p        = $this->pengajuanMilik($internal);

        // Catatan "lama": dibuat tanpa menyebut kolom baru, persis seperti sebelum fitur ini ada.
        $id = DB::table('catatan_admin')->insertGetId([
            'pengajuan_id'        => $p->id,
            'teks'                => 'Catatan lama rahasia',
            'dibuat_oleh_user_id' => $admin->id,
            'created_at'          => '2026-06-20 08:00:00',
            'updated_at'          => '2026-06-20 08:00:00',
        ]);

        $this->assertFalse((bool) DB::table('catatan_admin')->where('id', $id)->value('untuk_pengusul'));
        $this->actingAs($internal)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($admin)->getJson("/api/catatan-admin?pengajuan_id={$p->id}")->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_migrasi_pada_data_lama_menjaga_catatan_privat_dan_tidak_mengubah_isi(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(User::factory()->create());
        $migrasi = require database_path('migrations/2026_11_20_000001_add_untuk_pengusul_to_catatan_admin.php');

        // Kembalikan tabel ke bentuk sebelum migrasi, isi dengan catatan lama, lalu jalankan migrasi.
        $migrasi->down();
        $this->assertFalse(Schema::hasColumn('catatan_admin', 'untuk_pengusul'));

        DB::table('catatan_admin')->insert([
            ['pengajuan_id' => $p->id, 'teks' => 'lama 1', 'dibuat_oleh_user_id' => $admin->id, 'created_at' => '2026-06-20 08:00:00', 'updated_at' => '2026-06-20 08:00:00'],
            ['pengajuan_id' => $p->id, 'teks' => 'lama 2', 'dibuat_oleh_user_id' => $admin->id, 'created_at' => '2026-06-21 08:00:00', 'updated_at' => '2026-06-21 08:00:00'],
        ]);

        $migrasi->up();
        $migrasi->up(); // idempoten

        $this->assertTrue(Schema::hasColumn('catatan_admin', 'untuk_pengusul'));
        $rows = DB::table('catatan_admin')->orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertSame(['lama 1', 'lama 2'], $rows->pluck('teks')->all());
        $this->assertSame([false, false], $rows->map(fn ($r) => (bool) $r->untuk_pengusul)->all());
        $this->assertSame('2026-06-20 08:00:00', (string) $rows[0]->created_at);
    }

    public function test_admin_dapat_mengubah_visibilitas_catatan(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(User::factory()->create());
        $c     = CatatanAdmin::create(['pengajuan_id' => $p->id, 'teks' => 'abc', 'dibuat_oleh_user_id' => $admin->id]);

        $this->actingAs($admin)->putJson("/api/catatan-admin/{$c->id}", ['untuk_pengusul' => true])
            ->assertOk()->assertJsonPath('data.untuk_pengusul', true)->assertJsonPath('data.teks', 'abc');
        $this->actingAs($admin)->putJson("/api/catatan-admin/{$c->id}", ['untuk_pengusul' => false])
            ->assertOk()->assertJsonPath('data.untuk_pengusul', false);
    }

    public function test_pengusul_tidak_dapat_mengubah_visibilitas(): void
    {
        $admin    = $this->admin();
        $internal = User::factory()->create();
        $p        = $this->pengajuanMilik($internal);
        $c        = CatatanAdmin::create(['pengajuan_id' => $p->id, 'teks' => 'abc', 'dibuat_oleh_user_id' => $admin->id]);

        $this->actingAs($internal)->putJson("/api/catatan-admin/{$c->id}", ['untuk_pengusul' => true])->assertForbidden();
        $this->assertFalse((bool) $c->fresh()->untuk_pengusul);
    }

    public function test_update_tanpa_perubahan_ditolak(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(User::factory()->create());
        $c     = CatatanAdmin::create(['pengajuan_id' => $p->id, 'teks' => 'abc', 'dibuat_oleh_user_id' => $admin->id]);

        $this->actingAs($admin)->putJson("/api/catatan-admin/{$c->id}", [])->assertUnprocessable();
    }

    public function test_tidak_bisa_dibagikan_bila_pengajuan_tanpa_akun_pengusul(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(null);

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'x', 'untuk_pengusul' => true])
            ->assertUnprocessable()->assertJsonValidationErrors(['untuk_pengusul']);
        $this->assertDatabaseCount('catatan_admin', 0);
        $this->assertSame(0, Notifikasi::count());
    }

    public function test_nilai_untuk_pengusul_harus_boolean(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(User::factory()->create());

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'x', 'untuk_pengusul' => 'mungkin'])
            ->assertUnprocessable()->assertJsonValidationErrors(['untuk_pengusul']);
    }

    // ------------------------------------------------------------------
    // Notifikasi
    // ------------------------------------------------------------------

    public function test_catatan_untuk_pengusul_membuat_notifikasi_hanya_ke_pemilik(): void
    {
        $admin    = $this->admin();
        $pemilik  = User::factory()->create();
        $lain     = User::factory()->create();
        $external = User::factory()->external()->create();
        $p        = $this->pengajuanMilik($pemilik, 'MoU dengan PT Maju');

        $this->actingAs($admin)->postJson('/api/catatan-admin', [
            'pengajuan_id'   => $p->id,
            'teks'           => 'Mohon lengkapi lampiran A',
            'untuk_pengusul' => true,
            // Frontend tidak boleh bisa menentukan penerima lewat field apa pun.
            'user_id'        => $lain->id,
            'penerima_id'    => $external->id,
        ])->assertCreated();

        $this->assertSame(1, Notifikasi::count());
        $n = Notifikasi::first();
        $this->assertSame($pemilik->id, $n->user_id);
        $this->assertSame($p->id, $n->pengajuan_id);
        $this->assertSame('catatan_admin', $n->jenis_aktivitas);
        $this->assertSame($admin->id, $n->actor_id);
        $this->assertSame('/internal/data_pengajuan', $n->href);
        $this->assertStringContainsString('MoU dengan PT Maju', $n->pesan);
        $this->assertStringContainsString('Mohon lengkapi lampiran A', $n->pesan);
        $this->assertNull($n->dibaca_pada);

        $this->assertSame(0, Notifikasi::where('user_id', $lain->id)->count());
        $this->assertSame(0, Notifikasi::where('user_id', $external->id)->count());
        $this->assertSame(0, Notifikasi::where('user_id', $admin->id)->count());
    }

    public function test_notifikasi_untuk_external_mengarah_ke_halaman_external(): void
    {
        $admin    = $this->admin();
        $external = User::factory()->external()->create();
        $p        = $this->pengajuanMilik($external);

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'Cek dokumen', 'untuk_pengusul' => true])->assertCreated();

        $n = Notifikasi::where('user_id', $external->id)->first();
        $this->assertNotNull($n);
        $this->assertSame('/eksternal/daftar_kerjasama', $n->href);
        $this->assertSame($p->id, $n->pengajuan_id);
    }

    public function test_catatan_privat_tidak_membuat_notifikasi(): void
    {
        $admin = $this->admin();
        $p     = $this->pengajuanMilik(User::factory()->create());

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'privat'])->assertCreated();
        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'privat 2', 'untuk_pengusul' => false])->assertCreated();

        $this->assertSame(0, Notifikasi::count());
    }

    public function test_membagikan_catatan_privat_membuat_notifikasi_sekali_saja(): void
    {
        $admin   = $this->admin();
        $pemilik = User::factory()->create();
        $p       = $this->pengajuanMilik($pemilik);
        $c       = CatatanAdmin::create(['pengajuan_id' => $p->id, 'teks' => 'awalnya privat', 'dibuat_oleh_user_id' => $admin->id]);

        $this->actingAs($admin)->putJson("/api/catatan-admin/{$c->id}", ['untuk_pengusul' => true])->assertOk();
        $this->assertSame(1, Notifikasi::where('user_id', $pemilik->id)->count());

        // Ulang bagikan, ubah teks, sembunyikan lalu bagikan lagi: tetap satu notifikasi.
        $this->actingAs($admin)->putJson("/api/catatan-admin/{$c->id}", ['untuk_pengusul' => true])->assertOk();
        $this->actingAs($admin)->putJson("/api/catatan-admin/{$c->id}", ['teks' => 'teks diubah'])->assertOk();
        $this->actingAs($admin)->putJson("/api/catatan-admin/{$c->id}", ['untuk_pengusul' => false])->assertOk();
        $this->actingAs($admin)->putJson("/api/catatan-admin/{$c->id}", ['untuk_pengusul' => true])->assertOk();

        $this->assertSame(1, Notifikasi::where('user_id', $pemilik->id)->count());
    }

    public function test_dua_catatan_berbeda_menghasilkan_dua_notifikasi(): void
    {
        $admin   = $this->admin();
        $pemilik = User::factory()->create();
        $p       = $this->pengajuanMilik($pemilik);

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'satu', 'untuk_pengusul' => true])->assertCreated();
        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'dua', 'untuk_pengusul' => true])->assertCreated();

        $this->assertSame(2, Notifikasi::where('user_id', $pemilik->id)->count());
    }

    public function test_mengedit_teks_catatan_yang_sudah_dibagikan_tidak_menotifikasi_ulang(): void
    {
        $admin   = $this->admin();
        $pemilik = User::factory()->create();
        $p       = $this->pengajuanMilik($pemilik);

        $id = $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'v1', 'untuk_pengusul' => true])
            ->assertCreated()->json('data.id');
        $this->actingAs($admin)->putJson("/api/catatan-admin/{$id}", ['teks' => 'v2'])->assertOk();

        $this->assertSame(1, Notifikasi::count());
    }

    public function test_admin_humas_juga_menotifikasi_pemilik(): void
    {
        $humas   = User::factory()->create(['role' => 'admin-humas']);
        $pemilik = User::factory()->create();
        $p       = $this->pengajuanMilik($pemilik);

        $this->actingAs($humas)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'dari humas', 'untuk_pengusul' => true])->assertCreated();

        $this->assertSame(1, Notifikasi::where('user_id', $pemilik->id)->count());
        $this->assertSame($humas->id, Notifikasi::first()->actor_id);
    }

    public function test_pemilik_melihat_notifikasi_dan_catatan_lewat_api(): void
    {
        $admin   = $this->admin();
        $pemilik = User::factory()->create();
        $lain    = User::factory()->create();
        $p       = $this->pengajuanMilik($pemilik);

        $this->actingAs($admin)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'Silakan cek', 'untuk_pengusul' => true])->assertCreated();

        $res = $this->actingAs($pemilik)->getJson('/api/notifikasi')->assertOk();
        $this->assertSame(1, $res->json('belum_dibaca'));
        $this->assertSame($p->id, $res->json('data.0.pengajuan_id'));

        $this->actingAs($lain)->getJson('/api/notifikasi')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_pengusul_tidak_memicu_notifikasi_lewat_endpoint_catatan(): void
    {
        $pemilik = User::factory()->create();
        $p       = $this->pengajuanMilik($pemilik);

        $this->actingAs($pemilik)->postJson('/api/catatan-admin', ['pengajuan_id' => $p->id, 'teks' => 'x', 'untuk_pengusul' => true])->assertForbidden();
        $this->assertSame(0, Notifikasi::count());
        $this->assertDatabaseCount('catatan_admin', 0);
    }
}
