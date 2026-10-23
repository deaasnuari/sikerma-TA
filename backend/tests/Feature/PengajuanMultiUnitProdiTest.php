<?php

namespace Tests\Feature;

use App\Models\DokumenKerjasama;
use App\Models\MasterUnitProdi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PengajuanMultiUnitProdiTest extends TestCase
{
    use RefreshDatabase;

    private MasterUnitProdi $jurusanTI;
    private MasterUnitProdi $prodiTI1;
    private MasterUnitProdi $prodiTI2;
    private MasterUnitProdi $jurusanTM;
    private MasterUnitProdi $prodiTM;

    protected function setUp(): void
    {
        parent::setUp();

        $this->jurusanTI = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Informatika', 'aktif' => true]);
        $this->prodiTI1 = MasterUnitProdi::create(['jenis_node' => 'prodi', 'parent_id' => $this->jurusanTI->id, 'nama' => 'D3 Teknik Informatika', 'aktif' => true]);
        $this->prodiTI2 = MasterUnitProdi::create(['jenis_node' => 'prodi', 'parent_id' => $this->jurusanTI->id, 'nama' => 'D4 Rekayasa Perangkat Lunak', 'aktif' => true]);
        $this->jurusanTM = MasterUnitProdi::create(['jenis_node' => 'unit', 'kategori_unit' => 'jurusan', 'nama' => 'Teknik Mesin', 'aktif' => true]);
        $this->prodiTM = MasterUnitProdi::create(['jenis_node' => 'prodi', 'parent_id' => $this->jurusanTM->id, 'nama' => 'D3 Teknik Mesin', 'aktif' => true]);
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'nama_pengusul' => 'Dr. Budi',
            'judul_pengajuan' => 'Kerja Sama Multi Prodi',
            'jenis_dokumen' => 'MOU',
            'kategori_pengajuan' => 'internal',
            'nama_mitra' => 'PT Teknologi Maju',
        ], $override);
    }

    private function internal(): User
    {
        return User::factory()->create(['role' => 'internal']);
    }

    public function test_pengajuan_menyimpan_beberapa_prodi_dari_beberapa_jurusan(): void
    {
        $user = $this->internal();

        $response = $this->actingAs($user)->postJson('/api/pengajuan', $this->payload([
            'jurusan_ids' => [$this->jurusanTI->id, $this->jurusanTM->id],
            'unit_prodi_ids' => [$this->prodiTI1->id, $this->prodiTI2->id, $this->prodiTM->id],
        ]));

        $response->assertCreated();
        $pengajuan = Pengajuan::findOrFail($response->json('data.id'));

        // Prodi pertama = node utama di kolom lama; semuanya ada di pivot.
        $this->assertSame($this->prodiTI1->id, $pengajuan->unit_prodi_id);
        $this->assertEqualsCanonicalizing(
            [$this->prodiTI1->id, $this->prodiTI2->id, $this->prodiTM->id],
            $pengajuan->unitProdiItems()->pluck('master_unit_prodi.id')->all()
        );

        // Payload API menyertakan semua pilihan agar form edit bisa menampilkannya lagi.
        $this->assertCount(3, $response->json('data.unit_prodi_items'));
    }

    public function test_pengajuan_dengan_satu_prodi_tetap_berfungsi(): void
    {
        $response = $this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'unit_prodi_ids' => [$this->prodiTI1->id],
        ]));

        $response->assertCreated();
        $pengajuan = Pengajuan::findOrFail($response->json('data.id'));
        $this->assertSame($this->prodiTI1->id, $pengajuan->unit_prodi_id);
        $this->assertSame([$this->prodiTI1->id], $pengajuan->unitProdiIdsUrut());
    }

    public function test_klien_lama_yang_hanya_kirim_unit_prodi_id_tetap_tersimpan_di_pivot(): void
    {
        $response = $this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'unit_prodi_id' => $this->prodiTM->id,
        ]));

        $response->assertCreated();
        $pengajuan = Pengajuan::findOrFail($response->json('data.id'));
        $this->assertSame([$this->prodiTM->id], $pengajuan->unitProdiIdsUrut());
        $this->assertSame(1, $pengajuan->unitProdiItems()->count());
    }

    public function test_prodi_yang_bukan_anak_dari_jurusan_terpilih_ditolak(): void
    {
        $response = $this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'jurusan_ids' => [$this->jurusanTI->id],
            'unit_prodi_ids' => [$this->prodiTI1->id, $this->prodiTM->id],
        ]));

        $response->assertStatus(422)->assertJsonValidationErrors('unit_prodi_ids');
        $this->assertSame(0, Pengajuan::count());
    }

    public function test_pilihan_duplikat_ditolak(): void
    {
        $this->actingAs($this->internal())->postJson('/api/pengajuan', $this->payload([
            'unit_prodi_ids' => [$this->prodiTI1->id, $this->prodiTI1->id],
        ]))->assertStatus(422)->assertJsonValidationErrors('unit_prodi_ids.1');
    }

    public function test_edit_pengajuan_mengganti_dan_mengurangi_pilihan(): void
    {
        $user = $this->internal();
        $pengajuan = Pengajuan::create($this->payload([
            'user_pengusul_id' => $user->id,
            'status_pengajuan' => 'menunggu',
            'ruang_lingkup_ids' => [],
        ]));
        $pengajuan->syncUnitProdi([$this->prodiTI1->id, $this->prodiTI2->id, $this->prodiTM->id]);

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'jurusan_ids' => [$this->jurusanTM->id],
            'unit_prodi_ids' => [$this->prodiTM->id],
        ])->assertOk();

        $pengajuan->refresh();
        $this->assertSame($this->prodiTM->id, $pengajuan->unit_prodi_id);
        $this->assertSame([$this->prodiTM->id], $pengajuan->unitProdiIdsUrut());
    }

    public function test_update_tanpa_field_unit_prodi_tidak_mengubah_pilihan(): void
    {
        $user = $this->internal();
        $pengajuan = Pengajuan::create($this->payload([
            'user_pengusul_id' => $user->id,
            'status_pengajuan' => 'menunggu',
            'ruang_lingkup_ids' => [],
        ]));
        $pengajuan->syncUnitProdi([$this->prodiTI1->id, $this->prodiTI2->id]);

        $this->actingAs($user)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'judul_pengajuan' => 'Judul Baru',
        ])->assertOk();

        $this->assertEqualsCanonicalizing(
            [$this->prodiTI1->id, $this->prodiTI2->id],
            $pengajuan->fresh()->unitProdiIdsUrut()
        );
    }

    public function test_kajur_jurusan_kedua_melihat_pengajuan_yang_prodi_keduanya_ada_di_jurusannya(): void
    {
        $kajurTM = $this->internal();
        $kajurTM->update(['nik' => '300001']);

        $this->mock(\App\Services\CivitasStructureService::class, function ($mock) {
            $mock->shouldReceive('getJurusan')->andReturn([[
                'ID_JURUSAN' => '2', 'NAMA_JURUSAN' => 'TEKNIK MESIN', 'NAMA_JURUSAN_INGGRIS' => '-',
                'NIK_KAJUR' => '300001', 'NAMA_KAJUR' => 'Pak Mesin',
            ]]);
            $mock->shouldReceive('getProgramStudi')->andReturn([]);
            $mock->shouldReceive('getUnit')->andReturn([]);
        });

        $pemilik = $this->internal();
        // Utama di Teknik Informatika, tapi prodi kedua milik Teknik Mesin.
        $gabungan = Pengajuan::create($this->payload(['user_pengusul_id' => $pemilik->id, 'judul_pengajuan' => 'Gabungan', 'ruang_lingkup_ids' => []]));
        $gabungan->syncUnitProdi([$this->prodiTI1->id, $this->prodiTM->id]);
        $hanyaTI = Pengajuan::create($this->payload(['user_pengusul_id' => $pemilik->id, 'judul_pengajuan' => 'Hanya TI', 'ruang_lingkup_ids' => []]));
        $hanyaTI->syncUnitProdi([$this->prodiTI1->id]);

        $ids = collect($this->actingAs($kajurTM)->getJson('/api/pengajuan?per_page=50')->json('data.data'))->pluck('id')->all();

        $this->assertContains($gabungan->id, $ids);
        $this->assertNotContains($hanyaTI->id, $ids);

        $this->actingAs($kajurTM)->getJson("/api/pengajuan/{$gabungan->id}")->assertOk();
        $this->actingAs($kajurTM)->getJson("/api/pengajuan/{$hanyaTI->id}")->assertNotFound();
    }

    public function test_dokumen_kerjasama_menyimpan_dan_mengubah_beberapa_prodi(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = Pengajuan::create($this->payload(['nomor_pengajuan' => 'PMH-MULTI-001', 'ruang_lingkup_ids' => []]));

        $response = $this->actingAs($admin)->postJson('/api/dokumen-kerjasama', [
            'nomor_dokumen' => 'MULTI-001/MOU/2026',
            'no_permohonan' => $pengajuan->nomor_pengajuan,
            'nama_dokumen' => 'Dokumen Multi Prodi',
            'jenis_dokumen' => 'MOU',
            'file' => 'x.pdf',
            'jurusan_ids' => [$this->jurusanTI->id, $this->jurusanTM->id],
            'unit_prodi_ids' => [$this->prodiTI2->id, $this->prodiTM->id],
        ]);

        $response->assertCreated();
        $dokumen = DokumenKerjasama::findOrFail($response->json('data.id'));
        $this->assertSame($this->prodiTI2->id, $dokumen->unit_prodi_id);
        $this->assertEqualsCanonicalizing([$this->prodiTI2->id, $this->prodiTM->id], $dokumen->unitProdiIdsUrut());

        $this->actingAs($admin)->patchJson("/api/dokumen-kerjasama/{$dokumen->id}", [
            'unit_prodi_ids' => [$this->prodiTI1->id],
        ])->assertOk();

        $dokumen->refresh();
        $this->assertSame($this->prodiTI1->id, $dokumen->unit_prodi_id);
        $this->assertSame([$this->prodiTI1->id], $dokumen->unitProdiIdsUrut());
    }

    public function test_dokumen_di_rekap_data_memuat_semua_prodi_dan_terlihat_kajur_jurusan_kedua(): void
    {
        $kajurTM = $this->internal();
        $kajurTM->update(['nik' => '300001']);
        $this->mock(\App\Services\CivitasStructureService::class, function ($mock) {
            $mock->shouldReceive('getJurusan')->andReturn([[
                'ID_JURUSAN' => '2', 'NAMA_JURUSAN' => 'TEKNIK MESIN', 'NAMA_JURUSAN_INGGRIS' => '-',
                'NIK_KAJUR' => '300001', 'NAMA_KAJUR' => 'Pak Mesin',
            ]]);
            $mock->shouldReceive('getProgramStudi')->andReturn([]);
            $mock->shouldReceive('getUnit')->andReturn([]);
        });

        $pengajuan = Pengajuan::create($this->payload(['nomor_pengajuan' => 'PMH-MULTI-002', 'ruang_lingkup_ids' => []]));
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen' => 'MULTI-002/MOU/2026', 'no_permohonan' => $pengajuan->nomor_pengajuan,
            'nama_dokumen' => 'Gabungan', 'jenis_dokumen' => 'MOU', 'file' => 'x.pdf',
            'sumber_pengajuan_id' => $pengajuan->id,
        ]);
        $dokumen->syncUnitProdi([$this->prodiTI1->id, $this->prodiTM->id]);

        $rows = $this->actingAs($kajurTM)->getJson('/api/dokumen-kerjasama?per_page=50');
        $rows->assertOk();
        $row = collect($rows->json('data.data') ?? $rows->json('data'))->firstWhere('id', $dokumen->id);

        $this->assertNotNull($row);
        $this->assertCount(2, $row['unit_prodi_items']);
        $this->actingAs($kajurTM)->getJson("/api/dokumen-kerjasama/{$dokumen->id}")->assertOk();
    }

    public function test_edit_dari_form_satu_unit_dengan_id_utama_yang_sama_tidak_menghapus_pilihan_lain(): void
    {
        $admin = User::factory()->admin()->create();
        $pengajuan = Pengajuan::create($this->payload(['nomor_pengajuan' => 'PMH-MULTI-003', 'ruang_lingkup_ids' => []]));
        $pengajuan->syncUnitProdi([$this->prodiTI1->id, $this->prodiTM->id]);
        $dokumen = DokumenKerjasama::create([
            'nomor_dokumen' => 'MULTI-003/MOU/2026', 'no_permohonan' => $pengajuan->nomor_pengajuan,
            'nama_dokumen' => 'Gabungan', 'jenis_dokumen' => 'MOU', 'file' => 'x.pdf',
        ]);
        $dokumen->syncUnitProdi([$this->prodiTI1->id, $this->prodiTM->id]);

        // Rekap Data (form satu unit) mengirim ulang unit_prodi_id utama yang sama.
        $this->actingAs($admin)->patchJson("/api/dokumen-kerjasama/{$dokumen->id}", [
            'unit_prodi_id' => $this->prodiTI1->id,
            'nama_dokumen' => 'Nama Diubah',
        ])->assertOk();
        $this->actingAs($admin)->patchJson("/api/pengajuan/{$pengajuan->id}", [
            'unit_prodi_id' => $this->prodiTI1->id,
            'judul_pengajuan' => 'Judul Diubah',
        ])->assertOk();

        $this->assertCount(2, $dokumen->fresh()->unitProdiIdsUrut());
        $this->assertCount(2, $pengajuan->fresh()->unitProdiIdsUrut());

        // Memilih unit lain secara eksplisit = menggantikan pilihan.
        $this->actingAs($admin)->patchJson("/api/dokumen-kerjasama/{$dokumen->id}", [
            'unit_prodi_id' => $this->prodiTM->id,
        ])->assertOk();
        $this->assertSame([$this->prodiTM->id], $dokumen->fresh()->unitProdiIdsUrut());
    }

    public function test_pic_polibatam_tersimpan_dan_bisa_diubah(): void
    {
        $user = $this->internal();

        $response = $this->actingAs($user)->postJson('/api/pengajuan', $this->payload([
            'pic_polibatam_nama' => 'Ivy',
            'pic_polibatam_jabatan' => 'Dosen',
            'pic_polibatam_email' => 'ivy@polibatam.ac.id',
            'pic_polibatam_whatsapp' => '81234567890',
        ]));

        $response->assertCreated()
            ->assertJsonPath('data.pic_polibatam_nama', 'Ivy')
            ->assertJsonPath('data.pic_polibatam_whatsapp', '81234567890');

        $id = $response->json('data.id');
        $this->actingAs($user)->patchJson("/api/pengajuan/{$id}", ['pic_polibatam_nama' => 'Ivy Baru'])->assertOk();
        $this->assertSame('Ivy Baru', Pengajuan::find($id)->pic_polibatam_nama);

        $this->actingAs($user)->postJson('/api/pengajuan', $this->payload(['pic_polibatam_email' => 'bukan-email']))
            ->assertStatus(422)->assertJsonValidationErrors('pic_polibatam_email');
    }

    public function test_migrasi_backfill_data_lama_dibaca_lewat_unit_prodi_id(): void
    {
        // Baris lama: hanya unit_prodi_id, belum ada pivot — tetap terbaca sebagai pilihan tunggal.
        $pengajuan = Pengajuan::create($this->payload(['unit_prodi_id' => $this->prodiTI1->id, 'ruang_lingkup_ids' => []]));

        $this->assertSame([$this->prodiTI1->id], $pengajuan->unitProdiIdsUrut());
    }
}
