'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ImagePlus, Plus, RefreshCw, X } from 'lucide-react';
import MultiSelectDropdown from '@/components/MultiSelectDropdown';
import ProtectedImage from '@/components/ProtectedImage';
import { useMasterUnitProdi } from '@/hooks/useMasterData';
import { getDistribusiKandidat, type DistribusiJabatan, type DistribusiKandidat } from '@/services/distribusiKandidatService';
import {
  INISIASI_FORMAT_FOTO,
  INISIASI_MAKS_DOKUMEN,
  INISIASI_MAKS_FOTO,
  INISIASI_MAKS_TOTAL_UKURAN_BARU,
  INISIASI_MAKS_TOTAL_UPLOAD_BARU,
  INISIASI_MAKS_UKURAN_DOKUMEN,
  INISIASI_MAKS_UKURAN_FOTO,
  formatUkuranBerkas,
  saveInisiasi,
  type InisiasiDokumen,
  type InisiasiFoto,
  type InisiasiItem,
} from '@/services/inisiasiService';

type FotoBaru = { id: string; file: File; previewUrl: string };
type DokumenBaru = { id: string; file: File };

type Props = {
  open: boolean;
  // null = tambah data baru; berisi = edit data tersebut.
  item: InisiasiItem | null;
  onClose: () => void;
  onSaved: (saved: InisiasiItem, pesan: string) => void;
};

type FieldErrors = Partial<Record<'tanggal' | 'judul' | 'mitra' | 'deskripsi', string>>;

const labelClass = 'mb-1 block text-sm font-semibold text-slate-700';

const JABATAN_LABEL: Record<DistribusiJabatan, string> = {
  ketua_jurusan: 'Ketua Jurusan',
  ketua_prodi: 'Ketua Prodi',
  kepala_unit: 'Kepala Unit',
};

function groupLabel(kategori: string | null | undefined, jenis: string): string {
  if (jenis === 'prodi') return 'Program Studi';
  if (kategori === 'jurusan') return 'Jurusan';
  return 'Unit Kerja';
}

