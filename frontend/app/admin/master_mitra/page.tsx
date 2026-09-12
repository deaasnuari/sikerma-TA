'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Building2, ChevronDown, ChevronLeft, ChevronRight, Globe, Pencil, Plus, Search, Trash2, Users, X, type LucideIcon } from 'lucide-react';
import { getPageNumbers } from '@/lib/pagination';
import {
  createMasterMitra,
  deleteMasterMitra,
  getMasterMitra,
  updateMasterMitra,
  type MasterMitra,
} from '@/services/masterMitraService';
import { refreshPengajuanDataFromApi, type PengajuanItem } from '@/services/adminPengajuanService';

type FormState = {
  kode_mitra: string;
  nama_mitra: string;
  kategori_mitra: string;
  bidang_usaha: string;
  tingkat_perusahaan: string;
  negara: string;
  website: string;
  alamat: string;
  email_mitra: string;
  whatsapp_mitra: string;
  no_telepon_mitra: string;
  nama_kontak_utama: string;
  jabatan_kontak_utama: string;
  email_kontak_utama: string;
  telepon_kontak_utama: string;
  aktif: boolean;
};

type GroupedMitraRow = {
  primary: MasterMitra;
  nama_mitra: string;
  kategori_mitra: string;
  negara: string;
  email_mitra: string | null;
  aktif: boolean;
  groupCount: number;
  kontakList: Array<{
    nama: string;
    jabatan: string;
    email: string;
    telepon: string;
  }>;
};

const emptyForm: FormState = {
  kode_mitra: '',
  nama_mitra: '',
  kategori_mitra: '',
  bidang_usaha: '',
  tingkat_perusahaan: '',
  negara: 'Indonesia',
  website: '',
  alamat: '',
  email_mitra: '',
  whatsapp_mitra: '',
  no_telepon_mitra: '',
  nama_kontak_utama: '',
  jabatan_kontak_utama: '',
  email_kontak_utama: '',
  telepon_kontak_utama: '',
  aktif: true,
};

const kategoriOptions = [
  'Perguruan Tinggi',
  'Sekolah/Institusi Pendidikan Lain',
  'Pemerintahan',
  'Swasta/Dunia Usaha dan Dunia Industri (DUDI)',
  'Organisasi Non-Profit / LSM',
  // 4 kategori di bawah ini sudah lama dipakai di data mitra (hasil migrasi/import lama)
  // tapi belum ada di daftar ini — jadi sebelumnya tidak bisa dipilih lewat filter/form.
  'dudi dalam negeri',
  'dudi luar negeri',
  'instansi dalam negeri',
  'instansi luar negeri',
] as const;

const tingkatOptions = ['Lokal', 'Nasional', 'Internasional', 'Multinasional'] as const;
const tingkatFilterOptions = ['Semua Tingkat', ...tingkatOptions] as const;

const bidangUsahaOptions = [
  'Manufaktur',
  'Start Up',
  'Pendidikan',
  'Jasa',
  'Kesehatan',
  'Keuangan',
  'Teknologi Informasi',
  'Organisasi Nirlaba',
  'Supplayer',
  'Man Power',
  'Engineering, Procurement, and Construction (EPC)',
  'Transportasi Darat',
  'Transportasi Laut',
  'Transportasi Udara',
  'Lainnya',
] as const;

const DISMISSED_MITRA_ALERTS_KEY = 'admin-mitra-alerts-dismissed';

