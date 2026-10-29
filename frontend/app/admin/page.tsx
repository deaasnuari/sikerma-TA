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
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  getAdminNotifications,
  getDashboardStats,
  getQuickActions,
  markNotificationAsRead,
} from '@/services/adminService';
import { fetchRekapDokumenFromApi } from '@/services/dokumenKerjasamaApiService';
import { bulanOptions, getRekapStats, semuaBulanLabel } from '@/services/adminRekapDataService';
import { countKerjasamaBaru, refreshPengajuanDataFromApi, type PengajuanItem } from '@/services/adminPengajuanService';
import { apiRequest } from '@/lib/api';
import type { AdminNotification } from '@/types/admin';
import {
  deleteCarouselImage,
  getCarouselImages,
  updateCarouselSortOrder,
  uploadCarouselImage,
  type CarouselImageItem,
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
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [carouselImages, setCarouselImages] = useState<CarouselImageItem[]>([]);
  const [carouselTitle, setCarouselTitle] = useState('');
  const [isUploadingCarousel, setIsUploadingCarousel] = useState(false);
  const [carouselError, setCarouselError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<number | null>(null);
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
    const syncNotifications = () => {
      setNotifications(getAdminNotifications());
    };

    syncNotifications();
    window.addEventListener('admin-notifications-updated', syncNotifications);

    return () => window.removeEventListener('admin-notifications-updated', syncNotifications);
  }, []);

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
    setNotifications(markNotificationAsRead(notification.id));
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

    setCarouselError(null);
    setIsUploadingCarousel(true);

    try {
      await uploadCarouselImage({
        file,
        title: carouselTitle.trim() || undefined,
      });

      setCarouselTitle('');
      await refreshCarouselImages();
      setToast({ type: 'success', message: 'Gambar carousel berhasil diupload.' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload gambar carousel gagal.';
      setCarouselError(msg);
      setToast({ type: 'error', message: msg });
    } finally {
      setIsUploadingCarousel(false);
      event.target.value = '';
    }
  };

  const handleDeleteCarousel = (image: CarouselImageItem) => {
    setDeleteTarget(image);
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
    <div className="space-y-4">
      <div>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-[9px] mt-1">
          Selamat datang di SIKERMA v2.0 — Sistem Informasi Kerjasama Politeknik Negeri Batam
        </p>
      </div>

      <div className="card p-3 md:p-4">
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-xs font-semibold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Notifikasi Terbaru
          </h2>
          <Link href="/admin/notifikasi" className="text-xs text-[#173B82] hover:text-[#091222] font-medium">
            Lihat Semua
          </Link>
        </div>

        <div className="space-y-3">
          {notifications.length > 0 ? (
            notifications.slice(0, 3).map((notification, index) => (
              <button
                key={notification.id}
                onClick={() => handleOpenNotification(notification)}
                className={`w-full text-left bg-white border-l-4 ${index === 0 ? 'border-green-500' : 'border-[#173B82]'} rounded-lg p-3 flex gap-3 hover:shadow-md transition-shadow cursor-pointer ${!notification.read ? 'bg-slate-50/70' : ''}`}
              >
                <div className={`w-6 h-6 ${index === 0 ? 'bg-green-100' : 'bg-slate-100'} rounded-full flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <svg className={`w-4 h-4 ${index === 0 ? 'text-green-600' : 'text-[#173B82]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {index === 0 ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    )}
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-900">{notification.title}</p>
                    <span className="text-[9px] text-slate-400 whitespace-nowrap">{notification.createdAt}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                  <p className="text-[9px] text-gray-500 mt-1">📌 dari: {notification.from}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-gray-500">
              Belum ada notifikasi terbaru.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 md:gap-3">
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
              className={`${stat.color} rounded-lg p-3 text-center transition-all duration-200 ${isClickable ? 'cursor-pointer hover:shadow-lg hover:scale-105' : 'cursor-default opacity-90'}`}
            >
              <div className="flex justify-center mb-1.5">
                <IconComponent size={20} className={stat.textColor} />
              </div>
              <p className={`text-[9px] font-medium ${stat.textColor}`}>{stat.label}</p>
              <p className="text-xs md:text-base font-bold text-gray-900 mt-0.5">{stat.value}</p>
            </button>
          );
        })}
      </div>

      <div className="card flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between md:p-4">
        <div>
          <h2 className="text-[9px] md:text-xs font-bold text-gray-900">Kerjasama Baru {currentYear}</h2>
          <p className="text-[9px] text-gray-500 mt-0.5">Jumlah kerjasama baru yang disetujui, bisa difilter per bulan.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterBulanBaru}
            onChange={(e) => setFilterBulanBaru(e.target.value)}
            className="input-field px-3 py-2 text-[11px] text-gray-700"
          >
            <option>{semuaBulanLabel}</option>
            {bulanOptions.map((bulan) => (
              <option key={bulan}>{bulan}</option>
            ))}
          </select>
          <span className="text-lg md:text-2xl font-bold text-[#173B82]">{kerjasamaBaruCount}</span>
        </div>
      </div>

      <div className="card p-3 md:p-4">
        <div className="mb-3">
          <h2 className="text-[9px] md:text-xs font-bold text-gray-900">Quick Access</h2>
          <p className="text-[9px] text-gray-500 mt-0.5">Akses cepat ke menu utama yang sering digunakan.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 md:gap-3">
          {quickActions.map((action, idx) => {
            const IconComponent = actionIcons[action.iconKey];
            const isPrimary = idx === 0;

            return (
              <Link
                key={action.href}
                href={action.href}
                className={`${action.color} border rounded-lg p-3 md:p-4 hover:shadow-md transition-all block`}
              >
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isPrimary ? 'bg-white/15' : 'bg-white'} border ${isPrimary ? 'border-white/20' : 'border-slate-200'}`}>
                    <IconComponent size={18} className={isPrimary ? 'text-white' : 'text-[#173B82]'} />
                  </div>
                  <span className={`text-[9px] font-semibold ${isPrimary ? 'text-sky-100' : 'text-[#173B82]'}`}>Quick Access</span>
                </div>

                <h3 className={`text-xs font-bold ${isPrimary ? 'text-white' : 'text-gray-900'}`}>{action.label}</h3>
                <p className={`text-[9px] mt-0.5 ${isPrimary ? 'text-slate-200' : 'text-gray-500'}`}>{action.description}</p>
                <p className={`text-[9px] font-semibold mt-2 ${isPrimary ? 'text-sky-100' : 'text-[#173B82]'}`}>Buka menu →</p>
              </Link>
            );
          })}
        </div>
      </div>

      <AdminDashboardCharts
        stats={publicStats}
        jenisDistribution={jenisDistribution}
        topRuangLingkup={topRuangLingkup}
      />

      <div className="card p-3 md:p-4">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleUploadCarousel}
              disabled={isUploadingCarousel || carouselImages.length >= 7}
            />
          </label>
        </div>

        {carouselError && <p className="mt-3 text-xs text-red-600">{carouselError}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <div className="relative">
                  <img src={image.image_url} alt={image.title || 'Carousel'} className="h-40 w-full object-cover" />
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

