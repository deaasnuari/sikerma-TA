'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getRenewalRequests } from '@/services/adminRenewalRequestService';
import { addAdminNotification } from '@/services/adminService';
import type { AdminNotification } from '@/types/admin';

const POLL_MS = 30000;

/**
 * Notifikasi untuk pengusul (internal/eksternal) saat admin memutuskan permintaan
 * perpanjangannya. Notifikasi di aplikasi ini disimpan di localStorage browser, jadi
 * keputusan yang diambil admin di browser lain tidak sampai ke sini dengan sendirinya —
 * hook ini memeriksa server berkala dan membuat satu notifikasi per keputusan baru.
 *
 * Saat pertama kali jalan di browser ini, keputusan yang sudah ada hanya dicatat sebagai
 * "sudah dilihat" (tanpa notifikasi) supaya riwayat lama tidak membanjiri lonceng.
 */
export function useRenewalDecisionNotifier() {
  const { user } = useAuth();
  const userId = user?.id;
  const role = user?.role;

  useEffect(() => {
    if (!userId || !role || role === 'admin') return;

    const seenKey = `sikerma-renewal-decision-seen-${userId}`;
    const readSeen = (): Set<string> | null => {
      try {
        const raw = window.localStorage.getItem(seenKey);
        return raw === null ? null : new Set(JSON.parse(raw) as string[]);
      } catch {
        return null;
      }
    };
    const writeSeen = (ids: Set<string>) => {
      try {
        window.localStorage.setItem(seenKey, JSON.stringify(Array.from(ids)));
      } catch {
        // localStorage penuh/diblokir -> notifikasi bisa muncul ulang, tidak fatal.
      }
    };

    let active = true;

    const check = async () => {
      try {
        const items = await getRenewalRequests();
        if (!active) return;

        const stored = readSeen();
        const seen = stored ?? new Set<string>();
        const firstRun = stored === null;
        let changed = firstRun;

        // Terlama dulu supaya urutan di lonceng sesuai urutan keputusan.
        [...items].reverse().forEach((item) => {
          if (item.status === 'menunggu') return;
          const key = `${item.id}:${item.status}`;
          if (seen.has(key)) return;
          seen.add(key);
          changed = true;
          if (firstRun) return;

          const disetujui = item.status === 'disetujui';
          addAdminNotification({
            title: disetujui ? 'Perpanjangan Disetujui' : 'Perpanjangan Ditolak',
            message: disetujui
              ? `Perpanjangan ${item.noDokumen} (${item.namaMitra}) disetujui. Masa berlaku kerja sama sudah diperbarui.`
              : `Perpanjangan ${item.noDokumen} (${item.namaMitra}) ditolak oleh admin.`,
            from: 'Admin SIKERMA',
            href: item.notificationHref,
            category: disetujui ? 'approval' : 'reminder',
            targetRole: role as AdminNotification['targetRole'],
          });
        });

        if (changed) writeSeen(seen);
      } catch {
        // Offline / sesi habis -> coba lagi di putaran berikutnya.
      }
    };

    void check();
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, POLL_MS);
    window.addEventListener('renewal-requests-updated', check);

    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener('renewal-requests-updated', check);
    };
  }, [userId, role]);
}