export default function InisiasiFormModal({ open, item, onClose, onSaved }: Props) {
  const isEdit = item !== null;
  const { data: unitRows } = useMasterUnitProdi();

  const [tanggal, setTanggal] = useState('');
  const [judul, setJudul] = useState('');
  const [mitra, setMitra] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [unitProdiIds, setUnitProdiIds] = useState<number[]>([]);
  const [unitLainnya, setUnitLainnya] = useState<string[]>([]);
  const [unitInput, setUnitInput] = useState('');
  const [peserta, setPeserta] = useState<string[]>([]);
  const [pesertaInput, setPesertaInput] = useState('');
  const [fotoLama, setFotoLama] = useState<InisiasiFoto[]>([]);
  const [hapusFotoIds, setHapusFotoIds] = useState<number[]>([]);
  const [fotoBaru, setFotoBaru] = useState<FotoBaru[]>([]);
  const [dokumenLama, setDokumenLama] = useState<InisiasiDokumen[]>([]);
  const [hapusDokumenIds, setHapusDokumenIds] = useState<number[]>([]);
  const [dokumenBaru, setDokumenBaru] = useState<DokumenBaru[]>([]);
  const [dokumenError, setDokumenError] = useState<string | null>(null);
  // Saran nama peserta: Ketua Jurusan/Prodi/Kepala Unit (sama dengan pilihan Distribusi/CC di Data Pengajuan).
  const [kandidat, setKandidat] = useState<DistribusiKandidat[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fotoInputRef = useRef<HTMLInputElement>(null);
  const dokumenInputRef = useRef<HTMLInputElement>(null);
  // Target tombol "Ganti": foto lama (id) atau foto baru (id lokal); null = tambah foto biasa.
  const gantiTarget = useRef<{ jenis: 'lama' | 'baru'; id: string | number } | null>(null);
  const fotoBaruRef = useRef<FotoBaru[]>([]);
  fotoBaruRef.current = fotoBaru;

  // Isi ulang form tiap dibuka: kosong untuk tambah, terisi data tersimpan untuk edit.
  useEffect(() => {
    if (!open) return;

    setTanggal(item?.tanggal_kegiatan?.slice(0, 10) ?? '');
    setJudul(item?.judul ?? '');
    setMitra(item?.nama_mitra ?? '');
    setDeskripsi(item?.deskripsi ?? '');
    setUnitProdiIds(item?.units.filter((unit) => unit.unit_prodi_id !== null).map((unit) => unit.unit_prodi_id as number) ?? []);
    setUnitLainnya(item?.units.filter((unit) => unit.unit_prodi_id === null).map((unit) => unit.nama) ?? []);
    setPeserta(item?.peserta.map((p) => p.nama) ?? []);
    setFotoLama(item?.fotos ?? []);
    setHapusFotoIds([]);
    setFotoBaru([]);
    setDokumenLama(item?.dokumens ?? []);
    setHapusDokumenIds([]);
    setDokumenBaru([]);
    setDokumenError(null);
    setUnitInput('');
    setPesertaInput('');
    setErrors({});
    setFotoError(null);
    setServerError(null);
    setSubmitting(false);
  }, [open, item]);

  // Daftar kandidat diambil sekali saat modal pertama dibuka; bila gagal, peserta tetap bisa diketik bebas.
  const kandidatDimuat = useRef(false);
  useEffect(() => {
    if (!open || kandidatDimuat.current) return;
    kandidatDimuat.current = true;
    getDistribusiKandidat()
      .then(setKandidat)
      .catch(() => {
        kandidatDimuat.current = false;
      });
  }, [open]);

  // Lepas object URL preview saat modal ditutup/komponen dibongkar supaya memori tidak bocor.
  useEffect(() => {
    if (open) return;
    fotoBaruRef.current.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
  }, [open]);
  useEffect(() => () => fotoBaruRef.current.forEach((foto) => URL.revokeObjectURL(foto.previewUrl)), []);

  const unitOptions = useMemo(
    () =>
      unitRows
        .filter((row) => row.aktif)
        .map((row) => ({ value: row.id, label: row.nama, group: groupLabel(row.kategori_unit, row.jenis_node) }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)),
    [unitRows],
  );

  if (!open) return null;

  const totalFoto = fotoLama.length + fotoBaru.length;

  const kataPeserta = pesertaInput.trim().toLowerCase();
  const saranPeserta = (() => {
    if (!kataPeserta) return [];
    const sudah = new Set(peserta.map((nama) => nama.toLowerCase()));
    const terlihat = new Set<string>();
    return kandidat
      .filter((k) => k.nama.toLowerCase().includes(kataPeserta) && !sudah.has(k.nama.toLowerCase()))
      .filter((k) => {
        // Orang yang sama bisa muncul dua kali untuk jabatan berbeda; kuncinya nama+jabatan+unit.
        const kunci = `${k.nama.toLowerCase()}|${k.jabatan}|${k.unitNama ?? ''}`;
        if (terlihat.has(kunci)) return false;
        terlihat.add(kunci);
        return true;
      });
  })();
  const totalDokumen = dokumenLama.length + dokumenBaru.length;

  // Gabungkan teks ketikan (boleh beberapa nama dipisah koma/titik koma) ke daftar chip, tanpa duplikat.
  const gabungChip = (nilai: string, daftar: string[]): string[] => {
    const next = [...daftar];
    nilai
      .split(/[,;\n]/)
      .map((bagian) => bagian.trim())
      .filter(Boolean)
      .forEach((nama) => {
        if (!next.some((ada) => ada.toLowerCase() === nama.toLowerCase())) next.push(nama);
      });
    return next;
  };

  const validasiFile = (file: File): string | null => {
    if (!INISIASI_FORMAT_FOTO.includes(file.type)) return `${file.name}: format harus JPG, JPEG, PNG, atau WebP.`;
    if (file.size > INISIASI_MAKS_UKURAN_FOTO) return `${file.name}: ukuran maksimal 5 MB.`;
    return null;
  };

  const handlePilihFoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const target = gantiTarget.current;
    gantiTarget.current = null;
    event.target.value = '';
    if (files.length === 0) return;

    for (const file of files) {
      const pesan = validasiFile(file);
      if (pesan) {
        setFotoError(pesan);
        return;
      }
    }

    const pesanTotal = 'Total ukuran foto yang diunggah sekaligus maksimal 8 MB. Simpan dulu, lalu tambahkan foto berikutnya lewat Edit.';
    const ukuranBaruSaatIni = fotoBaru.reduce((total, foto) => total + foto.file.size, 0);

    // Mengganti satu foto = satu file pengganti; foto lama ditandai hapus, foto baru ditukar tempatnya.
    if (target) {
      const pengganti = files[0];
      const ukuranDigantikan = target.jenis === 'baru' ? (fotoBaru.find((foto) => foto.id === target.id)?.file.size ?? 0) : 0;
      if (ukuranBaruSaatIni - ukuranDigantikan + pengganti.size > INISIASI_MAKS_TOTAL_UKURAN_BARU) {
        setFotoError(pesanTotal);
        return;
      }
      const entri: FotoBaru = { id: `${Date.now()}-${Math.random()}`, file: pengganti, previewUrl: URL.createObjectURL(pengganti) };

      if (target.jenis === 'lama') {
        setHapusFotoIds((prev) => [...prev, target.id as number]);
        setFotoLama((prev) => prev.filter((foto) => foto.id !== target.id));
        setFotoBaru((prev) => [...prev, entri]);
      } else {
        setFotoBaru((prev) =>
          prev.map((foto) => {
            if (foto.id !== target.id) return foto;
            URL.revokeObjectURL(foto.previewUrl);
            return entri;
          }),
        );
      }
      setFotoError(null);
      return;
    }

    if (totalFoto + files.length > INISIASI_MAKS_FOTO) {
      setFotoError(`Maksimal ${INISIASI_MAKS_FOTO} foto per kegiatan.`);
      return;
    }

    if (ukuranBaruSaatIni + files.reduce((total, file) => total + file.size, 0) > INISIASI_MAKS_TOTAL_UKURAN_BARU) {
      setFotoError(pesanTotal);
      return;
    }

    setFotoError(null);
    setFotoBaru((prev) => [
      ...prev,
      ...files.map((file) => ({ id: `${Date.now()}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file) })),
    ]);
  };

  const handlePilihDokumen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    for (const file of files) {
      const adalahPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!adalahPdf) {
        setDokumenError(`${file.name}: format harus PDF.`);
        return;
      }
      if (file.size > INISIASI_MAKS_UKURAN_DOKUMEN) {
        setDokumenError(`${file.name}: ukuran maksimal 10 MB.`);
        return;
      }
    }

    if (totalDokumen + files.length > INISIASI_MAKS_DOKUMEN) {
      setDokumenError(`Maksimal ${INISIASI_MAKS_DOKUMEN} dokumen per kegiatan.`);
      return;
    }

    const ukuranFotoBaru = fotoBaru.reduce((total, foto) => total + foto.file.size, 0);
    const ukuranDokumenBaru = dokumenBaru.reduce((total, dokumen) => total + dokumen.file.size, 0);
    if (ukuranFotoBaru + ukuranDokumenBaru + files.reduce((total, file) => total + file.size, 0) > INISIASI_MAKS_TOTAL_UPLOAD_BARU) {
      setDokumenError('Total ukuran berkas yang diunggah sekaligus maksimal 48 MB. Simpan dulu, lalu tambahkan dokumen berikutnya lewat Edit.');
      return;
    }

    setDokumenError(null);
    setDokumenBaru((prev) => [...prev, ...files.map((file) => ({ id: `${Date.now()}-${Math.random()}`, file }))]);
  };

  const hapusDokumenBaru = (id: string) => {
    setDokumenBaru((prev) => prev.filter((dokumen) => dokumen.id !== id));
    setDokumenError(null);
  };

  const hapusDokumenLama = (id: number) => {
    setHapusDokumenIds((prev) => [...prev, id]);
    setDokumenLama((prev) => prev.filter((dokumen) => dokumen.id !== id));
    setDokumenError(null);
  };

  const bukaPemilihFoto = (target: { jenis: 'lama' | 'baru'; id: string | number } | null) => {
    gantiTarget.current = target;
    fotoInputRef.current?.click();
  };

  const hapusFotoBaru = (id: string) => {
    setFotoBaru((prev) => {
      const target = prev.find((foto) => foto.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((foto) => foto.id !== id);
    });
    setFotoError(null);
  };

  const hapusFotoLama = (id: number) => {
    setHapusFotoIds((prev) => [...prev, id]);
    setFotoLama((prev) => prev.filter((foto) => foto.id !== id));
    setFotoError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors: FieldErrors = {};
    if (!tanggal) nextErrors.tanggal = 'Tanggal kegiatan wajib diisi.';
    if (!judul.trim()) nextErrors.judul = 'Judul kegiatan wajib diisi.';
    if (!mitra.trim()) nextErrors.mitra = 'Nama mitra wajib diisi.';
    if (!deskripsi.trim()) nextErrors.deskripsi = 'Deskripsi kegiatan wajib diisi.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Teks yang masih diketik di kolom unit/peserta (belum ditekan Enter) ikut disimpan.
    const unitFinal = gabungChip(unitInput, unitLainnya);
    const pesertaFinal = gabungChip(pesertaInput, peserta);

    setSubmitting(true);
    setServerError(null);
    try {
      const saved = await saveInisiasi(
        {
          tanggalKegiatan: tanggal,
          judul: judul.trim(),
          namaMitra: mitra.trim(),
          deskripsi: deskripsi.trim(),
          unitProdiIds,
          unitLainnya: unitFinal,
          peserta: pesertaFinal,
          fotoBaru: fotoBaru.map((foto) => foto.file),
          hapusFotoIds,
          dokumenBaru: dokumenBaru.map((dokumen) => dokumen.file),
          hapusDokumenIds,
        },
        item?.id,
      );
      onSaved(saved, isEdit ? 'Data inisiasi berhasil diperbarui.' : 'Data inisiasi berhasil ditambahkan.');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Gagal menyimpan data inisiasi.');
    } finally {
      setSubmitting(false);
    }
  };

  const errorClass = (pesan?: string) => (pesan ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : '');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 backdrop-blur-[1px] sm:p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Inisiasi' : 'Tambah Inisiasi'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Catat kegiatan awal dengan calon mitra: apa yang dibahas, siapa yang ikut, dan fotonya.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {serverError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inisiasi-tanggal" className={labelClass}>Tanggal Kegiatan *</label>
              <input
                id="inisiasi-tanggal"
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className={`input-field h-10 w-full rounded-lg px-3 text-sm ${errorClass(errors.tanggal)}`}
              />
              {errors.tanggal && <p className="mt-1 text-xs text-red-500">{errors.tanggal}</p>}
            </div>
            <div>
              <label htmlFor="inisiasi-mitra" className={labelClass}>Nama Mitra *</label>
              <input
                id="inisiasi-mitra"
                type="text"
                value={mitra}
                onChange={(e) => setMitra(e.target.value)}
                maxLength={255}
                placeholder="Nama mitra yang terlibat"
                className={`input-field h-10 w-full rounded-lg px-3 text-sm ${errorClass(errors.mitra)}`}
              />
              {errors.mitra && <p className="mt-1 text-xs text-red-500">{errors.mitra}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="inisiasi-judul" className={labelClass}>Judul Kegiatan *</label>
            <input
              id="inisiasi-judul"
              type="text"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              maxLength={255}
              placeholder="Judul atau nama kegiatan inisiasi"
              className={`input-field h-10 w-full rounded-lg px-3 text-sm ${errorClass(errors.judul)}`}
            />
            {errors.judul && <p className="mt-1 text-xs text-red-500">{errors.judul}</p>}
          </div>

          <div>
            <label htmlFor="inisiasi-deskripsi" className={labelClass}>Deskripsi Kegiatan *</label>
            <textarea
              id="inisiasi-deskripsi"
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              rows={5}
              maxLength={10000}
              placeholder="Tujuan, pembahasan, hasil, dan informasi penting dari kegiatan"
              className={`input-field w-full rounded-lg px-3 py-2 text-sm ${errorClass(errors.deskripsi)}`}
            />
            {errors.deskripsi && <p className="mt-1 text-xs text-red-500">{errors.deskripsi}</p>}
          </div>

          <div>
            <span className={labelClass}>Unit Terlibat</span>
            <MultiSelectDropdown
              options={unitOptions}
              selected={unitProdiIds}
              onChange={setUnitProdiIds}
              placeholder="Pilih jurusan, prodi, atau unit (bisa lebih dari satu)"
              searchPlaceholder="Cari unit..."
              ariaLabel="Pilih unit terlibat"
              textClassName="text-sm"
            />
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={unitInput}
                onChange={(e) => setUnitInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setUnitLainnya(gabungChip(unitInput, unitLainnya));
                    setUnitInput('');
                  }
                }}
                maxLength={200}
                placeholder="Unit/bagian lain yang tidak ada di daftar (Enter untuk menambah)"
                className="input-field h-9 min-w-0 flex-1 rounded-lg px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setUnitLainnya(gabungChip(unitInput, unitLainnya));
                  setUnitInput('');
                }}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-[#173B82] hover:text-[#173B82]"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
            {unitLainnya.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unitLainnya.map((nama) => (
                  <span key={nama} className="inline-flex items-center gap-1 rounded-full bg-[#173B82] px-2.5 py-0.5 text-xs font-semibold text-white">
                    {nama}
                    <button type="button" aria-label={`Hapus ${nama}`} onClick={() => setUnitLainnya((prev) => prev.filter((n) => n !== nama))} className="hover:opacity-75">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className={labelClass}>Nama Peserta</span>
            <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={pesertaInput}
                onChange={(e) => setPesertaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setPeserta(gabungChip(pesertaInput, peserta));
                    setPesertaInput('');
                  }
                }}
                maxLength={200}
                placeholder="Cari nama Ketua Jurusan/Prodi/Kepala Unit, atau ketik nama lalu Enter"
                className="input-field h-9 min-w-0 flex-1 rounded-lg px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setPeserta(gabungChip(pesertaInput, peserta));
                  setPesertaInput('');
                }}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-[#173B82] hover:text-[#173B82]"
              >
                <Plus size={14} /> Tambah
              </button>
            </div>
            {kataPeserta && saranPeserta.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {saranPeserta.slice(0, 8).map((k) => (
                  <button
                    key={`${k.nik ?? 'x'}-${k.jabatan}-${k.unitNama ?? ''}-${k.nama}`}
                    type="button"
                    onClick={() => {
                      setPeserta((prev) => gabungChip(k.nama, prev));
                      setPesertaInput('');
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="truncate">{k.nama}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {JABATAN_LABEL[k.jabatan]}
                      {k.unitNama ? ` · ${k.unitNama}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            </div>
            {peserta.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {peserta.map((nama) => (
                  <span key={nama} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {nama}
                    <button type="button" aria-label={`Hapus ${nama}`} onClick={() => setPeserta((prev) => prev.filter((n) => n !== nama))} className="text-slate-400 hover:text-slate-700">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className={labelClass}>Foto / Dokumentasi Kegiatan</span>
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              onChange={handlePilihFoto}
            />

            {(fotoLama.length > 0 || fotoBaru.length > 0) && (
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fotoLama.map((foto) => (
                  <div key={`lama-${foto.id}`} className="group relative overflow-hidden rounded-lg border border-slate-200">
                    <ProtectedImage path={foto.path_file} alt={foto.nama_asli ?? 'Foto kegiatan'} className="h-28 w-full bg-slate-100 object-contain" />
                    <FotoAksi onGanti={() => bukaPemilihFoto({ jenis: 'lama', id: foto.id })} onHapus={() => hapusFotoLama(foto.id)} />
                  </div>
                ))}
                {fotoBaru.map((foto) => (
                  <div key={foto.id} className="group relative overflow-hidden rounded-lg border border-blue-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto.previewUrl} alt={foto.file.name} className="h-28 w-full bg-slate-100 object-contain" />
                    <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">BARU</span>
                    <FotoAksi onGanti={() => bukaPemilihFoto({ jenis: 'baru', id: foto.id })} onHapus={() => hapusFotoBaru(foto.id)} />
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => bukaPemilihFoto(null)}
              disabled={totalFoto >= INISIASI_MAKS_FOTO}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#173B82]/30 bg-white px-4 py-4 text-sm font-medium text-slate-600 transition hover:border-[#173B82] hover:text-[#173B82] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus size={18} />
              Pilih foto ({totalFoto}/{INISIASI_MAKS_FOTO})
            </button>
            <p className="mt-1 text-xs text-slate-400">JPG, JPEG, PNG, atau WebP — maksimal 5 MB per foto, total 8 MB per sekali simpan.</p>
            {fotoError && <p className="mt-1 text-xs text-red-500">{fotoError}</p>}
          </div>

          <div>
            <span className={labelClass}>Dokumen Pendukung (PDF)</span>
            <input
              ref={dokumenInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={handlePilihDokumen}
            />

            {totalDokumen > 0 && (
              <ul className="mb-3 space-y-1.5">
                {dokumenLama.map((dokumen) => (
                  <DokumenBaris key={`lama-${dokumen.id}`} nama={dokumen.nama_asli ?? 'Dokumen'} ukuran={dokumen.ukuran} onHapus={() => hapusDokumenLama(dokumen.id)} />
                ))}
                {dokumenBaru.map((dokumen) => (
                  <DokumenBaris key={dokumen.id} nama={dokumen.file.name} ukuran={dokumen.file.size} baru onHapus={() => hapusDokumenBaru(dokumen.id)} />
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => dokumenInputRef.current?.click()}
              disabled={totalDokumen >= INISIASI_MAKS_DOKUMEN}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#173B82]/30 bg-white px-4 py-4 text-sm font-medium text-slate-600 transition hover:border-[#173B82] hover:text-[#173B82] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText size={18} />
              Pilih dokumen PDF ({totalDokumen}/{INISIASI_MAKS_DOKUMEN})
            </button>
            <p className="mt-1 text-xs text-slate-400">Hanya PDF — bisa lebih dari satu, maksimal 10 MB per dokumen.</p>
            {dokumenError && <p className="mt-1 text-xs text-red-500">{dokumenError}</p>}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 rounded-lg bg-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
          >
            Batal
          </button>
          <button type="submit" disabled={submitting} className="btn-primary h-9 px-5 text-sm disabled:opacity-60">
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}

function DokumenBaris({ nama, ukuran, baru = false, onHapus }: { nama: string; ukuran: number | null; baru?: boolean; onHapus: () => void }) {
  return (
    <li className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${baru ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
      <FileText size={16} className="shrink-0 text-red-500" />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={nama}>{nama}</span>
      {baru && <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">BARU</span>}
      <span className="shrink-0 text-xs text-slate-400">{formatUkuranBerkas(ukuran)}</span>
      <button type="button" onClick={onHapus} title="Hapus dokumen" aria-label={`Hapus ${nama}`} className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
        <X size={14} />
      </button>
    </li>
  );
}

function FotoAksi({ onGanti, onHapus }: { onGanti: () => void; onHapus: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1">
      <button type="button" onClick={onGanti} title="Ganti foto" aria-label="Ganti foto" className="rounded bg-white/90 p-1 text-slate-700 hover:bg-white">
        <RefreshCw size={12} />
      </button>
      <button type="button" onClick={onHapus} title="Hapus foto" aria-label="Hapus foto" className="rounded bg-white/90 p-1 text-red-600 hover:bg-white">
        <X size={12} />
      </button>
    </div>
  );
}
