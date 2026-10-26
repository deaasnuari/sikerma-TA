'use client';

import { useEffect } from 'react';
import { downloadProtectedFile, extractProtectedStoragePath, openProtectedFile } from '@/lib/api';
import { showNotice } from '@/lib/dialog';

const NON_PREVIEWABLE_FILE_NAME = /^[^/\\]+\.(docx?|xlsx?|pptx?|zip|rar)$/i;

// Penangkap klik global: link <a href=".../storage/..."> yang tersebar di banyak halaman tidak
// bisa lagi dibuka langsung (backend menutup /storage untuk selain carousel). Di sini kliknya
// dialihkan ke pengambilan berkas lewat login (GET /berkas), jadi tiap halaman tidak perlu diubah.
export default function ProtectedFileLinkInterceptor() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;

      const anchor = (event.target as Element | null)?.closest?.('a');
      const href = anchor?.getAttribute('href');
      const path = extractProtectedStoragePath(href);
      if (!anchor || !path) return;

      event.preventDefault();

      // Berkas Word/Excel/dst. tidak bisa dipratinjau browser, jadi dibuka pun akhirnya diunduh dengan
      // nama acak dari storage. Kalau teks link-nya adalah nama berkas aslinya (mis. "Proposal.docx"),
      // pakai itu sebagai nama unduhan.
      const linkText = anchor.textContent?.trim() ?? '';
      const nameFromText = NON_PREVIEWABLE_FILE_NAME.test(linkText) ? linkText : null;

      if (anchor.hasAttribute('download') || nameFromText) {
        const name = anchor.getAttribute('download') || nameFromText || path.split('/').pop() || 'dokumen';
        downloadProtectedFile(path, name).catch((err) => showNotice(err instanceof Error ? err.message : 'Gagal mengunduh file.'));
      } else {
        void openProtectedFile(path);
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
