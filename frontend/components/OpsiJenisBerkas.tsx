import { JENIS_BERKAS_PENDUKUNG, JENIS_BERKAS_UTAMA } from '@/lib/jenisBerkas';

// Isi <select> jenis berkas: dokumen kerja sama (MoU/MoA/IA) dan dokumen pendukung (TOR, KAK, dst.).
export default function OpsiJenisBerkas() {
  return (
    <>
      <optgroup label="Dokumen kerja sama">
        {JENIS_BERKAS_UTAMA.map((jenis) => (
          <option key={jenis} value={jenis}>{jenis}</option>
        ))}
      </optgroup>
      <optgroup label="Dokumen pendukung">
        {JENIS_BERKAS_PENDUKUNG.map((jenis) => (
          <option key={jenis} value={jenis}>{jenis}</option>
        ))}
      </optgroup>
    </>
  );
}
