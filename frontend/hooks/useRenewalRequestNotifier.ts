'use client';

import { useEffect } from 'react';
import { getRenewalRequests } from '@/services/adminRenewalRequestService';
import { addAdminNotification } from '@/services/adminService';

const SEEN_KEY = 'sikerma-renewal-notified-ids';
const POLL_MS = 30000;

function readSeen(): Set<number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<number>) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage penuh/diblokir -> notifikasi bisa muncul ulang, tidak fatal.
  }
}

/**
 * Notifikasi admin (lonceng + badge sidebar) untuk permintaan perpanjangan yang diajukan
 * pengusul internal/eksternal. Notifikasi admin disimpan di localStorage browser admin, jadi
 * permintaan yang dibuat dari akun lain tidak otomatis membuat notifikasi — hook ini
 * memeriksa server berkala dan membuat satu notifikasi per permintaan baru (ID yang sudah
 * diberitahukan dicatat supaya tidak dobel).
 */
export function useRenewalRequestNotifier() {
  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const items = await getRenewalRequests();
        if (!active) return;

        const seen = readSeen();
        let changed = false;

        // Terlama dulu supaya urutan di lonceng sesuai urutan masuk.
        [...items].reverse().forEach((item) => {
          const dariPengusul = item.requesterRole === 'internal' || item.requesterRole === 'eksternal';
          if (item.status !== 'menunggu' || !dariPengusul || seen.has(item.id)) return;

          addAdminNotification({
            title: 'Permintaan Perpanjangan Baru',
            message: `${item.requesterRole === 'eksternal' ? 'Mitra eksternal' : 'Pengusul internal'} mengajukan perpanjangan ${item.noDokumen} (${item.namaMitra}).`,
            from: item.requesterRole === 'eksternal' ? 'Mitra Eksternal' : 'Internal',
            href: '/admin/monitoring/perpanjangan',
            category: 'reminder',
            targetRole: 'admin',
          });
          seen.add(item.id);
          changed = true;
        });

        if (changed) writeSeen(seen);
      } catch {
        // Offline / belum login -> coba lagi di putaran berikutnya.
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
  }, []);
}
