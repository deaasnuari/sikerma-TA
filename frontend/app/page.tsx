'use client';

import KategoriMitraDonutCard from '@/components/KategoriMitraDonutCard';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AdminNavbar from '@/components/admin/AdminNavbar';
import AdminFooter from '@/components/admin/AdminFooter';
import DonutChart from '@/components/DonutChart';
import { getCarouselImages, type CarouselImageItem } from '@/services/carouselService';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type KerjasamaRow = { id: number; nama: string; bidang: string; jenis: string; unit: string; wilayah: string };

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Document-style SVG icon used in summary strip */
function DocIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 6h18l8 8v22H8V6z" stroke="#1e376c" strokeWidth="2" />
      <path d="M26 6v8h8"           stroke="#1e376c" strokeWidth="2" />
      <path d="M13 18h16M13 23h16M13 28h10" stroke="#1e376c" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Doc icon with a small pencil badge (Total Kerjasama) */
function DocEditIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 6h18l8 8v22H8V6z" stroke="#1e376c" strokeWidth="2" />
      <path d="M26 6v8h8"           stroke="#1e376c" strokeWidth="2" />
      <path d="M13 18h16M13 23h16M13 28h10" stroke="#1e376c" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="33" r="6" fill="#1e376c" />
      <path d="M8 33h4M10 31v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Menu icon for detail button */
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="white" width={16} height={16}>
      <path d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2zm16 0h2v-2h-2v2zm0-10v2h2V7h-2zm0 6h2v-2h-2v2z" />
    </svg>
  );
}

