'use client';

import { useState, type ReactNode } from 'react';
import { downloadFileWithAuth, openUrl } from '@/lib/api';
import { showNotice } from '@/lib/dialog';

interface FileDownloadLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  // URL mentah ke storage (fallback) — dipakai kalau downloadUrl tidak ada.
  url?: string | null;
  // Path API yang butuh login (mis. /dokumen-kerjasama/{id}/documents/{fileId}/download) —
  // kalau ada, dipakai supaya file diunduh dengan NAMA ASLI berkasnya, bukan nama acak hasil
  // penyimpanan di server (lihat downloadFileWithAuth di lib/api.ts).
  downloadUrl?: string | null;
  fileName?: string | null;
  children: ReactNode;
}

// Pengganti drop-in untuk <a href={url} target="_blank">...</a> di semua tempat yang
// menawarkan unduhan berkas (dokumen final, dokumen pendukung, bukti tidak diperpanjang,
// dll) — supaya nama file yang tersimpan di komputer pengguna sesuai nama aslinya. Prop
// lain (title, className, dst.) diteruskan apa adanya ke elemen <a>-nya.
export default function FileDownloadLink({ url, downloadUrl, fileName, children, ...rest }: FileDownloadLinkProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloading) return;

    if (!downloadUrl) {
      // Tidak ada path API-nya (mis. data legacy) — buka URL storage mentah apa adanya.
      if (url) openUrl(url);
      return;
    }

    setIsDownloading(true);
    try {
      await downloadFileWithAuth(downloadUrl, fileName || 'dokumen');
    } catch (err) {
      // Fallback ke URL mentah kalau unduhan resmi gagal (mis. sesi habis, dsb).
      if (url) {
        openUrl(url);
      } else {
        showNotice(err instanceof Error ? err.message : 'Gagal mengunduh file.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  if (!url && !downloadUrl) {
    return null;
  }

  return (
    <a href={url || '#'} onClick={handleClick} aria-disabled={isDownloading} {...rest}>
      {children}
    </a>
  );
}
