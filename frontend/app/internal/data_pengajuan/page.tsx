'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Filter,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  deletePengajuanItem,
  getFilteredPengajuanData,
  getPengajuanData,
  getPengajuanStats,
  pengajuanDokumenBadge,
  pengajuanJurusanOptions,
  pengajuanUnitOptions,
  refreshPengajuanDataFromApi,
  updatePengajuanItem,
  type PengajuanItem,
  type PengajuanStatus,
} from '@/services/adminPengajuanService';
import AjukanKerjasamaForm from './AjukanKerjasamaForm';
import DetailPengajuanModal from './DetailPengajuanModal';

type EditFormState = {
  id: number;
  judul: string;
  mitra: string;
  jurusan: string;
  jenisDokumen: string;
  tanggalMulai: string;
  tanggalBerakhir: string;
  ruangLingkup: string[];
};

const ruangLingkupOptions = [
  'Penelitian',
  'Pengabdian Masyarakat',
  'Magang',
  'Pertukaran Mahasiswa',
  'Pelatihan',
  'Workshop',
  'Sertifikasi',
  'Joint Program',
  'Lainnya',
];

const statusConfig: Record<PengajuanStatus, { className: string; icon: React.ReactNode }> = {
  Menunggu: {
    className: 'bg-amber-100 text-amber-700',
    icon: <Clock3 size={13} />,
  },
  'Menunggu Review': {
    className: 'bg-amber-100 text-amber-700',
    icon: <Clock3 size={13} />,
  },
  Diproses: {
    className: 'bg-sky-100 text-sky-700',
    icon: <Clock3 size={13} />,
  },
  Revisi: {
    className: 'bg-orange-100 text-orange-700',
    icon: <Clock3 size={13} />,
  },
  Disetujui: {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={13} />,
  },
  'Disetujui Internal': {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={13} />,
  },
  'Disetujui Mitra': {
    className: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle2 size={13} />,
  },
  'Final Approved': {
    className: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 size={13} />,
  },
  Ditolak: {
    className: 'bg-rose-100 text-rose-700',
    icon: <XCircle size={13} />,
  },
};

const reviewCopy: Record<PengajuanStatus, string> = {
  Menunggu: 'Pengajuan sudah masuk dan sedang menunggu review dari admin.',
  'Menunggu Review': 'Pengajuan sedang menunggu review dari admin.',
  Diproses: 'Admin sedang memeriksa detail pengajuan kerja sama ini.',
  Revisi: 'Pengajuan perlu direvisi sesuai catatan admin.',
  Disetujui: 'Pengajuan sudah disetujui admin dan siap ditindaklanjuti.',
  'Disetujui Internal': 'Pengajuan telah disetujui oleh pihak internal.',
  'Disetujui Mitra': 'Pengajuan telah disetujui oleh mitra.',
  'Final Approved': 'Pengajuan telah mendapat persetujuan final.',
  Ditolak: 'Pengajuan belum disetujui admin. Silakan cek catatan review.',
};

const unitKeywords = ['upt', 'upa', 'pokja', 'subag', 'spi', 'p3m', 'p4m', 'shilau', 'sbum', 'akademik'];

function isUnitValue(value: string) {
  const normalized = value.toLowerCase();
  return pengajuanUnitOptions.includes(value) || unitKeywords.some((keyword) => normalized.includes(keyword));
}

