// Sisa masa berlaku berdasarkan kalender asli (bukan hari / 30 dibulatkan), mis.
// hari ini 30/9 s.d. 31/10 = "1 Bulan 1 Hari", bukan "2 Bulan".

export type SisaMasaBerlaku = { tahun: number; bulan: number; hari: number; totalHari: number };

function toLocalDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function diffDays(from: Date, to: Date): number {
  // Math.round meredam selisih jam akibat pergantian DST.
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** null kalau tanggal berakhir sudah lewat. */
export function hitungSisaMasaBerlaku(tanggalBerakhir: Date, hariIni: Date = new Date()): SisaMasaBerlaku | null {
  const start = toLocalDateOnly(hariIni);
  const end = toLocalDateOnly(tanggalBerakhir);
  const totalHari = diffDays(start, end);

  if (totalHari < 0) {
    return null;
  }

  let totalBulan = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (addMonthsClamped(start, totalBulan) > end) {
    totalBulan--;
  }

  const hari = diffDays(addMonthsClamped(start, totalBulan), end);

  return { tahun: Math.floor(totalBulan / 12), bulan: totalBulan % 12, hari, totalHari };
}

/** "1 Tahun 2 Bulan 3 Hari", "1 Bulan 1 Hari", "5 Hari", "Hari ini"; null kalau sudah lewat. */
export function formatSisaMasaBerlaku(tanggalBerakhir: Date, hariIni: Date = new Date()): string | null {
  const sisa = hitungSisaMasaBerlaku(tanggalBerakhir, hariIni);
  if (!sisa) {
    return null;
  }

  if (sisa.totalHari === 0) {
    return 'Hari ini';
  }

  const bagian: string[] = [];
  if (sisa.tahun > 0) bagian.push(`${sisa.tahun} Tahun`);
  if (sisa.bulan > 0) bagian.push(`${sisa.bulan} Bulan`);
  if (sisa.hari > 0) bagian.push(`${sisa.hari} Hari`);

  return bagian.join(' ');
}
