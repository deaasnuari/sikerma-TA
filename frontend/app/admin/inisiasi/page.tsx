'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, FilePlus2, Filter, ImageOff, Images, Info, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProtectedImage from '@/components/ProtectedImage';
import GroupedFilterSelect from '@/components/GroupedFilterSelect';
import MonthPicker from '@/components/MonthPicker';
import YearPicker from '@/components/YearPicker';
import { bulanOptions, semuaBulanLabel } from '@/services/adminRekapDataService';
import { useMasterUnitProdi } from '@/hooks/useMasterData';
import { exportInisiasiKeExcel } from '@/lib/exportInisiasiExcel';
import {
  deleteInisiasi,
  deleteInisiasiMassal,
  formatTanggalInisiasi,
  getInisiasiList,
  getSemuaInisiasi,
  INISIASI_STATUS_CLASS,
  INISIASI_STATUS_LABEL,
  type InisiasiItem,
  type InisiasiListMeta,
  type InisiasiOpsiFilter,
  type InisiasiStatus,
  type InisiasiUrut,
} from '@/services/inisiasiService';
import InisiasiDetailModal from './InisiasiDetailModal';
import InisiasiFormModal from './InisiasiFormModal';

const PER_PAGE = 9;
const MAKS_CHIP_UNIT = 3;

type Pesan = { tipe: 'sukses' | 'gagal'; teks: string };

