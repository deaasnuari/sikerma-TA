'use client';

import JenisBadges from '@/components/JenisBadges';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ClipboardList,
  Download,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import { isAktivitasPerpanjangan } from '@/lib/aktivitasPerpanjangan';
import KartuDokumenKerjasama from '@/components/KartuDokumenKerjasama';
import { usePerpanjanganDisetujui } from '@/hooks/usePerpanjanganDisetujui';
import type { KerjasamaStory, Aktivitas } from './page';
import LaporanPelaksanaanModal from '@/components/LaporanPelaksanaanModal';
import { getLaporanPelaksanaanByDokumenKerjasamaIds, type LaporanPelaksanaanRecord } from '@/services/laporanPelaksanaanService';
import { createAktivitasForDokumenApi } from '@/services/adminStoryAktivitasService';
import { showNotice } from '@/lib/dialog';

type Jenis = 'MoA' | 'MoU' | 'IA';
type StatusKerjasama = 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa';
type StatusAktivitas = 'direncanakan' | 'berlangsung' | 'selesai';

interface DetailStoryModalProps {
  story: KerjasamaStory;
  onBack: () => void;
}

const jenisBadgeMap: Record<Jenis, string> = {
  MoA: 'bg-cyan-100 text-cyan-700',
  MoU: 'bg-violet-100 text-violet-700',
  IA: 'bg-orange-100 text-orange-700',
};

const statusDotMap: Record<StatusKerjasama, string> = {
  Aktif: 'bg-green-500',
  'Akan Berakhir': 'bg-orange-500',
  Kadaluarsa: 'bg-red-500',
};

const statusTextMap: Record<StatusKerjasama, string> = {
  Aktif: 'text-green-700',
  'Akan Berakhir': 'text-orange-700',
  Kadaluarsa: 'text-red-700',
};

const aktivitasStatusBadge: Record<StatusAktivitas, { label: string; className: string }> = {
  direncanakan: { label: 'direncanakan', className: 'bg-purple-100 text-purple-700' },
  berlangsung: { label: 'berlangsung', className: 'bg-blue-100 text-blue-700' },
  selesai: { label: 'selesai', className: 'bg-green-100 text-green-700' },
};

const aktivitasIconBg: Record<StatusAktivitas, string> = {
  direncanakan: 'bg-purple-100',
  berlangsung: 'bg-blue-100',
  selesai: 'bg-green-100',
};

const aktivitasIconColor: Record<StatusAktivitas, string> = {
  direncanakan: 'text-purple-500',
  berlangsung: 'text-blue-500',
  selesai: 'text-green-500',
};

