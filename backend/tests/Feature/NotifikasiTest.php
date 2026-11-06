<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\Notifikasi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class NotifikasiTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    private function pengusul(string $role = 'external'): User
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

    private function judulNotifikasi(User $user): array
    {
        return Notifikasi::where('user_id', $user->id)->orderBy('id')->pluck('judul')->all();
    }

    // ---------------- pemicu ----------------

    public function test_pengajuan_baru_memberi_tahu_semua_admin_tapi_bukan_pengusul_atau_peran_lain(): void
    {
        $admin1 = $this->admin();
        $admin2 = $this->admin();
        $pimpinan = $this->pengusul('pimpinan');
        $mitra = $this->pengusul('external');

        $this->actingAs($mitra)->postJson('/api/pengajuan', [
            'nama_pengusul' => 'Dr. Budi',
            'jabatan_pengusul' => 'Dosen',
            'email_pengusul' => 'budi@polibatam.ac.id',
            'judul_pengajuan' => 'Kerja Sama Pendidikan',
            'jenis_dokumen' => 'MOU',
            'kategori_pengajuan' => 'eksternal',
            'nama_mitra' => 'PT Teknologi Maju',
        ])->assertCreated();

        $this->assertSame(['Pengajuan Baru Masuk'], $this->judulNotifikasi($admin1));
        $this->assertSame(['Pengajuan Baru Masuk'], $this->judulNotifikasi($admin2));
        $this->assertSame([], $this->judulNotifikasi($mitra));
        $this->assertSame([], $this->judulNotifikasi($pimpinan));
    }

    public function test_keputusan_admin_memberi_tahu_pengusul_sesuai_statusnya(): void
    {
        $admin = $this->admin();

        foreach ([
            ['revisi', 'Pengajuan Diminta Revisi'],
            ['ditolak', 'Pengajuan Ditolak'],
            ['disetujui', 'Pengajuan Disetujui'],
        ] as [$status, $judulHarapan]) {
            $mitra = $this->pengusul('external');
            $pengajuan = $this->pengajuan($mitra, ['status_pengajuan' => 'diproses']);

            if ($status === 'disetujui') {
                // Berkas final wajib ada untuk disetujui; nomor dokumen diisi supaya tidak memakai kueri khusus PostgreSQL.
                $pengajuan->pengajuanFiles()->create(['peran_berkas' => 'dokumen_final', 'nama_file' => 'final.pdf', 'path_file' => 'pengajuan/final.pdf']);
            }

            $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
                'status_pengajuan' => $status,
                'catatan_revisi' => 'Mohon lengkapi dokumen.',
                'keputusan' => 'Tidak sesuai syarat.',
                'nomor_dokumen' => '00'.$pengajuan->id.'/MOU/2026',
            ])->assertOk();

            $this->assertContains($judulHarapan, $this->judulNotifikasi($mitra), $status);
            $isi = Notifikasi::where('user_id', $mitra->id)->where('judul', $judulHarapan)->first();
            $this->assertSame('/eksternal/daftar_kerjasama', $isi->href);
        }

        // Aksi admin juga tercatat di lonceng semua admin (termasuk pelakunya) sebagai riwayat aktivitas.
        $this->assertSame(['Pengajuan Direvisi', 'Pengajuan Ditolak', 'Pengajuan Di-ACC'], $this->judulNotifikasi($admin));
    }

    public function test_pengusul_internal_diarahkan_ke_halaman_internal(): void
    {
        $admin = $this->admin();
        $internal = $this->pengusul('internal');
        $pengajuan = $this->pengajuan($internal, ['status_pengajuan' => 'diproses']);

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", ['status_pengajuan' => 'ditolak', 'keputusan' => 'x'])->assertOk();

        $this->assertSame('/internal/data_pengajuan', Notifikasi::where('user_id', $internal->id)->value('href'));
    }

    public function test_status_tidak_berubah_tidak_membuat_notifikasi(): void
    {
        $admin = $this->admin();
        $mitra = $this->pengusul();
        $pengajuan = $this->pengajuan($mitra);

        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", ['judul_pengajuan' => 'Judul Baru'])->assertOk();

        $this->assertSame([], $this->judulNotifikasi($mitra));
    }

    public function test_pindah_tahapan_memberi_tahu_pengusul_dan_tahap_sama_tidak(): void
    {
        $admin = $this->admin();
        $mitra = $this->pengusul();
        $pengajuan = $this->pengajuan($mitra, ['tahapan_stage' => 'Pengajuan Awal', 'tahapan_group' => 'todo']);
        $url = "/api/pengajuan/{$pengajuan->id}/tahapan";

        $this->actingAs($admin)->patchJson($url, ['stage' => 'Penyusunan Dokumen', 'group' => 'in_progress'])->assertOk();
        $this->assertSame(['Tahapan Pengajuan Diperbarui'], $this->judulNotifikasi($mitra));
        $this->assertStringContainsString('Penyusunan Dokumen', Notifikasi::where('user_id', $mitra->id)->value('pesan'));

        // Memilih tahap yang sama lagi tidak menambah notifikasi.
        $this->actingAs($admin)->patchJson($url, ['stage' => 'Penyusunan Dokumen', 'group' => 'in_progress'])->assertOk();
        $this->assertCount(1, Notifikasi::where('user_id', $mitra->id)->get());
    }

    public function test_revisi_dikirim_ulang_pengusul_memberi_tahu_admin(): void
    {
        $admin = $this->admin();
        $mitra = $this->pengusul();
        $pengajuan = $this->pengajuan($mitra, ['status_pengajuan' => 'revisi']);

        $this->actingAs($mitra)->patchJson("/api/pengajuan/{$pengajuan->id}", ['judul_pengajuan' => 'Judul Diperbaiki'])->assertOk();

        $this->assertSame('menunggu', $pengajuan->fresh()->status_pengajuan);
        $this->assertSame(['Revisi Pengajuan Dikirim Ulang'], $this->judulNotifikasi($admin));
    }

    public function test_permintaan_perpanjangan_memberi_tahu_admin_dan_keputusan_memberi_tahu_pemilik(): void
    {
        Storage::fake('public');
        $admin = $this->admin();
        $pemilik = $this->pengusul('internal');
        $pengajuan = $this->pengajuan($pemilik);
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen' => 'NOTIF/001/MOU/2026',
            'nama_dokumen' => 'Dokumen Uji',
            'jenis_dokumen' => 'MOU',
            'no_permohonan' => 'PMH-'.$pengajuan->id,
            'sumber_pengajuan_id' => $pengajuan->id,
            'dibuat_oleh_user_id' => $pemilik->id,
            'tanggal_mulai' => '2024-01-01',
            'tanggal_berakhir' => '2026-12-31',
            'file' => 'pengajuan/2026/01/x.pdf',
        ]);

        $this->actingAs($pemilik)->postJson("/api/dokumen-kerjasama/{$dokumen->id}/perpanjangan", [
            'tanggal_mulai_baru' => '2027-01-01',
            'tanggal_berakhir_baru' => '2029-12-31',
            'catatan_perpanjangan' => 'Lanjut',
            'bukti_perpanjangan' => 'data:application/pdf;base64,'.base64_encode('%PDF-1.4 x'),
            'bukti_perpanjangan_nama' => 'p.pdf',
        ])->assertCreated();

        $this->assertSame(['Permintaan Perpanjangan Baru'], $this->judulNotifikasi($admin));
        $this->assertSame([], $this->judulNotifikasi($pemilik));

        $logId = \App\Models\DokumenLog::where('dokumen_id', $dokumen->id)->value('id');
        $this->actingAs($admin)->patchJson("/api/dokumen-kerjasama/perpanjangan/{$logId}/status", ['status' => 'ditolak'])->assertOk();

        $this->assertSame(['Perpanjangan Ditolak'], $this->judulNotifikasi($pemilik));
        $this->assertSame('/internal/rekap_data', Notifikasi::where('user_id', $pemilik->id)->value('href'));
    }

    // ---------------- API lonceng ----------------

    public function test_pengguna_hanya_melihat_notifikasi_miliknya_dan_jumlah_belum_dibaca(): void
    {
        $a = $this->pengusul();
        $b = $this->pengusul();
        Notifikasi::create(['user_id' => $a->id, 'judul' => 'Untuk A', 'pesan' => 'x']);
        Notifikasi::create(['user_id' => $a->id, 'judul' => 'Untuk A (dibaca)', 'pesan' => 'x', 'dibaca_pada' => now()]);
        Notifikasi::create(['user_id' => $b->id, 'judul' => 'Untuk B', 'pesan' => 'x']);

        $respons = $this->actingAs($a)->getJson('/api/notifikasi')->assertOk();

        $this->assertCount(2, $respons->json('data'));
        $this->assertSame(1, $respons->json('belum_dibaca'));
        $this->assertNotContains('Untuk B', collect($respons->json('data'))->pluck('judul')->all());
    }

    public function test_tandai_baca_hapus_dan_tidak_bisa_menyentuh_milik_orang_lain(): void
    {
        $a = $this->pengusul();
        $b = $this->pengusul();
        $milikA = Notifikasi::create(['user_id' => $a->id, 'judul' => 'A', 'pesan' => 'x']);
        $milikB = Notifikasi::create(['user_id' => $b->id, 'judul' => 'B', 'pesan' => 'x']);

        $this->actingAs($a)->patchJson("/api/notifikasi/{$milikB->id}/baca")->assertNotFound();
        $this->actingAs($a)->deleteJson("/api/notifikasi/{$milikB->id}")->assertNotFound();
        $this->assertNull($milikB->fresh()->dibaca_pada);

        $this->actingAs($a)->patchJson("/api/notifikasi/{$milikA->id}/baca")->assertOk();
        $this->assertNotNull($milikA->fresh()->dibaca_pada);

        $this->actingAs($a)->deleteJson("/api/notifikasi/{$milikA->id}")->assertOk();
        $this->assertNull(Notifikasi::find($milikA->id));
        $this->assertNotNull(Notifikasi::find($milikB->id));
    }

    public function test_baca_semua_dan_hapus_semua_hanya_untuk_milik_sendiri(): void
    {
        $a = $this->pengusul();
        $b = $this->pengusul();
        Notifikasi::create(['user_id' => $a->id, 'judul' => '1', 'pesan' => 'x']);
        Notifikasi::create(['user_id' => $a->id, 'judul' => '2', 'pesan' => 'x']);
        Notifikasi::create(['user_id' => $b->id, 'judul' => '3', 'pesan' => 'x']);

        $this->actingAs($a)->postJson('/api/notifikasi/baca-semua')->assertOk();
        $this->assertSame(0, Notifikasi::where('user_id', $a->id)->whereNull('dibaca_pada')->count());
        $this->assertSame(1, Notifikasi::where('user_id', $b->id)->whereNull('dibaca_pada')->count());

        $this->actingAs($a)->deleteJson('/api/notifikasi')->assertOk();
        $this->assertSame(0, Notifikasi::where('user_id', $a->id)->count());
        $this->assertSame(1, Notifikasi::where('user_id', $b->id)->count());
    }

    public function test_notifikasi_wajib_login(): void
    {
        $this->getJson('/api/notifikasi')->assertUnauthorized();
        $this->postJson('/api/notifikasi/baca-semua')->assertUnauthorized();
    }

    public function test_membuka_detail_atau_daftar_pengajuan_tidak_membuat_notifikasi(): void
    {
        $admin = $this->admin();
        $mitra = $this->pengusul();
        $pengajuan = $this->pengajuan($mitra);

        $this->actingAs($mitra)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
        $this->actingAs($mitra)->getJson('/api/pengajuan')->assertOk();
        $this->actingAs($admin)->getJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        $this->assertSame(0, Notifikasi::count());
    }

    public function test_membuka_halaman_tujuan_menandai_dibaca_notifikasi_berawalan_itu_saja(): void
    {
        $a = $this->pengusul();
        $b = $this->pengusul();
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

    public function test_pengusul_menghapus_pengajuannya_memberi_tahu_admin_eksternal_dan_internal(): void
    {
        $admin = $this->admin();

        foreach (['external', 'internal'] as $role) {
            $pengusul = $this->pengusul($role);
            $pengajuan = $this->pengajuan($pengusul);

            $this->actingAs($pengusul)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();
        }

        $judul = $this->judulNotifikasi($admin);
        $this->assertSame(['Pengajuan Dihapus Pengusul', 'Pengajuan Dihapus Pengusul'], $judul);
    }

    public function test_admin_menghapus_pengajuan_dicatat_untuk_admin_tapi_tidak_untuk_pengusul_yang_masih_melihatnya(): void
    {
        $admin = $this->admin();
        $mitra = $this->pengusul();
        $pengajuan = $this->pengajuan($mitra);

        $this->actingAs($admin)->deleteJson("/api/pengajuan/{$pengajuan->id}")->assertOk();

        $this->assertSame([], $this->judulNotifikasi($mitra));
        // ...tetapi tercatat sebagai riwayat aktivitas di lonceng admin.
        $this->assertSame(['Pengajuan Dihapus'], $this->judulNotifikasi($admin));
    }
}
