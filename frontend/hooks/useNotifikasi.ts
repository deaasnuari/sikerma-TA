'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminNotification } from '@/types/admin';
import {
  deleteAllNotifications,
  deleteNotification,
  getAdminNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/services/adminService';
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

function dariServer(n: NotifikasiServer): AdminNotification {
  return {
    id: n.id,
    title: n.judul,
    message: n.pesan,
    from: n.dari,
    read: n.dibaca,
    createdAt: waktuRelatif(n.dibuat_pada),
    href: n.href ?? undefined,
    category: (['approval', 'comment', 'reminder', 'info'].includes(n.kategori) ? n.kategori : 'info') as AdminNotification['category'],
    source: 'server',
  };
}

/**
 * Notifikasi lonceng = notifikasi dari SERVER (sampai ke perangkat mana pun, dibuat otomatis saat pengajuan,
 * keputusan, tahapan, atau perpanjangan berubah) + notifikasi lokal admin (konfirmasi aksi sendiri di browser ini).
 */
export function useNotifikasi(role?: string | null) {
  const [server, setServer] = useState<AdminNotification[]>([]);
  const [local, setLocal] = useState<AdminNotification[]>([]);

  const muatLokal = useCallback(() => {
    const semua = getAdminNotifications();
    // Notifikasi lokal hanya konfirmasi aksi admin sendiri; tidak ada lagi yang ditujukan ke peran lain.
    setLocal(semua.filter((n) => (role === 'admin' ? (n.targetRole ?? 'admin') === 'admin' : false)));
  }, [role]);

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
    muatLokal();
    void muatServer();

    const onLokal = () => muatLokal();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void muatServer();
    };
    const timer = setInterval(onVisible, POLL_INTERVAL_MS);

    const onServer = () => void muatServer();
    window.addEventListener('admin-notifications-updated', onLokal);
    window.addEventListener('notifikasi-server-updated', onServer);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('admin-notifications-updated', onLokal);
      window.removeEventListener('notifikasi-server-updated', onServer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [muatLokal, muatServer]);

  const notifications = [...server, ...local];

  const tandaiDibaca = (n: AdminNotification) => {
    if (n.source === 'server') {
      setServer((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void bacaNotifikasi(n.id).catch(() => void muatServer());
    } else {
      markNotificationAsRead(n.id);
      muatLokal();
    }
  };

  const tandaiSemuaDibaca = () => {
    setServer((prev) => prev.map((x) => ({ ...x, read: true })));
    void bacaSemuaNotifikasi().catch(() => void muatServer());
    if (role === 'admin') {
      markAllNotificationsAsRead();
      muatLokal();
    }
  };

  const hapus = (n: AdminNotification) => {
    if (n.source === 'server') {
      setServer((prev) => prev.filter((x) => x.id !== n.id));
      void hapusNotifikasi(n.id).catch(() => void muatServer());
    } else {
      deleteNotification(n.id);
      muatLokal();
    }
  };

  const hapusSemua = () => {
    setServer([]);
    void hapusSemuaNotifikasi().catch(() => void muatServer());
    if (role === 'admin') {
      deleteAllNotifications();
      muatLokal();
    }
  };

  return { notifications, tandaiDibaca, tandaiSemuaDibaca, hapus, hapusSemua };
}
