'use client';

import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useRouter } from 'next/navigation';
import { Activity, ListChecks, Plus } from 'lucide-react';
import {
  addMonevManual,
  deleteMonevManual,
  getMonevByDokumenKerjasamaId,
  type MonevQuarter,
} from '@/services/monevService';
import { showNotice } from '@/lib/dialog';

interface Props {
  // id dokumen_kerjasama (selalu ada untuk setiap baris Detail Kerjasama) — kunci utama
  // Monev manual supaya tetap bisa diisi walau dokumennya tidak punya pengajuan sumber.
  dokumenKerjasamaId: number;
  // pengajuan_id sumber kerjasama ini (kalau ada) — dipakai HANYA untuk menampilkan
  // aktivitas dari Story & tombol "Lihat Story Aktivitas". Boleh kosong.
  pengajuanId?: number;
}

type ManualFormState = {
  catatanMonitoring: string;
  hasilEvaluasi: string;
  kendala: string;
  tindakLanjut: string;
  tautanDokumentasi: string;
};

const emptyForm: ManualFormState = {
  catatanMonitoring: '',
  hasilEvaluasi: '',
  kendala: '',
  tindakLanjut: '',
  tautanDokumentasi: '',
};

const manualFields: Array<{ key: keyof ManualFormState; label: string; type: 'textarea' | 'text' }> = [
  { key: 'catatanMonitoring', label: 'Catatan Monitoring', type: 'textarea' },
  { key: 'hasilEvaluasi', label: 'Hasil Evaluasi', type: 'textarea' },
  { key: 'kendala', label: 'Kendala', type: 'textarea' },
  { key: 'tindakLanjut', label: 'Tindak Lanjut', type: 'textarea' },
  { key: 'tautanDokumentasi', label: 'Tautan Dokumentasi (opsional)', type: 'text' },
];

function formatTanggal(value: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
}

