'use client';

import { useEffect, useState } from 'react';
import { Building2, CalendarDays, ChevronLeft, ChevronRight, ImageOff, Pencil, Trash2, Users, X } from 'lucide-react';
import ProtectedImage from '@/components/ProtectedImage';
import { formatTanggalInisiasi, type InisiasiItem } from '@/services/inisiasiService';

type Props = {
  item: InisiasiItem | null;
  onClose: () => void;
  onEdit: (item: InisiasiItem) => void;
  onDelete: (item: InisiasiItem) => void;
};

export default function InisiasiDetailModal({ item, onClose, onEdit, onDelete }: Props) {
  const [aktif, setAktif] = useState(0);

  // Tiap membuka data lain, galeri mulai dari foto pertama.
  useEffect(() => {
    setAktif(0);
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setAktif((prev) => Math.min(prev + 1, Math.max(item.fotos.length - 1, 0)));
      if (event.key === 'ArrowLeft') setAktif((prev) => Math.max(prev - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const fotos = item.fotos;
  const indeks = Math.min(aktif, Math.max(fotos.length - 1, 0));
  const foto = fotos[indeks];

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#173B82]">
              <CalendarDays size={13} /> {formatTanggalInisiasi(item.tanggal_kegiatan)}
            </p>
            <h2 className="mt-1 text-lg font-bold leading-snug text-slate-900">{item.judul}</h2>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-slate-600">
              <Building2 size={14} className="shrink-0 text-slate-400" /> {item.nama_mitra}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Galeri */}
          <section aria-label="Dokumentasi kegiatan">
            {foto ? (
              <>
                <div className="relative overflow-hidden rounded-xl bg-slate-100">
                  <ProtectedImage path={foto.path_file} alt={foto.nama_asli ?? `Foto ${indeks + 1}`} className="mx-auto max-h-[55vh] w-full object-contain" />
                  {fotos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAktif(Math.max(indeks - 1, 0))}
                        disabled={indeks === 0}
                        aria-label="Foto sebelumnya"
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-slate-700 shadow hover:bg-white disabled:opacity-40"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAktif(Math.min(indeks + 1, fotos.length - 1))}
                        disabled={indeks === fotos.length - 1}
                        aria-label="Foto berikutnya"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-slate-700 shadow hover:bg-white disabled:opacity-40"
                      >
                        <ChevronRight size={18} />
                      </button>
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {indeks + 1} / {fotos.length}
                      </span>
                    </>
                  )}
                </div>
                {fotos.length > 1 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {fotos.map((f, i) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setAktif(i)}
                        aria-label={`Lihat foto ${i + 1}`}
                        className={`shrink-0 overflow-hidden rounded-lg border-2 ${i === indeks ? 'border-[#173B82]' : 'border-transparent opacity-70 hover:opacity-100'}`}
                      >
                        <ProtectedImage path={f.path_file} alt={`Foto ${i + 1}`} className="h-14 w-20 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 text-slate-400">
                <ImageOff size={26} />
                <p className="text-xs">Belum ada foto dokumentasi</p>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Deskripsi Kegiatan</h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{item.deskripsi}</p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">Unit Terlibat</h3>
              {item.units.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {item.units.map((unit) => (
                    <span key={unit.id} className="rounded-full bg-[#173B82]/10 px-2.5 py-0.5 text-xs font-semibold text-[#173B82]">
                      {unit.nama}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">-</p>
              )}
            </section>
            <section>
              <h3 className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Users size={12} /> Peserta ({item.peserta.length})
              </h3>
              {item.peserta.length > 0 ? (
                <ul className="list-inside list-disc space-y-0.5 text-sm text-slate-700">
                  {item.peserta.map((p) => (
                    <li key={p.id}>{p.nama}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">-</p>
              )}
            </section>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 size={14} /> Hapus
          </button>
          <button type="button" onClick={() => onEdit(item)} className="btn-primary h-9 gap-1.5 px-4 text-sm">
            <Pencil size={14} /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}
