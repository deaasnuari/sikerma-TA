import * as XLSX from 'xlsx';

export function exportToExcel(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  filename: string,
  sheetName = 'Data',
): void {
  const worksheetData = [headers, ...rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell))
  )];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Auto-size each column based on the longest content
  const colWidths = headers.map((header, colIdx) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => String(row[colIdx] ?? '').length),
    );
    return { wch: Math.min(maxLen + 4, 60) };
  });
  worksheet['!cols'] = colWidths;

  // Bold header row
  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1');
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!worksheet[cellRef]) continue;
    worksheet[cellRef].s = { font: { bold: true } };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, filename);
}
