// Satu lencana per jenis dokumen, berwarna sesuai jenisnya (mis. MoU ungu, MoA biru). Dokumen yang
// memuat beberapa jenis sekaligus (MoU + MoA) menampilkan lencana-lencana itu berdampingan.
export default function JenisBadges({
  jenis,
  warna,
  className = '',
  fallbackClassName = 'bg-slate-100 text-slate-700',
  wrapperClassName = 'inline-flex flex-wrap gap-1',
}: {
  jenis: readonly string[];
  /** Kelas warna per jenis, mis. { MoU: 'bg-violet-100 text-violet-700' }. */
  warna: Record<string, string>;
  /** Kelas bentuk lencana (padding, rounded, ukuran font) — dipakai untuk setiap lencana. */
  className?: string;
  fallbackClassName?: string;
  wrapperClassName?: string;
}) {
  return (
    <span className={wrapperClassName}>
      {jenis.map((item) => (
        <span key={item} className={`${className} ${warna[item] ?? fallbackClassName}`}>
          {item}
        </span>
      ))}
    </span>
  );
}
