import { templateLaporanPelaksanaan, templateUrl } from '@/lib/templateDokumen';

// Mengisi file Word asli Draft LPK (public/templates) dengan data form, lalu
// mengembalikannya sebagai .docx. File .docx = ZIP; dibuka/ditulis ulang pakai
// modul CFB bawaan SheetJS (xlsx) supaya tidak perlu dependency tambahan.

export interface LaporanPelaksanaanDocxValues {
  judulKerjasama: string;
  referensiKerjasama: string;
  mitraKerjasama: string;
  ruangLingkup: string;
  hasilPelaksanaan: string;
  tautanDokumentasi: string;
  namaPenanggungJawab: string;
  namaTtdMitra: string;
  jabatanTtdMitra: string;
  namaMengetahui: string;
  jabatanMengetahui: string;
}

// Jabatan "Mengetahui" di template dipecah dua paragraf; hanya diganti bila diubah user.
export const DEFAULT_JABATAN_MENGETAHUI = 'Wakil Direktur Bidang Kemahasiswaan, Alumni dan Kerja Sama';

type CfbEntry = { content: Uint8Array | number[] };

function escapeXml(v: string): string {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// Run dengan font yang sama seperti isi tabel template.
function buildRun(text: string): string {
  return `<w:r><w:rPr><w:rFonts w:ascii="Bookman Old Style" w:hAnsi="Bookman Old Style"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

// Baris tabel LPK: [no] [label] [:] [isian]. Paragraf kosong di sel isian diganti
// satu paragraf per baris teks. Rata kiri (bukan justify bawaan template) karena
// Word meregangkan baris pendek pada paragraf justify; isi sel juga dibuat rata atas
// supaya sejajar dengan label, bukan di tengah sel.
function fillRow(xml: string, label: string, value: string): string {
  if (!value.trim()) return xml;
  const labelAt = xml.indexOf(`>${label}`);
  if (labelAt < 0) return xml;
  const labelCellEnd = xml.indexOf('</w:tc>', labelAt);
  if (labelCellEnd < 0) return xml;
  const colonCellEnd = xml.indexOf('</w:tc>', labelCellEnd + 1);
  if (colonCellEnd < 0) return xml;
  const cellStart = colonCellEnd + '</w:tc>'.length;
  const cellEnd = xml.indexOf('</w:tc>', cellStart);
  if (cellEnd < 0) return xml;

  const cell = xml.slice(cellStart, cellEnd);
  const firstPara = cell.indexOf('<w:p ') >= 0 ? cell.indexOf('<w:p ') : cell.indexOf('<w:p>');
  if (firstPara < 0) return xml;

  const tcPr = cell.slice(0, firstPara).replace('<w:vAlign w:val="center"/>', '');
  const pPr = (cell.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '<w:pPr></w:pPr>')
    .replace('<w:jc w:val="both"/>', '<w:jc w:val="left"/>');
  const paragraphs = value
    .split(/\r?\n/)
    .map((line) => `<w:p>${pPr}${line ? buildRun(line) : ''}</w:p>`)
    .join('');

  return xml.slice(0, cellStart) + tcPr + paragraphs + xml.slice(cellEnd);
}

function replaceText(xml: string, oldText: string, newText: string): string {
  if (!newText.trim()) return xml;
  return xml.replace(`>${oldText}</w:t>`, `>${escapeXml(newText)}</w:t>`);
}

export async function buildLaporanPelaksanaanDocx(values: LaporanPelaksanaanDocxValues): Promise<Blob> {
  const res = await fetch(templateUrl(templateLaporanPelaksanaan));
  if (!res.ok) throw new Error('Template laporan pelaksanaan tidak ditemukan.');
  const buffer = new Uint8Array(await res.arrayBuffer());

  const { CFB } = await import('xlsx');
  const container = CFB.read(buffer, { type: 'array' });
  const entry = CFB.find(container, '/word/document.xml') as CfbEntry | null;
  if (!entry) throw new Error('Template laporan pelaksanaan tidak valid.');

  let xml = new TextDecoder().decode(Uint8Array.from(entry.content));

  xml = fillRow(xml, 'JUDUL KERJASAMA', values.judulKerjasama);
  xml = fillRow(xml, 'REFERENSI KERJA SAMA (MOA/IA)', values.referensiKerjasama);
  xml = fillRow(xml, 'MITRA KERJASAMA', values.mitraKerjasama);
  xml = fillRow(xml, 'RUANG LINGKUP', values.ruangLingkup);
  xml = fillRow(xml, 'HASIL PELAKSANAAN (OUTPUT &amp; OUTCOME)', values.hasilPelaksanaan);
  xml = fillRow(xml, 'TAUTAN /LINK DOKUMENTASI', values.tautanDokumentasi);

  // Tabel tanda tangan: garis nama pelaksana (16 underscore) & mitra (18 underscore).
  xml = replaceText(xml, '________________', values.namaPenanggungJawab);
  xml = replaceText(xml, '__________________', values.namaTtdMitra);
  xml = replaceText(xml, 'Jabatan', values.jabatanTtdMitra);
  xml = replaceText(xml, 'Muhammad Zaenuddin', values.namaMengetahui);

  const jabatan = values.jabatanMengetahui.replace(/\s+/g, ' ').trim();
  if (jabatan && jabatan !== DEFAULT_JABATAN_MENGETAHUI) {
    xml = xml.replace(/>Wakil Direktur Bidang\s+Kemahasiswaan, Alumni <\/w:t>/, `>${escapeXml(jabatan)}</w:t>`);
    xml = xml.replace('>dan Kerja Sama</w:t>', '></w:t>');
  }

  entry.content = new TextEncoder().encode(xml);
  const out = CFB.write(container, { fileType: 'zip', type: 'array', compression: true }) as ArrayBuffer | number[];
  return new Blob([out instanceof ArrayBuffer ? out : new Uint8Array(out)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