export default function InternalDataPengajuanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAjukanView = searchParams.get('mode') === 'ajukan';
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterKategori, setFilterKategori] = useState<'Semua' | 'Jurusan' | 'Unit'>('Semua');
  const [filterJurusan, setFilterJurusan] = useState('Semua Jurusan/unit');
  const [pengajuanData, setPengajuanData] = useState<PengajuanItem[]>([]);
  const [detailItem, setDetailItem] = useState<PengajuanItem | null>(null);
  const [reviewItem, setReviewItem] = useState<PengajuanItem | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PengajuanItem | null>(null);
  const [infoModalMessage, setInfoModalMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Ambil data internal saja, exclude admin, dan deduplikasi berdasarkan id
    const syncPengajuan = () => {
      if (!isMounted) {
        return;
      }

      const internalOnly = getPengajuanData({ excludeAdmin: true }).filter(
        (item) => item.kategoriPengajuan === 'Internal'
      );
      // Dedup berdasarkan id
      const seen = new Set();
      const unique = [];
      for (const item of internalOnly) {
        if (!seen.has(item.id)) {
          unique.push(item);
          seen.add(item.id);
        }
      }
      setPengajuanData(unique);
    };

    // Hard refresh awal dari API agar daftar internal langsung up-to-date.
    void refreshPengajuanDataFromApi(true).finally(syncPengajuan);
    window.addEventListener('pengajuan-data-updated', syncPengajuan);
    return () => {
      isMounted = false;
      window.removeEventListener('pengajuan-data-updated', syncPengajuan);
    };
  }, []);

  const jurusanOptions = useMemo(() => {
    const currentValues = pengajuanData.map((item) => item.namaUnitProdi);

    if (filterKategori === 'Jurusan') {
      return [...new Set([...pengajuanJurusanOptions, ...currentValues.filter((value) => !isUnitValue(value))])];
    }

    if (filterKategori === 'Unit') {
      return [...new Set([...pengajuanUnitOptions, ...currentValues.filter((value) => isUnitValue(value))])];
    }

    return [...new Set([...pengajuanJurusanOptions, ...pengajuanUnitOptions, ...currentValues])];
  }, [filterKategori, pengajuanData]);

  const filteredItems = useMemo(() => {
    const baseItems = getFilteredPengajuanData(pengajuanData, {
      filterStatus,
      filterJurusan,
      filterTahun: 'Semua Tahun',
      search,
    }, { excludeAdmin: true });

    let filtered = baseItems;
    if (filterKategori === 'Jurusan') {
      filtered = baseItems.filter((item) => !isUnitValue(item.namaUnitProdi));
    } else if (filterKategori === 'Unit') {
      filtered = baseItems.filter((item) => isUnitValue(item.namaUnitProdi));
    }
    // Dedup sebelum render
    const seen = new Set();
    const unique = [];
    for (const item of filtered) {
      if (!seen.has(item.id)) {
        unique.push(item);
        seen.add(item.id);
      }
    }
    return unique;
  }, [pengajuanData, filterStatus, filterJurusan, search, filterKategori]);

  const stats = getPengajuanStats(pengajuanData);

  function openEdit(item: PengajuanItem) {
    setEditForm({
      id: item.id,
      judul: item.judulPengajuan,
      mitra: item.namaMitra,
      jurusan: item.namaUnitProdi,
      jenisDokumen: item.jenisDokumen,
      tanggalMulai: item.tanggalMulai || '',
      tanggalBerakhir: item.tanggalBerakhir || '',
      ruangLingkup: item.ruangLingkup,
    });
  }

  async function saveEdit() {
    if (!editForm) return;
    if (!editForm.judul.trim() || !editForm.mitra.trim() || !editForm.jurusan.trim()) {
      setInfoModalMessage('Judul, mitra, dan jurusan wajib diisi.');
      return;
    }
    if (editForm.ruangLingkup.length === 0) {
      setInfoModalMessage('Pilih minimal 1 ruang lingkup.');
      return;
    }
    try {
      const next = await updatePengajuanItem(editForm.id, {
        judulPengajuan: editForm.judul.trim(),
        namaMitra: editForm.mitra.trim(),
        namaUnitProdi: editForm.jurusan.trim(),
        jenisDokumen: editForm.jenisDokumen.trim() || 'MoU',
        tanggalMulai: editForm.tanggalMulai || undefined,
        tanggalBerakhir: editForm.tanggalBerakhir || undefined,
        ruangLingkup: editForm.ruangLingkup,
      });
      const internalOnly = next.filter((i) => i.kategoriPengajuan === 'Internal');
      setPengajuanData(internalOnly);
      setEditForm(null);
      setInfoModalMessage('Data pengajuan berhasil diperbarui.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal memperbarui pengajuan.';
      setInfoModalMessage(message);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    try {
      const next = await deletePengajuanItem(deletedId);
      setPengajuanData(next.filter((i) => i.kategoriPengajuan === 'Internal'));
      setDeleteTarget(null);
      if (detailItem?.id === deletedId) setDetailItem(null);
      if (reviewItem?.id === deletedId) setReviewItem(null);
      setInfoModalMessage('Data pengajuan berhasil dihapus.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menghapus pengajuan.';
      setInfoModalMessage(message);
    }
  }

  if (isAjukanView) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pengajuan Kerjasama</h2>
          <p className="text-sm text-slate-500">Form pengajuan sekarang ditempatkan langsung di dalam menu data pengajuan.</p>
        </div>

        <AjukanKerjasamaForm
          onCancel={() => router.replace('/internal/data_pengajuan')}
          onSubmitted={() => router.replace('/internal/data_pengajuan')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pengajuan Kerjasama</h2>
          <p className="text-sm text-slate-500">
            Daftar pengajuan internal akan otomatis mengikuti hasil review dari admin.
          </p>
        </div>
        <Link href="/internal/data_pengajuan?mode=ajukan" className="btn-primary px-4 py-2.5 text-sm font-semibold">
          <Plus size={16} />
          Ajukan Kerjasama Baru
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Pengajuan</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.totalPengajuan}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Menunggu</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{stats.menunggu}</p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Diproses</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">{stats.diproses}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Disetujui</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{stats.disetujui}</p>
        </div>
      </div>

      <div className="toolbar-shell p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Filter size={15} />
            Filter:
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
            {(['Semua', 'Jurusan', 'Unit'] as const).map((kategori) => (
              <button
                key={kategori}
                type="button"
                onClick={() => {
                  setFilterKategori(kategori);
                  setFilterJurusan('Semua Jurusan/unit');
                }}
                className={`px-3 py-2 text-sm font-semibold transition ${
                  filterKategori === kategori
                    ? 'bg-[#173B82] text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {kategori}
              </button>
            ))}
          </div>

          <select
            value={filterJurusan}
            onChange={(e) => setFilterJurusan(e.target.value)}
            className="input-field min-w-[220px] px-3 py-2 text-sm text-gray-700 cursor-pointer"
          >
            <option value="Semua Jurusan/unit">
              {filterKategori === 'Jurusan'
                ? 'Semua Jurusan'
                : filterKategori === 'Unit'
                  ? 'Semua Unit'
                  : 'Semua Jurusan/unit'}
            </option>
            {jurusanOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field px-3 py-2 text-sm text-gray-700 cursor-pointer"
          >
            <option>Semua Status</option>
            <option>Menunggu</option>
            <option>Diproses</option>
            <option>Disetujui</option>
            <option>Ditolak</option>
          </select>

          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                filterKategori === 'Jurusan'
                  ? 'Cari judul, mitra, pengusul, atau jurusan'
                  : filterKategori === 'Unit'
                    ? 'Cari judul, mitra, pengusul, atau unit'
                    : 'Cari judul, mitra, pengusul, atau jurusan/unit'
              }
              className="input-field w-full pl-9 pr-3 py-2 text-sm text-gray-700"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 shadow-sm">
            Belum ada pengajuan internal yang masuk.
          </div>
        ) : (
          filteredItems.map((item) => {
            const sc = statusConfig[item.statusPengajuan];

            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{item.judulPengajuan}</h3>
                      <p className="text-xs text-slate-500">
                        Pengusul: {item.namaPengusul} • {item.diajukanPada}
                      </p>
                    </div>

                    <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-slate-400">Mitra Tujuan</p>
                        <p className="font-semibold">{item.namaMitra}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Jenis Dokumen</p>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${pengajuanDokumenBadge[item.jenisDokumen] || 'bg-slate-100 text-slate-700'}`}>
                          {item.jenisDokumen}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Jurusan / Unit</p>
                        <p className="font-semibold">{item.namaUnitProdi}</p>
                      </div>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${sc.className}`}>
                    {sc.icon}
                    {item.statusPengajuan}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {item.ruangLingkup.map((scope) => (
                      <span key={`${item.id}-${scope}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        {scope}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-5 text-sm">
                    <button type="button" onClick={() => setDetailItem(item)} className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900">
                      <Eye size={16} />
                      <span className="underline underline-offset-2">Lihat Detail</span>
                    </button>
                    <button type="button" onClick={() => setReviewItem(item)} className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700">
                      <MessageSquareText size={16} />
                      <span>Review</span>
                    </button>
                    <button type="button" onClick={() => openEdit(item)} className="inline-flex items-center gap-2 text-amber-600 hover:text-amber-700">
                      <Pencil size={16} />
                      <span>Edit</span>
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(item)} className="inline-flex items-center gap-2 text-red-500 hover:text-red-700">
                      <Trash2 size={16} />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#173B82]">
                    <FileText size={15} />
                    Hasil Review Admin
                  </div>
                  <p className="text-sm text-slate-600">{item.reviewComment || reviewCopy[item.statusPengajuan]}</p>
                  {item.reviewedAt && (
                    <p className="mt-2 text-xs text-slate-500">
                      Diperbarui oleh {item.reviewedBy || 'Admin'} pada {item.reviewedAt}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {detailItem && (
        <DetailPengajuanModal item={detailItem} onClose={() => setDetailItem(null)} />
      )}

      {reviewItem && (
        <DetailPengajuanModal item={reviewItem} onClose={() => setReviewItem(null)} scrollToReview />
      )}

      {/* Edit Modal */}
      {editForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Edit Pengajuan</h3>
              <button type="button" onClick={() => setEditForm(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-700">Judul Pengajuan</label>
                <input type="text" value={editForm.judul} onChange={(e) => setEditForm((p) => p ? { ...p, judul: e.target.value } : p)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Mitra Tujuan</label>
                <input type="text" value={editForm.mitra} onChange={(e) => setEditForm((p) => p ? { ...p, mitra: e.target.value } : p)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Jurusan/Unit</label>
                <input type="text" value={editForm.jurusan} onChange={(e) => setEditForm((p) => p ? { ...p, jurusan: e.target.value } : p)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Jenis Dokumen</label>
                <select value={editForm.jenisDokumen} onChange={(e) => setEditForm((p) => p ? { ...p, jenisDokumen: e.target.value } : p)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  <option>MoU</option><option>MoA</option><option>IA</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Tanggal Mulai</label>
                <input type="date" value={editForm.tanggalMulai} onChange={(e) => setEditForm((p) => p ? { ...p, tanggalMulai: e.target.value } : p)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Tanggal Berakhir</label>
                <input type="date" value={editForm.tanggalBerakhir} onChange={(e) => setEditForm((p) => p ? { ...p, tanggalBerakhir: e.target.value } : p)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-700">Ruang Lingkup</label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ruangLingkupOptions.map((opt) => {
                    const checked = editForm.ruangLingkup.includes(opt);
                    return (
                      <label key={opt} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${checked ? 'border-[#173B82] bg-[#EEF2FF] text-[#173B82]' : 'border-slate-300 bg-white text-slate-700 hover:border-[#173B82]'}`}>
                        <input type="checkbox" checked={checked} onChange={() => setEditForm((p) => { if (!p) return p; const exists = p.ruangLingkup.includes(opt); return { ...p, ruangLingkup: exists ? p.ruangLingkup.filter((r) => r !== opt) : [...p.ruangLingkup, opt] }; })} className="h-4 w-4 accent-[#173B82]" />
                        {opt}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setEditForm(null)} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200">Batal</button>
              <button type="button" onClick={saveEdit} className="h-9 rounded-lg bg-[#173B82] px-4 text-sm font-semibold text-white hover:bg-[#2A4A8F]">Simpan Perubahan</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Hapus Pengajuan</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-700">Yakin ingin menghapus pengajuan <span className="font-semibold">{deleteTarget.judulPengajuan}</span>? Tindakan ini tidak bisa dibatalkan.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setDeleteTarget(null)} className="h-9 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200">Batal</button>
              <button type="button" onClick={confirmDelete} className="h-9 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {infoModalMessage && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-900">Informasi</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-700">{infoModalMessage}</p>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setInfoModalMessage(null)} className="h-9 rounded-lg bg-[#173B82] px-4 text-sm font-semibold text-white hover:bg-[#2A4A8F]">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
