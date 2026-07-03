'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ClipboardList,
  Download,
  FileText,
  Mail,
  MapPin,
  Phone,
  Users,
} from 'lucide-react';
import type { KerjasamaStory, Aktivitas } from './page';
import LaporanPelaksanaanModal from '@/components/LaporanPelaksanaanModal';
import { getLaporanPelaksanaanByPengajuanIds, type LaporanPelaksanaanRecord } from '@/services/laporanPelaksanaanService';

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

export default function DetailStoryModal({ story, onBack }: DetailStoryModalProps) {
  const totalAktivitas = story.aktivitas.length;
  const selesai = story.aktivitas.filter((a) => a.status === 'selesai').length;
  const berlangsung = story.aktivitas.filter((a) => a.status === 'berlangsung').length;
  const direncanakan = story.aktivitas.filter((a) => a.status === 'direncanakan').length;

  const [showLaporanModal, setShowLaporanModal] = useState(false);
  const [laporanTerkirim, setLaporanTerkirim] = useState<LaporanPelaksanaanRecord[]>([]);
  const [laporanLoading, setLaporanLoading] = useState(false);

  useEffect(() => {
    if (!story.pengajuanId) {
      setLaporanTerkirim([]);
      return;
    }

    let isMounted = true;
    setLaporanLoading(true);
    getLaporanPelaksanaanByPengajuanIds([story.pengajuanId])
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
  }, [story.pengajuanId, showLaporanModal]);

  const laporanData = story.pengajuanId
    ? {
        namaMitra: story.namaMitra,
        noDokumen: story.noDokumen,
        jenis: story.jenis,
        ruangLingkup: story.ruangLingkup,
        pengajuanId: story.pengajuanId,
      }
    : null;

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
            <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${jenisBadgeMap[story.jenis]}`}>
              {story.jenis}
            </span>
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

      {/* Story & Aktivitas */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[13.5px] font-bold text-gray-900">
            <span className="mr-1">📖</span> Story Kerjasama & Aktivitas
          </h3>
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
        </div>

        <div className="space-y-4">
          {story.aktivitas.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-10 text-center text-[12px] text-gray-500">
              Belum ada aktivitas tercatat untuk kerjasama ini.
            </div>
          ) : (
            story.aktivitas.map((a) => {
              const badge = aktivitasStatusBadge[a.status];
              return (
                <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${aktivitasIconBg[a.status]}`}>
                      <ClipboardList size={18} className={aktivitasIconColor[a.status]} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] font-bold text-gray-900">{a.judul}</p>
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

        {laporanLoading ? (
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
