'use client';

import { Download, FileText } from 'lucide-react';

type Props = {
  files?: { name: string; url: string }[];
  // Teks petunjuk untuk pembaca; admin yang melihat tidak perlu disuruh mengunggah ulang.
  forPengusul?: boolean;
};

/** Berkas Word yang dilampirkan admin saat meminta revisi (peran_berkas 'dokumen_revisi'). */
export default function FileRevisiBox({ files, forPengusul = true }: Props) {
  if (!files || files.length === 0) return null;

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-orange-800">
        <FileText size={13} />
        File Revisi dari Admin
      </div>
      {forPengusul && (
        <p className="mb-2 text-[10px] text-orange-700">
          Unduh file ini, perbaiki sesuai catatan revisi, lalu unggah kembali lewat tombol perbaiki pengajuan.
        </p>
      )}
      <ul className="space-y-1.5">
        {files.map((file, index) => (
          <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-2">
            <FileText size={13} className="shrink-0 text-orange-500" />
            {file.url ? (
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                download={file.name}
                className="flex items-center gap-1 truncate text-[10px] font-medium text-blue-600 underline hover:text-blue-800"
              >
                {file.name}
                <Download size={12} />
              </a>
            ) : (
              <span className="truncate text-[10px] text-slate-600">{file.name}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
