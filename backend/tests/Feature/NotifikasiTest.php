<?php

namespace Tests\Feature;

use App\Models\DokumenFile;
use App\Models\DokumenKerjasama;
use App\Models\DokumenLog;
use App\Models\Notifikasi;
use App\Models\Pengajuan;
use App\Models\User;
use App\Services\NotifikasiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Sistem notifikasi berdasarkan peran:
 *  - ADMIN = broadcast ke SEMUA akun admin, status baca independen per akun.
 *  - INTERNAL / EXTERNAL / PIMPINAN = personal berdasarkan user_id (pemilik pengajuan).
 */
class NotifikasiTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function pengguna(string $role): User
    {
        return User::factory()->create(['role' => $role]);
    }

    private function pengajuan(User $pemilik, array $override = []): Pengajuan
    {
        return Pengajuan::create(array_merge([
            'nama_pengusul' => 'Dr. Andi',
            'judul_pengajuan' => 'Kerja Sama Penelitian',
            'jenis_dokumen' => 'MOU',
            'status_pengajuan' => 'menunggu',
            'ruang_lingkup_ids' => [],
            'user_pengusul_id' => $pemilik->id,
            'kategori_pengajuan' => $pemilik->role === 'external' ? 'eksternal' : 'internal',
        ], $override));
    }

    private function payloadBaru(string $kategori): array
    {
        return [
            'nama_pengusul' => 'Dr. Budi', 'jabatan_pengusul' => 'Dosen', 'email_pengusul' => 'budi@polibatam.ac.id',
            'judul_pengajuan' => 'Kerja Sama Pendidikan', 'jenis_dokumen' => 'MOU',
            'kategori_pengajuan' => $kategori, 'nama_mitra' => 'PT Teknologi Maju',
        ];
    }

    private function judul(User $user): array
    {
        return Notifikasi::where('user_id', $user->id)->orderBy('id')->pluck('judul')->all();
    }

    private function dokumenDenganBerkas(User $pemilik, string $namaBerkas = 'final.pdf'): array
    {
        $pengajuan = $this->pengajuan($pemilik, ['nomor_pengajuan' => 'PMH-2026-001']);
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen' => 'NOTIF/'.$pengajuan->id.'/MOU/2026', 'nama_dokumen' => 'Dokumen Uji', 'jenis_dokumen' => 'MOU',
            'no_permohonan' => 'PMH-2026-001', 'sumber_pengajuan_id' => $pengajuan->id, 'dibuat_oleh_user_id' => $pemilik->id,
            'tanggal_mulai' => '2024-01-01', 'tanggal_berakhir' => '2026-12-31', 'file' => 'pengajuan/2026/01/'.$namaBerkas,
        ]);
        $berkas = DokumenFile::create([
            'dokumen_id' => $dokumen->id, 'peran_berkas' => 'dokumen_final',
            'nama_file' => $namaBerkas, 'path_file' => 'pengajuan/2026/01/'.$namaBerkas,
        ]);

        return [$pengajuan, $dokumen, $berkas];
    }

    // ================= A. ADMIN: broadcast ke semua akun admin =================

    public function test_pengajuan_baru_dari_internal_dan_external_masuk_ke_semua_admin(): void
    {
        $admins = [$this->admin(), $this->admin(), $this->admin()];

        $this->actingAs($this->pengguna('internal'))->postJson('/api/pengajuan', $this->payloadBaru('internal'))->assertCreated();
        $this->actingAs($this->pengguna('external'))->postJson('/api/pengajuan', $this->payloadBaru('eksternal'))->assertCreated();

        foreach ($admins as $admin) {
            $this->assertSame(['Pengajuan Baru Masuk', 'Pengajuan Baru Masuk'], $this->judul($admin));
            $pesan = Notifikasi::where('user_id', $admin->id)->orderBy('id')->pluck('pesan')->all();
            $this->assertMatchesRegularExpression('/dari .+ \(Internal\)/', $pesan[0]);
            $this->assertMatchesRegularExpression('/dari .+ \(External\)/', $pesan[1]);
        }
    }

    public function test_dokumen_revisi_dikirim_kembali_masuk_ke_semua_admin_dari_internal_maupun_external(): void
    {
        $admins = [$this->admin(), $this->admin()];

        foreach (['internal', 'external'] as $role) {
            $pengaju = $this->pengguna($role);
            $pengajuan = $this->pengajuan($pengaju, ['status_pengajuan' => 'revisi']);

            $this->actingAs($pengaju)->patchJson("/api/pengajuan/{$pengajuan->id}", ['judul_pengajuan' => 'Sudah Diperbaiki'])->assertOk();
            $this->assertContains('Dokumen Revisi Terkirim', $this->judul($pengaju));
        }

        foreach ($admins as $admin) {
            $this->assertSame(['Revisi Dikirim Kembali', 'Revisi Dikirim Kembali'], $this->judul($admin));
            $pesan = Notifikasi::where('user_id', $admin->id)->orderBy('id')->pluck('pesan')->all();
            $this->assertMatchesRegularExpression('/\(Internal\) telah mengirimkan kembali dokumen hasil revisi/', $pesan[0]);
            $this->assertMatchesRegularExpression('/\(External\) telah mengirimkan kembali dokumen hasil revisi/', $pesan[1]);
        }
    }

    public function test_admin_menghapus_berkas_semua_admin_menerima_dengan_nama_admin_berkas_dan_nomor_pengajuan(): void
    {
        $adminA = User::factory()->admin()->create(['name' => 'Admin Alfa']);
        $adminB = $this->admin();
        $adminC = $this->admin();
        $mitra = $this->pengguna('external');
        $internal = $this->pengguna('internal');
        [, $dokumen, $berkas] = $this->dokumenDenganBerkas($mitra, 'draf-mou.pdf');

        $this->actingAs($adminA)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/documents/{$berkas->id}")->assertOk();

        foreach ([$adminA, $adminB, $adminC] as $admin) {
            $this->assertSame(['Berkas Dihapus'], $this->judul($admin));
            $isi = Notifikasi::where('user_id', $admin->id)->first();
            $this->assertStringContainsString('Admin Alfa', $isi->pesan);
            $this->assertStringContainsString('draf-mou.pdf', $isi->pesan);
            $this->assertStringContainsString('PMH-2026-001', $isi->pesan);
            $this->assertSame('berkas_dihapus', $isi->jenis_aktivitas);
            $this->assertSame($adminA->id, $isi->actor_id);
        }
        $this->assertSame([], $this->judul($mitra));
        $this->assertSame([], $this->judul($internal));
    }

    public function test_internal_dan_external_tidak_dapat_menghapus_berkas_dan_tidak_ada_notifikasi(): void
    {
        $admin = $this->admin();

        foreach (['internal', 'external'] as $role) {
            $pemilik = $this->pengguna($role);
            [, $dokumen, $berkas] = $this->dokumenDenganBerkas($pemilik);

            $this->actingAs($pemilik)->deleteJson("/api/dokumen-kerjasama/{$dokumen->id}/documents/{$berkas->id}")->assertForbidden();
            $this->assertNotNull(DokumenFile::find($berkas->id));
        }

        $this->assertSame([], $this->judul($admin));
        $this->assertSame(0, Notifikasi::where('jenis_aktivitas', 'berkas_dihapus')->count());
    }

    public function test_status_baca_setiap_akun_admin_independen(): void
    {
        $a = $this->admin();
        $b = $this->admin();
        $this->actingAs($this->pengguna('internal'))->postJson('/api/pengajuan', $this->payloadBaru('internal'))->assertCreated();

        $idA = Notifikasi::where('user_id', $a->id)->value('id');
        $this->actingAs($a)->patchJson("/api/notifikasi/{$idA}/baca")->assertOk();

        $this->assertNotNull(Notifikasi::where('user_id', $a->id)->value('dibaca_pada'));
        $this->assertNull(Notifikasi::where('user_id', $b->id)->value('dibaca_pada'));
        $this->assertSame(0, $this->actingAs($a)->getJson('/api/notifikasi/jumlah-belum-dibaca')->json('belum_dibaca'));
        $this->assertSame(1, $this->actingAs($b)->getJson('/api/notifikasi/jumlah-belum-dibaca')->json('belum_dibaca'));

        $this->actingAs($b)->postJson('/api/notifikasi/baca-semua')->assertOk();
        $this->assertNotNull(Notifikasi::where('user_id', $a->id)->value('dibaca_pada'));
        $this->assertSame(0, $this->actingAs($b)->getJson('/api/notifikasi/jumlah-belum-dibaca')->json('belum_dibaca'));
    }

    public function test_admin_tidak_bisa_membaca_atau_menghapus_notifikasi_admin_lain(): void
    {
        $a = $this->admin();
        $b = $this->admin();
        $this->actingAs($this->pengguna('external'))->postJson('/api/pengajuan', $this->payloadBaru('eksternal'))->assertCreated();

        $milikB = Notifikasi::where('user_id', $b->id)->first();
        $this->actingAs($a)->patchJson("/api/notifikasi/{$milikB->id}/baca")->assertNotFound();
        $this->actingAs($a)->deleteJson("/api/notifikasi/{$milikB->id}")->assertNotFound();

        $this->actingAs($a)->postJson('/api/notifikasi/baca-semua')->assertOk();
        $this->assertNull($milikB->fresh()->dibaca_pada);
    }

    public function test_admin_baru_tidak_menerima_notifikasi_lama(): void
    {
        $lama = $this->admin();
        $this->actingAs($this->pengguna('internal'))->postJson('/api/pengajuan', $this->payloadBaru('internal'))->assertCreated();

        $baru = $this->admin();

        $this->assertSame(['Pengajuan Baru Masuk'], $this->judul($lama));
        $this->assertSame([], $this->judul($baru));
        $this->assertSame([], $this->actingAs($baru)->getJson('/api/notifikasi')->json('data'));
    }

    public function test_aksi_admin_hanya_memberi_tahu_pengaju_bukan_admin_lain(): void
    {
        $admin1 = $this->admin();
        $admin2 = $this->admin();
        $mitra = $this->pengguna('external');
        $pengajuan = $this->pengajuan($mitra, ['status_pengajuan' => 'diproses']);

        $this->actingAs($admin1)->patchJson("/api/pengajuan/{$pengajuan->id}", ['status_pengajuan' => 'revisi', 'catatan_revisi' => 'Lengkapi.'])->assertOk();

        $this->assertSame(['Pengajuan Memerlukan Revisi'], $this->judul($mitra));
        $this->assertSame([], $this->judul($admin1));
        $this->assertSame([], $this->judul($admin2));
    }

    // ================= B/C. INTERNAL dan EXTERNAL: personal =================

    public function test_pengajuan_dikirim_hanya_pengaju_yang_mendapat_konfirmasi(): void
    {
        $this->admin();
        $internalA = $this->pengguna('internal');
        $internalB = $this->pengguna('internal');
        $mitraA = $this->pengguna('external');
        $mitraB = $this->pengguna('external');
        $pimpinan = $this->pengguna('pimpinan');

        $this->actingAs($internalA)->postJson('/api/pengajuan', $this->payloadBaru('internal'))->assertCreated();
        $this->actingAs($mitraA)->postJson('/api/pengajuan', $this->payloadBaru('eksternal'))->assertCreated();

        $this->assertSame(['Pengajuan Berhasil Dikirim'], $this->judul($internalA));
        $this->assertSame(['Pengajuan Berhasil Dikirim'], $this->judul($mitraA));
        foreach ([$internalB, $mitraB, $pimpinan] as $lain) {
            $this->assertSame([], $this->judul($lain));
        }
    }

    public function test_keputusan_admin_hanya_diterima_pemilik_pengajuan(): void
    {
        $admin = $this->admin();

        foreach (['internal', 'external'] as $role) {
            $pemilik = $this->pengguna($role);
            $seperan = $this->pengguna($role);
            $lain = $this->pengguna($role === 'internal' ? 'external' : 'internal');

            foreach ([['revisi', 'Pengajuan Memerlukan Revisi'], ['ditolak', 'Pengajuan Ditolak']] as [$status, $judulHarapan]) {
                $pengajuan = $this->pengajuan($pemilik, ['status_pengajuan' => 'diproses']);

                $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
                    'status_pengajuan' => $status, 'catatan_revisi' => 'Mohon lengkapi.', 'keputusan' => 'Tidak sesuai.',
                ])->assertOk();

                $this->assertContains($judulHarapan, $this->judul($pemilik), "$role $status");
            }

            $this->assertSame([], $this->judul($seperan));
            $this->assertSame([], $this->judul($lain));
        }
    }

    public function test_tahapan_hanya_untuk_pemilik_dan_tidak_ganda(): void
    {
        $admin = $this->admin();
        $pemilik = $this->pengguna('external');
        $lain = $this->pengguna('external');
        $pengajuan = $this->pengajuan($pemilik, ['tahapan_stage' => 'Pengajuan Awal', 'tahapan_group' => 'todo']);
        $url = "/api/pengajuan/{$pengajuan->id}/tahapan";

        $this->actingAs($admin)->patchJson($url, ['stage' => 'Penyusunan Dokumen', 'group' => 'in_progress'])->assertOk();
        $this->assertSame(['Tahapan Pengajuan Diperbarui'], $this->judul($pemilik));

        $this->actingAs($admin)->patchJson($url, ['stage' => 'Penyusunan Dokumen', 'group' => 'in_progress'])->assertOk();
        $this->assertCount(1, Notifikasi::where('user_id', $pemilik->id)->get());
        $this->assertSame([], $this->judul($lain));
    }

    public function test_pengguna_hanya_melihat_notifikasi_miliknya(): void
    {
        $internal = $this->pengguna('internal');
        $mitra = $this->pengguna('external');
        $pimpinan = $this->pengguna('pimpinan');
        $admin = $this->admin();
        foreach ([$internal, $mitra, $pimpinan, $admin] as $u) {
            Notifikasi::create(['user_id' => $u->id, 'judul' => 'Milik '.$u->role, 'pesan' => 'x']);
        }

        foreach ([$internal, $mitra, $pimpinan, $admin] as $u) {
            $daftar = collect($this->actingAs($u)->getJson('/api/notifikasi')->assertOk()->json('data'))->pluck('judul')->all();
            $this->assertSame(['Milik '.$u->role], $daftar);
        }
    }

    // ================= D. PIMPINAN =================

    public function test_pimpinan_tidak_menerima_notifikasi_dari_alur_yang_ada(): void
    {
        $admin = $this->admin();
        $pimpinan = $this->pengguna('pimpinan');

        $this->actingAs($this->pengguna('external'))->postJson('/api/pengajuan', $this->payloadBaru('eksternal'))->assertCreated();
        $pengajuan = Pengajuan::first();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}/tahapan", ['stage' => 'Penyusunan Dokumen', 'group' => 'in_progress'])->assertOk();

        $this->assertSame([], $this->judul($pimpinan));
        $this->assertSame(0, $this->actingAs($pimpinan)->getJson('/api/notifikasi/jumlah-belum-dibaca')->json('belum_dibaca'));
    }

    public function test_notifikasi_pimpinan_hanya_dapat_dibaca_pemiliknya(): void
    {
        $pimpinanA = $this->pengguna('pimpinan');
        $pimpinanB = $this->pengguna('pimpinan');
        $milikA = Notifikasi::create(['user_id' => $pimpinanA->id, 'judul' => 'Untuk A', 'pesan' => 'x']);

        $this->actingAs($pimpinanB)->patchJson("/api/notifikasi/{$milikA->id}/baca")->assertNotFound();
        $this->assertSame([], $this->actingAs($pimpinanB)->getJson('/api/notifikasi')->json('data'));
        $this->actingAs($pimpinanA)->patchJson("/api/notifikasi/{$milikA->id}/baca")->assertOk();
    }

    // ================= E. Tanpa notifikasi ganda =================

    public function test_kunci_sama_tidak_membuat_notifikasi_ganda(): void
    {
        $user = $this->pengguna('internal');

        foreach (range(1, 3) as $ulang) {
            NotifikasiService::kirim($user->id, 'Judul', 'Pesan', '/x', 'info', 'Sistem', ['kunci' => 'uji:1']);
        }
        NotifikasiService::kirim($user->id, 'Judul', 'Pesan', '/x', 'info', 'Sistem', ['kunci' => 'uji:2']);

        $this->assertSame(2, Notifikasi::where('user_id', $user->id)->count());
    }

    public function test_pengulangan_hapus_berkas_tidak_menggandakan_notifikasi(): void
    {
        $admin1 = $this->admin();
        $admin2 = $this->admin();
        [, $dokumen, $berkas] = $this->dokumenDenganBerkas($this->pengguna('external'));
        $url = "/api/dokumen-kerjasama/{$dokumen->id}/documents/{$berkas->id}";

        $this->actingAs($admin1)->deleteJson($url)->assertOk();
        $this->actingAs($admin1)->deleteJson($url);

        $this->assertSame(1, Notifikasi::where('user_id', $admin1->id)->count());
        $this->assertSame(1, Notifikasi::where('user_id', $admin2->id)->count());
    }

    public function test_satu_pengajuan_baru_menghasilkan_satu_notifikasi_per_admin(): void
    {
        $admin = $this->admin();
        $this->actingAs($this->pengguna('internal'))->postJson('/api/pengajuan', $this->payloadBaru('internal'))->assertCreated();

        $this->assertSame(1, Notifikasi::where('user_id', $admin->id)->where('jenis_aktivitas', 'pengajuan_baru')->count());
    }

    // ================= F. Perpanjangan =================

    public function test_permintaan_perpanjangan_memberi_tahu_semua_admin_dan_keputusan_memberi_tahu_pemilik(): void
    {
        Storage::fake('public');
        $admins = [$this->admin(), $this->admin()];
        $pemilik = $this->pengguna('internal');
        [, $dokumen] = $this->dokumenDenganBerkas($pemilik);

        $this->actingAs($pemilik)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan", [
            'tanggal_mulai_baru' => '2027-01-01', 'tanggal_berakhir_baru' => '2029-12-31', 'catatan_perpanjangan' => 'Lanjut',
            'bukti_perpanjangan' => 'data:application/pdf;base64,'.base64_encode('%PDF-1.4 x'), 'bukti_perpanjangan_nama' => 'p.pdf',
        ])->assertCreated();

        foreach ($admins as $admin) {
            $this->assertSame(['Permintaan Perpanjangan Baru'], $this->judul($admin));
        }

        $logId = DokumenLog::where('dokumen_id', $dokumen->id)->value('id');
        $this->actingAs($admins[0])->patchJson("/api/dokumen-kerjasama/perpanjangan/{$logId}/status", ['status' => 'ditolak'])->assertOk();

        $this->assertContains('Perpanjangan Ditolak', $this->judul($pemilik));
    }

    // ================= G. API lonceng dan catatan aksi Internal =================

    public function test_membuka_detail_atau_daftar_pengajuan_tidak_membuat_notifikasi(): void
    {
        $admin = $this->admin();
        $mitra = $this->pengguna('external');
        $pengajuan = $this->pengajuan($mitra);

        $this->actingAs($mitra)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
        $this->actingAs($mitra)->getJson('/api/pengajuan')->assertOk();
        $this->actingAs($admin)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        $this->assertSame(0, Notifikasi::count());
    }

    public function test_daftar_terbaru_di_atas_dengan_pelaku_pengajuan_dan_waktu_baca(): void
    {
        $pengguna = $this->pengguna('external');
        $pelaku = User::factory()->admin()->create(['name' => 'Admin Beta']);
        $pengajuan = $this->pengajuan($pengguna);
        Notifikasi::create(['user_id' => $pengguna->id, 'judul' => 'Lama', 'pesan' => 'x']);
        $baru = Notifikasi::create(['user_id' => $pengguna->id, 'judul' => 'Baru', 'pesan' => 'x', 'actor_id' => $pelaku->id, 'pengajuan_id' => $pengajuan->id, 'jenis_aktivitas' => 'acc']);

        $respons = $this->actingAs($pengguna)->getJson('/api/notifikasi')->assertOk();
        $this->assertSame(['Baru', 'Lama'], collect($respons->json('data'))->pluck('judul')->all());
        $this->assertSame('Admin Beta', $respons->json('data.0.nama_pelaku'));
        $this->assertSame($pengajuan->id, $respons->json('data.0.pengajuan_id'));
        $this->assertNull($respons->json('data.0.dibaca_pada'));

        $this->actingAs($pengguna)->patchJson("/api/notifikasi/{$baru->id}/baca")->assertOk();
        $this->assertNotNull($this->actingAs($pengguna)->getJson('/api/notifikasi')->json('data.0.dibaca_pada'));
    }

    public function test_hapus_satu_dan_hapus_semua_hanya_milik_sendiri(): void
    {
        $a = $this->pengguna('internal');
        $b = $this->pengguna('internal');
        $milikA = Notifikasi::create(['user_id' => $a->id, 'judul' => 'A1', 'pesan' => 'x']);
        Notifikasi::create(['user_id' => $a->id, 'judul' => 'A2', 'pesan' => 'x']);
        Notifikasi::create(['user_id' => $b->id, 'judul' => 'B1', 'pesan' => 'x']);

        $this->actingAs($a)->deleteJson("/api/notifikasi/{$milikA->id}")->assertOk();
        $this->actingAs($a)->deleteJson('/api/notifikasi')->assertOk();

        $this->assertSame(0, Notifikasi::where('user_id', $a->id)->count());
        $this->assertSame(1, Notifikasi::where('user_id', $b->id)->count());
    }

    public function test_membuka_halaman_tujuan_menandai_dibaca_notifikasi_berawalan_itu_saja(): void
    {
        $a = $this->pengguna('internal');
        $b = $this->pengguna('internal');
        Notifikasi::create(['user_id' => $a->id, 'judul' => 'Pengajuan', 'pesan' => 'x', 'href' => '/admin/data_pengajuan?status=Menunggu']);
        Notifikasi::create(['user_id' => $a->id, 'judul' => 'Perpanjangan', 'pesan' => 'x', 'href' => '/admin/monitoring/perpanjangan']);
        Notifikasi::create(['user_id' => $b->id, 'judul' => 'Milik B', 'pesan' => 'x', 'href' => '/admin/data_pengajuan']);

        $this->actingAs($a)->postJson('/api/notifikasi/baca-href', ['prefix' => '/admin/data_pengajuan'])->assertOk();

        $this->assertNotNull(Notifikasi::where('judul', 'Pengajuan')->value('dibaca_pada'));
        $this->assertNull(Notifikasi::where('judul', 'Perpanjangan')->value('dibaca_pada'));
        $this->assertNull(Notifikasi::where('judul', 'Milik B')->value('dibaca_pada'));

        foreach (['%', 'admin', '/a%b', ''] as $buruk) {
            $this->actingAs($a)->postJson('/api/notifikasi/baca-href', ['prefix' => $buruk])->assertStatus(422);
        }
    }

    public function test_notifikasi_wajib_login(): void
    {
        $this->getJson('/api/notifikasi')->assertUnauthorized();
        $this->getJson('/api/notifikasi/jumlah-belum-dibaca')->assertUnauthorized();
        $this->postJson('/api/notifikasi/baca-semua')->assertUnauthorized();
    }

    public function test_internal_membuat_memperbarui_dan_menghapus_pengajuan_tercatat_di_lonceng_sendiri(): void
    {
        $this->admin();
        $internal = $this->pengguna('internal');

        $this->actingAs($internal)->postJson('/api/pengajuan', $this->payloadBaru('internal'))->assertCreated();
        $biasa = $this->pengajuan($internal);
        $this->actingAs($internal)->patchJson("/api/pengajuan/{$biasa->id}", ['judul_pengajuan' => 'Judul Baru'])->assertOk();
        $this->actingAs($internal)->deleteJson("/api/pengajuan/{$biasa->id}")->assertOk();

        $this->assertSame(['Pengajuan Berhasil Dikirim', 'Pengajuan Diperbarui', 'Pengajuan Dihapus'], $this->judul($internal));
    }

    public function test_pengusul_menghapus_pengajuan_tidak_memberi_tahu_admin(): void
    {
        $admin = $this->admin();

        foreach (['external', 'internal'] as $role) {
            $pengusul = $this->pengguna($role);
            $pengajuan = $this->pengajuan($pengusul);
            $this->actingAs($pengusul)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
        }

        $this->assertSame([], $this->judul($admin));
    }

    public function test_admin_menghapus_pengajuan_semua_admin_menerima_dan_pengusul_tidak(): void
    {
        $adminA = User::factory()->admin()->create(['name' => 'Admin Alfa']);
        $adminB = $this->admin();

        foreach (['external', 'internal'] as $role) {
            $pengusul = $this->pengguna($role);
            $pengajuan = $this->pengajuan($pengusul, ['nomor_pengajuan' => 'PMH-'.$role]);
            $this->actingAs($adminA)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
            $this->assertSame([], $this->judul($pengusul));
        }

        foreach ([$adminA, $adminB] as $admin) {
            $this->assertSame(['Pengajuan Dihapus', 'Pengajuan Dihapus'], $this->judul($admin));
            $this->assertStringContainsString('Admin Alfa telah menghapus pengajuan', Notifikasi::where('user_id', $admin->id)->value('pesan'));
        }
    }
}
