'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import LaporanPelaksanaanModal from '@/components/LaporanPelaksanaanModal';
import {
  deleteLaporanPelaksanaan,
  getLaporanPelaksanaanByPengajuanIds,
  type LaporanPelaksanaanRecord,
} from '@/services/laporanPelaksanaanService';
import {
  getPengajuanData,
  refreshPengajuanDataFromApi,
  type PengajuanItem,
} from '@/services/adminPengajuanService';
import {
  createAktivitasApi,
  deleteAktivitasApi,
  getHiddenStoryIds,
  refreshAktivitasDataFromApi,
  updateAktivitasApi,
} from '@/services/adminStoryAktivitasService';
import {
  findStoryAktivitasGroupByRouteParam,
  type StoryAktivitasTimelineItem,
} from '@/services/storyAktivitasGrouping';

type AktivitasStatus = 'direncanakan' | 'berlangsung' | 'selesai';

interface AktivitasFormState {
  judul: string;
  jenisAktivitas: string;
  tanggal: string;
  peserta: number;
  status: AktivitasStatus;
  picPolibatam: string;
  picMitra: string;
  deskripsi: string;
  sourcePengajuanId: number;
}

const jenisAktivitasOptions = [
  'Workshop',
  'Seminar',
  'Penelitian',
  'Pengabdian Masyarakat',
  'Magang',
  'Pelatihan',
  'Sertifikasi',
  'Pertukaran Mahasiswa',
  'Pertukaran Dosen',
  'Lainnya',
];

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/').map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: string): string {
  const parsed = parseDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function toDateInputValue(value?: string): string {
  if (!value) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/');
    return `${year}-${month}-${day}`;
  }

  const parsed = parseDate(value);
  if (!parsed) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMasaBerlaku(value?: string): string {
  const endDate = parseDate(value);
  if (!endDate) {
    return '-';
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);

  if (diffDays < 0) {
    return 'Kadaluarsa';
  }

  if (diffDays === 0) {
    return 'Hari ini';
  }

  const months = Math.floor(diffDays / 30);
  const days = diffDays % 30;

  if (months > 0) {
    return days > 0 ? `${months} bulan ${days} hari` : `${months} bulan`;
  }

  return `${diffDays} hari`;
}

