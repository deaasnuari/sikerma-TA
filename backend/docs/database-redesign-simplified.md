# SIKERMA Database Redesign - Penjelasan Lengkap

> **Catatan:** dokumen ini adalah rancangan awal dan sudah tidak sama dengan skema yang berjalan. Untuk ERD terbaru lihat [erd-sikerma-saat-ini.md](erd-sikerma-saat-ini.md).


Dokumen ini menjelaskan desain database baru SIKERMA versi simplified (9 tabel domain inti + 1 tabel bootstrap users),
perbandingan dengan tabel lama, dan mana yang terhubung atau tidak lagi dipakai.

---

## BAGIAN 1 — Daftar Tabel Baru

| No | Nama Tabel         | Fungsi                                             |
|----|--------------------|----------------------------------------------------|
| 1  | users              | Akun pengguna sistem (dari Laravel, tidak berubah) |
| 2  | master_unit_prodi  | Master unit kerja (jurusan) dan program studi      |
| 3  | master_mitra       | Master institusi/mitra dan kontak utamanya         |
| 4  | master_ruang_lingkup | Referensi pilihan ruang lingkup kerja sama       |
| 5  | pengajuan          | Data pengajuan kerja sama dari pemohon             |
| 6  | pengajuan_file     | Berkas/lampiran yang diunggah saat pengajuan       |
| 7  | pengajuan_log      | Riwayat perubahan status pengajuan                 |
| 8  | dokumen_kerjasama  | Dokumen kerja sama resmi (aktif + arsip)           |
| 9  | dokumen_file       | Berkas/file dokumen kerja sama (draft/final)       |
| 10 | dokumen_log        | Aktivitas, notifikasi, perpanjangan, dan event log |

Catatan:
- Tabel `otp_codes` dan `carousel_images` tetap dipakai dari skema lama (tidak diubah).
- Jika dijalankan di database kosong, file SQL sudah menyediakan bootstrap `users` minimal agar foreign key tidak gagal.

---

## BAGIAN 2 — Tabel Sikerma Lama vs Tabel Baru

### 2.1 Tabel LAMA yang TERHUBUNG ke tabel baru

| Tabel Lama          | Kolom Penting Lama                                           | Masuk ke Tabel Baru           | Catatan                                                |
|---------------------|--------------------------------------------------------------|-------------------------------|--------------------------------------------------------|
| ajuan               | no_permohonan, nama_pemohon, jabatan_pemohon, unit, prodi, email, wa_pemohon, nama_institusi, kategori_institusi, negara, nama_pic, jabatan_pic, wa_pic, email_pic, jenis_ajuan, ruang_lingkup, status_ajuan, tgl_ajuan, komentar | pengajuan | Digabung jadi 1 tabel terstruktur dengan FK ke master |
| kerjasamapemohon    | Nama_Pemohon, Jabatan_Pemohon, Email_Pemohon, Unit_Jurusan_Pemohon, No_Wa_Pemohon | pengajuan (kolom nama_pengusul, jabatan_pengusul, dsb) | Dulu tabel terpisah, sekarang menjadi bagian dari pengajuan |
| progres             | no_permohonan, status, tgl, komentar                         | pengajuan_log                 | Riwayat status pengajuan sekarang disimpan di log      |
| rekap               | no_permohonan, no_dokumen, tahun, tgl_awal, tgl_ahir, file   | dokumen_kerjasama + dokumen_file | Dokumen resmi masuk ke dokumen_kerjasama, file-nya ke dokumen_file |
| dokumen             | no_dokumen, mitra, telepon, negara, kategori_institusi, jenis_ajuan, bidang, unit, tahun, tgl_mulai, tgl_akhir, file | dokumen_kerjasama + dokumen_file | Digabung dan diperkuat dengan FK ke master_mitra dan master_unit_prodi |
| arsip               | nama_file, jenis, catatan                                    | dokumen_kerjasama (kolom status_siklus = archived) + dokumen_file | Arsip bukan tabel terpisah lagi, cukup status di dokumen_kerjasama |
| monitoring          | nomor, mitra, tgl_mulai, tgl_berakhir, unit, lingkup, tingkat, judul, manfaat, bukti, status, pic, tgl_monitoring | dokumen_log (tipe_log = aktivitas) | Aktivitas monitoring dicatat sebagai log dokumen       |
| monitoring_unit     | no_dokumen, mitra, unit, judul, manfaat, bukti, tanggal      | dokumen_log (tipe_log = aktivitas) | Sama seperti monitoring, digabung ke log dokumen       |
| m_moa               | nomor, mitra, lingkup, tingkat, judul_kegiatan, manfaat, tgl_mulai, tgl_berakhir, unit, pic, periode, status | dokumen_kerjasama + dokumen_log | Data dokumen MOA masuk ke dokumen_kerjasama, detail aktivitasnya ke dokumen_log |
| prodi               | kode, nama, unit                                             | master_unit_prodi (jenis_node = prodi, dengan parent = unit) | Prodi dan unit sekarang satu tabel hierarki            |

### 2.2 Tabel LAMA yang TIDAK DIPAKAI LAGI di skema baru

