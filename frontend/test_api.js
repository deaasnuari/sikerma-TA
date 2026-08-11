const fs = require('fs');

function mapJenis(value) {
  const upper = (value || '').toUpperCase();
  if (upper === 'MOA') return 'MoA';
  if (upper === 'IA') return 'IA';
  return 'MoU';
}

function mapStatus(value) {
  if (value === 'archived') return 'Kadaluarsa';
  if (value === 'expiring') return 'Akan Berakhir';
  return 'Aktif';
}

function toDisplayDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-GB');
}

const mockRow = {
  id: 216,
  no_permohonan: 'LEGACY-ARSIP-14b0c5a3c41e10ba5f84aa4fcc86e974',
  no_dokumen: 'ARSIP-14b0c5a3c41e10ba5f84aa4fcc86e974',
  nama_dokumen: 'Arsip ARSIP-14b0c5a3c41e10ba5f84aa4fcc86e974',
  jenis_dokumen: 'MOU',
  file: '49 MOU Solustar Pte Ltd 2017 (1).pdf63bfa247187cd',
  keterangan: 'Migrasi dari arsip lama',
  tanggal_mulai: '2017-08-07T00:00:00.000000Z',
  tanggal_berakhir: '2020-08-07T00:00:00.000000Z',
  status_siklus: 'archived',
  mitra: null,
  unit_prodi: null,
  sumber_pengajuan_id: null
};

let namaMitra = mockRow.mitra?.nama_mitra;
if (!namaMitra && mockRow.keterangan && mockRow.keterangan.includes('Mitra:')) {
  const match = mockRow.keterangan.match(/Mitra:\s*(.*?)(?:\s*\|\s*Bidang:|$)/i);
  if (match && match[1]) {
    namaMitra = match[1].trim();
  }
}

if (!namaMitra && mockRow.file) {
  const cleanedFile = mockRow.file.replace(/^\d+\s*(MOU|MOA|IA)\s*/i, '').replace(/\.pdf.*$/i, '').trim();
  if (cleanedFile && cleanedFile.length > 2) {
    namaMitra = cleanedFile;
  }
}

console.log('namaMitra ->', namaMitra);
