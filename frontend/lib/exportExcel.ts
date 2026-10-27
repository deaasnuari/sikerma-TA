// Ekspor tabel ke .xlsx memakai exceljs (menggantikan SheetJS `xlsx` yang punya celah keamanan
// tanpa perbaikan). Library dimuat saat dibutuhkan saja supaya tidak membebani halaman.
export async function exportToExcel(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  filename: string,
  sheetName = 'Data',
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');

  const workbook = new ExcelJS.Workbook();
  // Nama sheet Excel maksimal 31 karakter dan tidak boleh memuat : \ / ? * [ ]
  const worksheet = workbook.addWorksheet(sheetName.replace(/[:\/?*[\]]/g, ' ').slice(0, 31) || 'Data', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.addRow(headers);
  rows.forEach((row) => {
    worksheet.addRow(row.map((cell) => (cell === null || cell === undefined ? '' : cell)));
  });

  // Lebar tiap kolom mengikuti isi terpanjang (maks. 60 karakter)
  headers.forEach((header, colIdx) => {
    const maxLen = Math.max(header.length, ...rows.map((row) => String(row[colIdx] ?? '').length));
    worksheet.getColumn(colIdx + 1).width = Math.min(maxLen + 4, 60);
  });

  worksheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
