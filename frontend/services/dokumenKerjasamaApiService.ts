import { apiRequest, API_BASE_URL } from '@/lib/api';
import { getCachedMasterRuangLingkup, getMasterRuangLingkup } from '@/services/masterRuangLingkupService';

function getBackendOrigin(): string {
  try {
    const configured = process.env.NEXT_PUBLIC_API_URL;
    if (configured && /^https?:\/\//i.test(configured)) {
      return new URL(configured).origin;
    }
  } catch {
    // fall through
  }
  return API_BASE_URL.startsWith('http') ? new URL(API_BASE_URL).origin : 'http://127.0.0.1:8000';
}

export function buildLegacyFileUrl(filePath: string): string {
  if (filePath.startsWith('http')) return filePath;
  const origin = getBackendOrigin();
  //ini untuk menghapus prefix /storage/ di filePath, karena di backend sudah diubah ke dokumen/
  let clean = filePath.replace(/^\/+/, '').replace(/^storage\//, '');
  // Kalau path cuma nama file (mis. legacy "49 MOU Solustar Pte Ltd 2017.pdf"), tambahkan prefix
  if (!clean.includes('/')) {
    clean = `dokumen/${clean}`;
  }
  return `${origin}/storage/${clean}`;
}
import type { RekapDokumen } from '@/services/adminRekapDataService';

const REKAP_CACHE_TTL_MS = 60 * 1000;
let rekapDokumenCache: { data: RekapDokumen[]; expiresAt: number } | null = null;
let rekapDokumenInFlight: Promise<RekapDokumen[]> | null = null;

export function invalidateRekapCache(): void {
  rekapDokumenCache = null;
}

type ApiPaginatedResponse<T> = {
  success: boolean;
  message: string;
  data: {
    data: T[];
  };
};

type ApiDokumenRow = {
  id: number;
  nomor_dokumen?: string | null;
  nama_dokumen?: string | null;
  jenis_dokumen: string;
  tanggal_mulai?: string | null;
  tanggal_berakhir?: string | null;
  // Kapan baris dokumen_kerjasama ini benar-benar dibuat di sistem — dipakai untuk urutkan
  // Story & Aktivitas dari yang PALING BARU DIAJUKAN, beda dari tanggal_mulai (tanggal mulai
  // kontraktual kerja sama, bisa jauh dari kapan pengajuannya sendiri masuk).
  created_at?: string | null;
  status_siklus?: 'active' | 'expiring' | 'archived' | null;
  // Status terhitung dari backend (DokumenKerjasama::status_efektif) — SATU-SATUNYA
  // sumber kebenaran status kerjasama, dipakai bersama oleh Rekap Data, Monitoring,
  // Status & Progres Kerjasama, dan Arsip Dokumen supaya jumlah Kadaluarsa selalu sama.
  // status_siklus mentah tidak dipakai lagi untuk menentukan status tampilan karena bisa
  // basi (tidak otomatis ikut berubah saat tanggal_berakhir lewat).
  status_efektif?: 'active' | 'expiring' | 'archived' | null;
  ruang_lingkup_ids?: any[] | null;
  mitra?: {
    id: number;
    nama_mitra: string;
    kode_mitra?: string | null;
    kategori_mitra?: string | null;
    bidang_usaha?: string | null;
    tingkat_perusahaan?: string | null;
    alamat?: string | null;
    negara?: string | null;
    email_mitra?: string | null;
    whatsapp_mitra?: string | null;
    nama_kontak_utama?: string | null;
    jabatan_kontak_utama?: string | null;
    email_kontak_utama?: string | null;
    telepon_kontak_utama?: string | null;
    no_telepon_mitra?: string | null;
  } | null;
  unit_prodi?: {
    id: number;
    nama: string;
    kategori_unit?: string | null;
    jenis_node?: string | null;
    parent?: { id: number; nama: string; jenis_node?: string | null; kategori_unit?: string | null } | null;
  } | null;
  // Semua jurusan/prodi dokumen ini (pilihan majemuk). unit_prodi di atas = yang utama.
  unit_prodi_items?: {
    id: number;
    nama: string;
    kategori_unit?: string | null;
    jenis_node?: string | null;
    parent?: { id: number; nama: string; jenis_node?: string | null; kategori_unit?: string | null } | null;
  }[] | null;
  file?: string | null;
  alasan_arsip?: string | null;
  follow_up?: string | null;
  judul_dokumen?: string | null;
  manfaat?: string | null;
  luaran_kerja_sama?: string | null;
  nilai_kerjasama?: string | null;
  // Snapshot data pengajuan (tersimpan saat disetujui, aman dari penghapusan pengajuan)
  snap_nama_mitra?: string | null;
  snap_whatsapp_pengusul?: string | null;
  snap_pic_polibatam_nama?: string | null;
  snap_pic_polibatam_jabatan?: string | null;
  snap_pic_polibatam_email?: string | null;
  snap_pic_polibatam_whatsapp?: string | null;
  snap_nama_pengusul?: string | null;
  snap_email_pengusul?: string | null;
  snap_jenis_mitra?: string | null;
  snap_bidang_usaha?: string | null;
  snap_tingkat_perusahaan?: string | null;
  laporan_pelaksanaan?: Array<{
    id: number;
    tahun?: number | null;
    triwulan?: number | null;
    file_path?: string | null;
    file_nama?: string | null;
  }> | null;
  pengajuan?: {
    id: number;
    nomor_pengajuan: string;
    nama_pengusul: string;
    whatsapp_pengusul?: string;
    pic_polibatam_nama?: string | null;
    pic_polibatam_whatsapp?: string | null;
    nama_mitra?: string | null;
    user_pengusul_id?: number | null;
    user_pengusul?: { id: number; role: string } | null;
    final_approved_at?: string | null;
  } | null;
  dokumen_files?: Array<{
    id: number;
    nama_file: string;
    path_file: string;
    peran_berkas?: string | null;
    mime_type?: string | null;
    ukuran_file_bytes?: number | null;
  }> | null;
};

function mapJenis(value?: string | null): 'MoA' | 'MoU' | 'IA' | 'Lainnya' {
  const upper = (value || '').toUpperCase();
  if (upper === 'MOA') return 'MoA';
  if (upper === 'IA') return 'IA';
  if (upper === 'LAINNYA') return 'Lainnya';
  return 'MoU';
}

// Selalu pakai status_efektif (dihitung backend dari tanggal_berakhir, lihat
// KerjasamaStatus) — fallback ke status_siklus mentah hanya kalau backend lama belum
// mengirim status_efektif sama sekali (mis. baris publik/legacy yang tidak lewat
// DokumenKerjasama::index()).
function mapStatus(row: Pick<ApiDokumenRow, 'status_siklus' | 'status_efektif'>): RekapDokumen['status'] {
  const value = row.status_efektif ?? row.status_siklus;
  if (value === 'archived') return 'Kadaluarsa';
  if (value === 'expiring') return 'Akan Berakhir';
  return 'Aktif';
}

function toDisplayDate(value?: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
}

export async function fetchRekapDokumenFromApi(options?: { forceRefresh?: boolean }): Promise<RekapDokumen[]> {
  const shouldUseCache = !options?.forceRefresh;
  const now = Date.now();

  if (shouldUseCache && rekapDokumenCache && rekapDokumenCache.expiresAt > now) {
    return rekapDokumenCache.data;
  }

  if (rekapDokumenInFlight) {
    return rekapDokumenInFlight;
  }

  rekapDokumenInFlight = (async () => {
    // Selalu ambil ULANG daftar master ruang lingkup (semua status, aktif maupun nonaktif) —
    // JANGAN cuma andalkan cache lokal yang bisa basi (ruang lingkup baru/diubah namanya/
    // dinonaktifkan tidak langsung kepakai) atau cuma cakup yang aktif (bikin id yang sudah
    // nonaktif gagal ter-resolve jadi nama, tampil sebagai angka mentah). Ini yang bikin kolom
    // Ruang Lingkup di Rekap Data bisa beda dari kartu "Top 5 Ruang Lingkup" yang dihitung
    // langsung di backend dari master_ruang_lingkup tanpa cache.
    const [response, freshRuangLingkup] = await Promise.all([
      apiRequest<ApiPaginatedResponse<ApiDokumenRow & { sumber_pengajuan_id?: number | null; keterangan?: string | null }>>('/dokumen-kerjasama?per_page=2000'),
      getMasterRuangLingkup().catch(() => getCachedMasterRuangLingkup()),
    ]);
    const rlLookup = freshRuangLingkup.length > 0 ? freshRuangLingkup : getCachedMasterRuangLingkup();
    const mapped = (response.data?.data ?? []).map((row) => {
    const nomor = row.nomor_dokumen || row.pengajuan?.nomor_pengajuan || `DOK-${row.id}`;
    const tanggalMulaiRaw = row.tanggal_mulai || '';
    
    // Priority: mitra relation → pengajuan.nama_mitra → snap_nama_mitra → keterangan → legacy file name
    let namaMitra = row.mitra?.nama_mitra;

    if (!namaMitra && row.pengajuan?.nama_mitra) {
      namaMitra = row.pengajuan.nama_mitra;
    }

    // Snapshot tersimpan saat pengajuan disetujui — tetap ada meski pengajuan dihapus
    if (!namaMitra && row.snap_nama_mitra) {
      namaMitra = row.snap_nama_mitra;
    }

    if (!namaMitra && row.keterangan && row.keterangan.includes('Mitra:')) {
      const match = row.keterangan.match(/Mitra:\s*(.*?)(?:\s*\|\s*Bidang:|$)/i);
      if (match?.[1]) {
        namaMitra = match[1].trim();
      }
    }

    if (!namaMitra && row.file && !row.file.includes('/')) {
      // Only parse legacy filenames (e.g. "49 MOU Solustar Pte Ltd 2017.pdf"), skip storage paths
      const cleanedFile = row.file.replace(/^\d+\s*(MOU|MOA|IA)\s*/i, '').replace(/\.pdf.*$/i, '').trim();
      if (cleanedFile && cleanedFile.length > 2) {
        namaMitra = cleanedFile;
      }
    }

    // dokumen_files dari controller sudah dibatasi ke peran_berkas 'dokumen_final',
    // 'dokumen_perpanjangan', 'dokumen_pendukung', atau 'bukti_tidak_diperpanjang' —
    // pisahkan lagi di sini supaya dokumen pendukung (TOR/KAK/Proposal) dan bukti "tidak
    // diperpanjang" (diunggah admin di Monitoring) tidak ikut nyampur ke kartu dokumen utama.
    // Fallback ke kolom 'file' hanya untuk record lama yang belum punya dokumen_files.
    let dokumenTerkait: any[] = [];
    const allFiles = row.dokumen_files ?? [];
    const finalFiles = allFiles.filter((f) => f.peran_berkas !== 'dokumen_pendukung' && f.peran_berkas !== 'bukti_tidak_diperpanjang');
    const buktiTidakDiperpanjangFile = allFiles.find((f) => f.peran_berkas === 'bukti_tidak_diperpanjang');
    const dokumenPendukungTerkait = allFiles
      .filter((f) => f.peran_berkas === 'dokumen_pendukung')
      .map((f) => ({
        nama: f.nama_file,
        jenisBerkas: 'pendukung' as const,
        url: buildLegacyFileUrl(f.path_file || ''),
        // Dipakai untuk mengunduh dengan nama ASLI berkasnya (lewat downloadFileWithAuth) —
        // bukan nama acak hasil penyimpanan di server.
        downloadUrl: `/dokumen-kerjasama/${row.id}/documents/${f.id}/download`,
        tipe: f.mime_type || (f.nama_file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
        ukuran: f.ukuran_file_bytes ? `${Math.round(f.ukuran_file_bytes / 1024)} KB` : 'Dokumen Pendukung',
        tanggal: toDisplayDate(tanggalMulaiRaw),
      }));
    if (finalFiles.length > 0) {
      const seenPaths = new Set<string>();
      dokumenTerkait = finalFiles
        .filter((f) => {
          const key = f.path_file || f.nama_file;
          if (seenPaths.has(key)) return false;
          seenPaths.add(key);
          return true;
        })
        .map((f) => {
        const rawPath = f.path_file || '';
        const fileUrl = buildLegacyFileUrl(rawPath);
        const sizeLabel = f.ukuran_file_bytes
          ? `${Math.round(f.ukuran_file_bytes / 1024)} KB`
          : 'Ukuran tidak tersedia';
        return {
          nama: f.nama_file,
          jenisBerkas: jenisBerkasDariPeran(f.peran_berkas),
          url: fileUrl,
          downloadUrl: `/dokumen-kerjasama/${row.id}/documents/${f.id}/download`,
          tipe: f.mime_type || (f.nama_file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
          ukuran: sizeLabel,
          tanggal: toDisplayDate(tanggalMulaiRaw),
        };
      })
        // Dokumen final dulu (tautan utama di tabel mengambil berkas pertama), lalu perpanjangan, lalu berkas pengajuan.
        .sort((a, b) => URUTAN_JENIS_BERKAS[a.jenisBerkas] - URUTAN_JENIS_BERKAS[b.jenisBerkas]);
    } else if (row.file) {
      // Legacy: record lama yang hanya punya kolom 'file' (bukan dokumen_files) — endpoint
      // download/view backend sudah mendukung penanda khusus 'legacy' untuk kasus ini.
      dokumenTerkait.push({
        nama: row.file.split('/').pop() || row.file,
        jenisBerkas: 'final',
        url: buildLegacyFileUrl(row.file),
        downloadUrl: `/dokumen-kerjasama/${row.id}/documents/legacy/download`,
        tipe: row.file.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
        ukuran: 'File System',
        tanggal: toDisplayDate(tanggalMulaiRaw),
      });
    }

      const ruangLingkup = Array.isArray(row.ruang_lingkup_ids)
        ? (row.ruang_lingkup_ids as any[]).map((id) => {
            const numId = Number(id);
            const found = rlLookup.find((item) => item.id === numId);
            return found ? found.nama_ruang_lingkup : String(id);
          }).filter(Boolean)
        : [];

      const kategoriUnitRaw = row.unit_prodi?.kategori_unit?.toLowerCase() ?? '';
      const kategoriUnit: 'Jurusan' | 'Unit' | undefined =
        kategoriUnitRaw === 'jurusan' ? 'Jurusan' :
        kategoriUnitRaw ? 'Unit' : undefined;

      //jurusanNama, prodiNama, unitKerjaNama diambil dari unit_prodi (jika ada) sesuai jenis_node dan kategori_unit  
      // Dokumen bisa punya beberapa jurusan/prodi (unit_prodi_items); kalau tidak ada, pakai node utamanya.
      const unitItems = row.unit_prodi_items && row.unit_prodi_items.length > 0
        ? row.unit_prodi_items
        : row.unit_prodi ? [row.unit_prodi] : [];
      const jurusanNames: string[] = [];
      const prodiNames: string[] = [];
      const unitKerjaNames: string[] = [];
      const pushUnique = (list: string[], value?: string | null) => {
        if (value && !list.includes(value)) list.push(value);
      };
      unitItems.forEach((item) => {
        const itemJenisNode = item.jenis_node?.toLowerCase();
        const itemKategori = item.kategori_unit?.toLowerCase() ?? '';
        if (itemJenisNode === 'prodi') {
          pushUnique(prodiNames, item.nama);
          pushUnique(jurusanNames, item.parent?.nama);
        } else if (itemJenisNode === 'unit' && itemKategori === 'jurusan') {
          pushUnique(jurusanNames, item.nama);
        } else {
          pushUnique(unitKerjaNames, item.nama);
        }
      });
      const jurusanNama = jurusanNames.length > 0 ? jurusanNames.join(', ') : undefined;
      const prodiNama = prodiNames.length > 0 ? prodiNames.join(', ') : undefined;
      const unitKerjaNama = unitKerjaNames.length > 0 ? unitKerjaNames.join(', ') : undefined;

      // Durasi kerja sama dalam bulan (dibulatkan ke bilangan bulat), dihitung dari selisih tanggal.
      let durasiBulan: number | undefined;
      if (row.tanggal_mulai && row.tanggal_berakhir) {
        const startMs = new Date(row.tanggal_mulai).getTime();
        const endMs = new Date(row.tanggal_berakhir).getTime();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
          durasiBulan = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24 * 30.4375));
        }
      }

      // Tingkat perusahaan dipecah jadi 3 kolom Ya/Tidak sesuai struktur rekap Excel.
      // "Multinasional" dianggap masuk kelompok Internasional.
      const tingkatRaw = (row.mitra?.tingkat_perusahaan || row.snap_tingkat_perusahaan || '').toLowerCase();
      const tingkatInternasional = tingkatRaw === 'internasional' || tingkatRaw === 'multinasional';
      const tingkatNasional = tingkatRaw === 'nasional';
      const tingkatLokal = tingkatRaw === 'lokal';

      // Hasil Monitoring Triwulan 1-4: ditandai terisi kalau pernah ada laporan pelaksanaan
      // dengan nomor triwulan tsb (lintas tahun — belum discope ke tahun tertentu).
      const laporanList = row.laporan_pelaksanaan ?? [];
      const triwulanSet = new Set(
        laporanList.map((l) => l.triwulan).filter((t): t is number => typeof t === 'number'),
      );
      const laporanKegiatanLinks = laporanList
        .filter((l) => !!l.file_path)
        .map((l) => buildLegacyFileUrl(l.file_path as string));
      // Prioritas bukti dokumen: dokumen_final (dokumen_files) → file (legacy) → laporan pelaksanaan (PDF)
      const jenisUpper = (row.jenis_dokumen || '').toUpperCase();
      const primaryLink = dokumenTerkait.length > 0 ? dokumenTerkait[0].url : null;
      const buktiMou = jenisUpper === 'MOU' ? primaryLink : null;
      const buktiMoaPks = jenisUpper === 'MOA' ? primaryLink : null;
      const buktiIa = jenisUpper === 'IA' ? primaryLink : null;

      return {
      id: row.id,
      sourcePengajuanId: row.sumber_pengajuan_id || undefined,
      noDokumen: nomor,
      namaMitra: namaMitra || '-',
      jenis: mapJenis(row.jenis_dokumen),
      unit: unitItems.length > 0 ? unitItems.map((item) => item.nama).join(', ') : '-',
      kategoriUnit,
      tanggalMulai: toDisplayDate(tanggalMulaiRaw),
      berlakuHingga: toDisplayDate(row.tanggal_berakhir),
      tanggalMulaiRaw: tanggalMulaiRaw || undefined,
      berlakuHinggaRaw: row.tanggal_berakhir || undefined,
      dibuatPada: row.created_at || undefined,
      disetujuPada: row.pengajuan?.final_approved_at || undefined,
      tahun: (tanggalMulaiRaw || new Date().toISOString()).slice(0, 4),
      status: mapStatus(row),
      whatsappNumber: row.mitra?.whatsapp_mitra || row.pengajuan?.whatsapp_pengusul || row.snap_whatsapp_pengusul || undefined,
          emailMitra: row.mitra?.email_mitra || row.snap_email_pengusul || undefined,
      dokumenTerkait,
      dokumenPendukungTerkait: dokumenPendukungTerkait.length > 0 ? dokumenPendukungTerkait : undefined,
      ruangLingkup,
      ruangLingkupIds: Array.isArray(row.ruang_lingkup_ids) ? (row.ruang_lingkup_ids as number[]) : undefined,
      mitraNegara: row.mitra?.negara || undefined,
      // unitProdiId menunjuk ke node yang benar-benar tersimpan di dokumen_kerjasama.unit_prodi_id
      // (bisa Jurusan/Unit ATAU Prodi). jurusanUnitProdiId cuma terisi kalau node itu Prodi (anak
      // dari Jurusan) — dipakai form edit untuk prefill dropdown Jurusan → Prodi bertingkat.
      unitProdiId: row.unit_prodi?.id ?? undefined,
      unitProdiIds: unitItems.length > 0 ? unitItems.map((item) => item.id) : undefined,
      jurusanUnitProdiId: row.unit_prodi?.jenis_node === 'prodi' ? (row.unit_prodi?.parent?.id ?? undefined) : undefined,
      alasanArsip: row.alasan_arsip || null,
      buktiPdf: dokumenTerkait.length > 0 ? dokumenTerkait[0].url : null,
      // Path API buat unduh "Bukti PDF" pakai nama asli berkasnya (lihat downloadFileWithAuth).
      buktiPdfDownloadUrl: dokumenTerkait.length > 0 ? dokumenTerkait[0].downloadUrl : null,
      buktiPdfNama: dokumenTerkait.length > 0 ? dokumenTerkait[0].nama : null,
      // Bukti kalau kerja sama ini ditandai TIDAK diperpanjang (upload terpisah dari dokumen
      // final) — dipakai di kolom "Bukti Tidak Diperpanjang" pada tabel Arsip Dokumen.
      buktiTidakDiperpanjang: buktiTidakDiperpanjangFile ? buildLegacyFileUrl(buktiTidakDiperpanjangFile.path_file || '') : null,
      buktiTidakDiperpanjangDownloadUrl: buktiTidakDiperpanjangFile
        ? `/dokumen-kerjasama/${row.id}/documents/${buktiTidakDiperpanjangFile.id}/download`
        : null,
      buktiTidakDiperpanjangNama: buktiTidakDiperpanjangFile?.nama_file || null,
      manfaatKerjasama: (row.keterangan && !row.keterangan.includes('Mitra:')) ? row.keterangan : undefined,
      mitraId: row.mitra?.id ?? undefined,
      kodePerusahaan: row.mitra?.kode_mitra || undefined,
      jenisMitra: row.mitra?.kategori_mitra || row.snap_jenis_mitra || undefined,
      tingkatPerusahaan: row.mitra?.tingkat_perusahaan || row.snap_tingkat_perusahaan || undefined,
      followUp: row.follow_up || undefined,
      dibuatOlehRole: row.pengajuan?.user_pengusul?.role || null,

      bidangUsaha: row.mitra?.bidang_usaha || row.snap_bidang_usaha || undefined,
      alamatMitra: row.mitra?.alamat || undefined,
      noTeleponMitra: row.mitra?.no_telepon_mitra || undefined,
      picMitra: row.mitra?.nama_kontak_utama || undefined,
      // Tiga nomor WhatsApp berbeda untuk detail Rekap: kantor/umum mitra, PIC mitra, dan PIC Polibatam.
      whatsappMitraUmum: row.mitra?.whatsapp_mitra || undefined,
      whatsappPicMitra: row.pengajuan?.whatsapp_pengusul || row.snap_whatsapp_pengusul || undefined,
      picPolibatamNama: row.snap_pic_polibatam_nama || row.pengajuan?.pic_polibatam_nama || undefined,
      picPolibatamJabatan: row.snap_pic_polibatam_jabatan || undefined,
      picPolibatamEmail: row.snap_pic_polibatam_email || undefined,
      picPolibatamTelepon: row.snap_pic_polibatam_whatsapp || row.pengajuan?.pic_polibatam_whatsapp || undefined,
      jabatanPicMitra: row.mitra?.jabatan_kontak_utama || undefined,
      emailPicMitra: row.mitra?.email_kontak_utama || undefined,
      picJurusanUnit: row.pengajuan?.nama_pengusul || row.snap_nama_pengusul || undefined,
      tingkatInternasional,
      tingkatNasional,
      tingkatLokal,
      judulKegiatan: row.judul_dokumen || row.nama_dokumen || undefined,
      luaranKerjaSama: row.luaran_kerja_sama || undefined,
      nilaiKerjasama: row.nilai_kerjasama || undefined,
      manfaatSebenarnya: row.manfaat || undefined,
      keteranganAsli: row.keterangan || undefined,
      durasiBulan,
      jurusanNama,
      prodiNama,
      unitKerjaNama,
      triwulan1: triwulanSet.has(1),
      triwulan2: triwulanSet.has(2),
      triwulan3: triwulanSet.has(3),
      triwulan4: triwulanSet.has(4),
      buktiMou,
      buktiMoaPks,
      buktiIa,
      laporanKegiatanLinks,
    };
  });

    rekapDokumenCache = {
      data: mapped,
      expiresAt: Date.now() + REKAP_CACHE_TTL_MS,
    };

    return mapped;
  })();

  try {
    return await rekapDokumenInFlight;
  } finally {
    rekapDokumenInFlight = null;
  }
}

