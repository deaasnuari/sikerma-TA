// Hitungan "Komposisi Dokumen" (MoU / MoA / IA) untuk semua dashboard — satu sumber supaya diagram donat,
// angka di tengah, jumlah, persentase, dan progress bar selalu konsisten.
//
// Aturan: satu data kerja sama yang memuat beberapa jenis (mis. MoU + MoA) menambah hitungan di SETIAP
// jenisnya, dan baris datanya dihitung sekali per jenis (tidak berulang). `total` = jumlah semua kategori,
// jadi bisa lebih besar dari jumlah data kerja sama; persentase = jumlah jenis / total.

export interface DataJenis {
  /** Jenis utama. */
  jenis: string;
  /** Semua jenis bila data memuat beberapa jenis sekaligus; kosong = hanya `jenis`. */
  jenisList?: readonly string[];
}

export interface RingkasanJenis {
  MoU: number;
  MoA: number;
  IA: number;
  /** Jumlah SEMUA kategori (MoU + MoA + IA) — angka di tengah donat dan penyebut persentase. */
  total: number;
  /** Jumlah data kerja sama (baris) yang dihitung. */
  jumlahDokumen: number;
  /** Berapa data kerja sama yang memuat lebih dari satu jenis. */
  gabungan: number;
}

export function hitungJenisDokumen(items: ReadonlyArray<DataJenis>): RingkasanJenis {
  const perJenis = { MoU: 0, MoA: 0, IA: 0 };
  let gabungan = 0;

  for (const item of items) {
    // Set: jenis yang sama di dalam satu data tidak dihitung dua kali.
    const daftar = Array.from(new Set(item.jenisList && item.jenisList.length > 1 ? item.jenisList : [item.jenis]));
    if (daftar.length > 1) gabungan++;
    for (const jenis of daftar) {
      if (jenis === 'MoU' || jenis === 'MoA' || jenis === 'IA') perJenis[jenis]++;
    }
  }

  return { ...perJenis, total: perJenis.MoU + perJenis.MoA + perJenis.IA, jumlahDokumen: items.length, gabungan };
}

/** Persentase jenis terhadap total semua kategori (0 bila total 0). */
export function persenJenis(jumlah: number, total: number): number {
  return total > 0 ? Math.round((jumlah / total) * 100) : 0;
}
