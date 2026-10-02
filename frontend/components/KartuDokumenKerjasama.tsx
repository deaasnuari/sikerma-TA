'use client';

import { Calendar, Clock3, Users } from 'lucide-react';
import type { RenewalRequestItem } from '@/services/adminRenewalRequestService';
import { formatTanggalPerpanjangan } from '@/hooks/usePerpanjanganDisetujui';
import RiwayatPerpanjangan, { statusKerjasamaBadge, type StatusKerjasama } from '@/components/RiwayatPerpanjangan';

/**
 * Kartu satu dokumen kerja sama di "Story Kerja Sama" — bentuknya sama dengan kartu di
 * Story & Aktivitas admin. Kartu ini adalah kerja sama AWAL: periode aslinya diambil dari
 * snapshot perpanjangan pertama (tanggal di dokumen sudah ditimpa perpanjangan), dan tiap
 * perpanjangan tampil sebagai kartu terpisah di bawahnya.
 */
export default function KartuDokumenKerjasama({
  noDokumen,
  jenis,
  status,
  diajukanPada,
  tanggalMulai,
  tanggalBerakhir,
  unit,
  ruangLingkup,
  perpanjangan,
}: {
  noDokumen: string;
  jenis: string;
  status: StatusKerjasama;
  diajukanPada?: string;
  tanggalMulai?: string;
  tanggalBerakhir?: string;
  unit?: string;
  ruangLingkup: string[];
  perpanjangan: RenewalRequestItem[];
}) {
  const periodeAwal = perpanjangan[0]?.monitoringFields;
  const mulai = periodeAwal?.tgl_mulai ?? tanggalMulai;
  const berakhir = periodeAwal?.tgl_berakhir ?? tanggalBerakhir;

  return (
    <article className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{noDokumen}</p>
          <h3 className="mt-1 text-[12px] font-bold text-slate-900">{noDokumen}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {perpanjangan.length > 0 ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
              Diperpanjang {perpanjangan.length}x
            </span>
          ) : (
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusKerjasamaBadge[status]}`}>
              {status}
            </span>
          )}
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            {jenis}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-[10px] text-slate-600">
        {diajukanPada && (
          <p className="inline-flex items-center gap-1.5">
            <Calendar size={12} className="text-slate-400" />
            Diajukan: {formatTanggalPerpanjangan(diajukanPada)}
          </p>
        )}
        <p className="flex items-center gap-1.5">
          <Clock3 size={12} className="text-slate-400" />
          Berlaku: {formatTanggalPerpanjangan(mulai)} - {formatTanggalPerpanjangan(berakhir)}
        </p>
        {unit && unit !== '-' && (
          <p className="flex items-center gap-1.5">
            <Users size={12} className="text-slate-400" />
            Unit/Jurusan: {unit}
          </p>
        )}
      </div>

      {ruangLingkup.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ruangLingkup.map((item) => (
            <span key={item} className="rounded-md bg-blue-50 px-2.5 py-1 text-[10.5px] font-medium text-blue-700">
              {item}
            </span>
          ))}
        </div>
      )}

      <RiwayatPerpanjangan items={perpanjangan} statusTerkini={status} />
    </article>
  );
}
