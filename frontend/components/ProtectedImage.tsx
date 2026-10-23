'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getProtectedObjectUrl } from '@/lib/api';

type Props = {
  // Path berkas di storage (mis. "inisiasi/abc.png"); diambil lewat login (GET /berkas), bukan URL publik.
  path: string;
  alt: string;
  className?: string;
};

/** <img> untuk gambar terlindungi: loading berupa skeleton, gagal muat berupa ikon placeholder. */
export default function ProtectedImage({ path, alt, className = '' }: Props) {
  const [state, setState] = useState<{ path: string; src: string | null; failed: boolean }>({ path, src: null, failed: false });

  useEffect(() => {
    let active = true;

    getProtectedObjectUrl(path)
      .then((src) => {
        if (active) setState({ path, src, failed: false });
      })
      .catch(() => {
        if (active) setState({ path, src: null, failed: true });
      });

    return () => {
      active = false;
    };
  }, [path]);

  // State milik path sebelumnya dianggap belum selesai: tidak menampilkan gambar lama untuk path baru.
  const current = state.path === path ? state : { path, src: null, failed: false };

  if (current.failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`} role="img" aria-label={`${alt} (gambar tidak tersedia)`}>
        <ImageOff size={22} />
      </div>
    );
  }

  if (!current.src) {
    return <div className={`animate-pulse bg-slate-200 ${className}`} aria-hidden="true" />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={current.src} alt={alt} className={className} loading="lazy" />;
}