// Monev Triwulan: menggabungkan aktivitas dari Story (read-only, otomatis dikelompokkan
// per triwulan berdasarkan tanggal aktivitasnya oleh backend) dengan catatan Monev manual
// (Catatan Monitoring/Hasil Evaluasi/Kendala/Tindak Lanjut) yang bisa diisi di sini.
export default function MonevTriwulanSection({ dokumenKerjasamaId, pengajuanId }: Props) {
  const router = useRouter();
  const [quarters, setQuarters] = useState<MonevQuarter[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTahun, setSelectedTahun] = useState<number | null>(null);
  const [openFormKey, setOpenFormKey] = useState<string | null>(null);
  const [formState, setFormState] = useState<ManualFormState>(emptyForm);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const konfirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const mintaKonfirmasi = (): Promise<boolean> => {
    setKonfirmasiHapus(true);
    return new Promise<boolean>((resolve) => { konfirmResolveRef.current = resolve; });
  };
  const tutupKonfirmasi = (hasil: boolean) => {
    konfirmResolveRef.current?.(hasil);
    konfirmResolveRef.current = null;
    setKonfirmasiHapus(false);
  };
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getMonevByDokumenKerjasamaId(dokumenKerjasamaId);
      setQuarters(data);
      setSelectedTahun((prev) => prev ?? data[0]?.tahun ?? new Date().getFullYear());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data Monev.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokumenKerjasamaId]);

  async function handleSubmitManual(quarter: MonevQuarter) {
    setSubmitting(true);
    try {
      await addMonevManual({
        dokumenKerjasamaId,
        tahun: quarter.tahun,
        triwulan: quarter.triwulan,
        ...formState,
      });
      setFormState(emptyForm);
      setOpenFormKey(null);
      await load();
    } catch (e) {
      showNotice(e instanceof Error ? e.message : 'Gagal menyimpan catatan Monev.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteManual(id: number) {
    if (!(await mintaKonfirmasi())) return;
    setDeletingId(id);
    try {
      await deleteMonevManual(id);
      await load();
    } catch (e) {
      showNotice(e instanceof Error ? e.message : 'Gagal menghapus catatan Monev.');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-6 text-center text-[12px] text-gray-500">
        Memuat data Monev...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-600">{error}</div>
    );
  }

  const allQuarters = quarters ?? [];
  const years = Array.from(new Set(allQuarters.map((q) => q.tahun))).sort((a, b) => b - a);
  const quartersForYear = allQuarters
    .filter((q) => q.tahun === selectedTahun)
    .sort((a, b) => a.triwulan - b.triwulan);

  return (
    <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-[#1E376C]" />
          <p className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide">
            Monev (Monitoring dan Evaluasi)
          </p>
        </div>
        <div className="flex items-center gap-1">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setSelectedTahun(y)}
              className={`rounded-md px-2 py-1 text-[10.5px] font-semibold transition-colors ${
                y === selectedTahun ? 'bg-[#1E376C] text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {quartersForYear.map((q) => {
          const key = `${q.tahun}-${q.triwulan}`;
          const isFormOpen = openFormKey === key;

          return (
            <div key={key} className="rounded-lg border border-gray-200 bg-white p-3">
              {(() => {
                const laporanEntries = q.monev.filter((m) => m.jenis === 'laporan');
                const catatanEntries = q.monev.filter((m) => m.jenis === 'catatan');
                const summary = [
                  `${q.aktivitas.length} aktivitas`,
                  `${laporanEntries.length} laporan`,
                  `${catatanEntries.length} catatan`,
                ].join(' · ');

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-gray-800">{q.label}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9.5px] font-medium text-gray-500">
                        {summary}
                      </span>
                    </div>

                    {/* Aktivitas otomatis dari Story — read-only, edit/hapus lewat Story Aktivitas */}
                    {q.aktivitas.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {q.aktivitas.map((a) => (
                          <li key={a.id} className="flex items-start gap-1.5 text-[10.5px] text-gray-700">
                            <Activity size={11} className="mt-0.5 shrink-0 text-emerald-600" />
                            <span>
                              <span className="font-medium text-gray-800">{formatTanggal(a.tanggal)}</span> — {a.judul}
                              <span className="ml-1 text-gray-400">({a.jenisAktivitas})</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[10.5px] italic text-gray-400">Belum ada aktivitas dari Story pada triwulan ini.</p>
                    )}

                    {/* Laporan Pelaksanaan formal — dikirim dari Story & Aktivitas -> Buat
                        Laporan (selalu ada file). Ditampilkan terpisah dari catatan manual
                        karena field kegiatan/hasil di sini berisi Ruang Lingkup/Output-Outcome
                        dari form IA, bukan Catatan Monitoring/Hasil Evaluasi. */}
                    {laporanEntries.length > 0 && (
                      <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                        {laporanEntries.map((m) => (
                          <div key={m.id} className="rounded-md bg-blue-50 p-2 text-[10.5px] text-gray-700">
                            <p className="font-semibold text-[#1E376C]">
                              Laporan Pelaksanaan{m.nomorDokumen ? ` — ${m.nomorDokumen}` : ''}
                            </p>
                            {m.judulKerjasama && <p className="mt-0.5">{m.judulKerjasama}</p>}
                            {m.fileUrl && (
                              <a
                                href={m.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-block text-blue-600 underline"
                              >
                                Lihat file{m.fileNama ? `: ${m.fileNama}` : ''}
                              </a>
                            )}
                            <div className="mt-1 flex items-center justify-between text-[9.5px] text-gray-400">
                              <span>{m.dikirimOlehNama ? `dikirim oleh ${m.dikirimOlehNama}` : ''}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteManual(m.id)}
                                disabled={deletingId === m.id}
                                className="font-semibold text-red-500 hover:underline disabled:opacity-50"
                              >
                                {deletingId === m.id ? 'Menghapus...' : 'Hapus'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Catatan Monev manual — ditambah langsung dari sini, tidak pernah punya file */}
                    {catatanEntries.length > 0 && (
                      <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                        {catatanEntries.map((m) => (
                          <div key={m.id} className="rounded-md bg-slate-50 p-2 text-[10.5px] text-gray-700">
                            {m.catatanMonitoring && (
                              <p><span className="font-semibold">Catatan Monitoring:</span> {m.catatanMonitoring}</p>
                            )}
                            {m.hasilEvaluasi && (
                              <p><span className="font-semibold">Hasil Evaluasi:</span> {m.hasilEvaluasi}</p>
                            )}
                            {m.kendala && <p><span className="font-semibold">Kendala:</span> {m.kendala}</p>}
                            {m.tindakLanjut && <p><span className="font-semibold">Tindak Lanjut:</span> {m.tindakLanjut}</p>}
                            {m.tautanDokumentasi && (
                              <p>
                                <span className="font-semibold">Dokumentasi:</span>{' '}
                                <a href={m.tautanDokumentasi} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                                  Lihat tautan
                                </a>
                              </p>
                            )}
                            <div className="mt-1 flex items-center justify-between text-[9.5px] text-gray-400">
                              <span>{m.dikirimOlehNama ? `oleh ${m.dikirimOlehNama}` : ''}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteManual(m.id)}
                                disabled={deletingId === m.id}
                                className="font-semibold text-red-500 hover:underline disabled:opacity-50"
                              >
                                {deletingId === m.id ? 'Menghapus...' : 'Hapus'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {isFormOpen ? (
                <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                  {manualFields.map((field) => (
                    <div key={field.key}>
                      <label className="mb-0.5 block text-[9.5px] font-medium text-gray-500">{field.label}</label>
                      {field.type === 'textarea' ? (
                        <textarea
                          rows={2}
                          value={formState[field.key]}
                          onChange={(e) => setFormState((s) => ({ ...s, [field.key]: e.target.value }))}
                          className="w-full rounded-md border border-gray-200 px-2 py-1 text-[10.5px] outline-none focus:border-[#1E376C]"
                        />
                      ) : (
                        <input
                          type="text"
                          value={formState[field.key]}
                          onChange={(e) => setFormState((s) => ({ ...s, [field.key]: e.target.value }))}
                          className="w-full rounded-md border border-gray-200 px-2 py-1 text-[10.5px] outline-none focus:border-[#1E376C]"
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => { setOpenFormKey(null); setFormState(emptyForm); }}
                      className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubmitManual(q)}
                      disabled={submitting}
                      className="rounded-md bg-[#1E376C] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#2B4A93] disabled:opacity-60"
                    >
                      {submitting ? 'Menyimpan...' : 'Simpan'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setOpenFormKey(key); setFormState(emptyForm); }}
                  className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#1E376C] hover:underline"
                >
                  <Plus size={11} /> Tambah Catatan Monev
                </button>
              )}
            </div>
          );
        })}
      </div>

      {pengajuanId ? (
        <button
          type="button"
          onClick={() => router.push(`/admin/story_aktivitas/${pengajuanId}`)}
          className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[#1E376C] hover:underline"
        >
          <Activity size={12} /> Lihat Story Aktivitas lengkap
        </button>
      ) : (
        <p className="mt-3 text-[10.5px] italic text-gray-400">
          Dokumen ini belum terhubung ke pengajuan sumber, jadi belum ada aktivitas otomatis dari Story — catatan Monev manual di atas tetap bisa diisi.
        </p>
      )}

      <ConfirmDialog
        open={konfirmasiHapus}
        title="Hapus catatan Monev?"
        message="Catatan Monev manual ini akan dihapus."
        confirmLabel="Ya, hapus"
        onConfirm={() => tutupKonfirmasi(true)}
        onCancel={() => tutupKonfirmasi(false)}
      />
    </div>
  );
}
