'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, CalendarDays, FileText, Images, Lightbulb, Users } from 'lucide-react';
import { formatTanggalInisiasi, getInisiasi, type InisiasiItem } from '@/services/inisiasiService';

type Props = {
  inisiasiId: number | null | undefined;
};

/**
 * Ringkasan Inisiasi di detail pengajuan admin: pengajuan yang dibuat dari sebuah inisiasi menampilkan hasil
 * penjajakannya (tanggal, instansi, unit, deskripsi/hasil, peserta) supaya admin tidak perlu membuka menu Inisiasi.
 * Hanya dipakai di sisi admin (endpoint detail inisiasi lengkap hanya untuk admin).
 */
export default function InisiasiAsalPanel({ inisiasiId }: Props) {
  const [item, setItem] = useState<InisiasiItem | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!inisiasiId) {
      setItem(null);
      setState('idle');
      return;
    }
    let aktif = true;
    setState('loading');
    getInisiasi(inisiasiId)
      .then((data) => {
        if (!aktif) return;
        setItem(data);
        setState('idle');
      })
      .catch(() => {
        if (!aktif) return;
        setItem(null);
        setState('error');
      });
    return () => {
      aktif = false;
    };
  }, [inisiasiId]);

  if (!inisiasiId) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
        <Lightbulb size={12} /> Berasal dari Inisiasi
      </p>

      {state === 'loading' && <p className="mt-1.5 text-[11px] text-amber-800/80">Memuat data inisiasi…</p>}
      {state === 'error' && <p className="mt-1.5 text-[11px] text-amber-800/80">Data inisiasi tidak dapat dimuat.</p>}

      {item && (
        <div className="mt-1.5 space-y-2">
          <p className="text-[12px] font-semibold text-gray-900">{item.judul}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-600">
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={11} /> {formatTanggalInisiasi(item.tanggal_kegiatan)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Building2 size={11} /> {item.nama_mitra}
            </span>
          </div>

          {item.units.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.units.map((unit) => (
                <span key={unit.id} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#173B82] ring-1 ring-amber-200">
                  {unit.nama}
                </span>
              ))}
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold text-gray-500">Hasil / deskripsi kegiatan</p>
            <p className="mt-0.5 whitespace-pre-line text-[11px] leading-relaxed text-gray-800">{item.deskripsi}</p>
          </div>

          {(item.peserta?.length ?? 0) > 0 && (
            <p className="flex items-start gap-1.5 text-[10px] text-gray-600">
              <Users size={11} className="mt-0.5 shrink-0" />
              <span>{item.peserta?.map((p) => p.nama).join(', ')}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-amber-200 pt-2 text-[10px] text-gray-600">
            {(item.fotos?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Images size={11} /> {item.fotos?.length} foto
              </span>
            )}
            {(item.dokumens?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <FileText size={11} /> {item.dokumens?.length} dokumen
              </span>
            )}
            <Link href="/admin/inisiasi" className="ml-auto font-semibold text-[#173B82] underline hover:text-blue-800">
              Buka di menu Inisiasi
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
