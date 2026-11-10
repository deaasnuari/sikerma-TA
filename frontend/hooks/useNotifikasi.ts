'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminNotification } from '@/types/admin';
import {
  bacaNotifikasi,
  bacaSemuaNotifikasi,
  fetchNotifikasi,
  hapusNotifikasi,
  hapusSemuaNotifikasi,
  type NotifikasiServer,
} from '@/services/notifikasiService';

const POLL_INTERVAL_MS = 20000;

function waktuRelatif(iso: string | null): string {
  if (!iso) return 'Baru saja';
  const selisihMenit = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(selisihMenit) || selisihMenit < 1) return 'Baru saja';
  if (selisihMenit < 60) return `${selisihMenit} menit lalu`;
  const jam = Math.floor(selisihMenit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 30) return `${hari} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Tambahkan ?detail=ID agar klik notifikasi langsung membuka detail pengajuan terkait. */
function hrefDenganDetail(href: string | null, pengajuanId?: number | null): string | undefined {
  if (!href) return undefined;
  if (!pengajuanId || href.includes('detail=')) return href;
  return href + (href.includes('?') ? '&' : '?') + 'detail=' + pengajuanId;
}

function dariServer(n: NotifikasiServer): AdminNotification {
  return {
    id: n.id,
    title: n.judul,
    message: n.pesan,
    from: n.dari,
    read: n.dibaca,
    createdAt: waktuRelatif(n.dibuat_pada),
    href: hrefDenganDetail(n.href, n.pengajuan_id),
    category: (['approval', 'comment', 'reminder', 'info'].includes(n.kategori) ? n.kategori : 'info') as AdminNotification['category'],
    source: 'server',
  };
}

/**
 * Notifikasi lonceng = SEMUA dari server (tabel notifikasi, per akun). Admin: broadcast ke semua admin dengan
 * status baca masing-masing; Internal/External/Pimpinan: personal berdasarkan user_id. Tidak ada data lokal/dummy.
 */
export function useNotifikasi(role?: string | null) {
  const [notifications, setServer] = useState<AdminNotification[]>([]);

  const muatServer = useCallback(async () => {
    if (!role) {
      setServer([]);
      return;
    }
    try {
      const hasil = await fetchNotifikasi();
      setServer(hasil.data.map(dariServer));
    } catch {
      // Gagal sementara (offline, backend mati): biarkan daftar terakhir tetap tampil.
    }
  }, [role]);

  useEffect(() => {
    void muatServer();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void muatServer();
    };
    const timer = setInterval(onVisible, POLL_INTERVAL_MS);

    // Beberapa aksi beruntun hanya memicu satu pengambilan (jeda singkat).
    let tunda: ReturnType<typeof setTimeout> | undefined;
    const onServer = () => {
      clearTimeout(tunda);
      tunda = setTimeout(() => void muatServer(), 400);
    };
    window.addEventListener('notifikasi-server-updated', onServer);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      clearTimeout(tunda);
      window.removeEventListener('notifikasi-server-updated', onServer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [muatServer]);

  const tandaiDibaca = (n: AdminNotification) => {
    setServer((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    void bacaNotifikasi(n.id).catch(() => void muatServer());
  };

  const tandaiSemuaDibaca = () => {
    setServer((prev) => prev.map((x) => ({ ...x, read: true })));
    void bacaSemuaNotifikasi().catch(() => void muatServer());
  };

  const hapus = (n: AdminNotification) => {
    setServer((prev) => prev.filter((x) => x.id !== n.id));
    void hapusNotifikasi(n.id).catch(() => void muatServer());
  };

  const hapusSemua = () => {
    setServer([]);
    void hapusSemuaNotifikasi().catch(() => void muatServer());
  };

  return { notifications, tandaiDibaca, tandaiSemuaDibaca, hapus, hapusSemua };
}
