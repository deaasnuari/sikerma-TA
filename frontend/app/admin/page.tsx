'use client';

import { hitungJenisDokumen, type RingkasanJenis } from '@/lib/hitungJenisDokumen';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  TrendingUp,
  Handshake,
  Building2,
  Globe,
  BarChart3,
  Zap,
  FileText,
  Upload,
  Trash2,
  GripVertical,
  SlidersHorizontal,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  getDashboardStats,
  getQuickActions,
} from '@/services/adminService';
import { useAuth } from '@/context/AuthContext';
import { useNotifikasi } from '@/hooks/useNotifikasi';
import { fetchRekapDokumenFromApi } from '@/services/dokumenKerjasamaApiService';
import { bulanOptions, getRekapStats, semuaBulanLabel } from '@/services/adminRekapDataService';
import { countKerjasamaBaru, refreshPengajuanDataFromApi, type PengajuanItem } from '@/services/adminPengajuanService';
import { apiRequest } from '@/lib/api';
import type { AdminNotification } from '@/types/admin';
import {
  CAROUSEL_TAMPILAN_DEFAULT,
  CAROUSEL_ZOOM_MAX,
  CAROUSEL_ZOOM_MIN,
  carouselImageStyle,
  deleteCarouselImage,
  getCarouselImages,
  getCarouselTampilan,
  updateCarouselSortOrder,
  updateCarouselTampilan,
  uploadCarouselImage,
  validateCarouselFile,
  CAROUSEL_RULES_TEXT,
  type CarouselImageItem,
  type CarouselTampilan,
} from '@/services/carouselService';

type ToastState = {
  type: 'success' | 'error';
  message: string;
};

const AdminDashboardCharts = dynamic(() => import('./components/AdminDashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="card p-6 text-xs text-gray-500">Memuat statistik...</div>
  ),
});

const statIcons = {
  handshake: Handshake,
  building: Building2,
  globe: Globe,
  chart: BarChart3,
  zap: Zap,
  file: FileText,
  users: Users,
};

const actionIcons = {
  handshake: Handshake,
  users: Users,
  trending: TrendingUp,
};

function getMitraStatHref(label: string): string | null {
  if (label === 'Dalam Negeri') {
    return '/admin/master_mitra?wilayah=dalam-negeri';
  }

  if (label === 'Luar Negeri') {
    return '/admin/master_mitra?wilayah=luar-negeri';
  }

  if (label === 'Mitra Aktif') {
    return '/admin/master_mitra?status=aktif';
  }

  if (label === 'Total Mitra') {
    return '/admin/master_mitra';
  }

  return null;
}

