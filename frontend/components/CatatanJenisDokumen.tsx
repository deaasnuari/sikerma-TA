// Catatan di bawah statistik Komposisi Dokumen (MoU / MoA / IA). Jumlah semua kategori bisa lebih besar dari
// jumlah pengajuan karena satu pengajuan dapat memuat beberapa jenis dokumen.
export default function CatatanJenisDokumen() {
  return (
    <p className="mt-3 text-[10px] leading-snug text-slate-400">
      <span className="font-semibold text-slate-500">Catatan:</span> Satu pengajuan kerja sama dapat mencakup beberapa jenis dokumen,
      seperti MoU dan MoA. Oleh karena itu, setiap jenis dokumen dihitung secara terpisah sesuai kategorinya, meskipun berasal dari
      pengajuan yang sama.
    </p>
  );
}