function getKerjasamaStatus(tanggalBerakhir?: string): 'Aktif' | 'Akan Berakhir' | 'Kadaluarsa' {
  const endDate = parseDate(tanggalBerakhir);
  if (!endDate) {
    return 'Aktif';
  }

  const diffDays = Math.ceil((endDate.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) {
    return 'Kadaluarsa';
  }

  if (diffDays <= 120) {
    return 'Akan Berakhir';
  }

  return 'Aktif';
}

function statusClass(status: AktivitasStatus): string {
  if (status === 'selesai') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  if (status === 'berlangsung') {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }

  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function statusDot(status: AktivitasStatus): string {
  if (status === 'selesai') {
    return 'bg-emerald-500';
  }

  if (status === 'berlangsung') {
    return 'bg-blue-500';
  }

  return 'bg-amber-500';
}

function emptyForm(primaryPengajuanId: number): AktivitasFormState {
  return {
    judul: '',
    jenisAktivitas: '',
    tanggal: '',
    peserta: 0,
    status: 'direncanakan',
    picPolibatam: '',
    picMitra: '',
    deskripsi: '',
    sourcePengajuanId: primaryPengajuanId,
  };
}

export default function DetailStoryAktivitasPage() {
  const params = useParams();
  const router = useRouter();
  const routeId = String(params.id || '');

  const [sourceData, setSourceData] = useState<PengajuanItem[]>([]);
  const [hiddenStoryIds, setHiddenStoryIds] = useState<number[]>([]);
  const [aktivitasRevision, setAktivitasRevision] = useState(0);
  const [showLaporanModal, setShowLaporanModal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRef, setEditingRef] = useState<{ sourcePengajuanId: number; activityId: number } | null>(null);
  const [activeLaporanKey, setActiveLaporanKey] = useState<string>('default');
  const [laporanDiterima, setLaporanDiterima] = useState<LaporanPelaksanaanRecord[]>([]);
  const [laporanLoading, setLaporanLoading] = useState(false);
  const [deletingLaporanId, setDeletingLaporanId] = useState<number | null>(null);

  const storyGroup = useMemo(
    () => findStoryAktivitasGroupByRouteParam(sourceData, routeId, hiddenStoryIds),
    [sourceData, routeId, hiddenStoryIds, aktivitasRevision]
  );

  const primaryPengajuanId = storyGroup?.pengajuan[0]?.id ?? 0;

  const [formState, setFormState] = useState<AktivitasFormState>(emptyForm(primaryPengajuanId));

  useEffect(() => {
    let isMounted = true;

    const syncData = () => {
      if (!isMounted) {
        return;
      }
      setSourceData(getPengajuanData());
    };

    const syncStoryState = () => {
      if (!isMounted) {
        return;
      }
      setHiddenStoryIds(getHiddenStoryIds());
      setAktivitasRevision((r) => r + 1);
    };

    void Promise.all([
      refreshPengajuanDataFromApi(true),
      refreshAktivitasDataFromApi(),
    ])
      .catch(() => {
        // Keep UI usable with cached data if API aktivitas gagal.
      })
      .finally(() => {
        syncData();
        syncStoryState();
      });

    window.addEventListener('pengajuan-data-updated', syncData);
    window.addEventListener('story-data-updated', syncStoryState);

    return () => {
      isMounted = false;
      window.removeEventListener('pengajuan-data-updated', syncData);
      window.removeEventListener('story-data-updated', syncStoryState);
    };
  }, []);

  // Ambil laporan pelaksanaan yang dikirim internal/eksternal/admin untuk pengajuan-pengajuan di story ini.
  const storyPengajuanIds = storyGroup?.pengajuan.map((p) => p.id).join(',') ?? '';
  useEffect(() => {
    if (!storyPengajuanIds) {
      setLaporanDiterima([]);
      return;
    }

    let isMounted = true;
    setLaporanLoading(true);
    getLaporanPelaksanaanByPengajuanIds(storyPengajuanIds.split(',').map(Number))
      .then((rows) => {
        if (isMounted) setLaporanDiterima(rows);
      })
      .catch(() => {
        if (isMounted) setLaporanDiterima([]);
      })
      .finally(() => {
        if (isMounted) setLaporanLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [storyPengajuanIds, showLaporanModal]);

  useEffect(() => {
    if (!showForm || !storyGroup) {
      return;
    }

    setFormState((prev) => {
      if (prev.sourcePengajuanId > 0) {
        return prev;
      }

      return {
        ...prev,
        sourcePengajuanId: storyGroup.pengajuan[0]?.id ?? 0,
      };
    });
  }, [showForm, storyGroup]);

  const timelineItems = useMemo(() => {
    if (!storyGroup) {
      return [];
    }

    return [...storyGroup.aktivitas].sort(
      (left, right) => (parseDate(right.tanggal)?.getTime() ?? 0) - (parseDate(left.tanggal)?.getTime() ?? 0)
    );
  }, [storyGroup]);

  const stats = useMemo(() => {
    const total = timelineItems.length;
    const selesai = timelineItems.filter((item) => item.status === 'selesai').length;
    const berlangsung = timelineItems.filter((item) => item.status === 'berlangsung').length;
    const direncanakan = timelineItems.filter((item) => item.status === 'direncanakan').length;

    return { total, selesai, berlangsung, direncanakan };
  }, [timelineItems]);

  const laporanData = useMemo(() => {
    if (!storyGroup) {
      return null;
    }

    return {
      namaMitra: storyGroup.namaMitra,
      noDokumen: storyGroup.nomorDokumen,
      jenis: storyGroup.jenis,
      ruangLingkup: storyGroup.ruangLingkup,
      pengajuanId: storyGroup.pengajuan[0]?.id,
      aktivitasKey: activeLaporanKey,
    };
  }, [storyGroup, activeLaporanKey]);

  const handleCreate = () => {
    if (!storyGroup) {
      return;
    }

    setEditingRef(null);
    setFormState(emptyForm(storyGroup.pengajuan[0]?.id ?? 0));
    setActiveLaporanKey(`new-${Date.now()}`);
    setShowForm(true);
  };

  const handleEdit = (item: StoryAktivitasTimelineItem) => {
    setEditingRef({
      sourcePengajuanId: item.sourcePengajuanId,
      activityId: item.id,
    });

    setFormState({
      judul: item.judul,
      jenisAktivitas: item.jenisAktivitas,
      tanggal: toDateInputValue(item.tanggal),
      peserta: item.peserta,
      status: item.status,
      picPolibatam: item.picPolibatam,
      picMitra: item.picMitra,
      deskripsi: item.deskripsi,
      sourcePengajuanId: item.sourcePengajuanId,
    });

    setActiveLaporanKey(String(item.id));
    setShowForm(true);
  };

  const handleDelete = async (item: StoryAktivitasTimelineItem) => {
    const confirmed = window.confirm('Hapus aktivitas ini dari timeline?');
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      await deleteAktivitasApi(item.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Gagal menghapus aktivitas.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLaporan = async (laporan: LaporanPelaksanaanRecord) => {
    const confirmed = window.confirm('Hapus laporan pelaksanaan ini?');
    if (!confirmed) {
      return;
    }

    setDeletingLaporanId(laporan.id);
    try {
      await deleteLaporanPelaksanaan(laporan.id);
      setLaporanDiterima((prev) => prev.filter((item) => item.id !== laporan.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Gagal menghapus laporan pelaksanaan.');
    } finally {
      setDeletingLaporanId(null);
    }
  };

  const handleSubmit = async () => {
    if (!storyGroup) {
      return;
    }

    if (!formState.judul.trim() || !formState.jenisAktivitas.trim() || !formState.tanggal.trim()) {
      window.alert('Judul, jenis aktivitas, dan tanggal wajib diisi.');
      return;
    }

    const sourcePengajuanId = formState.sourcePengajuanId || (storyGroup.pengajuan[0]?.id ?? 0);
    if (!sourcePengajuanId) {
      window.alert('Pengajuan sumber aktivitas tidak valid.');
      return;
    }

    const payload = {
      judul: formState.judul,
      jenisAktivitas: formState.jenisAktivitas,
      tanggal: formState.tanggal,
      peserta: formState.peserta,
      status: formState.status,
      picPolibatam: formState.picPolibatam,
      picMitra: formState.picMitra,
      deskripsi: formState.deskripsi,
    };

    setIsSubmitting(true);
    try {
      if (editingRef) {
        await updateAktivitasApi(editingRef.activityId, sourcePengajuanId, payload);
      } else {
        await createAktivitasApi(sourcePengajuanId, payload);
      }

      setShowForm(false);
      setEditingRef(null);
      setFormState(emptyForm(storyGroup.pengajuan[0]?.id ?? 0));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Gagal menyimpan aktivitas.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!storyGroup) {
    return (
      <div className="space-y-5">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Kembali
        </button>

        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-[12px] text-slate-500">
          Story aktivitas tidak ditemukan atau sudah disembunyikan.
        </div>
      </div>
    );
  }

  const statusKerjasama = getKerjasamaStatus(storyGroup.pengajuan[0]?.tanggalBerakhir);

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-xl border border-slate-800 bg-[radial-gradient(circle_at_top_right,_#2e5ca1,_#091222_65%)] p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.back()}
              className="mb-3 inline-flex items-center gap-2 rounded-lg border border-blue-200/40 bg-blue-950/20 px-3 py-1.5 text-[12px] font-medium text-blue-50 transition hover:bg-blue-900/35"
            >
              <ArrowLeft size={15} />
              Kembali
            </button>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200">Story Kerja Sama</p>
            <h1 className="mt-1.5 text-[17px] font-bold">{storyGroup.namaMitra}</h1>
            <p className="mt-1.5 text-[12px] text-blue-100">
              {storyGroup.totalPengajuan} pengajuan digabung menjadi satu timeline aktivitas.
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-blue-300/30 bg-blue-950/25 px-4 py-3 text-[12px]">
            <p>
              Status: <span className="font-semibold">{statusKerjasama}</span>
            </p>
            <p>
              Masa berlaku: <span className="font-semibold">{formatMasaBerlaku(storyGroup.pengajuan[0]?.tanggalBerakhir)}</span>
            </p>
            <p>
              Dokumen acuan: <span className="font-semibold">{storyGroup.nomorDokumen}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[12px] text-slate-500">Total Aktivitas</p>
          <p className="mt-0.5 text-[17px] font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[12px] text-slate-500">Selesai</p>
          <p className="mt-0.5 text-[17px] font-bold text-emerald-700">{stats.selesai}</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[12px] text-slate-500">Berlangsung</p>
          <p className="mt-0.5 text-[17px] font-bold text-blue-700">{stats.berlangsung}</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[12px] text-slate-500">Direncanakan</p>
          <p className="mt-0.5 text-[17px] font-bold text-amber-700">{stats.direncanakan}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold text-slate-900">Story Kerja Sama</h2>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {storyGroup.pengajuan.map((pengajuan) => (
            <article key={pengajuan.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{pengajuan.nomorPengajuan}</p>
                  <h3 className="mt-1 text-[12px] font-bold text-slate-900">{pengajuan.judulPengajuan}</h3>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  {pengajuan.jenisDokumen}
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-[10px] text-slate-600">
                <p className="inline-flex items-center gap-1.5">
                  <Calendar size={12} className="text-slate-400" />
                  Diajukan: {formatDate(pengajuan.diajukanPada)}
                </p>
                <p className="inline-flex items-center gap-1.5">
                  <Clock3 size={12} className="text-slate-400" />
                  Berlaku: {formatDate(pengajuan.tanggalMulai)} - {formatDate(pengajuan.tanggalBerakhir)}
                </p>
                {pengajuan.namaUnitProdi && (
                  <p className="inline-flex items-center gap-1.5">
                    <Users size={12} className="text-slate-400" />
                    Unit/Jurusan: {pengajuan.namaUnitProdi}
                  </p>
                )}
                {pengajuan.mitraAlamat && (
                  <p className="inline-flex items-center gap-1.5">
                    <MapPin size={12} className="text-slate-400" />
                    Alamat mitra: {pengajuan.mitraAlamat}
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {pengajuan.ruangLingkup.map((item) => (
                  <span key={`${pengajuan.id}-${item}`} className="rounded-md bg-blue-50 px-2.5 py-1 text-[10.5px] font-medium text-blue-700">
                    {item}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">Laporan Pelaksanaan Diterima</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Laporan yang dikirim oleh internal/eksternal (atau admin) untuk kerja sama ini.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            {laporanDiterima.length} laporan
          </span>
        </div>

        {laporanLoading ? (
          <p className="text-[12px] text-slate-500">Memuat laporan...</p>
        ) : laporanDiterima.length === 0 ? (
          <p className="text-[12px] text-slate-500">Belum ada laporan pelaksanaan yang diterima untuk kerja sama ini.</p>
        ) : (
          <div className="space-y-2.5">
            {laporanDiterima.map((laporan) => (
              <article key={laporan.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-[12px] font-bold text-slate-900">
                      {laporan.judulKerjasama || 'Laporan Pelaksanaan'}
                    </h3>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Dikirim oleh {laporan.dikirimOlehNama || 'Pengguna'}
                      {laporan.dikirimOlehRole ? ` (${laporan.dikirimOlehRole})` : ''} · {formatDate(laporan.dikirimPada)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {laporan.fileUrl && (
                      <a
                        href={laporan.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E376C] px-2.5 py-1.5 text-[10px] font-semibold text-[#1E376C] hover:bg-[#EEF2FF]"
                      >
                        <Download size={12} />
                        {laporan.fileNama || 'Unduh File'}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteLaporan(laporan)}
                      disabled={deletingLaporanId === laporan.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[10px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Hapus laporan"
                    >
                      <Trash2 size={12} />
                      {deletingLaporanId === laporan.id ? 'Menghapus...' : 'Hapus'}
                    </button>
                  </div>
                </div>

                {laporan.kegiatan && (
                  <p className="mt-2 text-[11px] text-slate-600 whitespace-pre-line">{laporan.kegiatan}</p>
                )}

                {laporan.hasil && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Hasil Pelaksanaan</p>
                    <p className="mt-0.5 text-[11px] text-slate-700 whitespace-pre-line">{laporan.hasil}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold text-slate-900">Timeline Aktivitas Gabungan</h2>
          <button
            onClick={handleCreate}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0e1d34] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#183053]"
          >
            <Plus size={14} />
            Tambah Aktivitas
          </button>
        </div>

        {showForm && (
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[12px] font-bold text-slate-900">
                {editingRef ? 'Edit Aktivitas' : 'Tambah Aktivitas Baru'}
              </h3>
              <button
                onClick={() => setShowLaporanModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0e1d34] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#183053]"
              >
                <FileText size={14} />
                Laporan Pelaksanaan
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Judul Aktivitas</label>
                <input
                  value={formState.judul}
                  onChange={(event) => setFormState((prev) => ({ ...prev, judul: event.target.value }))}
                  type="text"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Jenis Aktivitas</label>
                <div className="relative">
                  <select
                    value={formState.jenisAktivitas}
                    onChange={(event) => setFormState((prev) => ({ ...prev, jenisAktivitas: event.target.value }))}
                    className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-[12px] text-slate-800 outline-none focus:border-slate-500"
                  >
                    <option value="">Pilih jenis aktivitas</option>
                    {jenisAktivitasOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tanggal</label>
                <input
                  value={formState.tanggal}
                  onChange={(event) => setFormState((prev) => ({ ...prev, tanggal: event.target.value }))}
                  type="date"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Jumlah Peserta</label>
                <input
                  value={formState.peserta}
                  onChange={(event) => setFormState((prev) => ({ ...prev, peserta: Number(event.target.value) || 0 }))}
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Status</label>
                <div className="relative">
                  <select
                    value={formState.status}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        status: event.target.value as AktivitasStatus,
                      }))
                    }
                    className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-[12px] text-slate-800 outline-none focus:border-slate-500"
                  >
                    <option value="direncanakan">Direncanakan</option>
                    <option value="berlangsung">Berlangsung</option>
                    <option value="selesai">Selesai</option>
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sumber Pengajuan</label>
                <div className="relative">
                  <select
                    value={formState.sourcePengajuanId}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        sourcePengajuanId: Number(event.target.value),
                      }))
                    }
                    disabled={editingRef !== null}
                    className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-[12px] text-slate-800 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {storyGroup.pengajuan.map((pengajuan) => (
                      <option key={pengajuan.id} value={pengajuan.id}>
                        {pengajuan.nomorPengajuan}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">PIC Polibatam</label>
                <input
                  value={formState.picPolibatam}
                  onChange={(event) => setFormState((prev) => ({ ...prev, picPolibatam: event.target.value }))}
                  type="text"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">PIC Mitra</label>
                <input
                  value={formState.picMitra}
                  onChange={(event) => setFormState((prev) => ({ ...prev, picMitra: event.target.value }))}
                  type="text"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Deskripsi</label>
              <textarea
                value={formState.deskripsi}
                onChange={(event) => setFormState((prev) => ({ ...prev, deskripsi: event.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-500"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-lg bg-[#0e1d34] px-4 py-2 text-[12px] font-medium text-white hover:bg-[#183053]"
              >
                {isSubmitting ? 'Menyimpan...' : editingRef ? 'Simpan Perubahan' : 'Simpan Aktivitas'}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingRef(null);
                  setFormState(emptyForm(storyGroup.pengajuan[0]?.id ?? 0));
                }}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-100"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {timelineItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-[12px] text-slate-500">
            Belum ada aktivitas. Tambahkan aktivitas pertama untuk mitra ini.
          </div>
        ) : (
          <ol className="relative ml-3 border-l border-slate-200">
            {timelineItems.map((item, index) => (
              <li key={`${item.sourcePengajuanId}-${item.id}-${index}`} className="mb-5 ml-6">
                <span className="absolute -left-[0.45rem] mt-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm">
                  <span className={`block h-full w-full rounded-full ${statusDot(item.status)}`} />
                </span>

                <article className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-bold text-slate-900">{item.judul}</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {formatDate(item.tanggal)} • {item.jenisAktivitas} • {item.peserta} peserta
                      </p>
                      <p className="mt-1 text-[10.5px] text-slate-400">
                        Sumber: {item.sourceNomorPengajuan} • {item.sourceJudulPengajuan}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                      <button
                        onClick={() => handleEdit(item)}
                        disabled={isSubmitting}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
                        title="Edit aktivitas"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={isSubmitting}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                        title="Hapus aktivitas"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {item.deskripsi && <p className="mt-2 text-[12px] text-slate-600">{item.deskripsi}</p>}

                  <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-slate-500">
                    {item.picPolibatam && (
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-slate-400" />
                        PIC Polibatam: {item.picPolibatam}
                      </span>
                    )}
                    {item.picMitra && (
                      <span className="inline-flex items-center gap-1.5">
                        <Activity size={12} className="text-slate-400" />
                        PIC Mitra: {item.picMitra}
                      </span>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>

      <LaporanPelaksanaanModal
        isOpen={showLaporanModal}
        onClose={() => setShowLaporanModal(false)}
        data={laporanData}
      />
    </div>
  );
}
