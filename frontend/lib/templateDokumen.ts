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
