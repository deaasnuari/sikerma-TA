/**
 * Membaca tanggal dari API pengajuan yang sudah diformat jadi teks hari/bulan/tahun
 * (mis. "14/10/2026" atau "14-10-2026"), selain format ISO ("2026-10-14").
 *
 * `new Date("14/10/2026")` Invalid Date, dan `new Date("07/10/2026")` malah terbaca 10 Juli
 * (bulan/hari) — jadi teks hari/bulan/tahun harus dipecah manual.
 */
export function parseTanggal(value?: string | null): Date | null {
  if (!value) return null;
  const text = value.trim();

  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dayFirst) {
    const date = new Date(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
