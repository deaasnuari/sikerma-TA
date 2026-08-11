const rows = [{"file":"19 MOA BP2RD BATAM.pdf63c11eef82658"}];
const row = rows[0];
const cleanedFile = row.file.replace(/^\d+\s*(MOU|MOA|IA)\s*/i, '').replace(/\.pdf.*$/i, '').trim();
console.log(cleanedFile);
