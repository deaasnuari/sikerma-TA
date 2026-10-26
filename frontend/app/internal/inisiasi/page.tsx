'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Lightbulb, Search } from 'lucide-react';
import {
  INISIASI_STATUS_CLASS,
  INISIASI_STATUS_LABEL,
  formatTanggalInisiasi,
  getInisiasiList,
  type InisiasiItem,
  type InisiasiListMeta,
  type InisiasiStatus,
} from '@/services/inisiasiService';

const PER_PAGE = 9;

// Daftar inisiasi (penjajakan kerja sama) yang melibatkan unit pengguna. Hanya baca: foto, dokumen, dan peserta
// khusus admin. Pengajuan tindak lanjutnya dibuat admin, jadi halaman ini hanya menampilkan statusnya.
export default function InternalInisiasiPage() {
  const [items, setItems] = useState<InisiasiItem[]>([]);
  const [meta, setMeta] = useState<InisiasiListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<InisiasiStatus | ''>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const muat = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const hasil = await getInisiasiList({ q: search, urut: 'terbaru', page, perPage: PER_PAGE, status: filterStatus });
      setItems(hasil.data);
      setMeta(hasil.meta);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data inisiasi.');
    } finally {
      setLoading(false);
    }
  }, [search, page, filterStatus]);

  useEffect(() => {
    void muat();
  }, [muat]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Inisiasi</h2>
        <p className="text-sm text-slate-500">Catatan pertemuan awal dengan calon mitra yang ditembuskan admin kepada Anda.</p>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] leading-relaxed text-slate-700">
        <p className="mb-1 font-semibold text-[#173B82]">Cara kerjanya</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Inisiasi adalah catatan pertemuan awal dengan calon mitra. Admin yang mencatatnya.</li>
          <li>
            Kalau kerja samanya jadi dilanjutkan, <strong>admin yang membuatkan pengajuannya</strong>. Anda tidak perlu
            mengajukan lagi.
          </li>
          <li>Status perkembangannya tampil di kartu di bawah. Kalau ingin melihat pengajuannya, buka menu Data Pengajuan.</li>
          <li>Mau mengajukan kerja sama sendiri tanpa inisiasi? Gunakan menu Data Pengajuan.</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari judul kegiatan atau nama instansi…"
            className="input-field h-10 w-full rounded-lg pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value as InisiasiStatus | '');
            setPage(1);
          }}
          aria-label="Filter status"
          className="input-field h-10 rounded-lg px-3 text-sm"
        >
          <option value="">Semua status</option>
          {(Object.keys(INISIASI_STATUS_LABEL) as InisiasiStatus[]).map((status) => (
            <option key={status} value={status}>{INISIASI_STATUS_LABEL[status]}</option>
          ))}
        </select>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => void muat()} className="font-semibold underline">Coba lagi</button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Memuat data inisiasi…</p>
      ) : items.length === 0 && !loadError ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-14 text-center">
          <Lightbulb size={28} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">Belum ada inisiasi untuk unit Anda</p>
          <p className="max-w-sm text-xs text-slate-500">Inisiasi dicatat oleh admin Humas dan Kerja Sama. Yang melibatkan unit Anda akan muncul di sini.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {items.map((item) => (
            <article key={item.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#173B82]">
                <CalendarDays size={13} /> {formatTanggalInisiasi(item.tanggal_kegiatan)}
              </p>
              <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-slate-900">{item.judul}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                <Building2 size={13} className="shrink-0 text-slate-400" />
                <span className="truncate">{item.nama_mitra}</span>
              </p>
              <p className="mt-1.5 line-clamp-4 flex-1 text-xs leading-relaxed text-slate-500">{item.deskripsi}</p>

              {item.units.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.units.map((unit) => (
                    <span key={unit.id} className="max-w-full truncate rounded-full bg-[#173B82]/10 px-2 py-0.5 text-[10px] font-semibold text-[#173B82]">
                      {unit.nama}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${INISIASI_STATUS_CLASS[item.status_tindak_lanjut]}`}>
                  {INISIASI_STATUS_LABEL[item.status_tindak_lanjut]}
                </span>
                {item.jumlah_pengajuan > 0 && (
                  <span className="text-[11px] text-slate-500">{item.jumlah_pengajuan} pengajuan</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={meta.current_page <= 1 || loading}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
          >
            <ChevronLeft size={15} /> Sebelumnya
          </button>
          <span className="text-sm text-slate-600">Halaman {meta.current_page} dari {meta.last_page}</span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, meta.last_page))}
            disabled={meta.current_page >= meta.last_page || loading}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
          >
            Berikutnya <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
