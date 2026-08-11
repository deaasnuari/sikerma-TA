'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  createMasterRuangLingkup,
  deleteMasterRuangLingkup,
  getMasterRuangLingkup,
  updateMasterRuangLingkup,
  type MasterRuangLingkup,
} from '@/services/masterRuangLingkupService';

type FormState = {
  nama_ruang_lingkup: string;
  aktif: boolean;
};

const emptyForm: FormState = {
  nama_ruang_lingkup: '',
  aktif: true,
};

const campusRuangLingkupReferences = [
  'Penelitian',
  'Pengabdian Masyarakat',
  'Magang / PKL',
  'Pelatihan & Workshop',
  'Pertukaran Pelajar',
  'Rekrutmen',
  'Riset Bersama',
  'Pengembangan Kurikulum',
];

export default function MasterRuangLingkupPage() {
  const [rows, setRows] = useState<MasterRuangLingkup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [showModal, setShowModal] = useState(false);
  const [editingRow, setEditingRow] = useState<MasterRuangLingkup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const availableReferenceOptions = useMemo(() => {
    const existingNames = new Set(rows.map((item) => item.nama_ruang_lingkup.trim().toLowerCase()));
    return campusRuangLingkupReferences.filter((name) => !existingNames.has(name.toLowerCase()));
  }, [rows]);

  useEffect(() => {
    let mounted = true;

    const loadRows = async () => {
      try {
        setError(null);
        const data = await getMasterRuangLingkup();
        if (mounted) {
          setRows(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Gagal memuat master ruang lingkup.');
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

  const openCreate = () => {
    setEditingRow(null);
    setForm({
      ...emptyForm,
      nama_ruang_lingkup: availableReferenceOptions[0] ?? '',
    });
    setShowModal(true);
  };

  const openEdit = (item: MasterRuangLingkup) => {
    setEditingRow(item);
    setForm({
      nama_ruang_lingkup: item.nama_ruang_lingkup,
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
    if (!form.nama_ruang_lingkup.trim()) {
      setError(editingRow ? 'Nama ruang lingkup wajib diisi.' : 'Pilih ruang lingkup dari referensi kampus.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        nama_ruang_lingkup: form.nama_ruang_lingkup.trim(),
        aktif: form.aktif,
      };

      const saved = editingRow
        ? await updateMasterRuangLingkup(editingRow.id, payload)
        : await createMasterRuangLingkup(payload);

      setRows((prev) => {
        if (editingRow) {
          return prev.map((item) => (item.id === editingRow.id ? saved : item));
        }

        return [saved, ...prev];
      });

      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan master ruang lingkup.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: MasterRuangLingkup) => {
    if (!confirm(`Yakin ingin menghapus ruang lingkup "${item.nama_ruang_lingkup}"?`)) {
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await deleteMasterRuangLingkup(item.id);
      setRows((prev) => prev.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus master ruang lingkup.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return rows.filter((item) => {
      const matchSearch = !keyword || item.nama_ruang_lingkup.toLowerCase().includes(keyword);
      const matchStatus = filterStatus === 'Semua Status' || (filterStatus === 'Aktif' ? item.aktif : !item.aktif);

      return matchSearch && matchStatus;
    });
  }, [rows, search, filterStatus]);

  const summary = {
    total: rows.length,
    aktif: rows.filter((item) => item.aktif).length,
    nonAktif: rows.filter((item) => !item.aktif).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Master Ruang Lingkup</h1>
          <p className="page-subtitle mt-0.5">Kelola referensi ruang lingkup kerja sama</p>
        </div>

        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg border border-[#1E376C] bg-white px-3 py-2 text-[12px] font-semibold text-[#1E376C] shadow-sm transition hover:bg-[#EEF2FF]"
        >
          <Plus size={15} />
          Referensi Kampus
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-0.5 text-[17px] font-bold text-slate-900">{summary.total}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Aktif</p>
          <p className="mt-0.5 text-[17px] font-bold text-emerald-700">{summary.aktif}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Non Aktif</p>
          <p className="mt-0.5 text-[17px] font-bold text-slate-700">{summary.nonAktif}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama ruang lingkup..."
            className="input-field w-full pl-9 pr-4 py-2.5 text-[12px]"
          />
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
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Nama Ruang Lingkup</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-gray-500">Memuat data master ruang lingkup...</td>
                </tr>
              )}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-gray-400">Tidak ada data ditemukan</td>
                </tr>
              )}

              {!loading && filteredRows.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 transition hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.nama_ruang_lingkup}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold ${item.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {item.aktif ? 'Aktif' : 'NonAktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(item)} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(item)} disabled={submitting} className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50" title="Hapus">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-bold text-gray-900">{editingRow ? 'Edit Ruang Lingkup' : 'Tambah Ruang Lingkup'}</h2>
                <p className="text-[12px] text-gray-500">Lengkapi data master ruang lingkup kerja sama</p>
              </div>
              <button onClick={closeModal} className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-500 transition hover:bg-gray-50">Tutup</button>
            </div>

            <div className="space-y-4">
              <label className="block text-[12px] font-medium text-gray-700">
                Nama Ruang Lingkup *
                {editingRow ? (
                  <input
                    value={form.nama_ruang_lingkup}
                    onChange={(event) => setForm((prev) => ({ ...prev, nama_ruang_lingkup: event.target.value }))}
                    className="input-field mt-1.5 w-full px-4 py-2.5 text-[12px]"
                  />
                ) : (
                  <>
                    <select
                      value={form.nama_ruang_lingkup}
                      onChange={(event) => setForm((prev) => ({ ...prev, nama_ruang_lingkup: event.target.value }))}
                      className="input-field mt-1.5 w-full px-4 py-2.5 text-[12px]"
                      disabled={availableReferenceOptions.length === 0}
                    >
                      {availableReferenceOptions.length === 0 ? (
                        <option value="">Semua referensi sudah ditambahkan</option>
                      ) : (
                        availableReferenceOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))
                      )}
                    </select>
                    <p className="mt-1 text-[10px] text-gray-500">Pilih dari daftar referensi kampus, tanpa input manual.</p>
                  </>
                )}
              </label>

              <label className="inline-flex items-center gap-2 text-[12px] font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={form.aktif}
                  onChange={(event) => setForm((prev) => ({ ...prev, aktif: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-[#173B82]"
                />
                Status Aktif
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={closeModal} className="rounded-xl border border-gray-200 px-4 py-2 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50" disabled={submitting}>
                Batal
              </button>
              <button onClick={handleSave} className="btn-primary rounded-xl px-4 py-2 text-[12px] font-semibold" disabled={submitting || (!editingRow && availableReferenceOptions.length === 0)}>
                {submitting ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
