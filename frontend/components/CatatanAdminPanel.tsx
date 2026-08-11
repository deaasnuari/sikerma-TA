'use client';

import { useState, useEffect, useCallback } from 'react';
import { StickyNote, Plus, Pencil, Trash2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import {
  fetchCatatanAdmin,
  createCatatanAdmin,
  updateCatatanAdmin,
  deleteCatatanAdmin,
  type CatatanAdminItem,
} from '@/services/catatanAdminService';

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface Props {
  pengajuanId: number;
}

export default function CatatanAdminPanel({ pengajuanId }: Props) {
  const [items, setItems] = useState<CatatanAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form tambah
  const [addText, setAddText] = useState('');
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form edit
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  // Hapus
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Server tidak merespons. Coba lagi.')), 8000),
      );
      const data = await Promise.race([fetchCatatanAdmin(pengajuanId), timeout]);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat catatan');
    } finally {
      setLoading(false);
    }
  }, [pengajuanId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const teks = addText.trim();
    if (!teks) return;
    setAdding(true);
    try {
      const created = await createCatatanAdmin(pengajuanId, teks);
      setItems((prev) => [created, ...prev]);
      setAddText('');
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambahkan catatan');
    } finally {
      setAdding(false);
    }
  };

  const handleEdit = async (id: number) => {
    const teks = editText.trim();
    if (!teks) return;
    setSaving(true);
    try {
      const updated = await updateCatatanAdmin(id, teks);
      setItems((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memperbarui catatan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteCatatanAdmin(id);
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus catatan');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <StickyNote size={14} className="text-amber-600" />
          <span className="text-xs font-semibold text-amber-800">Catatan Admin</span>
          {items.length > 0 && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {items.length}
            </span>
          )}
        </div>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => { setShowAddForm(true); setError(null); }}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            <Plus size={11} />
            Tambah Catatan
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Form tambah */}
        {showAddForm && (
          <div className="rounded-lg border border-amber-300 bg-white p-3 shadow-sm">
            <textarea
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              placeholder="Tulis catatan internal admin di sini..."
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddText(''); setError(null); }}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100"
              >
                <X size={11} /> Batal
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding || !addText.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {adding ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Simpan
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={18} className="animate-spin text-amber-400" />
          </div>
        )}

        {/* Empty */}
        {!loading && items.length === 0 && !showAddForm && (
          <p className="text-center text-[11px] text-amber-600/70 py-4">
            Belum ada catatan admin untuk pengajuan ini.
          </p>
        )}

        {/* List catatan */}
        {!loading && items.map((catatan) => (
          <div
            key={catatan.id}
            className="rounded-lg border border-amber-200 bg-white p-3 shadow-sm"
          >
            {editId === catatan.id ? (
              /* Mode edit */
              <>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditId(null); setError(null); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100"
                  >
                    <X size={11} /> Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(catatan.id)}
                    disabled={saving || !editText.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Simpan
                  </button>
                </div>
              </>
            ) : (
              /* Mode tampil */
              <>
                <p className="text-[12px] text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {catatan.teks}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">
                    {catatan.dibuat_oleh} · {formatDateTime(catatan.created_at)}
                    {catatan.updated_at !== catatan.created_at && ' (diedit)'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setEditId(catatan.id); setEditText(catatan.teks); setError(null); }}
                      className="rounded-md p-1 text-gray-400 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                      title="Edit catatan"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(catatan.id)}
                      disabled={deletingId === catatan.id}
                      className="rounded-md p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
                      title="Hapus catatan"
                    >
                      {deletingId === catatan.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