function formatLaporanDate(value?: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const kerjasamaStatusBadge: Record<StatusKerjasama, string> = {
  Aktif: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Akan Berakhir': 'border-amber-200 bg-amber-50 text-amber-700',
  Kadaluarsa: 'border-red-200 bg-red-50 text-red-700',
};

export default function DetailStoryModal({ story, onBack }: DetailStoryModalProps) {
  const [aktivitasList, setAktivitasList] = useState<Aktivitas[]>(story.aktivitas);
  const [pesanError, setPesanError] = useState<string | null>(null);
  const perpanjanganByDokumen = usePerpanjanganDisetujui(story.dokumenKerjasamaIds.join(','));

  useEffect(() => {
    if (!pesanError) return;
    const t = setTimeout(() => setPesanError(null), 4000);
    return () => clearTimeout(t);
  }, [pesanError]);

  const totalAktivitas = aktivitasList.length;
  const selesai = aktivitasList.filter((a) => a.status === 'selesai').length;
  const berlangsung = aktivitasList.filter((a) => a.status === 'berlangsung').length;
  const direncanakan = aktivitasList.filter((a) => a.status === 'direncanakan').length;

  const [showLaporanModal, setShowLaporanModal] = useState(false);
  const [showTambah, setShowTambah] = useState(false);
  const [laporanTerkirim, setLaporanTerkirim] = useState<LaporanPelaksanaanRecord[]>([]);
  const [laporanLoading, setLaporanLoading] = useState(false);

  // Key string (bukan array) supaya effect tidak jalan ulang hanya karena referensi array berubah.
  const laporanDokumenIdsKey = story.dokumenKerjasamaIds.join(',');
  useEffect(() => {
    // Ambil ulang hanya saat modal laporan tertutup (termasuk setelah ditutup, supaya
    // laporan yang baru dikirim langsung tampil) — bukan saat modal dibuka.
    if (showLaporanModal) return;
    if (!laporanDokumenIdsKey) {
      setLaporanTerkirim([]);
      return;
    }

    let isMounted = true;
    setLaporanLoading(true);
    getLaporanPelaksanaanByDokumenKerjasamaIds(laporanDokumenIdsKey.split(',').map(Number))
      .then((rows) => {
        if (isMounted) setLaporanTerkirim(rows);
      })
      .catch(() => {
        if (isMounted) setLaporanTerkirim([]);
      })
      .finally(() => {
        if (isMounted) setLaporanLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [laporanDokumenIdsKey, showLaporanModal]);

  const laporanData = story.dokumenKerjasamaIds[0]
    ? {
        namaMitra: story.namaMitra,
        noDokumen: story.noDokumen,
        jenis: story.jenis,
        ruangLingkup: story.ruangLingkup,
        dokumenKerjasamaId: story.dokumenKerjasamaIds[0],
      }
    : null;

  async function handleTambahAktivitas(data: Aktivitas, jenisAktivitas: string) {
    const dokumenId = story.dokumenKerjasamaIds[0];
    if (!dokumenId) {
      setPesanError('Aktivitas tidak bisa disimpan karena kerja sama ini tidak punya dokumen.');
      return;
    }

    try {
      const created = await createAktivitasForDokumenApi(dokumenId, {
        judul: data.judul,
        jenisAktivitas,
        tanggal: data.tanggal,
        peserta: data.peserta,
        deskripsi: data.deskripsi,
        picPolibatam: data.picPolibatam,
        picMitra: data.picMitra,
        status: data.status,
      });
      setAktivitasList((prev) => [{ ...data, id: String(created.id) }, ...prev]);
      setShowTambah(false);
    } catch (error) {
      setPesanError(error instanceof Error && error.message ? error.message : 'Gagal menyimpan aktivitas ke server.');
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[12px] font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Kembali ke Daftar
        </button>
      </div>

      {/* Partner Header Card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Name + Status */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            <h2 className="text-[17px] font-bold text-gray-900">{story.namaMitra}</h2>
            <p className="mt-0.5 text-[10px] text-gray-500">No. Dokumen: {story.noDokumen}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${statusDotMap[story.status]}`} />
            <span className={`text-[12px] font-semibold ${statusTextMap[story.status]}`}>{story.status}</span>
          </div>
        </div>

        {/* Info Row */}
        <div className="grid grid-cols-2 gap-4 border-t border-gray-100 px-6 py-4 md:grid-cols-4">
          <div>
            <p className="text-[10.5px] text-gray-500">Jenis Dokumen</p>
            <JenisBadges jenis={story.jenisList} warna={jenisBadgeMap} className="mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold" />
          </div>
          <div>
            <p className="text-[10.5px] text-gray-500">Kategori Mitra</p>
            <p className="mt-1 text-[12px] font-semibold text-gray-900">{story.kategoriMitra}</p>
          </div>
          <div>
            <p className="text-[10.5px] text-gray-500">Tanggal Mulai</p>
            <p className="mt-1 text-[12px] font-semibold text-gray-900">{story.tanggalMulai}</p>
          </div>
          <div>
            <p className="text-[10.5px] text-gray-500">Tanggal Berakhir</p>
            <p className="mt-1 text-[12px] font-semibold text-gray-900">{story.tanggalBerakhir}</p>
          </div>
        </div>

        {/* Mitra Info + Masa Berlaku */}
        <div className="grid grid-cols-1 gap-4 border-t border-gray-100 px-6 py-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-800">
              <span className="mr-1">📄</span> Informasi Mitra
            </p>
            <div className="space-y-1.5 text-[12px] text-gray-600">
              <p className="flex items-center gap-2">
                <MapPin size={13} className="text-gray-400" />
                {story.alamat}
              </p>
              <p className="flex items-center gap-2">
                <Mail size={13} className="text-gray-400" />
                {story.email}
              </p>
              <p className="flex items-center gap-2">
                <Phone size={13} className="text-gray-400" />
                {story.telepon}
              </p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-800">
              <span className="mr-1">📋</span> Status Masa Berlaku
            </p>
            <p className="mt-1 text-[10px] text-gray-500">Sisa Waktu:</p>
            <p className="mt-0.5 text-[17px] font-bold text-[#F28C00]">{story.sisaWaktu}</p>
          </div>
        </div>

        {/* Ruang Lingkup + Jurusan */}
        <div className="grid grid-cols-1 gap-4 border-t border-gray-100 px-6 py-4 md:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-800">Ruang Lingkup Kerjasama</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {story.ruangLingkup.length > 0 ? (
                story.ruangLingkup.map((r) => (
                  <span key={r} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-medium text-orange-700">
                    {r}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-gray-400">-</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-800">Jurusan Terlibat</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {story.jurusanTerlibat.length > 0 ? (
                story.jurusanTerlibat.map((j) => (
                  <span key={j} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-medium text-cyan-700">
                    {j}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-gray-400">-</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat icon={<ClipboardList size={18} className="text-gray-500" />} iconBg="bg-gray-100" label="Total Aktivitas" value={totalAktivitas} />
        <MiniStat icon={<CheckCircle2 size={18} className="text-green-500" />} iconBg="bg-green-100" label="Selesai" value={selesai} />
        <MiniStat icon={<Clock size={18} className="text-blue-500" />} iconBg="bg-blue-100" label="Berlangsung" value={berlangsung} />
        <MiniStat icon={<Calendar size={18} className="text-purple-500" />} iconBg="bg-purple-100" label="Direncanakan" value={direncanakan} />
      </div>

      {/* Story Kerja Sama: kartu tiap dokumen kerja sama + perpanjangannya (sama dengan admin) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13.5px] font-bold text-gray-900">
            Story Kerja Sama
            <span className="ml-2 text-[11px] font-medium text-gray-500">({story.dokumen.length} dokumen kerja sama)</span>
          </h3>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
            {(['Aktif', 'Akan Berakhir', 'Kadaluarsa'] as const).map((label) => (
              <span key={label} className={`rounded-full border px-2.5 py-1 ${kerjasamaStatusBadge[label]}`}>
                {story.rincianStatus[label]} {label}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5">
          {story.dokumen.map((d) => (
            <KartuDokumenKerjasama
              key={d.id}
              noDokumen={d.noDokumen}
              jenis={d.jenis}
              jenisList={d.jenisList}
              status={d.status}
              diajukanPada={d.diajukanPada}
              tanggalMulai={d.tanggalMulaiRaw}
              tanggalBerakhir={d.tanggalBerakhirRaw}
              unit={d.unit}
              ruangLingkup={d.ruangLingkup}
              perpanjangan={perpanjanganByDokumen.get(d.id) ?? []}
            />
          ))}
        </div>
      </div>

      {/* Story & Aktivitas */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[13.5px] font-bold text-gray-900">
            <span className="mr-1">📖</span> Timeline Aktivitas
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLaporanModal(true)}
              disabled={!laporanData}
              title={!laporanData ? 'Kerja sama ini tidak terhubung ke pengajuan manapun' : undefined}
              className="relative z-10 inline-flex items-center gap-1.5 rounded-xl border border-[#091222] px-4 py-2.5 text-[10px] font-semibold text-[#091222] shadow-sm transition hover:bg-[#091222]/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FileText size={14} />
              Laporan Pelaksanaan
            </button>
            <button
              type="button"
              onClick={() => setShowTambah((prev) => !prev)}
              className="relative z-10 inline-flex items-center gap-1.5 rounded-xl bg-[#091222] px-4 py-2.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-[#173B82] hover:shadow-md"
            >
              <Plus size={14} />
              Tambah Aktivitas
            </button>
          </div>
        </div>

        {showTambah && (
          <div className="mb-4">
            <TambahAktivitasForm onClose={() => setShowTambah(false)} onSave={handleTambahAktivitas} />
          </div>
        )}

        <div className="space-y-4">
          {aktivitasList.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-10 text-center text-[12px] text-gray-500">
              Belum ada aktivitas tercatat untuk kerjasama ini.
            </div>
          ) : (
            aktivitasList.map((a) => {
              const badge = aktivitasStatusBadge[a.status];
              return (
                <div
                  key={a.id}
                  className={`rounded-xl border bg-white p-5 shadow-sm ${
                    isAktivitasPerpanjangan(a.judul) ? 'border-blue-200 border-l-4 border-l-blue-500 bg-blue-50/40' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${aktivitasIconBg[a.status]}`}>
                      <ClipboardList size={18} className={aktivitasIconColor[a.status]} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-gray-900">
                          {a.judul}
                          {isAktivitasPerpanjangan(a.judul) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[9.5px] font-semibold text-white">
                              <RefreshCw size={10} />
                              Perpanjangan
                            </span>
                          )}
                        </p>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={11} />
                          {a.tanggal}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users size={11} />
                          {a.peserta} peserta
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] text-gray-600 leading-relaxed">{a.deskripsi}</p>
                      <div className="mt-2 space-y-0.5 text-[10px] text-gray-500">
                        <p>PIC Polibatam: {a.picPolibatam}</p>
                        {a.picMitra && <p>PIC Mitra: {a.picMitra}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Laporan Pelaksanaan Terkirim */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13.5px] font-bold text-gray-900">
            <span className="mr-1">📝</span> Laporan Pelaksanaan Terkirim
          </h3>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-600">
            {laporanTerkirim.length} laporan
          </span>
        </div>

        {laporanLoading && laporanTerkirim.length === 0 ? (
          <p className="text-[12px] text-gray-500">Memuat laporan...</p>
        ) : laporanTerkirim.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-10 text-center text-[12px] text-gray-500">
            Belum ada laporan pelaksanaan yang dikirim untuk kerja sama ini.
          </div>
        ) : (
          <div className="space-y-2.5">
            {laporanTerkirim.map((laporan) => (
              <div key={laporan.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-bold text-gray-900">{laporan.judulKerjasama || 'Laporan Pelaksanaan'}</p>
                    <p className="mt-0.5 text-[10px] text-gray-500">
                      Dikirim {formatLaporanDate(laporan.dikirimPada)}
                    </p>
                  </div>
                  {laporan.fileUrl && (
                    <a
                      href={laporan.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#091222] px-2.5 py-1.5 text-[10px] font-semibold text-[#091222] hover:bg-[#091222]/5"
                    >
                      <Download size={12} />
                      {laporan.fileNama || 'Unduh File'}
                    </a>
                  )}
                </div>
                {laporan.kegiatan && (
                  <p className="mt-2 text-[11px] text-gray-600 whitespace-pre-line">{laporan.kegiatan}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <LaporanPelaksanaanModal
        isOpen={showLaporanModal}
        onClose={() => setShowLaporanModal(false)}
        data={laporanData}
      />

      {pesanError && (
        <div className="fixed bottom-5 left-1/2 z-[95] -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] font-semibold text-red-700 shadow-lg">
          {pesanError}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number;
}) {
  return (
    <div className="stat-card flex items-center gap-3 p-3.5">
      <div>
        <p className="text-[10px] text-gray-500">{label}</p>
        <p className="mt-0.5 text-[17px] font-bold text-gray-900">{value}</p>
      </div>
      <div className={`ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
    </div>
  );
}

function TambahAktivitasForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: Aktivitas, jenisAktivitas: string) => void | Promise<void>;
}) {
  const [judul, setJudul] = useState('');
  const [jenisAktivitas, setJenisAktivitas] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [peserta, setPeserta] = useState('');
  const [status, setStatus] = useState<StatusAktivitas>('direncanakan');
  const [picPolibatam, setPicPolibatam] = useState('');
  const [picMitra, setPicMitra] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    if (!judul.trim()) {
      showNotice('Judul aktivitas wajib diisi.');
      return;
    }
    if (!jenisAktivitas) {
      showNotice('Jenis aktivitas wajib dipilih.');
      return;
    }
    if (!tanggal) {
      showNotice('Tanggal wajib diisi.');
      return;
    }
    if (!picPolibatam.trim()) {
      showNotice('PIC Polibatam wajib diisi.');
      return;
    }

    try {
      setIsSaving(true);
      await onSave(
        {
          id: `a-${Date.now()}`,
          judul: `${jenisAktivitas} - ${judul}`,
          // Kirim format ISO (YYYY-MM-DD) apa adanya — backend menolak format DD/MM/YYYY
          // dengan error "must be a valid date".
          tanggal,
          peserta: Number(peserta) || 0,
          deskripsi,
          picPolibatam,
          picMitra,
          status,
        },
        jenisAktivitas
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 space-y-5">
      <h3 className="text-[13.5px] font-bold text-gray-900">Tambah Aktivitas Baru</h3>

      {/* Row 1: Judul & Jenis */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">
            Judul Aktivitas <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Contoh: Penyusunan kurikulum bersama"
            className="input-field h-10 w-full px-3 text-[12px] text-gray-700 placeholder:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">
            Jenis Aktivitas <span className="text-red-500">*</span>
          </label>
          <select
            value={jenisAktivitas}
            onChange={(e) => setJenisAktivitas(e.target.value)}
            className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
          >
            <option value="">Pilih Jenis</option>
            <option value="Workshop">Workshop</option>
            <option value="Penelitian">Penelitian</option>
            <option value="Pengabdian Masyarakat">Pengabdian Masyarakat</option>
            <option value="Pelatihan">Pelatihan</option>
            <option value="Seminar">Seminar</option>
            <option value="Magang">Magang</option>
          </select>
        </div>
      </div>

      {/* Row 2: Tanggal, Jumlah Peserta, Status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">
            Tanggal <span className="text-red-500">*</span>
          </label>
          <InlineDatePicker value={tanggal} onChange={setTanggal} />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Jumlah Peserta</label>
          <input
            type="number"
            value={peserta}
            onChange={(e) => setPeserta(e.target.value)}
            placeholder="0"
            className="input-field h-10 w-full px-3 text-[12px] text-gray-700 placeholder:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusAktivitas)}
            className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
          >
            <option value="direncanakan">Direncanakan</option>
            <option value="berlangsung">Berlangsung</option>
            <option value="selesai">Selesai</option>
          </select>
        </div>
      </div>

      {/* Row 3: PIC */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">
            PIC Polibatam <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={picPolibatam}
            onChange={(e) => setPicPolibatam(e.target.value)}
            placeholder="Nama PIC dari Polibatam"
            className="input-field h-10 w-full px-3 text-[12px] text-gray-700 placeholder:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">PIC Mitra</label>
          <input
            type="text"
            value={picMitra}
            onChange={(e) => setPicMitra(e.target.value)}
            placeholder="Nama PIC dari mitra"
            className="input-field h-10 w-full px-3 text-[12px] text-gray-700 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Deskripsi */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Deskripsi</label>
        <textarea
          value={deskripsi}
          onChange={(e) => setDeskripsi(e.target.value)}
          rows={3}
          placeholder="Jelaskan detail aktivitas ini..."
          className="input-field w-full px-3 py-2 text-[12px] text-gray-700 resize-y placeholder:text-gray-400"
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="btn-primary px-5 py-2 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Menyimpan...' : 'Simpan Aktivitas'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

// Date-picker custom: sengaja tidak pakai <input type="date"> bawaan browser karena
// spinner/kalender nativenya sering "mulai" dari tanggal hari ini begitu disentuh,
// sehingga terasa seperti otomatis terisi tanggal sekarang. Di sini tidak ada tanggal
// yang terpilih sampai pengguna benar-benar klik salah satu tanggal di kalender.
function InlineDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (value ? new Date(`${value}T00:00:00`) : new Date()));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = viewDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const dayLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  function formatIso(day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function isSelectedDay(day: number): boolean {
    return (
      !!selectedDate &&
      selectedDate.getFullYear() === year &&
      selectedDate.getMonth() === month &&
      selectedDate.getDate() === day
    );
  }

  const displayText = selectedDate
    ? selectedDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Pilih tanggal';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`input-field flex h-10 w-full items-center justify-between gap-2 px-3 text-left text-[12px] ${
          selectedDate ? 'text-gray-700' : 'text-gray-400'
        }`}
      >
        {displayText}
        <Calendar size={14} className="flex-shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            >
              <ChevronLeft size={14} />
            </button>
            <p className="text-[11px] font-semibold capitalize text-gray-800">{monthLabel}</p>
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400">
            {dayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => {
                  onChange(formatIso(day));
                  setOpen(false);
                }}
                className={`h-7 w-7 rounded-md text-[11px] transition-colors ${
                  isSelectedDay(day) ? 'bg-[#173B82] font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
