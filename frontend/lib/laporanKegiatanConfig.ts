// Link Google Drive milik Admin Kerja Sama, tempat pengisi laporan pelaksanaan mengunggah dokumentasi
// dan laporan kegiatan. Isi di sini (atau lewat NEXT_PUBLIC_LINK_DRIVE_LAPORAN_KEGIATAN di .env.local,
// lalu restart `npm run dev`). Selama kosong, kolom tautan di form laporan tetap berupa isian bebas.
// Pastikan akses folder Drive-nya "Siapa saja yang memiliki link".
export const LINK_DRIVE_LAPORAN_KEGIATAN: string =
  process.env.NEXT_PUBLIC_LINK_DRIVE_LAPORAN_KEGIATAN?.trim() || '';
