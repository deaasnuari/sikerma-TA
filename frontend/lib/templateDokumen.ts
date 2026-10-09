// Daftar template dokumen kerja sama. File ada di public/templates/.
export type TemplateFile = { label: string; fileName: string };

export const templateFilesByJenis: Record<string, TemplateFile[]> = {
  MoU: [
    { label: 'MoU Industri', fileName: 'Draft MOU Industri.docx' },
    { label: 'MoU Lembaga', fileName: 'Draft MOU Lembaga.docx' },
  ],
  MoA: [
    { label: 'MoA Magang Industri', fileName: 'Draft MOA Magang Industri.docx' },
    { label: 'MoA Magang Pemerintah', fileName: 'Draft MOA Magang Pemerintah.docx' },
  ],
  IA: [
    { label: 'IA Polibatam', fileName: 'DRAFT IA POLIBATAM.docx' },
  ],
};

// Petunjuk memilih template sesuai jenis instansi mitra (ditampilkan di form pengajuan bila ada lebih dari satu template).
export const templateHintByLabel: Record<string, string> = {
  'MoU Industri': 'Pilih ini bila mitra berupa perusahaan / dunia usaha dan industri (DUDI).',
  'MoU Lembaga': 'Pilih ini bila mitra berupa lembaga atau instansi (bukan perusahaan), misalnya sekolah, kampus, organisasi, atau instansi pemerintah.',
  'MoA Magang Industri': 'Pilih ini bila mitra berupa perusahaan / dunia usaha dan industri (DUDI).',
  'MoA Magang Pemerintah': 'Pilih ini bila mitra berupa instansi pemerintah (dinas, kementerian, badan, atau pemerintah daerah).',
};

export function templateUrl(fileName: string): string {
  return `/templates/${encodeURIComponent(fileName)}`;
}

export function downloadTemplate(fileName: string): void {
  const link = document.createElement('a');
  link.href = templateUrl(fileName);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export const templateLaporanPelaksanaan = 'Draft Laporan Pelaksanaan Kerjasama (LPK).docx';