function mapStatusToApi(status: string): 'active' | 'expiring' | 'archived' {
  if (status === 'Akan Berakhir') return 'expiring';
  if (status === 'Kadaluarsa') return 'archived';
  return 'active';
}

function mapJenisToApi(jenis: string): 'MOU' | 'MOA' | 'IA' | 'LAINNYA' {
  const upper = jenis.toUpperCase();
  if (upper === 'MOA') return 'MOA';
  if (upper === 'IA') return 'IA';
  if (upper === 'LAINNYA') return 'LAINNYA';
  return 'MOU';
}

export async function updateDokumenKerjasamaById(
  id: number,
  payload: {
    nomor_dokumen?: string;
    nama_dokumen?: string;
    judul_dokumen?: string | null;
    jenis_dokumen?: string;
    unit_prodi_id?: number;
    unit_prodi_ids?: number[];
    jurusan_ids?: number[];
    tanggal_mulai?: string | null;
    tanggal_berakhir?: string | null;
    status_siklus?: 'active' | 'expiring' | 'archived';
    // Catatan kenapa kerja sama diarsipkan/tidak diperpanjang — tampil di kolom "Catatan Tidak
    // Diperpanjang" pada tabel Arsip Dokumen.
    alasan_arsip?: string | null;
    keterangan?: string | null;
    follow_up?: string | null;
    manfaat?: string | null;
    luaran_kerja_sama?: string | null;
    // Teks bebas (mis. "Rp 50.000.000" atau "USD 5,000").
    nilai_kerjasama?: string | null;
    ruang_lingkup_ids?: number[] | null;
    mitra_id?: number | null;
  }
): Promise<void> {
  await apiRequest<unknown>(`/dokumen-kerjasama/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  rekapDokumenCache = null;
}

export async function createDokumenKerjasama(payload: {
  nomor_dokumen: string;
  nama_dokumen: string;
  judul_dokumen?: string | null;
  jenis_dokumen: string;
  unit_prodi_id: number;
  unit_prodi_ids?: number[];
  jurusan_ids?: number[];
  mitra_id?: number | null;
  tanggal_mulai?: string | null;
  tanggal_berakhir?: string | null;
  status_siklus?: 'active' | 'expiring' | 'archived';
  keterangan?: string | null;
  manfaat?: string | null;
  luaran_kerja_sama?: string | null;
  ruang_lingkup_ids?: number[] | null;
}): Promise<{ id: number }> {
  const response = await apiRequest<{ success: boolean; data: { id: number }; message: string }>('/dokumen-kerjasama/manual', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  rekapDokumenCache = null;
  return response.data;
}

export async function updatePengajuanNamaMitra(
  pengajuanId: number,
  namaMitra: string
): Promise<void> {
  await apiRequest<unknown>(`/pengajuan/${pengajuanId}`, {
    method: 'PATCH',
    body: JSON.stringify({ nama_mitra: namaMitra }),
  });
}

export async function uploadDokumenFile(
  id: number,
  blob: Blob,
  fileName: string,
  peranBerkas?: 'dokumen_final' | 'dokumen_pendukung' | 'bukti_tidak_diperpanjang'
): Promise<void> {
  const formData = new FormData();
  formData.append('file', blob, fileName);
  if (peranBerkas) {
    formData.append('peran_berkas', peranBerkas);
  }
  await apiRequest<unknown>(`/dokumen-kerjasama/${id}/upload-file`, {
    method: 'POST',
    body: formData,
  });
  rekapDokumenCache = null;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const byteChars = atob(data);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  return new Blob([byteArray], { type: mime });
}

export { mapStatusToApi, mapJenisToApi, dataUrlToBlob };

export async function deleteDokumenKerjasamaById(id: number): Promise<void> {
  await apiRequest(`/dokumen-kerjasama/${id}`, {
    method: 'DELETE',
  });

  rekapDokumenCache = null;
}

export type TrashDokumenApiItem = {
  id: number;
  noDokumen: string;
  namaMitra: string;
  jenis: 'MoA' | 'MoU' | 'IA' | 'Lainnya';
  status: 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';
  tanggalMulai: string;
  berlakuHingga: string;
  // Siapa yang menghapus & kapan — dihapusAdminPada = dihapus oleh admin (dilihat di sini
  // supaya admin bisa audit siapa yang menghapus), dihapusUserPada = dihapus oleh pemiliknya
  // sendiri dari Rekap Data mereka.
  dihapusOlehAdmin: boolean;
  dihapusOlehPemilik: boolean;
  dihapusPada: string | null;
  // File dokumen final (kontrak/MoU/MoA/IA) — dipakai admin buat buka & pastikan isinya
  // sebelum memutuskan pulihkan atau hapus permanen. null kalau memang belum pernah diunggah.
  dokumenUrl: string | null;
  dokumenDownloadUrl: string | null;
  dokumenNama: string | null;
};

type ApiTrashRow = ApiDokumenRow & {
  dihapus_admin_pada?: string | null;
  dihapus_user_pada?: string | null;
};

function jenisBerkasDariPeran(peran?: string | null): 'final' | 'pengajuan' | 'perpanjangan' | 'pendukung' {
  if (peran === 'pengajuan_awal') return 'pengajuan';
  if (peran === 'dokumen_perpanjangan') return 'perpanjangan';
  if (peran === 'dokumen_pendukung') return 'pendukung';
  return 'final';
}

const URUTAN_JENIS_BERKAS = { final: 0, perpanjangan: 1, pengajuan: 2, pendukung: 3 } as const;

export async function fetchTrashDokumenFromApi(): Promise<TrashDokumenApiItem[]> {
  const response = await apiRequest<ApiPaginatedResponse<ApiTrashRow>>('/dokumen-kerjasama/trash/list?per_page=200');
  return (response.data?.data ?? []).map((row) => {
    const nomor = row.nomor_dokumen || row.pengajuan?.nomor_pengajuan || `DOK-${row.id}`;
    const namaMitra = row.mitra?.nama_mitra || row.pengajuan?.nama_mitra || row.snap_nama_mitra || '-';
    const dihapusPada = row.dihapus_admin_pada || row.dihapus_user_pada || null;

    // Prioritas sama seperti Rekap Data: dokumen_files (dokumen_final/perpanjangan) →
    // fallback kolom 'file' legacy.
    const allFiles = row.dokumen_files ?? [];
    const finalFiles = allFiles.filter((f) => f.peran_berkas !== 'dokumen_pendukung' && f.peran_berkas !== 'bukti_tidak_diperpanjang');
    let dokumenUrl: string | null = null;
    let dokumenDownloadUrl: string | null = null;
    let dokumenNama: string | null = null;
    if (finalFiles.length > 0) {
      const f = finalFiles[0];
      dokumenUrl = buildLegacyFileUrl(f.path_file || '');
      dokumenDownloadUrl = `/dokumen-kerjasama/${row.id}/documents/${f.id}/download`;
      dokumenNama = f.nama_file;
    } else if (row.file) {
      dokumenUrl = buildLegacyFileUrl(row.file);
      dokumenDownloadUrl = `/dokumen-kerjasama/${row.id}/documents/legacy/download`;
      dokumenNama = row.file.split('/').pop() || row.file;
    }

    return {
      id: row.id,
      noDokumen: nomor,
      namaMitra,
      jenis: mapJenis(row.jenis_dokumen),
      status: mapStatus(row),
      tanggalMulai: toDisplayDate(row.tanggal_mulai),
      berlakuHingga: toDisplayDate(row.tanggal_berakhir),
      dihapusOlehAdmin: !!row.dihapus_admin_pada,
      dihapusOlehPemilik: !!row.dihapus_user_pada,
      dihapusPada: dihapusPada ? toDisplayDate(dihapusPada) : null,
      dokumenUrl,
      dokumenDownloadUrl,
      dokumenNama,
    };
  });
}

export async function restoreDokumenKerjasamaById(id: number): Promise<void> {
  await apiRequest(`/dokumen-kerjasama/${id}/restore`, {
    method: 'POST',
  });

  rekapDokumenCache = null;
}

export async function permanentDeleteDokumenKerjasamaById(id: number): Promise<void> {
  await apiRequest(`/dokumen-kerjasama/${id}/permanent`, {
    method: 'DELETE',
  });

  rekapDokumenCache = null;
}

export type ArsipDokumenApiItem = {
  id: number;
  noDokumen: string;
  namaMitra: string;
  jenis: 'MoA' | 'MoU' | 'IA' | 'Lainnya';
  // Status yang SAMA dengan Rekap Data/Monitoring (dari status_efektif backend) — Arsip
  // Dokumen HARUS baca ini, bukan menghitung ulang sendiri dari tanggal, supaya jumlah
  // "Kadaluarsa" konsisten di semua halaman.
  status: 'Akan Berakhir' | 'Kadaluarsa';
  tanggalMulai: string;
  berlakuHingga: string;
  alasanArsip: string | null;
  buktiPdf: string | null;
  buktiPdfDownloadUrl: string | null;
  buktiPdfNama: string | null;
  buktiTidakDiperpanjang: string | null;
  buktiTidakDiperpanjangDownloadUrl: string | null;
  buktiTidakDiperpanjangNama: string | null;
};

export async function fetchArsipDokumenFromApi(): Promise<ArsipDokumenApiItem[]> {
  const items = await fetchRekapDokumenFromApi();
  return items
    .filter((item) => item.status === 'Akan Berakhir' || item.status === 'Kadaluarsa')
    .map((item, index) => ({
      // PENTING: pakai id ASLI dokumen_kerjasama (item.id), BUKAN index+1 — id ini dipakai
      // tombol "Perpanjang" untuk membuka dokumen yang benar di halaman Monitoring. Kalau
      // pakai index+1, angka kecil seperti 1/2/3 gampang KEBETULAN cocok dengan id dokumen
      // LAIN yang tidak ada hubungannya, jadi salah sasaran (lihat insiden "GAK MAU" ke
      // dokumen id=1 padahal yang dimaksud dokumen lain).
      id: item.id ?? index + 1,
      noDokumen: item.noDokumen,
      namaMitra: item.namaMitra,
      // Sudah difilter di atas ke 'Akan Berakhir' | 'Kadaluarsa' saja.
      status: item.status as 'Akan Berakhir' | 'Kadaluarsa',
      jenis: item.jenis,
      tanggalMulai: item.tanggalMulai,
      berlakuHingga: item.berlakuHingga,
      alasanArsip: (item as any).alasanArsip || null,
      buktiPdf: (item as any).buktiPdf || null,
      buktiPdfDownloadUrl: (item as any).buktiPdfDownloadUrl || null,
      buktiPdfNama: (item as any).buktiPdfNama || null,
      buktiTidakDiperpanjang: (item as any).buktiTidakDiperpanjang || null,
      buktiTidakDiperpanjangDownloadUrl: (item as any).buktiTidakDiperpanjangDownloadUrl || null,
      buktiTidakDiperpanjangNama: (item as any).buktiTidakDiperpanjangNama || null,
    }));
}
