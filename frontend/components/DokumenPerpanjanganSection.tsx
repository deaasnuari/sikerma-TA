import { Download, Paperclip } from 'lucide-react';
import JenisBerkasBadge from '@/components/JenisBerkasBadge';

type Props = {
  files?: { name: string; url: string }[];
  className?: string;
};

/**
 * Daftar dokumen perpanjangan milik kerja sama dari pengajuan ini (diunggah saat mengajukan perpanjangan).
 * Tidak menampilkan apa pun bila belum pernah ada perpanjangan.
 */
export default function DokumenPerpanjanganSection({ files, className = '' }: Props) {
  if (!files || files.length === 0) return null;

  return (
    <section className={className}>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <JenisBerkasBadge jenis="perpanjangan" />
          <span className="text-[10px] text-amber-800">Diunggah saat mengajukan perpanjangan kerja sama</span>
        </div>
        <div className="space-y-2">
          {files.map((file, index) => (
            <a
              key={`${file.name}-${index}`}
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              download={file.name}
              className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
            >
              <Paperclip size={13} className="shrink-0 text-amber-600" />
              <span className="truncate">{file.name}</span>
              <Download size={13} className="ml-auto shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