export default function AdminDashboard() {
  // Notifikasi dari server (lintas perangkat) + konfirmasi aksi admin di browser ini, sama dengan lonceng di navbar.
  const { user: pengguna } = useAuth();
  const { notifications, tandaiDibaca } = useNotifikasi(pengguna?.role);
  const [carouselImages, setCarouselImages] = useState<CarouselImageItem[]>([]);
  const [showCarouselModal, setShowCarouselModal] = useState(false);
  const [carouselTitle, setCarouselTitle] = useState('');
  const [isUploadingCarousel, setIsUploadingCarousel] = useState(false);
  const [carouselError, setCarouselError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<number | null>(null);
  // Ukuran kartu pratinjau di modal Kelola Carousel; pilihan diingat per browser.
  // Lebar kartu (px); tinggi gambar mengikuti (rasio 16:10). Bisa ditarik lewat pegangan sudut kartu
  // seperti memperbesar gambar di Word, atau lewat slider.
  const CAROUSEL_MIN_WIDTH = 120;
  const CAROUSEL_MAX_WIDTH = 800;
  const [carouselWidth, setCarouselWidth] = useState(260);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('carouselPreviewWidth'));
      if (saved >= CAROUSEL_MIN_WIDTH && saved <= CAROUSEL_MAX_WIDTH) setCarouselWidth(saved);
    } catch {}
  }, []);
  const changeCarouselWidth = (width: number) => {
    const clamped = Math.min(CAROUSEL_MAX_WIDTH, Math.max(CAROUSEL_MIN_WIDTH, Math.round(width)));
    setCarouselWidth(clamped);
    try { localStorage.setItem('carouselPreviewWidth', String(clamped)); } catch {}
  };
  const startResizeCarousel = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = carouselWidth;
    const onMove = (e: PointerEvent) => changeCarouselWidth(startWidth + (e.clientX - startX));
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };
  const dragIndexRef = useRef<number | null>(null);
  const router = useRouter();
  const [dashboardStats, setDashboardStats] = useState(getDashboardStats());
  const quickActions = getQuickActions();
  // Statistik Kerjasama — sumber data sama persis dengan landing page (endpoint publik).
  const [publicStats, setPublicStats] = useState({
    total: 0,
    kategori: [] as { label: string; value: number }[],
    dalam_negeri: 0,
    luar_negeri: 0,
    dudi_nasional: 0,
    dudi_internasional: 0,
    instansi_nasional: 0,
    instansi_internasional: 0,
  });
  const [jenisDistribution, setJenisDistribution] = useState<RingkasanJenis>({ MoU: 0, MoA: 0, IA: 0, total: 0, jumlahDokumen: 0, gabungan: 0 });
  const [topRuangLingkup, setTopRuangLingkup] = useState<[string, number][]>([]);
  // "Kerjasama Baru" — supaya admin juga bisa lihat jumlah kerjasama baru per bulan,
  // sama seperti KPI "Kerjasama Baru" di dashboard Pimpinan, tapi dengan filter bulan.
  const [pengajuanItems, setPengajuanItems] = useState<PengajuanItem[]>([]);
  const [filterBulanBaru, setFilterBulanBaru] = useState(semuaBulanLabel);
  const currentYear = new Date().getFullYear();
  const kerjasamaBaruCount = useMemo(() => {
    return countKerjasamaBaru(pengajuanItems, currentYear, filterBulanBaru);
  }, [pengajuanItems, filterBulanBaru, currentYear]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CarouselImageItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    getCarouselImages()
      .then((items) => setCarouselImages(items))
      .catch(() => setCarouselImages([]));
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadKerjasamaStats = async () => {
      try {
        // Pakai sumber & status yang sama dengan halaman Rekap Data (status_siklus
        // dari database), BUKAN status_kerjasama.status milik halaman monitoring
        // yang dihitung ulang dari tanggal_berakhir — supaya "Total Kerjasama
        // Aktif/Tidak Aktif" di sini selalu sama dengan kartu "Aktif"/"Kadaluarsa"
        // di Rekap Data. forceRefresh: true supaya tidak kena cache 60 detik
        // milik fetchRekapDokumenFromApi — kalau baru saja ada dokumen dihapus
        // di Rekap Data, dashboard harus langsung baca angka terbaru juga.
        const [pengajuanData, rekapItems] = await Promise.all([
          refreshPengajuanDataFromApi(),
          fetchRekapDokumenFromApi({ forceRefresh: true }),
        ]);

        if (!mounted) return;

        setPengajuanItems(pengajuanData);

        const rekapStats = getRekapStats(rekapItems);
        setDashboardStats((prev) =>
          prev.map((stat) => {
            if (stat.label === 'Total Kerjasama Aktif') {
              return { ...stat, value: String(rekapStats.totalAktif + rekapStats.totalAkanBerakhir) };
            }
            if (stat.label === 'Total Kerjasama Tidak Aktif') {
              return { ...stat, value: String(rekapStats.totalKadaluarsa) };
            }
            return stat;
          })
        );

      } catch {
        // Tetap tampilkan nilai default jika API belum tersedia.
      }
    };

    loadKerjasamaStats();

    return () => {
      mounted = false;
    };
  }, []);

  // Statistik "Jenis Mitra & Wilayah" — beda dari endpoint publik landing page.
  // Endpoint ini baca langsung dari Data Kemitraan (master_mitra), apa adanya
  // (tidak dedup nama) — dipakai juga untuk kartu "Dalam Negeri"/"Luar
  // Negeri"/"Total Mitra" di atas supaya semua kartu konsisten & ikut turun
  // begitu ada mitra yang dihapus di Data Kemitraan.
  useEffect(() => {
    let mounted = true;

    type KerjasamaRow = { id: number; nama: string; bidang: string; jenis: string; jenis_list?: string[]; unit: string; wilayah: string };

    apiRequest<{ success: boolean; data: typeof publicStats }>('/dokumen-kerjasama/stats/mitra')
      .then((res) => {
        if (!mounted || !res.data) return;

        setPublicStats(res.data);

        const { total: totalMitra, dalam_negeri: domesticCount, luar_negeri: foreignCount } = res.data;
        setDashboardStats((prev) =>
          prev.map((stat) => {
            if (stat.label === 'Dalam Negeri') {
              return { ...stat, value: String(domesticCount) };
            }

            if (stat.label === 'Luar Negeri') {
              return { ...stat, value: String(foreignCount) };
            }

            if (stat.label === 'Total Mitra') {
              return { ...stat, value: String(totalMitra) };
            }

            return stat;
          })
        );
      })
      .catch(() => {});

    apiRequest<{ success: boolean; data: { data: KerjasamaRow[]; total: number } }>('/public/kerjasama')
      .then((res) => {
        if (!mounted) return;
        const rows = res.data?.data;
        if (!Array.isArray(rows)) return;

        // Komposisi Dokumen dihitung per jenis: satu data yang memuat MoU + MoA menambah MoU dan MoA masing-masing.
        setJenisDistribution(hitungJenisDokumen(rows.map((r) => ({ jenis: r.jenis, jenisList: r.jenis_list }))));

        const scopeCounts: Record<string, number> = {};
        rows.forEach((r) => {
          if (!r.bidang || r.bidang === '-') return;
          r.bidang.split(',').forEach((b) => {
            const name = b.trim();
            if (name && name !== '-') scopeCounts[name] = (scopeCounts[name] || 0) + 1;
          });
        });
        setTopRuangLingkup(Object.entries(scopeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5));
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const handleOpenNotification = (notification: AdminNotification) => {
    tandaiDibaca(notification);
    router.push(notification.href || '/admin/notifikasi');
  };

  const refreshCarouselImages = async () => {
    const items = await getCarouselImages();
    setCarouselImages(items);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!deleteTarget) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        setDeleteTarget(null);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [deleteTarget, isDeleting]);

  const handleUploadCarousel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    event.target.value = '';
    setCarouselError(null);

    // Periksa aturan ukuran/format dulu; kalau tidak lolos, tampilkan pesan dan jangan buka editor.
    const problem = await validateCarouselFile(file);
    if (problem) {
      setCarouselError(problem);
      setToast({ type: 'error', message: problem });
      return;
    }

    // Foto belum diupload: atur dulu ukuran/posisinya di editor, lalu klik Upload di sana.
    closeTampilanEditor();
    setPendingUpload({ file, previewUrl: URL.createObjectURL(file) });
    setTampilanDraft(CAROUSEL_TAMPILAN_DEFAULT);
  };

  const handleDeleteCarousel = (image: CarouselImageItem) => {
    setDeleteTarget(image);
  };

  // Editor tampilan foto (zoom + geser) untuk satu foto carousel.
  const [tampilanTarget, setTampilanTarget] = useState<CarouselImageItem | null>(null);
  const [tampilanDraft, setTampilanDraft] = useState<CarouselTampilan>(CAROUSEL_TAMPILAN_DEFAULT);
  const [pendingUpload, setPendingUpload] = useState<{ file: File; previewUrl: string } | null>(null);
  const [isSavingTampilan, setIsSavingTampilan] = useState(false);
  const tampilanFrameRef = useRef<HTMLDivElement>(null);

  const closeTampilanEditor = () => {
    setTampilanTarget(null);
    setPendingUpload((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const openTampilanEditor = (image: CarouselImageItem) => {
    setTampilanTarget(image);
    setTampilanDraft(getCarouselTampilan(image));
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const startPanTampilan = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const frame = tampilanFrameRef.current;
    if (!frame) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const width = frame.getBoundingClientRect().width || 1;
    const height = frame.getBoundingClientRect().height || 1;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = tampilanDraft;
    // Seret ke kanan = bagian kiri foto terlihat (titik fokus bergeser ke kiri), sama seperti menggeser foto.
    const onMove = (e: PointerEvent) =>
      setTampilanDraft({
        ...start,
        pos_x: clamp(Math.round((start.pos_x - ((e.clientX - startX) / width) * 100) * 10) / 10, 0, 100),
        pos_y: clamp(Math.round((start.pos_y - ((e.clientY - startY) / height) * 100) * 10) / 10, 0, 100),
      });
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  const saveTampilan = async () => {
    if (pendingUpload) {
      setIsSavingTampilan(true);
      setIsUploadingCarousel(true);
      try {
        await uploadCarouselImage({
          file: pendingUpload.file,
          title: carouselTitle.trim() || undefined,
          tampilan: tampilanDraft,
        });
        setCarouselTitle('');
        await refreshCarouselImages();
        setToast({ type: 'success', message: 'Gambar carousel berhasil diupload.' });
        closeTampilanEditor();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Upload gambar carousel gagal.';
        setCarouselError(msg);
        setToast({ type: 'error', message: msg });
      } finally {
        setIsSavingTampilan(false);
        setIsUploadingCarousel(false);
      }
      return;
    }

    if (!tampilanTarget) return;
    setIsSavingTampilan(true);
    try {
      await updateCarouselTampilan(tampilanTarget.id, tampilanDraft);
      setCarouselImages((prev) => prev.map((item) => (item.id === tampilanTarget.id ? { ...item, ...tampilanDraft } : item)));
      setToast({ type: 'success', message: 'Tampilan foto disimpan.' });
      setTampilanTarget(null);
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal menyimpan tampilan foto.' });
    } finally {
      setIsSavingTampilan(false);
    }
  };

  const confirmDeleteCarousel = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await deleteCarouselImage(deleteTarget.id);
      await refreshCarouselImages();
      setToast({ type: 'success', message: 'Gambar carousel berhasil dihapus.' });
      setDeleteTarget(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Gagal menghapus gambar carousel.';
      setCarouselError(msg);
      setToast({ type: 'error', message: msg });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    setIsDraggingOver(index);
  };

  const handleDrop = async (dropIndex: number) => {
    const dragIndex = dragIndexRef.current;
    setIsDraggingOver(null);
    dragIndexRef.current = null;

    if (dragIndex === null || dragIndex === dropIndex) {
      return;
    }

    // Reorder optimistically
    const reordered = [...carouselImages];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    const withNewOrder = reordered.map((img, i) => ({ ...img, sort_order: i }));
    setCarouselImages(withNewOrder);

    // Persist new sort_order to backend
    try {
      await Promise.all(withNewOrder.map((img) => updateCarouselSortOrder(img.id, img.sort_order)));
    } catch (error) {
      setCarouselError(error instanceof Error ? error.message : 'Gagal menyimpan urutan carousel.');
      await refreshCarouselImages();
    }
  };

  const handleDragEnd = () => {
    setIsDraggingOver(null);
    dragIndexRef.current = null;
  };

  return (
    // Desktop (lg+): satu layar penuh tanpa scroll halaman — baris atas & statistik setinggi isinya, baris grafik
    // mengisi sisa tinggi (isi kartu menggulir di dalam kartu bila layar terlalu pendek). Layar kecil: tumpuk biasa.
    <div className="space-y-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:space-y-0 lg:gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between lg:shrink-0">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-[9px] mt-0.5">
            Selamat datang di SIKERMA v2.0 — Sistem Informasi Kerjasama Politeknik Negeri Batam
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="card flex items-center gap-2 px-3 py-1.5">
            <div className="leading-tight">
              <p className="text-[10px] font-bold text-gray-900">Kerjasama Baru {currentYear}</p>
              <p className="text-[8px] text-gray-500">Yang disetujui, per bulan</p>
            </div>
            <select
              value={filterBulanBaru}
              onChange={(e) => setFilterBulanBaru(e.target.value)}
              className="input-field px-2 py-1 text-[10px] text-gray-700"
            >
              <option>{semuaBulanLabel}</option>
              {bulanOptions.map((bulan) => (
                <option key={bulan}>{bulan}</option>
              ))}
            </select>
            <span className="text-lg font-bold text-[#173B82]">{kerjasamaBaruCount}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowCarouselModal(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Upload size={14} />
            Kelola Carousel
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-600">{carouselImages.length}/7</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 lg:shrink-0">
        {dashboardStats.map((stat, idx) => {
          const IconComponent = statIcons[stat.iconKey];
          const href = getMitraStatHref(stat.label);
          const isClickable = Boolean(href);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => href && router.push(href)}
              disabled={!isClickable}
              className={`${stat.color} flex items-center justify-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-200 ${isClickable ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02]' : 'cursor-default opacity-90'}`}
            >
              <IconComponent size={20} className={`${stat.textColor} shrink-0`} />
              <div className="min-w-0">
                <p className={`truncate text-[9px] font-medium ${stat.textColor}`}>{stat.label}</p>
                <p className="text-sm md:text-base font-bold leading-tight text-gray-900">{stat.value}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="lg:min-h-0">
          <AdminDashboardCharts
            stats={publicStats}
            jenisDistribution={jenisDistribution}
            topRuangLingkup={topRuangLingkup}
            compact
          />
        </div>

        <div className="flex flex-col gap-3 lg:min-h-0">
          <div className="card flex flex-col p-3 lg:min-h-0 lg:flex-1">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-gray-900 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Notifikasi Terbaru
              </h2>
              <Link href="/admin/notifikasi" className="text-[10px] text-[#173B82] hover:text-[#091222] font-medium">
                Lihat Semua
              </Link>
            </div>

            <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {notifications.length > 0 ? (
                notifications.slice(0, 3).map((notification, index) => (
                  <button
                    key={`${notification.source ?? 'local'}-${notification.id}`}
                    onClick={() => handleOpenNotification(notification)}
                    className={`w-full text-left bg-white border-l-4 ${index === 0 ? 'border-green-500' : 'border-[#173B82]'} rounded-lg p-2 hover:shadow-md transition-shadow cursor-pointer ${!notification.read ? 'bg-slate-50/70' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-[11px] font-semibold text-gray-900">{notification.title}</p>
                      <span className="text-[8px] text-slate-400 whitespace-nowrap">{notification.createdAt}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-gray-600">{notification.message}</p>
                    <p className="mt-0.5 text-[8px] text-gray-500">📌 dari: {notification.from}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[11px] text-gray-500">
                  Belum ada notifikasi terbaru.
                </div>
              )}
            </div>
          </div>

          <div className="card shrink-0 p-3">
            <h2 className="mb-2 text-xs font-bold text-gray-900">Quick Access</h2>
            <div className="flex flex-col gap-1.5">
              {quickActions.map((action, idx) => {
                const IconComponent = actionIcons[action.iconKey];
                const isPrimary = idx === 0;

                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    title={action.description}
                    className={`${action.color} flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all hover:shadow-md`}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${isPrimary ? 'border-white/20 bg-white/15' : 'border-slate-200 bg-white'}`}>
                      <IconComponent size={15} className={isPrimary ? 'text-white' : 'text-[#173B82]'} />
                    </div>
                    <span className={`flex-1 text-[11px] font-bold ${isPrimary ? 'text-white' : 'text-gray-900'}`}>{action.label}</span>
                    <span className={`text-[10px] font-semibold ${isPrimary ? 'text-sky-100' : 'text-[#173B82]'}`}>→</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showCarouselModal && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCarouselModal(false); }}
        >
          <div className="relative my-4 w-full max-w-4xl">
            <button
              type="button"
              onClick={() => setShowCarouselModal(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Tutup"
            >
              <X size={16} />
            </button>
      <div className="card p-3 md:p-4 !shadow-2xl">
        <div className="mb-3 flex flex-col gap-2 pr-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[9px] md:text-xs font-bold text-gray-900">Kelola Carousel Landing Page</h2>
            <p className="text-[9px] text-gray-500 mt-0.5">Upload maksimal 7 gambar. Perubahan akan otomatis tampil di menu Aktivitas. <span className="text-slate-400">Drag kartu untuk mengatur urutan slide.</span></p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[9px] font-semibold text-slate-600">
            {carouselImages.length}/7 gambar aktif
          </span>
        </div>

        <div className="grid gap-2.5 md:grid-cols-[1fr_auto] md:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-medium text-slate-700">Judul Aktivitas (opsional)</span>
            <input
              type="text"
              value={carouselTitle}
              onChange={(event) => setCarouselTitle(event.target.value)}
              placeholder="Contoh: Penandatanganan MoU Industri"
              className="input-field h-8 px-3 text-[9px] text-gray-700"
            />
          </label>

          <label className={`inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-[9px] font-semibold text-white transition-colors ${isUploadingCarousel ? 'bg-slate-400' : 'bg-[#173B82] hover:bg-[#091222]'}`}>
            <Upload size={15} />
            {isUploadingCarousel ? 'Uploading...' : 'Upload Gambar'}
            <input
              type="file"
              accept=".jpg,.jpeg,.png"
              className="hidden"
              onChange={handleUploadCarousel}
              disabled={isUploadingCarousel || carouselImages.length >= 7}
            />
          </label>
        </div>

        <p className="mt-2 text-[9px] text-slate-500">{CAROUSEL_RULES_TEXT}</p>
        {carouselError && (
          <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{carouselError}</span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="text-[9px] font-medium text-slate-600">Ukuran pratinjau</span>
          <input
            type="range"
            min={CAROUSEL_MIN_WIDTH}
            max={CAROUSEL_MAX_WIDTH}
            step={10}
            value={carouselWidth}
            onChange={(e) => changeCarouselWidth(Number(e.target.value))}
            aria-label="Ukuran pratinjau gambar carousel"
            className="w-32 accent-[#173B82]"
          />
          <span className="w-10 text-right text-[9px] tabular-nums text-slate-500">{carouselWidth}px</span>
        </div>
        <p className="mt-1 text-right text-[9px] text-slate-400">Tarik pegangan di sudut kanan bawah gambar untuk memperbesar atau memperkecil.</p>

        <div
          className="mt-2 grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${carouselWidth}px), ${carouselWidth}px))` }}
        >
          {carouselImages.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
              Belum ada gambar carousel. Upload gambar pertama untuk menampilkan aktivitas di landing page.
            </div>
          ) : (
            carouselImages.map((image, index) => (
              <div
                key={image.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                className={`overflow-hidden rounded-xl border bg-white transition-all ${isDraggingOver === index ? 'scale-[1.02] border-[#173B82] shadow-md' : 'border-slate-200'}`}
              >
                <div className="relative overflow-hidden">
                  <img
                    src={image.image_url}
                    alt={image.title || 'Carousel'}
                    draggable={false}
                    className="w-full object-cover"
                    style={{ height: Math.round(carouselWidth * 0.625), ...carouselImageStyle(getCarouselTampilan(image)) }}
                  />
                  <div
                    onPointerDown={startResizeCarousel}
                    title="Tarik untuk mengubah ukuran"
                    role="presentation"
                    className="absolute bottom-1 right-1 flex h-5 w-5 cursor-nwse-resize touch-none items-center justify-center rounded-sm border border-white bg-[#173B82] shadow"
                  >
                    <span className="block h-2 w-2 border-b-2 border-r-2 border-white" />
                  </div>
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-slate-900/55 px-2 py-0.5 text-[9px] font-bold text-white">
                    #{index + 1}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      title="Geser untuk mengubah urutan"
                      className="mt-0.5 flex-shrink-0 cursor-grab text-slate-400 active:cursor-grabbing"
                    >
                      <GripVertical size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{image.title || 'Tanpa Judul'}</p>
                      <p className="text-[9px] text-slate-500">Slide ke-{index + 1}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openTampilanEditor(image)}
                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
                    title="Atur tampilan foto (perbesar & geser)"
                  >
                    <SlidersHorizontal size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCarousel(image)}
                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-red-200 text-red-600 transition-colors hover:bg-red-50"
                    title="Hapus gambar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
          </div>
        </div>
      )}

      {(tampilanTarget || pendingUpload) && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !isSavingTampilan) closeTampilanEditor(); }}
        >
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{pendingUpload ? 'Atur Foto Sebelum Upload' : 'Atur Tampilan Foto'}</h3>
                <p className="mt-0.5 text-[10px] text-gray-500">
                  Bingkai di bawah sama dengan carousel di landing page. Pilih Tampil utuh agar foto tidak terpotong, seret foto untuk menggeser, dan gunakan slider atau scroll mouse untuk memperbesar atau memperkecil.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTampilanEditor}
                disabled={isSavingTampilan}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>

            <div
              ref={tampilanFrameRef}
              onPointerDown={startPanTampilan}
              onWheel={(e) =>
                setTampilanDraft((d) => ({
                  ...d,
                  zoom: clamp(Math.round((d.zoom - Math.sign(e.deltaY) * 0.1) * 100) / 100, CAROUSEL_ZOOM_MIN, CAROUSEL_ZOOM_MAX),
                }))
              }
              className="relative aspect-[16/7] w-full cursor-grab touch-none select-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100 active:cursor-grabbing"
            >
              <img
                src={pendingUpload?.previewUrl ?? tampilanTarget?.image_url}
                alt={(pendingUpload ? carouselTitle : tampilanTarget?.title) || 'Carousel'}
                draggable={false}
                className="h-full w-full object-cover"
                style={carouselImageStyle(tampilanDraft)}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/55 via-slate-900/10 to-transparent" />
              <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] font-semibold text-white">
                {(pendingUpload ? carouselTitle : tampilanTarget?.title) || 'Tanpa Judul'}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[10px] font-medium text-slate-700">
                Perbesar
                <input
                  type="range"
                  min={CAROUSEL_ZOOM_MIN}
                  max={CAROUSEL_ZOOM_MAX}
                  step={0.05}
                  value={tampilanDraft.zoom}
                  onChange={(e) => setTampilanDraft((d) => ({ ...d, zoom: Number(e.target.value) }))}
                  className="w-40 accent-[#173B82]"
                />
                <span className="w-10 tabular-nums text-slate-500">{tampilanDraft.zoom.toFixed(2)}x</span>
              </label>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                {([['cover', 'Isi bingkai'], ['contain', 'Tampil utuh']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTampilanDraft((d) => ({ ...d, fit: value }))}
                    aria-pressed={tampilanDraft.fit === value}
                    className={`px-3 py-1.5 text-[10px] font-semibold transition-colors ${tampilanDraft.fit === value ? 'bg-[#173B82] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setTampilanDraft(CAROUSEL_TAMPILAN_DEFAULT)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Reset
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={closeTampilanEditor}
                  disabled={isSavingTampilan}
                  className="rounded-lg border border-slate-200 px-4 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void saveTampilan()}
                  disabled={isSavingTampilan}
                  className="rounded-lg bg-[#173B82] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2A4A8F] disabled:opacity-60"
                >
                  {isSavingTampilan ? (pendingUpload ? 'Mengupload...' : 'Menyimpan...') : pendingUpload ? 'Upload' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[90]">
          <div
            className={`pointer-events-auto w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border bg-white shadow-2xl ring-1 ring-black/5 toast-enter ${
              toast.type === 'success' ? 'border-emerald-200' : 'border-rose-200'
            }`}
          >
            <div
              className={`h-1.5 w-full ${
                toast.type === 'success'
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                  : 'bg-gradient-to-r from-rose-400 to-rose-600'
              }`}
            />
            <div className="flex items-start gap-3 p-4">
              <div
                className={`mt-0.5 rounded-full p-2 ${
                  toast.type === 'success'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900">
                  {toast.type === 'success' ? 'Berhasil' : 'Terjadi Kesalahan'}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{toast.message}</p>
              </div>

              <button
                type="button"
                onClick={() => setToast(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup notifikasi"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="modal-enter w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-rose-50 to-white px-5 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-rose-100 p-2.5 text-rose-700">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Hapus Gambar Carousel</h3>
                    <p className="mt-0.5 text-[9px] text-slate-500">Aksi ini permanen dan tidak dapat dibatalkan.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
                  aria-label="Tutup modal"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="px-5 py-4">
              <p className="text-xs text-slate-600">Item yang akan dihapus:</p>
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="line-clamp-2 text-xs font-semibold text-slate-900">
                  {deleteTarget.title || 'Tanpa Judul'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteCarousel}
                disabled={isDeleting}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .toast-enter {
          animation: toastIn 0.25s ease-out;
        }
        .modal-enter {
          animation: modalIn 0.2s ease-out;
        }
        @keyframes toastIn {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes modalIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <style jsx global>{`
        @keyframes toastbar {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </div>
  );
}

