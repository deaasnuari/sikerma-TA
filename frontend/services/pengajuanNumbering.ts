const unitKodePatterns: Array<{ code: string; keys: string[] }> = [
  { code: 'PL29', keys: ['direktur'] },
  { code: 'PL29.5', keys: ['spi', 'satuan pengawas internal'] },
  { code: 'PL29.6', keys: ['p4m', 'penjaminan mutu'] },
  { code: 'PL29.7', keys: ['p3m', 'penelitian dan pengabdian'] },
  { code: 'PL29.8', keys: ['akademik', 'subag akademik'] },
  { code: 'PL29.9', keys: ['sbum', 'sub bagian umum'] },
  { code: 'PL29.10', keys: ['teknik elektro'] },
  { code: 'PL29.11', keys: ['teknik informatika'] },
  { code: 'PL29.12', keys: ['teknik mesin'] },
  { code: 'PL29.13', keys: ['manajemen dan bisnis'] },
  { code: 'PL29.14', keys: ['shilau'] },
  { code: 'PL29.15', keys: ['upa perpustakaan'] },
  { code: 'PL29.16', keys: ['upa tik'] },
  { code: 'PL29.17', keys: ['upa pp', 'perbaikan dan perawatan'] },
  { code: 'PL29.18', keys: ['upa pkk', 'pengembangan karier'] },
  { code: 'PL29.19', keys: ['osdm', 'organisasi dan sdm'] },
  { code: 'PL29.20', keys: ['pokja keuangan'] },
  { code: 'PL29.21', keys: ['pokja perencanaan'] },
  { code: 'PL29.22', keys: ['pokja bmn', 'pengadaan'] },
  { code: 'PL29.23', keys: ['pokja kemahasiswaan'] },
  { code: 'PL29.24', keys: ['pokja humas', 'kerjasama'] },
];

function resolveUnitKode(unitName?: string): string {
  const normalized = (unitName || '').trim().toLowerCase();
  if (!normalized) {
    return 'PL29';
  }

  for (const pattern of unitKodePatterns) {
    if (pattern.keys.some((key) => normalized.includes(key))) {
      return pattern.code;
    }
  }

  return 'PL29';
}

export function buildNomorPengajuanPreview(
  source: 'admin' | 'internal' | 'eksternal',
  unitName?: string,
  existingNomorPengajuan?: string
): string {
  if (existingNomorPengajuan && existingNomorPengajuan.trim() !== '') {
    return existingNomorPengajuan.trim();
  }

  const prefix: 'ADM' | 'INT' | 'EXT' = source === 'admin' ? 'ADM' : source === 'eksternal' ? 'EXT' : 'INT';
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const unitCode = resolveUnitKode(unitName);

  return `PGJ/${prefix}/${unitCode}/${stamp}/0001`;
}