function normalizeMitraName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getDismissedMitraAlerts(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DISMISSED_MITRA_ALERTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function MasterMitraPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<MasterMitra[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterKategori, setFilterKategori] = useState('Semua Kategori');
  const [filterTingkat, setFilterTingkat] = useState<(typeof tingkatFilterOptions)[number]>('Semua Tingkat');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showModal, setShowModal] = useState(false);
  const [editingRow, setEditingRow] = useState<MasterMitra | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MasterMitra | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pengajuanItems, setPengajuanItems] = useState<PengajuanItem[]>([]);
  const [dismissedMitraAlerts, setDismissedMitraAlerts] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadRows = async () => {
      try {
        setError(null);
        const data = await getMasterMitra();
        if (mounted) {
          setRows(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Gagal memuat master mitra.');
          setRows([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadRows();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setDismissedMitraAlerts(getDismissedMitraAlerts());
  }, []);

  const dismissMitraAlert = (nama: string) => {
    const normalized = normalizeMitraName(nama);
    setDismissedMitraAlerts((prev) => {
      if (prev.includes(normalized)) {
        return prev;
      }

      const next = [...prev, normalized];
      window.localStorage.setItem(DISMISSED_MITRA_ALERTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Ambil data pengajuan untuk mendeteksi nama mitra yang diketik manual (belum terdaftar
  // atau sudah terdaftar tapi belum ada kode) supaya admin bisa cepat melengkapinya di sini.
  useEffect(() => {
    let mounted = true;

    refreshPengajuanDataFromApi(true)
      .then((items) => {
        if (mounted) {
          setPengajuanItems(items);
        }
      })
      .catch(() => {
        if (mounted) {
          setPengajuanItems([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const tingkatParam = (searchParams.get('tingkat') || '').trim();
    const kategoriParam = (searchParams.get('kategori') || '').trim();
    const statusParam = (searchParams.get('status') || '').trim().toLowerCase();

    if (tingkatOptions.includes(tingkatParam as (typeof tingkatOptions)[number])) {
      setFilterTingkat(tingkatParam as (typeof tingkatFilterOptions)[number]);
    } else {
      setFilterTingkat('Semua Tingkat');
    }

    if (kategoriOptions.includes(kategoriParam as (typeof kategoriOptions)[number])) {
      setFilterKategori(kategoriParam);
    } else {
      setFilterKategori('Semua Kategori');
    }

    if (statusParam === 'aktif') {
      setFilterStatus('Aktif');
    } else if (statusParam === 'nonaktif' || statusParam === 'non-aktif') {
      setFilterStatus('NonAktif');
    } else {
      setFilterStatus('Semua Status');
    }
  }, [searchParams]);

  // Nama mitra dari pengajuan yang perlu ditindaklanjuti: belum terdaftar sama sekali,
  // atau sudah terdaftar tapi belum diberi kode. Nama yang sudah di-dismiss (mis. sudah
  // dihapus dari Data Kemitraan secara sengaja) tidak dimunculkan lagi di sini.
  const mitraAlerts = useMemo(() => {
    const masterByName = new Map<string, MasterMitra>();
    rows.forEach((row) => masterByName.set(normalizeMitraName(row.nama_mitra), row));

    const dismissedSet = new Set(dismissedMitraAlerts);
    const seen = new Set<string>();
    const alerts: { nama: string; masterMitra: MasterMitra | null }[] = [];

    pengajuanItems.forEach((item) => {
      const nama = (item.namaMitra || '').trim();
      if (!nama || nama === '-') {
        return;
      }

      const norm = normalizeMitraName(nama);
      if (seen.has(norm) || dismissedSet.has(norm)) {
        return;
      }
      seen.add(norm);

      const master = masterByName.get(norm) ?? null;
      if (master && master.kode_mitra) {
        return;
      }

      alerts.push({ nama, masterMitra: master });
    });

    return alerts;
  }, [rows, pengajuanItems, dismissedMitraAlerts]);

  const openCreate = () => {
    setEditingRow(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openCreateWithName = (nama: string) => {
    setEditingRow(null);
    setForm({ ...emptyForm, nama_mitra: nama });
    setShowModal(true);
  };

  const openEdit = (item: MasterMitra) => {
    setEditingRow(item);
    setForm({
      kode_mitra: item.kode_mitra || '',
      nama_mitra: item.nama_mitra,
      kategori_mitra: item.kategori_mitra || '',
      bidang_usaha: item.bidang_usaha || '',
      tingkat_perusahaan: item.tingkat_perusahaan || '',
      negara: item.negara || '',
      website: item.website || '',
      alamat: item.alamat || '',
      email_mitra: item.email_mitra || '',
      whatsapp_mitra: item.whatsapp_mitra || '',
      no_telepon_mitra: item.no_telepon_mitra || '',
      nama_kontak_utama: item.nama_kontak_utama || '',
      jabatan_kontak_utama: item.jabatan_kontak_utama || '',
      email_kontak_utama: item.email_kontak_utama || '',
      telepon_kontak_utama: item.telepon_kontak_utama || '',
      aktif: item.aktif,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) {
      return;
    }

    setShowModal(false);
    setEditingRow(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.nama_mitra.trim()) {
      setError('Nama mitra wajib diisi.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        ...form,
        kode_mitra: form.kode_mitra.trim() || null,
        kategori_mitra: form.kategori_mitra.trim() || null,
        bidang_usaha: form.bidang_usaha.trim() || null,
        tingkat_perusahaan: form.tingkat_perusahaan.trim() || null,
        negara: form.negara.trim() || null,
        website: form.website.trim() || null,
        alamat: form.alamat.trim() || null,
        email_mitra: form.email_mitra.trim() || null,
        whatsapp_mitra: form.whatsapp_mitra.trim() || null,
        no_telepon_mitra: form.no_telepon_mitra.trim() || null,
        nama_kontak_utama: form.nama_kontak_utama.trim() || null,
        jabatan_kontak_utama: form.jabatan_kontak_utama.trim() || null,
        email_kontak_utama: form.email_kontak_utama.trim() || null,
        telepon_kontak_utama: form.telepon_kontak_utama.trim() || null,
      };

      const saved = editingRow
        ? await updateMasterMitra(editingRow.id, payload)
        : await createMasterMitra(payload);

      setRows((prev) => {
        if (editingRow) {
          return prev.map((item) => (item.id === editingRow.id ? saved : item));
        }

        return [saved, ...prev];
      });

      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan master mitra.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    const target = deleteTarget;
    setRows((prev) => prev.filter((row) => row.id !== target.id));
    setDeleteTarget(null);

    try {
      await deleteMasterMitra(target.id);
      // Mitra yang sengaja dihapus admin tidak perlu muncul lagi di alert
      // "perlu ditindaklanjuti" walau masih ada pengajuan yang menyebut namanya.
      dismissMitraAlert(target.nama_mitra);
    } catch (err) {
      setRows((prev) => [...prev, target]);
      setError(err instanceof Error ? err.message : 'Gagal menghapus master mitra.');
    }
  };

  const groupedRows = useMemo<GroupedMitraRow[]>(() => {
    // Sengaja TIDAK digabung berdasarkan nama_mitra lagi — mitra dengan nama
    // sama yang kebetulan terinput dobel di database harus tetap tampil
    // sebagai baris terpisah (kunci per id, bukan per nama), supaya admin
    // bisa lihat & hapus manual satu-satu dari sini. Total yang tampil di
    // sini jadi sama persis dengan jumlah baris di tabel master_mitra.
    const groups = new Map<string, MasterMitra[]>();

    for (const item of rows) {
      const key = String(item.id);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(item);
    }

    return Array.from(groups.values()).map((group) => {
      const primary = group[0];
      const kategoriSet = new Set(group.map((item) => (item.kategori_mitra || '').trim()).filter(Boolean));
      const negaraSet = new Set(group.map((item) => (item.negara || '').trim()).filter(Boolean));
      const kontakMap = new Map<string, { nama: string; jabatan: string; email: string; telepon: string }>();

      for (const item of group) {
        const kontak = {
          nama: (item.nama_kontak_utama || '-').trim() || '-',
          jabatan: (item.jabatan_kontak_utama || '-').trim() || '-',
          email: (item.email_kontak_utama || item.email_mitra || '-').trim() || '-',
          telepon: (item.telepon_kontak_utama || item.whatsapp_mitra || '-').trim() || '-',
        };
        const key = `${kontak.nama}|${kontak.jabatan}|${kontak.email}|${kontak.telepon}`;
        if (!kontakMap.has(key)) {
          kontakMap.set(key, kontak);
        }
      }

      const negaraLabel =
        negaraSet.size <= 1
          ? (Array.from(negaraSet)[0] || primary.negara || '-')
          : 'Multi Negara';

      return {
        primary,
        nama_mitra: primary.nama_mitra,
        kategori_mitra: kategoriSet.size ? Array.from(kategoriSet).join(', ') : '-',
        negara: negaraLabel,
        email_mitra: group.map((item) => item.email_mitra).find((value) => Boolean(value)) || null,
        aktif: group.some((item) => item.aktif),
        groupCount: group.length,
        kontakList: Array.from(kontakMap.values()),
      };
    }).sort((a, b) => {
      const nameA = a.nama_mitra.trim().toLowerCase();
      const nameB = b.nama_mitra.trim().toLowerCase();
      return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return groupedRows.filter((item) => {
      const kontakText = item.kontakList
        .map((kontak) => `${kontak.nama} ${kontak.jabatan} ${kontak.email} ${kontak.telepon}`)
        .join(' ')
        .toLowerCase();

      const matchSearch =
        !keyword ||
        item.nama_mitra.toLowerCase().includes(keyword) ||
        (item.primary.kode_mitra || '').toLowerCase().includes(keyword) ||
        (item.kategori_mitra || '').toLowerCase().includes(keyword) ||
        (item.negara || '').toLowerCase().includes(keyword) ||
        (item.email_mitra || '').toLowerCase().includes(keyword) ||
        kontakText.includes(keyword);
      const matchKategori =
        filterKategori === 'Semua Kategori' ||
        item.kategori_mitra.split(', ').includes(filterKategori) ||
        (filterKategori === 'Industri' && item.kategori_mitra.includes('Perusahaan'));
      const matchTingkat =
        filterTingkat === 'Semua Tingkat' ||
        item.primary.tingkat_perusahaan === filterTingkat;
      const matchStatus = filterStatus === 'Semua Status' || (filterStatus === 'Aktif' ? item.aktif : !item.aktif);

      return matchSearch && matchKategori && matchTingkat && matchStatus;
    });
  }, [groupedRows, search, filterKategori, filterTingkat, filterStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterKategori, filterTingkat, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * itemsPerPage;
  const paginatedRows = filteredRows.slice(pageStartIndex, pageStartIndex + itemsPerPage);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  // `tingkat_perusahaan` (Lokal/Nasional/Internasional/Multinasional) belum
  // pernah diisi untuk sebagian besar mitra lama (kolomnya baru ditambahkan
  // belakangan) — kalau kosong, tebak dari `negara` saja (sama seperti kartu
  // "Dalam Negeri"/"Luar Negeri" di dashboard), supaya Nasional/Lokal +
  // Internasional/Multinasional selalu pas dengan Total Mitra.
  const isNasionalAtauLokal = (item: GroupedMitraRow): boolean => {
    const tingkat = (item.primary.tingkat_perusahaan || '').trim();
    if (tingkat === 'Nasional' || tingkat === 'Lokal') return true;
    if (tingkat === 'Internasional' || tingkat === 'Multinasional') return false;

    const negara = (item.primary.negara || '').trim().toLowerCase();
    return negara === '' || negara === 'indonesia';
  };

  const summary = {
    total: groupedRows.length,
    aktif: groupedRows.filter((item) => item.aktif).length,
    nasional: groupedRows.filter(isNasionalAtauLokal).length,
    internasional: groupedRows.filter((item) => !isNasionalAtauLokal(item)).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Data Kemitraan</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">Kelola data referensi mitra kerja sama Polibatam</p>
        </div>

        <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
          <Plus size={14} />
          Tambah Mitra
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] text-red-700">{error}</div>}

      {mitraAlerts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-[12px] font-semibold text-amber-800">
                {mitraAlerts.length} nama mitra dari pengajuan perlu ditindaklanjuti
              </p>
              <p className="mt-0.5 text-[10.5px] text-amber-700">
                Nama-nama ini diketik manual saat pengajuan (belum terdaftar di Data Kemitraan, atau sudah terdaftar tapi belum ada kode).
              </p>
            </div>
          </div>

          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {mitraAlerts.map((alert) => (
              <div
                key={alert.nama}
                className="flex items-center justify-between gap-3 rounded-md border-l-2 border-amber-400 bg-white py-2.5 pl-3 pr-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold leading-tight text-gray-800">{alert.nama}</p>
                  <p className="mt-0.5 truncate text-[10.5px] leading-tight text-gray-500">
                    {alert.masterMitra ? 'Sudah terdaftar, tapi belum ada kode' : 'Belum terdaftar di Data Kemitraan'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => (alert.masterMitra ? openEdit(alert.masterMitra) : openCreateWithName(alert.nama))}
                    className="rounded-md bg-[#1E376C] px-3 py-1.5 text-[10.5px] font-semibold text-white hover:bg-[#2B4A93]"
                  >
                    {alert.masterMitra ? 'Lengkapi Kode' : 'Tambah Mitra'}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissMitraAlert(alert.nama)}
                    title="Abaikan, jangan tampilkan lagi"
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Building2} label="Total Mitra" value={summary.total} />
        <SummaryCard icon={Users} label="Mitra Aktif" value={summary.aktif} />
        <SummaryCard icon={Globe} label="Nasional / Lokal" value={summary.nasional} />
        <SummaryCard icon={Globe} label="Internasional / Multinasional" value={summary.internasional} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama, kategori, negara, atau email..."
            className="input-field w-full pl-9 pr-4 py-2.5 text-[12px]"
          />
        </div>

        <div className="relative min-w-[180px]">
          <select value={filterKategori} onChange={(event) => setFilterKategori(event.target.value)} className="input-field appearance-none pl-4 pr-9 py-2.5 text-[12px] font-medium">
            <option>Semua Kategori</option>
            {kategoriOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative min-w-[170px]">
          <select value={filterTingkat} onChange={(event) => setFilterTingkat(event.target.value as (typeof tingkatFilterOptions)[number])} className="input-field appearance-none pl-4 pr-9 py-2.5 text-[12px] font-medium">
            {tingkatFilterOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="relative min-w-[160px]">
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="input-field appearance-none pl-4 pr-9 py-2.5 text-[12px] font-medium">
            <option>Semua Status</option>
            <option>Aktif</option>
            <option>NonAktif</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className="table-shell overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="table-head border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Kode</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Nama Mitra</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Kategori</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Negara</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Kontak Utama</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-500">Memuat data master mitra...</td>
                </tr>
              )}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-400">Tidak ada data ditemukan</td>
                </tr>
              )}

              {!loading && paginatedRows.map((item) => (
                <tr key={`${item.primary.id}-${item.nama_mitra}`} className="border-b border-gray-100 transition hover:bg-gray-50/60">
                  <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">{item.primary.kode_mitra || '-'}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.nama_mitra}</p>
                      <p className="text-[10px] text-gray-500">{item.email_mitra || '-'}</p>
                      {item.groupCount > 1 && (
                        <p className="text-[10.5px] font-semibold text-[#173B82]">{item.groupCount} data kontak digabung</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.kategori_mitra || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{item.negara || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="space-y-2">
                      {item.kontakList.map((kontak, index) => (
                        <div key={`${item.primary.id}-kontak-${index}`}>
                          <p className="font-medium text-gray-800">{kontak.nama}</p>
                          <p className="text-[10px] text-gray-500">{kontak.telepon}</p>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold ${item.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {item.aktif ? 'Aktif' : 'NonAktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(item.primary)} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteTarget(item.primary)} disabled={submitting} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50" title="Hapus">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRows.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-gray-500">
              Menampilkan <span className="font-semibold text-gray-700">{pageStartIndex + 1}–{Math.min(pageStartIndex + itemsPerPage, filteredRows.length)}</span> dari{' '}
              <span className="font-semibold text-gray-700">{filteredRows.length}</span> mitra
            </p>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                Prev
              </button>

              {pageNumbers.map((page, idx) =>
                page === '...' ? (
                  <span key={`dots-${idx}`} className="px-2 text-[12px] text-gray-400">
                    …
                  </span>
                ) : (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-[12px] font-semibold transition-colors ${
                      page === safePage
                        ? 'bg-[#1E376C] text-white'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage === totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <h2 className="mb-1 text-[15px] font-bold text-gray-900">Hapus Mitra</h2>
            <p className="mb-1 text-[12px] text-gray-500">Yakin ingin menghapus mitra berikut?</p>
            <p className="mb-5 text-[13px] font-semibold text-gray-800">{deleteTarget.nama_mitra}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={submitting}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={submitting}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-[12px] font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-bold text-gray-900">{editingRow ? 'Edit Master Mitra' : 'Tambah Master Mitra'}</h2>
                <p className="text-[12px] text-gray-500">Lengkapi data mitra kerja sama secara terstruktur</p>
              </div>
              <button onClick={closeModal} className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-500 transition hover:bg-gray-50">Tutup</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Kode Mitra">
                <input value={form.kode_mitra} onChange={(event) => setForm((prev) => ({ ...prev, kode_mitra: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px] font-mono" placeholder="mis. PT001, UN01" />
              </Field>
              <Field label="Nama Mitra *">
                <input value={form.nama_mitra} onChange={(event) => setForm((prev) => ({ ...prev, nama_mitra: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>
              <Field label="Kategori Mitra">
                <select
                  value={form.kategori_mitra}
                  onChange={(event) => setForm((prev) => ({ ...prev, kategori_mitra: event.target.value }))}
                  className="input-field w-full px-4 py-2.5 text-[12px]"
                >
                  <option value="">Pilih kategori mitra</option>
                  {kategoriOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bidang Usaha">
                <select
                  value={form.bidang_usaha}
                  onChange={(event) => setForm((prev) => ({ ...prev, bidang_usaha: event.target.value }))}
                  className="input-field w-full px-4 py-2.5 text-[12px]"
                >
                  <option value="">Pilih bidang usaha</option>
                  {bidangUsahaOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tingkat Perusahaan">
                <select
                  value={form.tingkat_perusahaan}
                  onChange={(event) => setForm((prev) => ({ ...prev, tingkat_perusahaan: event.target.value }))}
                  className="input-field w-full px-4 py-2.5 text-[12px]"
                >
                  <option value="">Pilih tingkat</option>
                  {tingkatOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Negara">
                <input value={form.negara} onChange={(event) => setForm((prev) => ({ ...prev, negara: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>
              <Field label="Website">
                <input value={form.website} onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" placeholder="https://..." />
              </Field>
              <Field label="Email Mitra">
                <input type="email" value={form.email_mitra} onChange={(event) => setForm((prev) => ({ ...prev, email_mitra: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>
              <Field label="WhatsApp Mitra">
                <input value={form.whatsapp_mitra} onChange={(event) => setForm((prev) => ({ ...prev, whatsapp_mitra: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>
              <Field label="No. Telepon">
                <input value={form.no_telepon_mitra} onChange={(event) => setForm((prev) => ({ ...prev, no_telepon_mitra: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Alamat">
                  <textarea value={form.alamat} onChange={(event) => setForm((prev) => ({ ...prev, alamat: event.target.value }))} className="input-field min-h-24 w-full px-4 py-2.5 text-[12px]" />
                </Field>
              </div>

              <div className="md:col-span-2 border-t border-gray-100 pt-4">
                <p className="mb-3 text-[12px] font-semibold text-gray-700">Kontak Utama</p>
              </div>
              <Field label="Nama Kontak Utama">
                <input value={form.nama_kontak_utama} onChange={(event) => setForm((prev) => ({ ...prev, nama_kontak_utama: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>
              <Field label="Jabatan Kontak Utama">
                <input value={form.jabatan_kontak_utama} onChange={(event) => setForm((prev) => ({ ...prev, jabatan_kontak_utama: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>
              <Field label="Email Kontak Utama">
                <input type="email" value={form.email_kontak_utama} onChange={(event) => setForm((prev) => ({ ...prev, email_kontak_utama: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>
              <Field label="Telepon Kontak Utama">
                <input value={form.telepon_kontak_utama} onChange={(event) => setForm((prev) => ({ ...prev, telepon_kontak_utama: event.target.value }))} className="input-field w-full px-4 py-2.5 text-[12px]" />
              </Field>

              <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-[12px] font-semibold text-gray-800">Status aktif</p>
                  <p className="text-[10px] text-gray-500">Tandai apakah mitra ini masih digunakan di sistem</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, aktif: !prev.aktif }))}
                  className={`inline-flex items-center rounded-full px-4 py-2 text-[12px] font-semibold ${form.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                >
                  {form.aktif ? 'Aktif' : 'NonAktif'}
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
              <button onClick={closeModal} className="rounded-lg border border-gray-200 px-4 py-2.5 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                Batal
              </button>
              <button onClick={handleSave} disabled={submitting} className="btn-primary px-4 py-2.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100">
          <Icon size={18} className="text-sky-700" />
        </div>
        <p className="text-[12px] font-medium text-gray-500">{label}</p>
      </div>
      <p className="text-[17px] font-bold text-gray-900">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-[12px] font-medium text-gray-700">
      <span>{label}</span>
      {children}
    </label>
  );
}