export default function InisiasiPage() {
  const [items, setItems] = useState<InisiasiItem[]>([]);
  const [meta, setMeta] = useState<InisiasiListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [urut, setUrut] = useState<InisiasiUrut>('terbaru');
  const [page, setPage] = useState(1);
  const [filterUnit, setFilterUnit] = useState('');
  const [filterTahun, setFilterTahun] = useState('');
  const [filterBulan, setFilterBulan] = useState('');
  const [filterStatus, setFilterStatus] = useState<InisiasiStatus | ''>('');
  const [opsi, setOpsi] = useState<InisiasiOpsiFilter>({ tahun: [], unit: [] });
  const [mengekspor, setMengekspor] = useState(false);
  const [progresExport, setProgresExport] = useState<string | null>(null);
  const { data: masterUnitRows } = useMasterUnitProdi();

  const [detailItem, setDetailItem] = useState<InisiasiItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<InisiasiItem | null>(null);
  const [hapusItem, setHapusItem] = useState<InisiasiItem | null>(null);
  // Pilihan untuk hapus banyak sekaligus (id inisiasi); tetap terpilih saat pindah halaman.
  const [pilihIds, setPilihIds] = useState<number[]>([]);
  const [hapusMassalOpen, setHapusMassalOpen] = useState(false);
  const [menghapusMassal, setMenghapusMassal] = useState(false);
  const [menghapus, setMenghapus] = useState(false);
  const [pesan, setPesan] = useState<Pesan | null>(null);

  // Pencarian ditunda sebentar supaya tidak memanggil API di setiap ketikan.
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
      const hasil = await getInisiasiList({
        q: search,
        urut,
        page,
        perPage: PER_PAGE,
        unit: filterUnit || undefined,
        tahun: filterTahun ? Number(filterTahun) : null,
        bulan: filterBulan ? Number(filterBulan) : null,
        status: filterStatus,
      });
      // Halaman terakhir jadi kosong (mis. setelah hapus) -> mundur satu halaman.
      if (hasil.data.length === 0 && page > 1) {
        setPage(hasil.meta.last_page || 1);
        return;
      }
      setItems(hasil.data);
      setMeta(hasil.meta);
      setOpsi(hasil.opsi);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data inisiasi.');
    } finally {
      setLoading(false);
    }
  }, [search, urut, page, filterUnit, filterTahun, filterBulan, filterStatus]);

  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    if (!pesan) return;
    const timer = setTimeout(() => setPesan(null), 5000);
    return () => clearTimeout(timer);
  }, [pesan]);

  const bukaTambah = () => {
    setEditItem(null);
    setFormOpen(true);
  };

  const bukaEdit = (item: InisiasiItem) => {
    setDetailItem(null);
    setEditItem(item);
    setFormOpen(true);
  };

  const handleSaved = (saved: InisiasiItem, teks: string) => {
    setFormOpen(false);
    setEditItem(null);
    setPesan({ tipe: 'sukses', teks });
    // Detail yang sedang dibuka (kalau ada) ikut menampilkan data terbaru.
    setDetailItem((prev) => (prev && prev.id === saved.id ? saved : prev));
    void muat();
  };

  const idsHalaman = items.map((item) => item.id);
  const semuaHalamanTerpilih = idsHalaman.length > 0 && idsHalaman.every((id) => pilihIds.includes(id));

  const togglePilih = (id: number) => {
    setPilihIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const togglePilihHalaman = () => {
    setPilihIds((prev) =>
      semuaHalamanTerpilih ? prev.filter((id) => !idsHalaman.includes(id)) : Array.from(new Set([...prev, ...idsHalaman])),
    );
  };

  const konfirmasiHapusMassal = async () => {
    if (pilihIds.length === 0) return;
    setMenghapusMassal(true);
    try {
      const jumlah = await deleteInisiasiMassal(pilihIds);
      setPesan({ tipe: 'sukses', teks: `${jumlah} data inisiasi berhasil dihapus.` });
      setPilihIds([]);
      setHapusMassalOpen(false);
      setDetailItem(null);
      await muat();
    } catch (err) {
      setPesan({ tipe: 'gagal', teks: err instanceof Error ? err.message : 'Gagal menghapus data inisiasi.' });
      setHapusMassalOpen(false);
    } finally {
      setMenghapusMassal(false);
    }
  };

  const konfirmasiHapus = async () => {
    if (!hapusItem) return;
    setMenghapus(true);
    try {
      await deleteInisiasi(hapusItem.id);
      setPesan({ tipe: 'sukses', teks: 'Data inisiasi berhasil dihapus.' });
      setPilihIds((prev) => prev.filter((id) => id !== hapusItem.id));
      setHapusItem(null);
      setDetailItem(null);
      await muat();
    } catch (err) {
      setPesan({ tipe: 'gagal', teks: err instanceof Error ? err.message : 'Gagal menghapus data inisiasi.' });
      setHapusItem(null);
    } finally {
      setMenghapus(false);
    }
  };

  const adaFilter = search.trim() !== '' || filterUnit !== '' || filterTahun !== '' || filterBulan !== '';
  const adaFilterSelain = filterUnit !== '' || filterTahun !== '' || filterBulan !== '' || filterStatus !== '';

  const resetFilter = () => {
    setSearchInput('');
    setSearch('');
    setFilterUnit('');
    setFilterTahun('');
    setFilterBulan('');
    setFilterStatus('');
    setPage(1);
  };

  // Export seluruh data sesuai filter yang sedang aktif (bukan hanya halaman yang tampil).
  const handleExport = async () => {
    setMengekspor(true);
    setProgresExport('Mengambil data…');
    try {
      const semua = await getSemuaInisiasi({
        q: search,
        urut,
        unit: filterUnit || undefined,
        tahun: filterTahun ? Number(filterTahun) : null,
        bulan: filterBulan ? Number(filterBulan) : null,
        status: filterStatus,
      });

      if (semua.length === 0) {
        setPesan({ tipe: 'gagal', teks: 'Tidak ada data inisiasi untuk diexport.' });
        return;
      }

      await exportInisiasiKeExcel(semua, `inisiasi-${new Date().toISOString().slice(0, 10)}.xlsx`, (selesai, total) =>
        setProgresExport(`Memuat foto ${selesai}/${total}…`),
      );
      setPesan({ tipe: 'sukses', teks: `${semua.length} data inisiasi berhasil diexport.` });
    } catch (err) {
      setPesan({ tipe: 'gagal', teks: err instanceof Error ? err.message : 'Gagal mengexport data inisiasi.' });
    } finally {
      setMengekspor(false);
      setProgresExport(null);
    }
  };

  // Daftar lengkap seperti di Rekap Data: semua Jurusan, Program Studi, dan Unit Kerja aktif dari Data Master
  // (bukan hanya yang sudah dipakai), ditambah unit yang diketik bebas di data Inisiasi (grup "Lainnya").
  const unitFilterGroups = useMemo(() => {
    const aktif = masterUnitRows.filter((row) => row.aktif && !['EL', 'TM', 'MB'].includes(row.nama.trim().toUpperCase()));
    const ke = (rows: typeof aktif) =>
      rows
        .map((row) => ({ value: `id:${row.id}`, label: row.nama }))
        .sort((x, y) => x.label.localeCompare(y.label));

    return [
      { label: 'Jurusan', options: ke(aktif.filter((row) => row.jenis_node === 'unit' && row.kategori_unit === 'jurusan')) },
      { label: 'Program Studi', options: ke(aktif.filter((row) => row.jenis_node === 'prodi')) },
      { label: 'Unit Kerja', options: ke(aktif.filter((row) => row.jenis_node === 'unit' && row.kategori_unit !== 'jurusan')) },
      {
        label: 'Lainnya',
        options: opsi.unit.filter((unit) => unit.group === 'Lainnya').map((unit) => ({ value: unit.value, label: unit.nama })),
      },
    ];
  }, [masterUnitRows, opsi.unit]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title">Inisiasi</h1>
          <p className="page-subtitle mt-0.5">Catatan pertemuan dan kegiatan awal dengan calon mitra, sebelum kerja sama dibuat</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={mengekspor}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-[#173B82] hover:text-[#173B82] disabled:opacity-60"
          >
            <Download size={16} /> {mengekspor ? (progresExport ?? 'Mengexport…') : 'Export Excel'}
          </button>
          <button type="button" onClick={bukaTambah} className="btn-primary h-10 gap-1.5 px-4 text-sm">
            <Plus size={16} /> Tambah Inisiasi
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4" aria-label="Tentang Inisiasi">
        <div className="flex items-start gap-3">
          <Info size={18} className="mt-0.5 shrink-0 text-[#173B82]" />
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Halaman ini untuk menyimpan catatan kegiatan <strong className="text-slate-900">sebelum</strong> kerja sama dengan sebuah mitra dimulai,
              misalnya kunjungan, pertemuan, rapat online, atau diskusi perkenalan.
            </p>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-600">
              <li>Isi: tanggal, judul kegiatan, nama instansi, dan cerita singkat apa yang dibahas serta hasilnya.</li>
              <li>Catat juga siapa saja yang ikut dari Polibatam (unit dan nama peserta), lalu tambahkan foto kegiatan.</li>
              <li>Catatan di sini berdiri sendiri. Tidak otomatis menjadi berita atau dokumen kerja sama.</li>
            </ul>
          </div>
        </div>
      </section>

      {pesan && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            pesan.tipe === 'sukses' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <span>{pesan.teks}</span>
          <button type="button" onClick={() => setPesan(null)} className="text-xs font-semibold underline">
            Tutup
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari judul kegiatan atau nama instansi…"
              aria-label="Cari inisiasi"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="flex items-center gap-3">
            <p className="hidden text-xs font-medium text-gray-500 sm:block">
              {meta ? `${meta.total} kegiatan` : ''}
            </p>
            <div className="relative">
              <select
                value={urut}
                onChange={(e) => {
                  setUrut(e.target.value as InisiasiUrut);
                  setPage(1);
                }}
                aria-label="Urutkan berdasarkan tanggal kegiatan"
                className="appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2 pl-3.5 pr-9 text-sm font-medium text-gray-700 outline-none transition hover:bg-gray-100 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="terbaru">Tanggal: terbaru</option>
                <option value="terlama">Tanggal: terlama</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <Filter size={14} /> Filter
          </span>

          <GroupedFilterSelect
            value={filterUnit}
            onChange={(value) => {
              setFilterUnit(value);
              setPage(1);
            }}
            allLabel="Semua Jurusan/Prodi/Unit"
            allValue=""
            groups={unitFilterGroups}
          />

          <YearPicker
            value={filterTahun || null}
            onChange={(tahun) => {
              setFilterTahun(tahun ?? '');
              setPage(1);
            }}
            availableYears={opsi.tahun}
          />

          <MonthPicker
            value={filterBulan ? (bulanOptions[Number(filterBulan) - 1] ?? semuaBulanLabel) : semuaBulanLabel}
            onChange={(label) => {
              const index = bulanOptions.indexOf(label);
              setFilterBulan(index >= 0 ? String(index + 1) : '');
              setPage(1);
            }}
            allowTanpaBulan={false}
          />

          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as InisiasiStatus | '');
              setPage(1);
            }}
            aria-label="Filter status"
            className="input-field h-9 rounded-lg px-3 text-sm"
          >
            <option value="">Semua status</option>
            {(Object.keys(INISIASI_STATUS_LABEL) as InisiasiStatus[]).map((status) => (
              <option key={status} value={status}>{INISIASI_STATUS_LABEL[status]}</option>
            ))}
          </select>

          {adaFilterSelain && (
            <button type="button" onClick={resetFilter} className="text-xs font-semibold text-[#173B82] underline hover:text-blue-800">
              Reset filter
            </button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={semuaHalamanTerpilih}
              onChange={togglePilihHalaman}
              className="h-4 w-4 cursor-pointer accent-[#173B82]"
            />
            Pilih semua di halaman ini
          </label>
          {pilihIds.length > 0 && (
            <>
              <span className="text-slate-500">{pilihIds.length} dipilih</span>
              <button type="button" onClick={() => setPilihIds([])} className="text-xs font-semibold text-[#173B82] underline hover:text-blue-800">
                Batalkan pilihan
              </button>
              <button
                type="button"
                onClick={() => setHapusMassalOpen(true)}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Trash2 size={14} /> Hapus {pilihIds.length} terpilih
              </button>
            </>
          )}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="aspect-[16/10] bg-slate-200" />
              <div className="space-y-2 p-4">
                <div className="h-3 w-1/3 rounded bg-slate-200" />
                <div className="h-4 w-4/5 rounded bg-slate-200" />
                <div className="h-3 w-full rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-red-700">{loadError}</p>
          <button type="button" onClick={() => void muat()} className="btn-primary mt-3 h-9 px-4 text-sm">
            Coba lagi
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-14 text-center">
          <Images size={32} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm font-semibold text-gray-700">
            {adaFilter ? 'Tidak ada kegiatan yang cocok dengan pencarian.' : 'Belum ada data inisiasi.'}
          </p>
          {!adaFilter && (
            <>
              <p className="mt-1 text-xs text-gray-500">Mulai dokumentasikan kegiatan penjajakan kerja sama dengan mitra.</p>
              <button type="button" onClick={bukaTambah} className="btn-primary mt-4 h-9 gap-1.5 px-4 text-sm">
                <Plus size={15} /> Tambah Inisiasi
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={`grid gap-4 grid-cols-[repeat(auto-fill,minmax(250px,1fr))] ${loading ? 'opacity-60' : ''}`}>
          {items.map((item) => (
            <article
              key={item.id}
              className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
                pilihIds.includes(item.id) ? 'border-[#173B82] ring-2 ring-[#173B82]/30' : 'border-gray-200'
              }`}
            >
              <label
                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/95 shadow-sm"
                title="Pilih untuk dihapus"
              >
                <input
                  type="checkbox"
                  checked={pilihIds.includes(item.id)}
                  onChange={() => togglePilih(item.id)}
                  aria-label={`Pilih ${item.judul}`}
                  className="h-4 w-4 cursor-pointer accent-[#173B82]"
                />
              </label>
              <button
                type="button"
                onClick={() => setDetailItem(item)}
                className="group relative block aspect-[16/10] w-full overflow-hidden bg-slate-100 text-left"
                aria-label={`Lihat detail ${item.judul}`}
              >
                {item.fotos[0] ? (
                  <>
                    {/* Latar: foto yang sama diperbesar dan diburamkan, supaya tidak ada pita kosong di kiri-kanan/atas-bawah. */}
                    <ProtectedImage path={item.fotos[0].path_file} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl" />
                    <ProtectedImage
                      path={item.fotos[0].path_file}
                      alt={item.fotos[0].nama_asli ?? item.judul}
                      className="absolute inset-0 h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                    />
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageOff size={26} />
                    <span className="text-xs">Belum ada foto</span>
                  </div>
                )}
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-[#173B82] shadow-sm">
                  <CalendarDays size={11} /> {formatTanggalInisiasi(item.tanggal_kegiatan)}
                </span>
                {item.fotos.length > 1 && (
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <Images size={11} /> {item.fotos.length}
                  </span>
                )}
              </button>

              <div className="flex flex-1 flex-col p-3"><div className="flex-1">
                <h2 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">
                  <button type="button" onClick={() => setDetailItem(item)} className="text-left hover:text-[#173B82] hover:underline">
                    {item.judul}
                  </button>
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                  <Building2 size={13} className="shrink-0 text-slate-400" />
                  <span className="truncate">{item.nama_mitra}</span>
                </p>
                <span className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${INISIASI_STATUS_CLASS[item.status_tindak_lanjut]}`}>
                  {INISIASI_STATUS_LABEL[item.status_tindak_lanjut]}
                  {item.jumlah_pengajuan > 0 ? ` · ${item.jumlah_pengajuan} pengajuan` : ''}
                </span>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.deskripsi}</p>

                {item.units.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.units.slice(0, MAKS_CHIP_UNIT).map((unit) => (
                      <span key={unit.id} className="max-w-full truncate rounded-full bg-[#173B82]/10 px-2 py-0.5 text-[10px] font-semibold text-[#173B82]">
                        {unit.nama}
                      </span>
                    ))}
                    {item.units.length > MAKS_CHIP_UNIT && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        +{item.units.length - MAKS_CHIP_UNIT}
                      </span>
                    )}
                  </div>
                )}

                {item.peserta.length > 0 && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-500">
                    <Users size={12} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2">
                      {item.peserta.length} peserta: {item.peserta.map((p) => p.nama).join(', ')}
                    </span>
                  </p>
                )}

                </div>

                <div className="mt-3 flex justify-end gap-1.5 border-t border-slate-100 pt-2.5">
                  {(item.status_tindak_lanjut === 'belum' || item.status_tindak_lanjut === 'tidak_dilanjutkan') && (
                    <Link
                      href={`/admin/data_pengajuan?view=ajukan&inisiasi=${item.id}`}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#173B82] bg-[#173B82] px-2.5 text-[11px] font-semibold text-white hover:bg-[#122f68]"
                    >
                      <FilePlus2 size={13} /> Buat Pengajuan
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => bukaEdit(item)}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:border-[#173B82] hover:text-[#173B82]"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setHapusItem(item)}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={13} /> Hapus
                  </button>
                </div>
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
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={15} /> Sebelumnya
          </button>
          <span className="text-sm text-gray-600">
            Halaman {meta.current_page} dari {meta.last_page}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, meta.last_page))}
            disabled={meta.current_page >= meta.last_page || loading}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Berikutnya <ChevronRight size={15} />
          </button>
        </div>
      )}

      <InisiasiDetailModal item={detailItem} onClose={() => setDetailItem(null)} onEdit={bukaEdit} onDelete={(item) => setHapusItem(item)} />

      <InisiasiFormModal
        open={formOpen}
        item={editItem}
        onClose={() => {
          setFormOpen(false);
          setEditItem(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={hapusMassalOpen}
        title={`Hapus ${pilihIds.length} data inisiasi?`}
        message={
          <>
            <strong>{pilihIds.length}</strong> data inisiasi beserta seluruh foto dan dokumennya akan dihapus permanen, termasuk dari tampilan
            internal yang di-CC. Tindakan ini tidak bisa dikembalikan.
          </>
        }
        confirmLabel={`Ya, hapus ${pilihIds.length}`}
        loading={menghapusMassal}
        onConfirm={() => void konfirmasiHapusMassal()}
        onCancel={() => setHapusMassalOpen(false)}
      />

      <ConfirmDialog
        open={hapusItem !== null}
        title="Hapus data inisiasi?"
        message={
          <>
            Data <strong>{hapusItem?.judul}</strong> beserta seluruh foto dokumentasinya akan dihapus permanen dan tidak bisa dikembalikan.
          </>
        }
        confirmLabel="Ya, hapus"
        loading={menghapus}
        onConfirm={() => void konfirmasiHapus()}
        onCancel={() => setHapusItem(null)}
      />
    </div>
  );
}
