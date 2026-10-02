'use client';

import { useEffect, useState } from 'react';
import { getRenewalRequests, type RenewalRequestItem } from '@/services/adminRenewalRequestService';

/**
 * Perpanjangan yang sudah disetujui, dikelompokkan per dokumen kerja sama (key = ID dokumen,
 * terlama dulu). Dipakai Story & Aktivitas untuk menampilkan tiap perpanjangan sebagai kartu
 * terpisah di bawah kerja sama awal. Backend membatasi hasil sesuai akses akun yang login.
 */
export function usePerpanjanganDisetujui(refreshKey?: unknown): Map<number, RenewalRequestItem[]> {
  const [byDokumen, setByDokumen] = useState<Map<number, RenewalRequestItem[]>>(new Map());

  useEffect(() => {
    let active = true;
    getRenewalRequests()
      .then((items) => {
        if (!active) return;
        const map = new Map<number, RenewalRequestItem[]>();
        items
          .filter((item) => item.status === 'disetujui')
          .sort((a, b) => a.id - b.id)
          .forEach((item) => map.set(item.kerjasamaId, [...(map.get(item.kerjasamaId) ?? []), item]));
        setByDokumen(map);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return byDokumen;
}

/** 'YYYY-MM-DD' -> '15 Jul 2024' (sama dengan tampilan tanggal Story & Aktivitas admin). */
export function formatTanggalPerpanjangan(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