/** Briefcase icon for DUDI hero stat cards */
function BriefcaseIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Building icon for Instansi hero stat cards */
function BuildingIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 21V5a1 1 0 011-1h6a1 1 0 011 1v16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 21V9a1 1 0 011-1h4a1 1 0 011 1v12" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 7h1M7 10h1M7 13h1M7 16h1M17 11h1M17 14h1M17 17h1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 21h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Globe icon marking the "internasional" variant of a hero stat card */
function GlobeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<KerjasamaRow | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedWilayah, setSelectedWilayah] = useState('Semua Wilayah');
  const [selectedJenisDokumen, setSelectedJenisDokumen] = useState('Semua Jenis');
  const [selectedUnit, setSelectedUnit] = useState('Semua Unit');
  const [carouselImages, setCarouselImages] = useState<CarouselImageItem[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [kerjasamaList, setKerjasamaList] = useState<KerjasamaRow[]>([]);
  const [isLoadingTable, setIsLoadingTable] = useState(true);
  const [perPage, setPerPage] = useState(10);

  // Daftar unit untuk dropdown — diambil dari master unit di database,
  // dipisah per kategori (Jurusan / Program Studi / Unit Kerja) supaya
  // tidak tercampur jadi 1 list rata.
  const [unitGroups, setUnitGroups] = useState<{ jurusan: string[]; prodi: string[]; unit: string[] }>({
    jurusan: [],
    prodi: [],
    unit: [],
  });

  // Stat cards — diambil dari database
  const [stats, setStats] = useState({
    total: 478,
    kategori: [] as { label: string; value: number }[],
    dalam_negeri: 447,
    luar_negeri: 31,
    dudi_nasional: 154,
    dudi_internasional: 7,
    instansi_nasional: 292,
    instansi_internasional: 24,
  });

  const carouselSlides = useMemo(() => {
    if (carouselImages.length > 0) {
      return carouselImages.slice(0, 7).map((item, index) => ({
        id: item.id,
        title: item.title || `Aktivitas Kerjasama ${index + 1}`,
        imageUrl: item.image_url,
      }));
    }

    return Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      title: `Aktivitas Kerjasama ${index + 1}`,
      imageUrl: '/polibatam.jpg',
    }));
  }, [carouselImages]);

  useEffect(() => {
    let mounted = true;

    getCarouselImages()
      .then((items) => {
        if (mounted) {
          setCarouselImages(items);
        }
      })
      .catch(() => {
        if (mounted) {
          setCarouselImages([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch semua unit dari master database untuk mengisi dropdown "Semua Unit",
  // sudah dipisah per kategori dari backend (jurusan/prodi/unit).
  useEffect(() => {
    let mounted = true;

    apiRequest<{ success: boolean; data: { jurusan: string[]; prodi: string[]; unit: string[] } }>('/public/unit-prodi')
      .then((res) => {
        if (!mounted || !res.data) return;

        setUnitGroups({
          jurusan: Array.isArray(res.data.jurusan) ? res.data.jurusan : [],
          prodi: Array.isArray(res.data.prodi) ? res.data.prodi : [],
          unit: Array.isArray(res.data.unit) ? res.data.unit : [],
        });
      })
      .catch((err: unknown) => {
        console.error('[UnitDropdown] Gagal memuat unit dari database:', err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Statistik "Jenis Mitra & Wilayah" — sumbernya sama dengan Data Kemitraan
  // & Dashboard Admin (mitra unik dari master_mitra, bukan jumlah dokumen),
  // supaya angka yang tampil ke publik selalu konsisten dengan data internal.
  useEffect(() => {
    let mounted = true;
    apiRequest<{ success: boolean; data: { total: number; kategori: { label: string; value: number }[]; dalam_negeri: number; luar_negeri: number; dudi_nasional: number; dudi_internasional: number; instansi_nasional: number; instansi_internasional: number } }>('/dokumen-kerjasama/stats/mitra')
      .then((res) => {
        if (mounted && res.data) setStats(res.data);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoadingTable(true);

    apiRequest<{ success: boolean; data: { data: KerjasamaRow[]; total: number } }>('/public/kerjasama')
      .then((res) => {
        if (!mounted) return;
        const rows = res.data?.data;
        if (Array.isArray(rows)) setKerjasamaList(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setIsLoadingTable(false);
      });

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (carouselSlides.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [carouselSlides.length]);

  useEffect(() => {
    if (activeSlide >= carouselSlides.length) {
      setActiveSlide(0);
    }
  }, [activeSlide, carouselSlides.length]);

  // ── Table logic ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    kerjasamaList.filter((r) =>
      (selectedWilayah === 'Semua Wilayah' || r.wilayah === selectedWilayah) &&
      (selectedJenisDokumen === 'Semua Jenis' || r.jenis === selectedJenisDokumen) &&
      (selectedUnit === 'Semua Unit' || r.unit === selectedUnit) &&
      (search === '' ||
        r.nama.toLowerCase().includes(search.toLowerCase()) ||
        r.bidang.toLowerCase().includes(search.toLowerCase()))
    ),
    [kerjasamaList, selectedWilayah, selectedJenisDokumen, selectedUnit, search]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const startIndex = (currentPage - 1) * perPage;
  const endIndex   = Math.min(currentPage * perPage, filtered.length);
  const pagedItems = filtered.slice(startIndex, endIndex);

  const changePage = (delta: number) => {
    const next = currentPage + delta;
    if (next < 1 || next > totalPages) return;
    setCurrentPage(next);
  };

  const jenisDistribution = useMemo(() => {
    const counts = { MoU: 0, MoA: 0, IA: 0 };
    kerjasamaList.forEach((r) => {
      if (r.jenis === 'MoU') counts.MoU++;
      else if (r.jenis === 'MoA') counts.MoA++;
      else if (r.jenis === 'IA') counts.IA++;
    });
    return counts;
  }, [kerjasamaList]);

  const topRuangLingkup = useMemo(() => {
    const counts: Record<string, number> = {};
    kerjasamaList.forEach((r) => {
      if (!r.bidang || r.bidang === '-') return;
      r.bidang.split(',').forEach((b) => {
        const name = b.trim();
        if (name && name !== '-') counts[name] = (counts[name] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [kerjasamaList]);

  const handleLihatDetail = () => {
    // Dari landing page publik, "Lihat Detail Lengkap" tidak boleh langsung
    // menembus ke halaman admin walau ada sesi tersimpan — selalu arahkan ke
    // halaman login supaya akses ke data lengkap selalu lewat login eksplisit.
    router.push('/login');
  };

  const handleOpenDetail = (row: KerjasamaRow) => {
    // Selagi status login masih diverifikasi ke server, anggap belum login (fail-closed)
    // supaya token basi/tidak valid tidak bisa dipakai untuk menembus modal detail.
    if (isAuthenticated && !isAuthLoading) {
      setSelectedRow(row);
    } else {
      setShowLoginPrompt(true);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="bg-gradient-to-b from-slate-50 to-white font-sans text-slate-800">
      <div className="sticky top-0 z-50">
        <AdminNavbar isPublic />
      </div>

      {/* ── HERO ── */}
      <section
        id="beranda"
        className="relative overflow-hidden"
      >
        <Image
          src="/polibatam.jpg"
          alt="Kampus Politeknik Negeri Batam"
          fill
          priority
          quality={65}
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#091222]/70" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(9,18,34,0.92) 0%, rgba(9,18,34,0.78) 45%, rgba(9,18,34,0.4) 100%)',
          }}
        />
        <div className="pointer-events-none absolute -left-10 top-14 h-40 w-40 rounded-full bg-[#57C9E8]/15 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-[#F28C00]/10 blur-3xl" />

        <div className="relative mx-auto grid min-h-[600px] max-w-7xl gap-10 px-4 py-16 md:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold text-blue-100 backdrop-blur-sm">
              Portal Resmi Bagian Kerjasama
            </span>
            <h1 className="mt-4 max-w-2xl text-[25px] font-extrabold leading-tight text-white md:text-[40px]">
              Bangun Kolaborasi Strategis Bersama Politeknik Negeri Batam
            </h1>
            <p className="mt-4 max-w-xl text-[11.5px] leading-6 text-slate-200 md:text-[13.5px]">
              Temukan informasi kerja sama, statistik kemitraan, dan daftar mitra aktif secara lebih cepat, rapi, dan terstruktur.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#info-kerjasama" className="btn-highlight">
                Lihat Informasi
              </a>
              <button
                type="button"
                onClick={() => setShowContactModal(true)}
                className="inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-[11.5px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                Hubungi Kami
              </button>
            </div>

          </div>

          <div className="grid grid-cols-2 gap-3">
            {([
              { key: 'dudi_nasional',          label: 'Dudi Nasional',          Icon: BriefcaseIcon, accent: '#57C9E8', intl: false },
              { key: 'dudi_internasional',     label: 'Dudi Internasional',     Icon: BriefcaseIcon, accent: '#F28C00', intl: true  },
              { key: 'instansi_nasional',      label: 'Instansi Nasional',      Icon: BuildingIcon,  accent: '#57C9E8', intl: false },
              { key: 'instansi_internasional', label: 'Instansi Internasional', Icon: BuildingIcon,  accent: '#F28C00', intl: true  },
            ] as const).map((item) => (
              <div
                key={item.key}
                className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-3.5 text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/15 hover:shadow-xl"
              >
                <div
                  className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-30"
                  style={{ backgroundColor: item.accent }}
                />
                <span
                  className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${item.accent}25`, color: item.accent }}
                >
                  <item.Icon className="h-5 w-5" />
                </span>
                <div className="relative min-w-0">
                  <p className="text-[22px] font-bold leading-none md:text-[24px]">{stats[item.key]}</p>
                  <p className="mt-1.5 flex items-center gap-1 text-[10.5px] font-medium leading-snug text-slate-300">
                    {item.label}
                    {item.intl && <GlobeIcon className="h-3 w-3 flex-shrink-0 text-slate-400" />}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AKTIVITAS CAROUSEL ── */}
      <section id="aktivitas" className="px-4 py-8 md:py-12">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11.5px] font-semibold text-[#173B82]">Aktivitas Kerjasama</p>
              <h2 className="text-[20px] font-bold text-slate-900">Dokumentasi Kegiatan Kolaborasi</h2>
            </div>
            <p className="max-w-2xl text-[11.5px] text-slate-500">
              Galeri ini otomatis mengikuti gambar terbaru yang diupload admin melalui dashboard.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            <div
              className="flex transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >
              {carouselSlides.map((slide) => (
                <div key={slide.id} className="relative h-[260px] w-full flex-shrink-0 sm:h-[340px] lg:h-[420px]">
                  <img
                    src={slide.imageUrl}
                    alt={slide.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-slate-900/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                    <p className="text-[11.5px] font-semibold text-white sm:text-[13.5px]">{slide.title}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setActiveSlide((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length)}
              className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-slate-900/45 text-white transition hover:bg-slate-900/65"
              aria-label="Slide sebelumnya"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setActiveSlide((prev) => (prev + 1) % carouselSlides.length)}
              className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-slate-900/45 text-white transition hover:bg-slate-900/65"
              aria-label="Slide berikutnya"
            >
              ›
            </button>

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
              {carouselSlides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setActiveSlide(index)}
                  className={`h-2.5 rounded-full transition-all ${activeSlide === index ? 'w-7 bg-white' : 'w-2.5 bg-white/60'}`}
                  aria-label={`Buka slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SUMMARY CARDS ── */}
      <section className="relative -mt-6 px-6 pb-3 md:pb-4">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {[
            { label: 'Total Mitra', value: stats.total, sub: 'Seluruh mitra terdaftar', color: '#173B82', bg: 'from-blue-600 to-blue-800', icon: <DocEditIcon className="h-9 w-9" /> },
            { label: 'Dalam Negeri',    value: stats.dalam_negeri, sub: `${Math.round((stats.dalam_negeri / (stats.total || 1)) * 100)}% dari total`, color: '#0e7490', bg: 'from-cyan-600 to-cyan-800', icon: <DocIcon className="h-9 w-9" /> },
            { label: 'Luar Negeri',     value: stats.luar_negeri,  sub: `${Math.round((stats.luar_negeri  / (stats.total || 1)) * 100)}% dari total`, color: '#b45309', bg: 'from-amber-500 to-amber-700', icon: <DocIcon className="h-9 w-9" /> },
          ].map((card) => (
            <div key={card.label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className={`h-1 w-full bg-gradient-to-r ${card.bg}`} />
              <div className="flex items-center gap-4 p-4">
                <div className="rounded-xl p-2.5" style={{ backgroundColor: `${card.color}15` }}>
                  <div style={{ color: card.color }}>{card.icon}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-slate-500">{card.label}</p>
                  <p className="text-[22px] font-bold leading-tight" style={{ color: card.color }}>{card.value.toLocaleString('id-ID')}</p>
                  <p className="text-[10px] text-slate-400">{card.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── STATISTIK KERJASAMA ── */}
      <section className="px-4 pt-4 pb-18 md:pb-12">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11.5px] font-semibold text-[#173B82]">Statistik Kerjasama</p>
              <h2 className="text-[20px] font-bold text-slate-900">Gambaran umum kolaborasi Polibatam</h2>
            </div>
            <p className="max-w-2xl text-[11.5px] text-slate-500">
              Ringkasan mitra dan dokumen kerja sama berdasarkan data terkini dari sistem.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Card 1: Kategori Mitra (sama dengan filter Kategori di Data Kemitraan) */}
            <KategoriMitraDonutCard total={stats.total} kategori={stats.kategori} />

            {/* Card 2: Komposisi Dokumen */}
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-slate-50 p-4 md:p-5">
              <h3 className="text-[12px] font-bold text-slate-800">Komposisi Dokumen</h3>
              <div className="mt-4 flex items-center justify-center">
                <DonutChart
                  size={180}
                  centerLabel={String(jenisDistribution.MoU + jenisDistribution.MoA + jenisDistribution.IA)}
                  segments={[
                    { value: jenisDistribution.MoU, color: '#1D4ED8' },
                    { value: jenisDistribution.MoA, color: '#7C3AED' },
                    { value: jenisDistribution.IA,  color: '#A78BFA' },
                  ]}
                />
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { label: 'MoU', value: jenisDistribution.MoU, color: '#1D4ED8' },
                  { label: 'MoA', value: jenisDistribution.MoA, color: '#7C3AED' },
                  { label: 'IA',  value: jenisDistribution.IA,  color: '#A78BFA' },
                ].map((item) => {
                  const total = jenisDistribution.MoU + jenisDistribution.MoA + jenisDistribution.IA;
                  const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          {item.label}
                        </span>
                        <span className="font-semibold text-slate-800">{item.value} <span className="font-normal text-slate-400">({pct}%)</span></span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card 3: Top 5 Ruang Lingkup */}
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-cyan-50 to-slate-50 p-4 md:p-5">
              <h3 className="text-[12px] font-bold text-slate-800">Top 5 Ruang Lingkup</h3>
              <p className="mt-0.5 text-[10px] text-slate-400">Bidang paling sering diajukan</p>
              <div className="mt-5 space-y-3">
                {topRuangLingkup.length === 0 ? (
                  <p className="text-center text-[11px] text-slate-400">Memuat data...</p>
                ) : topRuangLingkup.map(([nama, jumlah], idx) => {
                  const max = topRuangLingkup[0][1];
                  const pct = max > 0 ? Math.round((jumlah / max) * 100) : 0;
                  const colors = ['#173B82', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA'];
                  return (
                    <div key={nama}>
                      <div className="mb-1 flex items-start justify-between gap-2 text-[10.5px]">
                        <span className="flex items-center gap-1.5 leading-tight text-slate-700">
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: colors[idx] }}>
                            {idx + 1}
                          </span>
                          {nama}
                        </span>
                        <span className="flex-shrink-0 font-semibold text-slate-800">{jumlah}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: colors[idx] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INFORMASI KERJASAMA ── */}
      <section id="info-kerjasama" className="px-4 pt-4 md:pt-2 pb-14">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11.5px] font-semibold text-[#173B82]">Informasi Kerjasama</p>
              <h2 className="text-[20px] font-bold text-slate-900">Daftar mitra dan bidang kerja sama</h2>
            </div>
            <p className="max-w-xl text-[11.5px] text-slate-500">
              Jelajahi daftar mitra kerja sama berdasarkan bidang dan unit pengaju dengan pencarian yang lebih mudah.
            </p>
          </div>

          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Cari mitra atau bidang..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="w-44 bg-transparent text-[11.5px] text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>

              {/* Periode */}
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] text-slate-600 shadow-sm">
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <input
                  type="month"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="bg-transparent outline-none"
                />
              </div>

              {/* Wilayah */}
              <select
                value={selectedWilayah}
                onChange={(e) => { setSelectedWilayah(e.target.value); setCurrentPage(1); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] text-slate-700 shadow-sm outline-none focus:border-blue-400"
              >
                <option>Semua Wilayah</option>
                <option>Dalam Negeri</option>
                <option>Luar Negeri</option>
              </select>

              {/* Jenis */}
              <select
                value={selectedJenisDokumen}
                onChange={(e) => { setSelectedJenisDokumen(e.target.value); setCurrentPage(1); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] text-slate-700 shadow-sm outline-none focus:border-blue-400"
              >
                <option>Semua Jenis</option>
                <option>MoU</option>
                <option>MoA</option>
                <option>IA</option>
              </select>

              {/* Unit — dipisah per kategori: Jurusan / Program Studi / Unit Kerja */}
              <select
                value={selectedUnit}
                onChange={(e) => { setSelectedUnit(e.target.value); setCurrentPage(1); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] text-slate-700 shadow-sm outline-none focus:border-blue-400"
              >
                <option>Semua Unit</option>
                {unitGroups.jurusan.length > 0 && (
                  <optgroup label="Jurusan">
                    {unitGroups.jurusan.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </optgroup>
                )}
                {unitGroups.prodi.length > 0 && (
                  <optgroup label="Program Studi">
                    {unitGroups.prodi.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </optgroup>
                )}
                {unitGroups.unit.length > 0 && (
                  <optgroup label="Unit Kerja">
                    {unitGroups.unit.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </optgroup>
                )}
              </select>

              <div className="ml-auto flex items-center gap-2 text-[11.5px] text-slate-500">
                <span>Tampilkan</span>
                <select
                  value={perPage}
                  onChange={(e) => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[11.5px] shadow-sm outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>data</span>
              </div>
            </div>

            {(search || selectedWilayah !== 'Semua Wilayah' || selectedJenisDokumen !== 'Semua Jenis' || selectedUnit !== 'Semua Unit' || selectedPeriod) && (
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="text-slate-400">Hasil:</span>
                <span className="font-semibold text-[#173B82]">{filtered.length} dokumen</span>
                <button
                  onClick={() => { setSearch(''); setSelectedWilayah('Semua Wilayah'); setSelectedJenisDokumen('Semua Jenis'); setSelectedUnit('Semua Unit'); setSelectedPeriod(''); setCurrentPage(1); }}
                  className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-slate-600 hover:bg-slate-300"
                >
                  Reset filter
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full min-w-[900px] border-collapse text-[11.5px]">
              <thead>
                <tr className="bg-[#173B82] text-white">
                  <th className="w-10 px-4 py-3 text-left text-[11px] font-semibold tracking-wide opacity-80">No</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wide">Nama Mitra</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wide">Bidang Kerjasama</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wide">Jenis</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-wide">Unit Pengaju</th>
                  <th className="w-16 px-4 py-3 text-center text-[11px] font-semibold tracking-wide">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoadingTable ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[11.5px] text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#173B82] border-t-transparent" />
                        Memuat data kerjasama...
                      </div>
                    </td>
                  </tr>
                ) : pagedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[11.5px] text-slate-400">
                      <div className="flex flex-col items-center gap-1">
                        <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Tidak ada data yang sesuai
                      </div>
                    </td>
                  </tr>
                ) : pagedItems.map((row, i) => (
                  <tr key={row.id} className="group cursor-default bg-white transition-colors hover:bg-blue-50/60">
                    <td className="px-4 py-3 align-middle text-[11px] text-slate-400">{startIndex + i + 1}</td>
                    <td className="px-4 py-3 align-middle font-medium text-slate-800">{row.nama}</td>
                    <td className="px-4 py-3 align-middle text-slate-500">{row.bidang}</td>
                    <td className="px-4 py-3 align-middle">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                        row.jenis === 'MoU' ? 'bg-blue-100 text-blue-700' :
                        row.jenis === 'MoA' ? 'bg-purple-100 text-purple-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {row.jenis}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-500">{row.unit}</td>
                    <td className="px-4 py-3 align-middle text-center">
                      <button
                        onClick={() => handleOpenDetail(row)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#173B82]/10 text-[#173B82] transition-colors hover:bg-[#173B82] hover:text-white group-hover:bg-[#173B82]/20"
                      >
                        <MenuIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11.5px] text-slate-500">
              Menampilkan <span className="font-semibold text-slate-700">{filtered.length === 0 ? 0 : startIndex + 1}–{endIndex}</span> dari <span className="font-semibold text-slate-700">{filtered.length}</span> dokumen
            </p>

            <div className="flex items-center gap-1">
              <button
                onClick={() => changePage(-1)}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] text-slate-600 transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-40"
              >
                ‹ Prev
              </button>

              {(() => {
                const maxVisible = 5;
                const start = Math.max(1, Math.min(currentPage - 2, totalPages - maxVisible + 1));
                const pages = Array.from({ length: Math.min(maxVisible, totalPages) }, (_, i) => start + i);
                return pages.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCurrentPage(n)}
                    className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-medium transition ${
                      currentPage === n
                        ? 'border-[#173B82] bg-[#173B82] text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:border-blue-200'
                    }`}
                  >
                    {n}
                  </button>
                ));
              })()}

              {totalPages > 5 && currentPage < totalPages - 2 && (
                <>
                  <button className="cursor-default border-r border-slate-200 bg-slate-100 px-3 py-1.5 text-[11.5px] text-[#173B82]">
                    ...
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className={`border-r border-slate-200 px-3 py-1.5 text-[11.5px] font-medium ${
                      currentPage === totalPages ? 'bg-[#173B82] text-white' : 'bg-white text-[#173B82] hover:bg-blue-50'
                    }`}
                  >
                    {totalPages}
                  </button>
                </>
              )}

              <button
                onClick={() => changePage(1)}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] text-slate-600 transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          </div>
        </div>
      </section>

      <div id="kontak" className="px-4 py-8 md:py-12">
        <AdminFooter />
      </div>

      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-[#0f2557] to-[#173B82] px-6 py-5">
              <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">Dokumen Kerjasama</p>
                  <h2 className="mt-1 text-[15px] font-bold leading-snug text-white">{selectedRow.nama}</h2>
                </div>
                <button onClick={() => setSelectedRow(null)} className="ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                  selectedRow.jenis === 'MoU' ? 'bg-blue-200/30 text-blue-100' :
                  selectedRow.jenis === 'MoA' ? 'bg-purple-200/30 text-purple-100' :
                  'bg-emerald-200/30 text-emerald-100'
                }`}>{selectedRow.jenis}</span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10.5px] text-blue-100">{selectedRow.wilayah}</span>
              </div>
            </div>

            {/* Body */}
            <div className="divide-y divide-slate-100 px-6">
              <div className="py-4">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400">Bidang Kerja Sama</p>
                <p className="mt-1 text-[13px] text-slate-700">{selectedRow.bidang}</p>
              </div>
              <div className="py-4">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400">Unit Pengaju</p>
                <p className="mt-1 text-[13px] text-slate-700">{selectedRow.unit}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 bg-slate-50 px-6 py-4">
              <button
                onClick={() => setSelectedRow(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Tutup
              </button>
              <button
                onClick={handleLihatDetail}
                className="flex-1 rounded-xl bg-[#173B82] py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#0f2557]"
              >
                Lihat Detail Lengkap →
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoginPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setShowLoginPrompt(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#173B82]/10 text-[#173B82]">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h2 className="text-[15px] font-bold text-slate-800">Login Diperlukan</h2>
              <p className="text-[12.5px] leading-relaxed text-slate-500">
                Anda harus login terlebih dahulu untuk melihat detail kerja sama ini.
              </p>
            </div>

            <div className="flex gap-2 bg-slate-50 px-6 py-4">
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Tutup
              </button>
              <button
                onClick={() => router.push('/login')}
                className="flex-1 rounded-xl bg-[#173B82] py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#0f2557]"
              >
                Login →
              </button>
            </div>
          </div>
        </div>
      )}

      {showContactModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowContactModal(false)}
        >
          <div
            className="scrollbar-none relative grid max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-gradient-to-br from-[#091222] via-[#0f2557] to-[#173B82] text-white shadow-2xl md:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowContactModal(false)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
              aria-label="Tutup"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Left — info kontak */}
            <div className="p-6 md:p-8">
              <h2 className="text-[26px] font-extrabold uppercase tracking-tight text-[#FBBF24] md:text-[30px]">
                Get In Touch
              </h2>
              <div className="mt-2 mb-6 h-1 w-16 rounded-full bg-[#FBBF24]" />

              <div className="space-y-5 text-[12.5px]">
                {[
                  { title: 'Kapokja Humas dan Kerjasama', email: 'kapokja-hk@polibatam.ac.id' },
                  { title: 'Kerjasama Luar Negeri', email: 'oia@polibatam.ac.id' },
                  { title: 'Kerjasama Dalam Negeri', email: 'kerjasama@polibatam.ac.id' },
                ].map((kontak) => (
                  <div key={kontak.title}>
                    <h3 className="mb-2 text-[13px] font-bold text-white">{kontak.title}</h3>
                    <ul className="space-y-1 text-slate-100">
                      <li>
                        <a href={`mailto:${kontak.email}`} className="text-cyan-200 underline-offset-2 hover:underline">
                          {kontak.email}
                        </a>
                      </li>
                    </ul>
                  </div>
                ))}

                <div>
                  <h3 className="mb-2 text-[13px] font-bold text-white">Mailing Address</h3>
                  <p className="leading-relaxed text-slate-100">
                    Jl. Ahmad Yani, Tlk. Tering, Kec. Batam Kota, Kota Batam, Kepulauan Riau 29461
                  </p>
                </div>
              </div>
            </div>

            {/* Right — foto kampus & website */}
            <div className="relative flex flex-col justify-between gap-4 bg-black/10 p-4 md:p-6">
              <div className="relative h-40 w-full overflow-hidden rounded-xl border border-white/20 shadow-lg md:h-full">
                <img
                  src="/polibatam.jpg"
                  alt="Kampus Politeknik Negeri Batam"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white p-1.5 shadow-md">
                  <img src="/polibatam_logo.png" alt="Logo Polibatam" className="h-full w-full object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-white">Visit Our Website</p>
                  <a
                    href="https://www.polibatam.ac.id"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-[11.5px] text-cyan-200 underline-offset-2 hover:underline"
                  >
                    www.Polibatam.ac.id
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}