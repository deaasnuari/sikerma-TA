'use client';

import { useCallback, useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import NoticeDialog from '@/components/NoticeDialog';
import { registerDialogListener, type DialogRequest } from '@/lib/dialog';

// Dipasang sekali di app/layout.tsx. Menampilkan pop up dari showNotice()/askConfirm() (lib/dialog.ts).
// Permintaan yang datang beruntun diantre dan ditampilkan satu per satu.
export default function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);

  useEffect(() => {
    registerDialogListener((request) => setQueue((prev) => [...prev, request]));
    return () => registerDialogListener(null);
  }, []);

  const current = queue[0] ?? null;

  const selesai = useCallback((hasil: boolean) => {
    setQueue((prev) => {
      const [first, ...rest] = prev;
      if (first?.kind === 'confirm') first.resolve(hasil);
      return rest;
    });
  }, []);

  return (
    <>
      <NoticeDialog
        open={current?.kind === 'notice'}
        title={current?.kind === 'notice' ? current.title : undefined}
        tone={current?.kind === 'notice' ? current.tone : 'warning'}
        message={current?.kind === 'notice' ? current.message : undefined}
        onClose={() => selesai(true)}
      />
      <ConfirmDialog
        open={current?.kind === 'confirm'}
        title={current?.kind === 'confirm' ? current.title ?? 'Konfirmasi' : 'Konfirmasi'}
        message={current?.kind === 'confirm' ? current.message : undefined}
        confirmLabel={current?.kind === 'confirm' ? current.confirmLabel ?? 'Ya, lanjutkan' : undefined}
        onConfirm={() => selesai(true)}
        onCancel={() => selesai(false)}
      />
    </>
  );
}