| Tabel Lama      | Alasan Tidak Dipakai                                                                 |
|-----------------|--------------------------------------------------------------------------------------|
| arsip           | Konsep arsip dihapus sebagai tabel terpisah. Cukup kolom `status_siklus = archived` di `dokumen_kerjasama`. Data arsip tetap bisa dilihat via view `v_arsip_dokumen_kerjasama`. |
| kerjasamapemohon| Data pemohon sekarang langsung ada di tabel `pengajuan`. Tidak perlu tabel terpisah. |

### 2.3 Tabel LAMA yang TETAP DIPAKAI

| Tabel Lama      | Status di Skema Baru   | Catatan                                   |
|-----------------|------------------------|-------------------------------------------|
| users           | Tetap dipakai          | Mengikuti skema Laravel yang sudah ada; SQL hanya menyediakan bootstrap minimal bila DB kosong |
| otp_codes       | Tetap dipakai          | Tidak ada perubahan                       |
| carousel_images | Tetap dipakai          | Tidak ada perubahan                       |

---

## BAGIAN 3 — Kenapa Struktur Berubah

### Masalah di desain lama:
1. `ajuan` dan `kerjasamapemohon` menyimpan data yang sama (nama pemohon, unit, dsb) di 2 tabel.
2. `dokumen` dan `arsip` adalah 2 tabel terpisah padahal entitasnya sama (dokumen kerja sama), hanya beda status.
3. `monitoring` dan `monitoring_unit` duplikat fungsi yang sama (catatan aktivitas).
4. `m_moa` adalah tabel monitoring khusus MOA, padahal bisa digabung ke satu tabel monitoring umum.
5. Hampir tidak ada foreign key antar tabel, data mudah inkonsisten.
6. Kolom tanggal disimpan sebagai VARCHAR/string, bukan DATE.

### Solusi di desain baru:
1. Satu sumber data per domain: `pengajuan`, `dokumen_kerjasama`, `dokumen_log`.
2. Arsip bukan tabel lain, tapi status di dokumen.
3. Monitoring dan aktivitas masuk ke `dokumen_log` dengan `tipe_log`.
4. Semua relasi memakai foreign key yang tepat.
5. Kolom tanggal menggunakan tipe DATE/TIMESTAMP yang benar.

---

## BAGIAN 4 — Penyambung Entitas (Relasi Lengkap)

1. `master_unit_prodi (parent)` 1..n `master_unit_prodi (child)` — unit menaungi banyak prodi
2. `users` 1..n `pengajuan` — satu user bisa ajukan banyak pengajuan
3. `master_unit_prodi` 1..n `pengajuan` — pengajuan berasal dari unit/prodi tertentu
4. `master_mitra` 1..n `pengajuan` — pengajuan ditujukan ke mitra tertentu
5. `pengajuan` 1..n `pengajuan_file` — satu pengajuan bisa banyak lampiran
6. `pengajuan` 1..n `pengajuan_log` — setiap perubahan status dicatat di log
7. `pengajuan` 1..0/1 `dokumen_kerjasama` — pengajuan yang disetujui jadi dokumen
8. `master_unit_prodi` 1..n `dokumen_kerjasama` — dokumen terkait unit/prodi
9. `master_mitra` 1..n `dokumen_kerjasama` — dokumen terkait mitra
10. `dokumen_kerjasama` 1..n `dokumen_file` — dokumen punya banyak file
11. `dokumen_kerjasama` 1..n `dokumen_log` — dokumen punya log aktivitas, notifikasi, perpanjangan
12. `master_ruang_lingkup` n..m `pengajuan` — disimpan via array `ruang_lingkup_ids`
13. `master_ruang_lingkup` n..m `dokumen_kerjasama` — disimpan via array `ruang_lingkup_ids`

---

## BAGIAN 5 — Status yang Dipakai

| Enum                      | Nilai                                              |
|---------------------------|----------------------------------------------------|
| status_pengajuan          | menunggu, diproses, disetujui, ditolak             |
| status_siklus_dokumen     | active, expiring, archived                         |
| tipe_log_pengajuan        | status, komentar, verifikasi                       |
| tipe_log_dokumen          | aktivitas, notifikasi, perpanjangan, status, arsip |
| jenis_dokumen             | MOU, MOA, IA                                       |
| jenis_node (unit/prodi)   | unit, prodi                                        |

---

## BAGIAN 6 — Kompatibilitas Arsip (View)

Untuk tetap bisa query data arsip seperti sistem lama:

```sql
SELECT * FROM v_arsip_dokumen_kerjasama;
```

View ini mengembalikan semua dokumen yang:
1. `status_siklus = archived`, atau
2. `tanggal_berakhir < tanggal hari ini`

---

## BAGIAN 7 — Index Wajib

| Tabel              | Kolom Index                          | Tujuan                        |
|--------------------|--------------------------------------|-------------------------------|
| pengajuan          | (status_pengajuan, diajukan_pada)    | Filter pengajuan by status    |
| pengajuan          | (unit_prodi_id, mitra_id)            | Filter by unit dan mitra      |
| dokumen_kerjasama  | (status_siklus, tanggal_berakhir)    | Monitoring dokumen hampir expired |
| dokumen_kerjasama  | ruang_lingkup_ids (GIN)              | Query array ruang lingkup     |
| dokumen_log        | (dokumen_id, dibuat_pada)            | Riwayat log per dokumen       |
| master_mitra       | nama_mitra                           | Pencarian mitra               |
