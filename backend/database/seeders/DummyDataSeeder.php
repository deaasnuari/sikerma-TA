<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Faker\Factory as Faker;
use Illuminate\Support\Str;

class DummyDataSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $faker = Faker::create('id_ID');

        // Get some users, master_unit_prodi, and mitra to associate with
        $users = DB::table('users')->pluck('id')->toArray();
        $unitProdis = DB::table('master_unit_prodi')->pluck('id')->toArray();
        
        // If master_mitra is empty, seed a few dummy mitras first
        if (empty(DB::table('master_mitra')->count())) {
            for ($i = 0; $i < 5; $i++) {
                DB::table('master_mitra')->insert([
                    'nama_mitra' => $faker->company,
                    'kategori_mitra' => $faker->randomElement(['Pemerintahan', 'Perguruan Tinggi', 'Swasta/Dunia Usaha dan Dunia Industri (DUDI)', 'Sekolah/Institusi Pendidikan Lain', 'Organisasi Non-Profit / LSM', 'Lainnya']),
                    'tingkat_perusahaan' => $faker->randomElement(['Lokal', 'Nasional', 'Internasional', 'Multinasional']),
                    'alamat' => $faker->address,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
        $mitras = DB::table('master_mitra')->pluck('id')->toArray();

        // 1. Seed Pengajuan
        $pengajuanIds = [];
        for ($i = 0; $i < 10; $i++) {
            $nomorPengajuan = 'REQ-' . strtoupper(Str::random(8));

            $pengajuanId = DB::table('pengajuan_v2')->insertGetId([
                'nomor_pengajuan' => $nomorPengajuan,
                'user_pengusul_id' => !empty($users) ? $faker->randomElement($users) : null,
                'nama_pengusul' => $faker->name,
                'jabatan_pengusul' => 'Dosen / Staf',
                'email_pengusul' => $faker->email,
                'whatsapp_pengusul' => $faker->phoneNumber,
                'unit_prodi_id' => !empty($unitProdis) ? $faker->randomElement($unitProdis) : null,
                'mitra_id' => !empty($mitras) ? $faker->randomElement($mitras) : null,
                'judul_pengajuan' => 'Pengajuan Kerja Sama ' . $faker->sentence(3),
                'deskripsi_pengajuan' => $faker->paragraph,
                'jenis_dokumen' => $faker->randomElement(['MoU', 'MoA', 'SPK', 'IA']),
                'kategori_pengajuan' => $faker->randomElement(['Dalam Negeri', 'Luar Negeri']),
                //ini untuk
                'ruang_lingkup_ids' => '{}',
                'tanggal_mulai' => $faker->date(),
                'tanggal_berakhir' => $faker->dateTimeBetween('now', '+5 years')->format('Y-m-d'),
                'status_pengajuan' => $faker->randomElement(['menunggu', 'review', 'revisi', 'disetujui', 'ditolak']),
                'diajukan_pada' => now()->subDays(rand(10, 30)),
                'email_terverifikasi_pada' => $faker->boolean(80) ? now() : null,
                'created_at' => now(),
                'updated_at' => now(),
                'nama_mitra' => $faker->company,
            ]);
            $pengajuanIds[] = $pengajuanId;

            // Seed Pengajuan Log for this pengajuan
            for ($j = 0; $j < rand(1, 3); $j++) {
                DB::table('pengajuan_log')->insert([
                    'pengajuan_id' => $pengajuanId,
                    'tipe_log' => 'status_update',
                    'status_baru' => $faker->randomElement(['menunggu', 'review', 'disetujui']),
                    'isi_log' => $faker->sentence,
                    'dibuat_oleh_user_id' => $faker->randomElement($users) ?? null,
                    'dibuat_pada' => now()->subDays(rand(1, 10)),
                ]);
            }
        }

        // 2. Seed Dokumen Kerjasama
        foreach ($pengajuanIds as $index => $pId) {
            // Not all pengajuan become documents
            if ($index % 2 == 0) continue;

            $nomorPengajuan = DB::table('pengajuan_v2')->where('id', $pId)->value('nomor_pengajuan') ?? (string) $pId;

            $dokumenId = DB::table('dokumen_kerjasama')->insertGetId([
                'no_permohonan' => $nomorPengajuan,
                'sumber_pengajuan_id' => $pId,
                'nomor_dokumen' => 'DOC-' . strtoupper(Str::random(8)),
                'nama_dokumen' => 'Dokumen Kerja Sama Resmi ' . $faker->sentence(3),
                'judul_dokumen' => 'Kerja Sama ' . $faker->company,
                'jenis_dokumen' => $faker->randomElement(['MoU', 'MoA']),
                'unit_prodi_id' => !empty($unitProdis) ? $faker->randomElement($unitProdis) : null,
                'mitra_id' => !empty($mitras) ? $faker->randomElement($mitras) : null,
                'tanggal_mulai' => $faker->date(),
                'tanggal_berakhir' => $faker->dateTimeBetween('now', '+3 years')->format('Y-m-d'),
                'status_siklus' => $faker->randomElement(['active', 'expired', 'archived']),
                'file' => 'dummy/path/dokumen_' . $pId . '.pdf', // Fallback for old column
                'keterangan' => $faker->sentence,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // Seed Dokumen File
            DB::table('dokumen_file')->insert([
                'dokumen_id' => $dokumenId,
                'peran_berkas' => 'lampiran',
                'nama_file' => 'Scan_Dokumen_Resmi.pdf',
                'path_file' => 'storage/dokumen/Scan_Dokumen_Resmi.pdf',
                'diunggah_pada' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            
            // Seed Dokumen Log
            for ($k = 0; $k < rand(1, 3); $k++) {
                DB::table('dokumen_log')->insert([
                    'dokumen_id' => $dokumenId,
                    'tipe_log' => $faker->randomElement(['aktivitas', 'status_update']),
                    'isi_log' => $faker->sentence,
                    'dibuat_pada' => now()->subDays(rand(1, 10)),
                ]);
            }
        }
    }
}
