// Jenis sebuah berkas pada dokumen final / pendukung. MoU / MoA / IA adalah dokumen kerja sama (dihitung di
// dashboard); TOR, KAK, Proposal, Laporan Kegiatan, dan Lainnya adalah dokumen pendukung (tidak dihitung).

export const JENIS_BERKAS_UTAMA = ['MoU', 'MoA', 'IA'] as const;
export const JENIS_BERKAS_PENDUKUNG = ['TOR', 'KAK', 'Proposal', 'Laporan Kegiatan', 'Lainnya'] as const;

const LABEL_DARI_API: Record<string, string> = {
  MOU: 'MoU',
  MOA: 'MoA',
  IA: 'IA',
  TOR: 'TOR',
  KAK: 'KAK',
  PROPOSAL: 'Proposal',
  LAPORAN_KEGIATAN: 'Laporan Kegiatan',
  LAINNYA: 'Lainnya',
};

/** Label tampilan (mis. "Laporan Kegiatan") dari nilai database (mis. "LAPORAN_KEGIATAN"). */
export function labelJenisBerkas(nilaiApi?: string | null): string | undefined {
  if (!nilaiApi) return undefined;
  const kunci = nilaiApi.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return LABEL_DARI_API[kunci] ?? nilaiApi;
}

/** Nilai untuk dikirim ke API (mis. "Laporan Kegiatan" -> "LAPORAN_KEGIATAN"). */
export function jenisBerkasKeApi(label?: string | null): string | undefined {
  if (!label) return undefined;
  return label.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/** Berkas jenis ini dokumen pendukung (bukan dokumen kerja sama). */
export function adalahBerkasPendukung(label?: string | null): boolean {
  return (JENIS_BERKAS_PENDUKUNG as readonly string[]).includes(labelJenisBerkas(label) ?? '');
}
