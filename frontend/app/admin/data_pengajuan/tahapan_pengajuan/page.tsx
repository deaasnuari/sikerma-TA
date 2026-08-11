'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Loader2, AlertCircle, Check, X,
  ChevronDown, GitBranch, StickyNote, History,
} from 'lucide-react';
import {
  getTahapan, syncFromApi, setStage, updateTahapanViaApi,
  ALL_STAGES, GROUP_CONFIG, STAGE_DIBATALKAN, STAGE_SELESAI,
  type PengajuanTahapan, type StageGroup, type RiwayatEntry,
} from '@/services/tahapanPengajuanService';
import { fetchPengajuanDataFromApi, type PengajuanItem } from '@/services/adminPengajuanService';
import CatatanAdminPanel from '@/components/CatatanAdminPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch { return iso; }
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

interface DropdownProps {
  pengajuanId: number;
  currentStage: string | null;
  onSelect: (t: PengajuanTahapan) => void;
  onClose: () => void;
}

function StageDropdown({ pengajuanId, currentStage, onSelect, onClose }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSelect = (stage: typeof ALL_STAGES[number]) => {
    // Optimistic: update localStorage dan tutup dropdown langsung
    const optimistic = setStage(pengajuanId, stage);
    onSelect(optimistic);
    onClose();
    // Sync ke server di background
    void updateTahapanViaApi(pengajuanId, stage).catch(() => {});
  };

  const handleClear = () => {
    const awal = ALL_STAGES.find((s) => s.name === 'Pengajuan Awal') ?? ALL_STAGES[0];
    const optimistic = setStage(pengajuanId, awal);
    onSelect(optimistic);
    onClose();
    void updateTahapanViaApi(pengajuanId, awal).catch(() => {});
  };

  const groups: StageGroup[] = ['todo', 'in_progress', 'complete'];

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 w-72 rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Pilih Tahapan</span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={13} />
        </button>
      </div>

      <div className="py-1">
        {currentStage && currentStage !== 'Pengajuan Awal' && (
          <button
            type="button"
            onClick={handleClear}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 text-[11px] text-gray-400"
          >
            <X size={10} /> Kembalikan ke Pengajuan Awal
          </button>
        )}

        {groups.map((group) => {
          const items = ALL_STAGES.filter((s) => s.group === group);
          if (!items.length) return null;
          const cfg = GROUP_CONFIG[group];
          return (
            <div key={group}>
              <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {cfg.label}
              </p>
              {items.map((stage) => {
                const isActive = currentStage === stage.name;
                const isDibatalkan = stage.name === STAGE_DIBATALKAN;
                const isSelesai = stage.name === STAGE_SELESAI;
                return (
                  <button
                    key={stage.name}
                    type="button"
                    onClick={() => handleSelect(stage)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                      isDibatalkan
                        ? 'hover:bg-red-50'
                        : isSelesai
                          ? 'hover:bg-green-50'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${stage.dot}`} />
                    <span className={`flex-1 text-[12px] truncate ${
                      isActive
                        ? 'font-semibold text-gray-900'
                        : isDibatalkan
                          ? 'text-red-600'
                          : isSelesai
                            ? 'text-green-700'
                            : 'text-gray-700'
                    }`}>
                      {stage.name}
                      {(isSelesai || isDibatalkan) && (
                        <span className="ml-1 text-[9px] opacity-60">→ buka review</span>
                      )}
                    </span>
                    {isActive && <Check size={12} className="text-[#1E376C] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({
  tahapan,
  onUpdate,
}: {
  tahapan: PengajuanTahapan;
  onUpdate: (t: PengajuanTahapan) => void;
}) {
  const [open, setOpen] = useState(false);
  const stage = ALL_STAGES.find((s) => s.name === tahapan.stage);
  const isDibatalkan = tahapan.stage === STAGE_DIBATALKAN;
  const cfg = tahapan.group ? GROUP_CONFIG[tahapan.group] : null;

  const badgeClass = isDibatalkan
    ? 'bg-red-50 text-red-700 border-red-200'
    : cfg
      ? cfg.badge
      : 'bg-gray-50 text-gray-400 border-gray-200 border-dashed';

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors hover:shadow-sm whitespace-nowrap ${badgeClass}`}
      >
        {stage
          ? <span className={`h-2 w-2 rounded-full flex-shrink-0 ${stage.dot}`} />
          : <span className="h-2 w-2 rounded-full bg-gray-200 flex-shrink-0" />}
        <span className="max-w-[150px] truncate">
          {tahapan.stage ?? 'Pilih tahapan'}
        </span>
        <ChevronDown size={9} className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <StageDropdown
          pengajuanId={tahapan.pengajuanId}
          currentStage={tahapan.stage}
          onSelect={(t) => {
            onUpdate(t);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ── Riwayat modal ─────────────────────────────────────────────────────────────

function RiwayatModal({
  item,
  riwayat,
  onClose,
}: {
  item: PengajuanItem;
  riwayat: RiwayatEntry[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-[11px] font-bold text-[#1E376C]">{item.nomorPengajuan}</p>
            <p className="text-xs text-gray-600 truncate max-w-[280px]">{item.judulPengajuan}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <div className="flex items-center gap-2 mb-4">
            <History size={14} className="text-[#1E376C]" />
            <span className="text-xs font-bold text-[#1E376C] uppercase tracking-wide">Riwayat Perubahan Tahapan</span>
          </div>
          {riwayat.length === 0 ? (
            <p className="text-center text-[12px] text-gray-400 py-6">Belum ada riwayat perubahan.</p>
          ) : (
            <ol className="relative border-l border-gray-200 space-y-4 ml-2">
              {[...riwayat].reverse().map((r, idx) => {
                const stageInfo = ALL_STAGES.find((s) => s.name === r.stage);
                const isDibatalkan = r.stage === STAGE_DIBATALKAN;
                return (
                  <li key={idx} className="pl-5 relative">
                    <span className={`absolute -left-[7px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${stageInfo?.dot ?? (isDibatalkan ? 'bg-red-500' : 'bg-gray-400')}`} />
                    <p className={`text-[12px] font-semibold ${isDibatalkan ? 'text-red-600' : 'text-gray-800'}`}>
                      {r.stage}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatDateTime(r.changed_at)}
                      {r.changed_by ? ` · ${r.changed_by}` : ''}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Catatan modal ─────────────────────────────────────────────────────────────

function CatatanModal({ item, onClose }: { item: PengajuanItem; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-[11px] font-semibold text-[#1E376C]">{item.nomorPengajuan}</p>
            <p className="text-xs text-gray-600 font-medium max-w-[300px] truncate">{item.judulPengajuan}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 pb-5">
          <CatatanAdminPanel pengajuanId={item.id} />
        </div>
      </div>
    </div>
  );
}

// ── Catatan button ────────────────────────────────────────────────────────────

function CatatanButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
      title="Lihat / tambah catatan admin"
    >
      <StickyNote size={12} />
      Catatan
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TahapanPengajuanPage() {
  const router = useRouter();
  const [list, setList] = useState<PengajuanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tahapanMap, setTahapanMap] = useState<Record<number, PengajuanTahapan>>({});
  const [catatanTarget, setCatatanTarget] = useState<PengajuanItem | null>(null);
  const [riwayatTarget, setRiwayatTarget] = useState<PengajuanItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterGroup, setFilterGroup] = useState<StageGroup | null>(null);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchPengajuanDataFromApi({ perPage: 500 })
      .then((items) => {
        setList(items);
        const map: Record<number, PengajuanTahapan> = {};
        items.forEach((item) => {
          // Sync data dari API ke localStorage
          map[item.id] = syncFromApi(
            item.id,
            item.tahapanStage,
            item.tahapanGroup,
            item.tahapanRiwayat?.map((r) => ({
              stage:      r.stage,
              group:      r.group as StageGroup,
              changed_at: r.changedAt,
              changed_by: r.changedBy,
            })) ?? null,
          );
        });
        setTahapanMap(map);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = useCallback((updated: PengajuanTahapan) => {
    setTahapanMap((prev) => ({ ...prev, [updated.pengajuanId]: updated }));

    // Auto-redirect ke halaman Review saat memilih Selesai atau Dibatalkan
    if (updated.stage === STAGE_SELESAI || updated.stage === STAGE_DIBATALKAN) {
      router.push(`/admin/data_pengajuan?review=${updated.pengajuanId}`);
    }
  }, [router]);

  const filtered = list.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      p.nomorPengajuan.toLowerCase().includes(q) ||
      p.judulPengajuan.toLowerCase().includes(q) ||
      p.namaMitra.toLowerCase().includes(q);
    const tahapan = tahapanMap[p.id] ?? getTahapan(p.id);
    const matchGroup = filterGroup === null || tahapan.group === filterGroup;
    return matchSearch && matchGroup;
  });

  useEffect(() => { setCurrentPage(1); }, [search, filterGroup]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedFiltered = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const riwayatForTarget = riwayatTarget
    ? (tahapanMap[riwayatTarget.id]?.riwayat ?? [])
    : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E376C]/10">
          <GitBranch size={16} className="text-[#1E376C]" />
        </div>
        <div>
          <h1 className="text-base font-bold text-[#1E376C]">Tahapan Pengajuan</h1>
          <p className="text-[11px] text-gray-500">Kelola progres setiap pengajuan secara manual</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pengajuan..."
            className="w-56 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#1E376C]/40"
          />
        </div>
        <div className="flex items-center gap-2">
          {(['todo', 'in_progress', 'complete'] as StageGroup[]).map((g) => {
            const isActive = filterGroup === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setFilterGroup(isActive ? null : g)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium border transition-colors ${
                  isActive
                    ? 'bg-[#1E376C] text-white border-[#1E376C]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                }`}
              >
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${GROUP_CONFIG[g].dot}`} />
                {GROUP_CONFIG[g].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-gray-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
          <AlertCircle size={28} />
          <p className="text-sm">Tidak ada data pengajuan</p>
        </div>
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-center w-10">No</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap">No. Pengajuan</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600">Judul / Mitra</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-center">Status Tahapan</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-center">Riwayat</th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-center">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedFiltered.map((item, index) => {
                const tahapan = tahapanMap[item.id] ?? getTahapan(item.id);
                const riwayatCount = tahapan.riwayat?.length ?? 0;
                return (
                  <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-2.5 text-center text-[11px] text-gray-500 font-medium">
                      {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-[#1E376C] whitespace-nowrap">
                      {item.nomorPengajuan}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-800 max-w-[220px] truncate">{item.judulPengajuan}</p>
                      <p className="text-[10px] text-gray-400 truncate max-w-[220px]">{item.namaMitra}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge tahapan={tahapan} onUpdate={handleUpdate} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setRiwayatTarget(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        <History size={12} />
                        {riwayatCount > 0 ? `${riwayatCount}x` : '-'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <CatatanButton onClick={() => setCatatanTarget(item)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-500">
              Menampilkan <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</strong> dari <strong>{filtered.length}</strong> dokumen
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                &lsaquo; Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) {
                    acc.push('...');
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 text-[11px]">...</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCurrentPage(p as number)}
                      className={`w-8 h-8 rounded text-[11px] font-medium border transition-colors ${
                        currentPage === p
                          ? 'bg-[#1E376C] text-white border-[#1E376C]'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next &rsaquo;
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Modal catatan */}
      {catatanTarget && (
        <CatatanModal item={catatanTarget} onClose={() => setCatatanTarget(null)} />
      )}

      {/* Modal riwayat */}
      {riwayatTarget && (
        <RiwayatModal
          item={riwayatTarget}
          riwayat={riwayatForTarget}
          onClose={() => setRiwayatTarget(null)}
        />
      )}
    </div>
  );
}
