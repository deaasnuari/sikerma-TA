'use client';

import { openUrl } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { FileText, Clock, CheckCircle, XCircle, Search, Filter, Plus, Eye, MessageSquare, X, ThumbsUp, FilePenLine, CalendarDays, ChevronLeft, ChevronRight, Pencil, Trash2, ExternalLink, Paperclip, Download, Upload, Bell, CheckSquare, Square } from 'lucide-react';
import { addAdminNotification, markNotificationsByHrefPrefixAsRead } from '@/services/adminService';
import AdminAjukanKerjasamaForm from './AjukanKerjasamaForm';
import InisiasiAsalPanel from '@/components/admin/InisiasiAsalPanel';
import GroupedFilterSelect from '@/components/GroupedFilterSelect';
import ConfirmDialog from '@/components/ConfirmDialog';
import { invalidateRekapCache } from '@/services/dokumenKerjasamaApiService';
import FileRevisiBox from '@/components/FileRevisiBox';
import { buatUrlWhatsAppMitra, buildPesanWhatsAppPengajuan } from '@/lib/whatsappPesan';
import InternalAjukanKerjasamaForm from '@/app/internal/data_pengajuan/AjukanKerjasamaForm';
import { validateSelectedFile } from '@/lib/fileUploadUtils';
import { getPageNumbers } from '@/lib/pagination';
import { downloadTemplate, templateFilesByJenis } from '@/lib/templateDokumen';
import {
  createMasterUnitProdi,
  deleteMasterUnitProdi,
  getCachedMasterUnitProdiTree,
  getMasterUnitProdi,
  updateMasterUnitProdi,
  type MasterUnitProdi,
} from '@/services/masterUnitProdiService';
import {
  createMasterRuangLingkup,
  deleteMasterRuangLingkup,
  getCachedMasterRuangLingkup,
  getMasterRuangLingkup,
  updateMasterRuangLingkup,
  type MasterRuangLingkup,
} from '@/services/masterRuangLingkupService';
import {
  createMasterNegara,
  deleteMasterNegara,
  getCachedMasterNegara,
  getMasterNegara,
  updateMasterNegara,
  type MasterNegara,
} from '@/services/masterNegaraService';
import {
  deletePengajuanItemApi,
  fetchPengajuanDataFromApi,
  getFilteredPengajuanData,
  getPengajuanData,
  getPengajuanStats,
  getPengajuanYearOptions,
  pengajuanDokumenBadge,
  savePengajuanReviewApi,
  savePengajuanRevisionApi,
  accFinalBerkasApi,
  uploadAccFileApi,
  updatePengajuanItemApi,
  type PengajuanItem,
  type PengajuanStatus,
  type PengajuanFileAttachment,
} from '@/services/adminPengajuanService';
import { updateMasterMitra, upsertMasterMitraByName } from '@/services/masterMitraService';
import { getDistribusiKandidat, provisionDistribusiUser, type DistribusiKandidat } from '@/services/distribusiKandidatService';

type EditFormState = {
  id: number;
  updatedAt?: string;
  judulPengajuan: string;
  namaMitra: string;
  namaUnitProdi: string;
  jenisDokumen: string;
  tanggalMulai: string;
  tanggalBerakhir: string;
  ruangLingkup: string[];
};

const statusConfig: Record<PengajuanStatus, { label: string; className: string; iconEl: React.ReactNode }> = {
  Menunggu: {
    label: 'Menunggu',
    className: 'badge badge-warning',
    iconEl: <Clock size={13} />,
  },
  'Menunggu Review': {
    label: 'Menunggu Review',
    className: 'badge badge-warning',
    iconEl: <Clock size={13} />,
  },
  Diproses: {
    label: 'Diproses',
    className: 'badge badge-info',
    iconEl: <Clock size={13} />,
  },
  Revisi: {
    label: 'Review/Revisi',
    className: 'bg-orange-100 text-orange-800 border border-orange-300 rounded-full px-3 py-1 text-[10px] font-semibold',
    iconEl: <Clock size={13} />,
  },
  Disetujui: {
    label: 'Disetujui',
    className: 'badge badge-success',
    iconEl: <CheckCircle size={13} />,
  },
  'Disetujui Internal': {
    label: 'Disetujui Internal',
    className: 'bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-full px-3 py-1 text-[10px] font-semibold',
    iconEl: <CheckCircle size={13} />,
  },
  'Disetujui Mitra': {
    label: 'Disetujui Mitra',
    className: 'bg-cyan-100 text-cyan-800 border border-cyan-300 rounded-full px-3 py-1 text-[10px] font-semibold',
    iconEl: <CheckCircle size={13} />,
  },
  'Final Approved': {
    label: 'Final Approved',
    className: 'bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full px-3 py-1 text-[10px] font-semibold',
    iconEl: <CheckCircle size={13} />,
  },
  Ditolak: {
    label: 'Ditolak',
    className: 'badge badge-danger',
    iconEl: <XCircle size={13} />,
  },
};

const templatePreviewUrlByJenis: Record<string, string> = {
  MoU: '/templates/Draft%20MOU%20Industri.docx',
  MoA: '/templates/Draft%20MOA%20Magang%20Industri.docx',
  IA: '/templates/DRAFT%20IA%20POLIBATAM.docx',
};

type TemplateDokumenConfig = {
  title: string;
  subtitle: string;
  struktur: string[];
  note: string;
};

function buildWhatsAppUrl(value?: string | null, pesan?: string, negara?: string | null): string | null {
  return buatUrlWhatsAppMitra(value, negara, pesan);
}

// Nomor PIC Polibatam disimpan tanpa kode negara (form-nya sudah memberi awalan +62), mis. "812 3457 6789".
function buildPolibatamWhatsAppUrl(value?: string | null, pesan?: string): string | null {
  const local = (value || '').replace(/\D/g, '').replace(/^62/, '').replace(/^0+/, '');
  return local ? `https://wa.me/62${local}${pesan ? `?text=${encodeURIComponent(pesan)}` : ''}` : null;
}

// Kontak person PIC dari pihak mitra (diisi pengusul di bagian "Kontak Person PIC" pada form pengajuan),
// ditampilkan ke admin sebagai koresponden mitra supaya jelas siapa yang dihubungi.
function KoresponMitraCard({ item }: { item: PengajuanItem }) {
  const telepon = item.mitraPicTelepon || item.whatsappPengusul;
  const waUrl = buildWhatsAppUrl(telepon, buildPesanWhatsAppPengajuan(item, item.mitraPicNama), item.mitraNegara);

  return (
    <div className="bg-white rounded-lg px-4 py-3 border border-[#D9DCE4]">
      <p className="text-[12px] font-semibold text-gray-900 mb-3">Kontak Person PIC / Koresponden Mitra</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[10px]">
        <div>
          <p className="text-gray-500">Nama</p>
          <p className="text-gray-900 font-medium">{item.mitraPicNama || '-'}</p>
        </div>
        <div>
          <p className="text-gray-500">Jabatan</p>
          <p className="text-gray-900 font-medium">{item.mitraPicJabatan || '-'}</p>
        </div>
        <div>
          <p className="text-gray-500">Email</p>
          {item.mitraPicEmail ? (
            <a href={`mailto:${item.mitraPicEmail}`} className="font-medium text-gray-900 underline hover:text-gray-700 break-all">
              {item.mitraPicEmail}
            </a>
          ) : (
            <p className="text-gray-900 font-medium">-</p>
          )}
        </div>
        <div>
          <p className="text-gray-500">Telepon / WhatsApp</p>
          {telepon && waUrl ? (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-green-700 underline hover:text-green-800">
              {telepon}
              <ExternalLink size={12} />
            </a>
          ) : (
            <p className="text-gray-900 font-medium">{telepon || '-'}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const editTemplateDokumenMap: Record<string, TemplateDokumenConfig> = {
  MoU: {
    title: 'Memorandum of Understanding (MoU)',
    subtitle: 'Template untuk kesepahaman awal kerja sama',
    struktur: ['Pembukaan', 'Para Pihak', 'Tujuan Kerja Sama', 'Ruang Lingkup', 'Jangka Waktu', 'Penutup'],
    note: 'Template bisa diunduh sebagai acuan. Anda tetap bisa langsung mengunggah dokumen sendiri.',
  },
  MoA: {
    title: 'Memorandum of Agreement (MoA)',
    subtitle: 'Template untuk perjanjian teknis pelaksanaan',
    struktur: ['Dasar Kerja Sama', 'Hak dan Kewajiban', 'Program Pelaksanaan', 'Pendanaan', 'Monitoring', 'Penutup'],
    note: 'Gunakan format MoA resmi agar isi dokumen sesuai standar admin.',
  },
  IA: {
    title: 'Implementation Arrangement (IA)',
    subtitle: 'Template rincian implementasi program',
    struktur: ['Informasi Program', 'Target Kegiatan', 'Peran Tim', 'Timeline', 'Output', 'Pelaporan'],
    note: 'Template IA dipakai untuk detail implementasi kerja sama yang sudah disepakati.',
  },
};

const MAX_EDIT_FILE_SIZE = 10 * 1024 * 1024;

function toDateInputValue(value?: string | null): string {
  if (!value) return '';

  const normalized = value.trim();
  const dayFirstMatch = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dayFirstMatch) {
    return `${dayFirstMatch[3]}-${dayFirstMatch[2].padStart(2, '0')}-${dayFirstMatch[1].padStart(2, '0')}`;
  }

  return normalized.slice(0, 10);
}

function triggerBrowserDownload(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

async function downloadAttachmentFile(url: string, fileName: string) {
  if (url.startsWith('data:')) {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      triggerBrowserDownload(objectUrl, fileName);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    return;
  }

  triggerBrowserDownload(url, fileName);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}.`));

    reader.readAsDataURL(file);
  });
}

async function buildPersistentFileAttachments(files: File[]) {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      url: await readFileAsDataUrl(file),
    }))
  );
}

export default function PengajuanKerjasama() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isAjukanView  = searchParams.get('view') === 'ajukan';
  // Dari kartu Inisiasi: ?view=ajukan&inisiasi=<id> -> pengajuan dibuat sebagai tindak lanjut inisiasi itu.
  const inisiasiParam = Number(searchParams.get('inisiasi'));
  const inisiasiAsalId = isAjukanView && Number.isInteger(inisiasiParam) && inisiasiParam > 0 ? inisiasiParam : null;
  const reviewTargetId = searchParams.get('review') ? Number(searchParams.get('review')) : null;

  // Keep hook order stable on every render to avoid runtime hook mismatch.
  const [filterJurusan, setFilterJurusan] = useState('Semua Kategori Kerjasama');
  const [filterUnitProdi, setFilterUnitProdi] = useState('Semua Jurusan/Prodi/Unit');
  const [filterStatus, setFilterStatus] = useState('Semua Status');
  const [filterTahun, setFilterTahun] = useState('Semua Tahun');
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pengajuanData, setPengajuanData] = useState<PengajuanItem[]>([]);
  const [pengajuanLoading, setPengajuanLoading] = useState(true);
const [detailItem, setDetailItem] = useState<PengajuanItem | null>(null);
  const [selectedPengajuanIds, setSelectedPengajuanIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [reviewItem, setReviewItem] = useState<PengajuanItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<PengajuanStatus>('Disetujui');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewFinalFile, setReviewFinalFile] = useState<File | null>(null);
  const [reviewFinalFilePreview, setReviewFinalFilePreview] = useState<{ name: string; url: string } | null>(null);
  const [reviewFinalLink, setReviewFinalLink] = useState('');
  // Berkas Word opsional yang dilampirkan admin saat meminta revisi.
  const [reviewRevisiFile, setReviewRevisiFile] = useState<{ file: File; url: string } | null>(null);
  const [reviewDistribusiUserIds, setReviewDistribusiUserIds] = useState<number[]>([]);
  const [reviewDistribusiSearch, setReviewDistribusiSearch] = useState('');
  const [internalUsersList, setInternalUsersList] = useState<DistribusiKandidat[]>([]);
  const [provisioningNik, setProvisioningNik] = useState<string | null>(null); // key: `${nik}-${jabatan}`
  const [ajukanModalOpen, setAjukanModalOpen] = useState(false);
  const [masterModalOpen, setMasterModalOpen] = useState(false);
  const [negaraModalOpen, setNegaraModalOpen] = useState(false);
  const [ruangLingkupModalOpen, setRuangLingkupModalOpen] = useState(false);
  const [ruangLingkupRows, setRuangLingkupRows] = useState<MasterRuangLingkup[]>(() => getCachedMasterRuangLingkup());
  const [masterNegaraRows, setMasterNegaraRows] = useState<MasterNegara[]>(() => getCachedMasterNegara());
  const [ruangLingkupNama, setRuangLingkupNama] = useState('');
  const [editingRuangLingkupId, setEditingRuangLingkupId] = useState<number | null>(null);
  const [editingRuangLingkupNama, setEditingRuangLingkupNama] = useState('');
  const [ruangLingkupSaving, setRuangLingkupSaving] = useState(false);
  const [ruangLingkupMessage, setRuangLingkupMessage] = useState<string | null>(null);
  const [negaraInput, setNegaraInput] = useState('');
  const [negaraMessage, setNegaraMessage] = useState<string | null>(null);
  const [editingNegaraId, setEditingNegaraId] = useState<number | null>(null);
  const [editingNegaraNama, setEditingNegaraNama] = useState('');
  const [masterJenis, setMasterJenis] = useState<'jurusan' | 'unit_kerja'>('jurusan');
  const [masterKode, setMasterKode] = useState('');
  const [masterNama, setMasterNama] = useState('');
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterMessage, setMasterMessage] = useState<string | null>(null);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterJurusanRows, setMasterJurusanRows] = useState<MasterUnitProdi[]>(() => getCachedMasterUnitProdiTree().filter((item) => item.jenis_node === 'unit' && item.kategori_unit === 'jurusan'));
  const [masterUnitRows, setMasterUnitRows] = useState<MasterUnitProdi[]>(() => getCachedMasterUnitProdiTree().filter((item) => item.jenis_node === 'unit' && item.kategori_unit === 'unit_kerja'));
  const [masterProdiRows, setMasterProdiRows] = useState<MasterUnitProdi[]>(() => getCachedMasterUnitProdiTree().filter((item) => item.jenis_node === 'prodi'));
  const [prodiDraftByJurusan, setProdiDraftByJurusan] = useState<Record<number, { kode: string; nama: string }>>({});
  const [editingJurusanId, setEditingJurusanId] = useState<number | null>(null);
  const [editingJurusanKode, setEditingJurusanKode] = useState('');
  const [editingJurusanNama, setEditingJurusanNama] = useState('');
  const [editingProdiId, setEditingProdiId] = useState<number | null>(null);
  const [editingProdiKode, setEditingProdiKode] = useState('');
  const [editingProdiNama, setEditingProdiNama] = useState('');
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editingUnitKode, setEditingUnitKode] = useState('');
  const [editingUnitNama, setEditingUnitNama] = useState('');
  const [infoModalMessage, setInfoModalMessage] = useState<string | null>(null);
  const [finalGuardItem, setFinalGuardItem] = useState<PengajuanItem | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  const [editAsal, setEditAsal] = useState<'Jurusan' | 'Unit'>('Jurusan');
  const [editJurusanOpen, setEditJurusanOpen] = useState(false);
  const [editRlOpen, setEditRlOpen] = useState(false);
  const [editJurusanInput, setEditJurusanInput] = useState('');
  const [editRlInput, setEditRlInput] = useState('');
  const [editCustomJurusanOpts, setEditCustomJurusanOpts] = useState<string[]>([]);
  const [editCustomUnitOpts, setEditCustomUnitOpts] = useState<string[]>([]);
  const [editCustomRlOpts, setEditCustomRlOpts] = useState<string[]>([]);
  const [editOriginalJenisDokumen, setEditOriginalJenisDokumen] = useState('');
  const [editUploadedFiles, setEditUploadedFiles] = useState<File[]>([]);
  const [editFileError, setEditFileError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<PengajuanItem | null>(null);
  const [editingItem, setEditingItem] = useState<PengajuanItem | null>(null);
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);

// Track previous pending count for new submission notifications
  const previousPendingRef = useRef<number>(0);

  // Konfirmasi hapus pakai modal (pengganti window.confirm). mintaKonfirmasi() mengembalikan
  // Promise<boolean> yang selesai saat user menekan tombol di ConfirmDialog.
  const [konfirmasiPesan, setKonfirmasiPesan] = useState<string | null>(null);
  const konfirmasiResolveRef = useRef<((v: boolean) => void) | null>(null);
  const mintaKonfirmasi = useCallback((pesan: string): Promise<boolean> => {
    setKonfirmasiPesan(pesan);
    return new Promise<boolean>((resolve) => {
      konfirmasiResolveRef.current = resolve;
    });
  }, []);
  const tutupKonfirmasi = useCallback((hasil: boolean) => {
    konfirmasiResolveRef.current?.(hasil);
    konfirmasiResolveRef.current = null;
    setKonfirmasiPesan(null);
  }, []);

  const refreshPengajuanData = useCallback(async (silent = false) => {
    if (!silent) {
      setPengajuanLoading(true);
    }

    try {
      const rows = await fetchPengajuanDataFromApi({ perPage: 500 });
      
      // Check for new pending submissions and notify admin
      const currentPending = rows.filter(item => 
        item.statusPengajuan === 'Menunggu' || item.statusPengajuan === 'Menunggu Review'
      ).length;
      
      // If this is not the first load and there's an increase, notify admin
      if (previousPendingRef.current > 0 && currentPending > previousPendingRef.current) {
        const newSubmissions = currentPending - previousPendingRef.current;
        addAdminNotification({
          title: 'Pengajuan Baru Masuk',
          message: `Ada ${newSubmissions} pengajuan baru yang menunggu review. Silakan periksa sekarang!`,
          from: 'Sistem',
          href: '/admin/data_pengajuan?status=Menunggu',
          category: 'info',
        });
      }
      
      // Update the ref for next comparison
      if (previousPendingRef.current === 0 && rows.length > 0) {
        previousPendingRef.current = currentPending;
      } else if (rows.length > 0) {
        previousPendingRef.current = currentPending;
      }
      
      setPengajuanData(rows);
    } catch {
      setInfoModalMessage('Gagal memuat data pengajuan dari server.');
    } finally {
      if (!silent) {
        setPengajuanLoading(false);
      }
    }
  }, []);

  // Centang/lepas satu pengajuan untuk dihapus massal — mirip pola checkbox + "Hapus (N)"
  // di Rekap Data, supaya admin tidak perlu klik tombol Hapus satu-satu per kartu.
  function togglePengajuanSelected(id: number) {
    setSelectedPengajuanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAllPengajuan() {
    const visibleIds = paginatedFiltered.map((item) => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedPengajuanIds.has(id));
    setSelectedPengajuanIds(allSelected ? new Set() : new Set(visibleIds));
  }

  async function confirmBulkDeletePengajuan() {
    const ids = Array.from(selectedPengajuanIds);
    if (ids.length === 0) return;

    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deletePengajuanItemApi(id)));
    } catch {
      // Lanjut refresh meski sebagian gagal, biar admin lihat sisa yang belum kehapus.
    }

    if (detailItem && ids.includes(detailItem.id)) setDetailItem(null);
    if (reviewItem && ids.includes(reviewItem.id)) setReviewItem(null);

    setSelectedPengajuanIds(new Set());
    setShowBulkDeleteConfirm(false);
    setBulkDeleting(false);
    await refreshPengajuanData(false);
  }

// Sync detailItem dengan pengajuanData setiap kali list di-refresh/update
  useEffect(() => {
    if (detailItem) {
      const refreshed = pengajuanData.find((item) => item.id === detailItem.id);
      if (refreshed) {
        setDetailItem(refreshed);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pengajuanData]);

// Auto-refresh every 30 seconds to check for new submissions (polling for notifications).
// Di-skip saat tab tidak aktif/di-background — sebelumnya tetap nge-fetch ~500 baris
// pengajuan (dengan relasi dokumen/mitra ter-eager-load) tiap 30 detik meski tab admin
// cuma dibiarkan terbuka di background, bikin boros network+CPU tanpa ada yang lihat.
  useEffect(() => {
    void refreshPengajuanData(false);

    const POLL_INTERVAL_MS = 30000; // 30 seconds

    const intervalId = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void refreshPengajuanData(true); // silent refresh
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshPengajuanData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshPengajuanData]);


  useEffect(() => {
    if (isAjukanView) {
      setAjukanModalOpen(true);
    }
  }, [isAjukanView]);

  useEffect(() => {
    const isAnyFormModalOpen = ajukanModalOpen || !!editingItem;
    if (isAnyFormModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [ajukanModalOpen, editingItem]);

  // Tandai notifikasi data pengajuan sebagai sudah dibaca saat halaman ini dibuka
  useEffect(() => {
    markNotificationsByHrefPrefixAsRead('/admin/data_pengajuan');
  }, []);

  // Kandidat Ketua Jurusan/Ketua Prodi untuk pilihan "Distribusi" di modal review —
  // termasuk yang belum pernah login ke SIKERMA (lihat getDistribusiKandidat()).
  useEffect(() => {
    let mounted = true;
    getDistribusiKandidat()
      .then((kandidat) => {
        if (mounted) {
          setInternalUsersList(kandidat);
        }
      })
      .catch(() => {
        if (mounted) setInternalUsersList([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-buka review modal saat diarahkan dari halaman Tahapan (?review=ID)
  useEffect(() => {
    if (!reviewTargetId || pengajuanLoading || pengajuanData.length === 0) return;
    const target = pengajuanData.find((p) => p.id === reviewTargetId);
    if (target && target.statusPengajuan === 'Menunggu Review') {
      openReview(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewTargetId, pengajuanLoading, pengajuanData]);

  const handleAddNegaraOption = async () => {
    const trimmed = negaraInput.trim();
    if (!trimmed) {
      setNegaraMessage('Nama negara wajib diisi.');
      return;
    }

    try {
      await createMasterNegara({ nama_negara: trimmed, aktif: true });
      setNegaraInput('');
      await refreshMasterNegara();
      setNegaraMessage('Negara berhasil ditambahkan.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menambah negara.';
      setNegaraMessage(message);
    }
  };

  const handleUpdateNegaraOption = async () => {
    const trimmed = editingNegaraNama.trim();

    if (!trimmed) {
      setNegaraMessage('Nama negara wajib diisi.');
      return;
    }

    if (editingNegaraId === null) {
      return;
    }

    try {
      await updateMasterNegara(editingNegaraId, { nama_negara: trimmed, aktif: true });
      await refreshMasterNegara();
      setEditingNegaraId(null);
      setEditingNegaraNama('');
      setNegaraMessage('Negara berhasil diperbarui.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal memperbarui negara.';
      setNegaraMessage(message);
    }
  };

  const handleDeleteNegaraOption = async (item: MasterNegara) => {
    const confirmed = await mintaKonfirmasi(`Yakin ingin menghapus negara "${item.nama_negara}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteMasterNegara(item.id);
      await refreshMasterNegara();
      setNegaraMessage('Negara berhasil dihapus.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menghapus negara.';
      setNegaraMessage(message);
    }
  };

  const refreshMasterReferenceData = useCallback(async () => {
    const [jurusanRows, unitRows, prodiRows] = await Promise.all([
      getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'jurusan', aktif: true }),
      getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'unit_kerja', aktif: true }),
      getMasterUnitProdi({ jenis_node: 'prodi', aktif: true }),
    ]);

    setMasterJurusanRows(jurusanRows);
    setMasterUnitRows(unitRows);
    setMasterProdiRows(prodiRows);

    return { jurusanRows, unitRows, prodiRows };
  }, []);

  const refreshMasterRuangLingkup = useCallback(async () => {
    const rows = await getMasterRuangLingkup();
    setRuangLingkupRows(rows);
    return rows;
  }, []);

  const refreshMasterNegara = useCallback(async () => {
    const rows = await getMasterNegara({ aktif: true });
    setMasterNegaraRows(rows);
    return rows;
  }, []);

  const masterUnitProdiTreeForForm = useMemo(() => {
    const prodiByParent = new Map<number, MasterUnitProdi[]>();

    masterProdiRows.forEach((prodi) => {
      if (typeof prodi.parent_id !== 'number') {
        return;
      }

      const current = prodiByParent.get(prodi.parent_id) || [];
      current.push(prodi);
      prodiByParent.set(prodi.parent_id, current);
    });

    return masterJurusanRows.map((jurusan) => ({
      ...jurusan,
      children: prodiByParent.get(jurusan.id) || [],
    }));
  }, [masterJurusanRows, masterProdiRows]);

  useEffect(() => {
    let isMounted = true;

    async function loadMasterReferenceData() {
      try {
        await refreshMasterReferenceData();
      } catch {
        if (isMounted) {
          setMasterMessage('Gagal memuat data master. Pastikan backend aktif.');
        }
      }
    }

    loadMasterReferenceData();

    return () => {
      isMounted = false;
    };
  }, [refreshMasterReferenceData]);

  useEffect(() => {
    let isMounted = true;

    async function loadNegaraAtMount() {
      try {
        await refreshMasterNegara();
      } catch {
        if (isMounted) {
          setNegaraMessage('Gagal memuat data negara. Pastikan backend aktif.');
        }
      }
    }

    void loadNegaraAtMount();

    return () => {
      isMounted = false;
    };
  }, [refreshMasterNegara]);

  useEffect(() => {
    let isMounted = true;

    async function loadRuangLingkupAtMount() {
      try {
        await refreshMasterRuangLingkup();
      } catch {
        if (isMounted) {
          setRuangLingkupMessage('Gagal memuat data ruang lingkup. Pastikan backend aktif.');
        }
      }
    }

    loadRuangLingkupAtMount();

    return () => {
      isMounted = false;
    };
  }, [refreshMasterRuangLingkup]);

  async function handleSubmitRuangLingkup() {
    const nama = ruangLingkupNama.trim();
    if (!nama) {
      setRuangLingkupMessage('Nama ruang lingkup wajib diisi.');
      return;
    }

    try {
      setRuangLingkupSaving(true);
      setRuangLingkupMessage(null);

      await createMasterRuangLingkup({
        nama_ruang_lingkup: nama,
        aktif: true,
      });

      await refreshMasterRuangLingkup();
      setRuangLingkupNama('');
      setRuangLingkupMessage('Ruang lingkup berhasil ditambahkan.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menambah ruang lingkup.';
      setRuangLingkupMessage(message);
    } finally {
      setRuangLingkupSaving(false);
    }
  }

  function startEditRuangLingkup(item: MasterRuangLingkup) {
    setEditingRuangLingkupId(item.id);
    setEditingRuangLingkupNama(item.nama_ruang_lingkup);
    setRuangLingkupMessage(null);
  }

  function cancelEditRuangLingkup() {
    setEditingRuangLingkupId(null);
    setEditingRuangLingkupNama('');
  }

  async function saveEditRuangLingkup(id: number) {
    const nextName = editingRuangLingkupNama.trim();
    if (!nextName) {
      setRuangLingkupMessage('Nama ruang lingkup wajib diisi.');
      return;
    }

    try {
      setRuangLingkupSaving(true);
      setRuangLingkupMessage(null);

      await updateMasterRuangLingkup(id, {
        nama_ruang_lingkup: nextName,
      });

      await refreshMasterRuangLingkup();
      setRuangLingkupMessage('Ruang lingkup berhasil diperbarui.');
      cancelEditRuangLingkup();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal mengubah ruang lingkup.';
      setRuangLingkupMessage(message);
    } finally {
      setRuangLingkupSaving(false);
    }
  }

  async function handleDeleteRuangLingkup(id: number) {
    const confirmed = await mintaKonfirmasi('Yakin ingin menghapus ruang lingkup ini?');
    if (!confirmed) {
      return;
    }

    try {
      setRuangLingkupSaving(true);
      setRuangLingkupMessage(null);

      await deleteMasterRuangLingkup(id);
      await refreshMasterRuangLingkup();
      setRuangLingkupMessage('Ruang lingkup berhasil dihapus.');

      if (editingRuangLingkupId === id) {
        cancelEditRuangLingkup();
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menghapus ruang lingkup.';
      setRuangLingkupMessage(message);
    } finally {
      setRuangLingkupSaving(false);
    }
  }

  const setProdiDraftField = (jurusanId: number, field: 'kode' | 'nama', value: string) => {
    setProdiDraftByJurusan((prev) => {
      const current = prev[jurusanId] || { kode: '', nama: '' };
      return {
        ...prev,
        [jurusanId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const filteredJurusanRows = masterJurusanRows.filter((jurusan) => {
    const keyword = masterSearch.trim().toLowerCase();
    if (!keyword) {
      return true;
    }

    const jurusanText = `${jurusan.kode || ''} ${jurusan.nama}`.toLowerCase();
    if (jurusanText.includes(keyword)) {
      return true;
    }

    const prodis = masterProdiRows.filter((prodi) => prodi.parent_id === jurusan.id);
    return prodis.some((prodi) => `${prodi.kode || ''} ${prodi.nama}`.toLowerCase().includes(keyword));
  });

  const { totalPengajuan, menunggu, diproses, disetujui } = getPengajuanStats(pengajuanData);

  const statCards = [
    {
      key: 'Semua Status',
      label: 'Total Pengajuan',
      value: totalPengajuan,
      icon: FileText,
      iconWrap: 'bg-gray-100',
      iconText: 'text-gray-600',
      valueText: 'text-gray-900',
    },
    {
      key: 'Menunggu',
      label: 'Menunggu',
      value: menunggu,
      icon: Clock,
      iconWrap: 'bg-yellow-50',
      iconText: 'text-yellow-600',
      valueText: 'text-yellow-600',
    },
    {
      key: 'Diproses',
      label: 'Diproses',
      value: diproses,
      icon: Clock,
      iconWrap: 'bg-blue-50',
      iconText: 'text-blue-600',
      valueText: 'text-blue-600',
    },
    {
      key: 'Disetujui',
      label: 'Disetujui',
      value: disetujui,
      icon: CheckCircle,
      iconWrap: 'bg-green-50',
      iconText: 'text-green-600',
      valueText: 'text-green-600',
    },
  ];

  const tahunOptions = getPengajuanYearOptions(pengajuanData);
  const currentYear = new Date().getFullYear();
  const defaultYearRangeStart = Math.min(currentYear - 4, Number(tahunOptions[tahunOptions.length - 1] ?? currentYear));
  const [yearRangeStart, setYearRangeStart] = useState(defaultYearRangeStart);
  const [currentPage, setCurrentPage] = useState(1);
  const yearGrid = Array.from({ length: 12 }, (_, index) => yearRangeStart + index);

  // Opsi Jurusan/Unit/Prodi untuk filter — dipisah per kategori supaya dropdown bisa
  // dikelompokkan pakai <optgroup> (sama seperti dropdown "Semua Unit" di landing page).
  // "Lainnya" nampung nama yang benar-benar dipakai di data pengajuan tapi tidak cocok ke
  // master data aktif mana pun (unit/prodi lama/nonaktif).
  const unitProdiGroups = useMemo(() => {
    const jurusan = Array.from(new Set(masterJurusanRows.map((item) => item.nama).filter(Boolean)));
    const prodi = Array.from(new Set(masterProdiRows.map((item) => item.nama).filter(Boolean)));
    const unit = Array.from(new Set(masterUnitRows.map((item) => item.nama).filter(Boolean)));
    const known = new Set([...jurusan, ...prodi, ...unit]);
    const lainnya = Array.from(
      new Set(pengajuanData.map((item) => item.namaUnitProdi).filter((nama) => nama && !known.has(nama)))
    );

    return { jurusan, prodi, unit, lainnya };
  }, [masterJurusanRows, masterUnitRows, masterProdiRows, pengajuanData]);

  // Deduplikasi data berdasarkan id sebelum render
  const filteredRaw = getFilteredPengajuanData(pengajuanData, {
    filterStatus,
    filterJurusan,
    filterTahun,
    search,
  });
  const seen = new Set();
  const filtered = [];
  for (const item of filteredRaw) {
    if (seen.has(item.id)) {
      continue;
    }
    if (filterUnitProdi !== 'Semua Jurusan/Prodi/Unit' && item.namaUnitProdi !== filterUnitProdi) {
      continue;
    }
    filtered.push(item);
    seen.add(item.id);
  }

  // Daftar ditampilkan 10 per halaman, seperti di Rekap Data.
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const paginatedFiltered = filtered.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  // Kembali ke halaman 1 setiap kali filter atau pencarian berubah.
  useEffect(() => {
    setCurrentPage(1);
  }, [filterJurusan, filterUnitProdi, filterStatus, filterTahun, search]);


  const detailFileEntries = detailItem
    ? detailItem.fileAttachments?.length
      ? detailItem.fileAttachments
      : (detailItem.fileName || '')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({ name, url: '', isAcc: false }))
    : [];
  const detailFallbackTemplateUrl = detailItem ? (templatePreviewUrlByJenis[detailItem.jenisDokumen] || '') : '';

  // Memoize agar referensi tidak berubah saat parent re-render (auto-refresh 30s dll),
  // sehingga useEffect([initialData]) di form tidak reset field yang sudah diisi user.
  const editFormInitialData = useMemo(() => {
    if (!editingItem) return undefined;
    return {
      nomorPengajuan: editingItem.nomorPengajuan,
      asal: (masterUnitRows.some((row) => row.nama === editingItem.namaUnitProdi) ? 'Unit' : 'Jurusan') as 'Jurusan' | 'Unit',
      namaMitra: editingItem.namaMitra,
      jenisMitra: editingItem.mitraKategori || '',
      bidangUsaha: editingItem.mitraBidangUsaha || '',
      tingkatPerusahaan: editingItem.mitraTingkatPerusahaan || '',
      teleponMitra: editingItem.mitraTelepon || '',
      noTeleponMitra: editingItem.mitraNoTelepon || '',
      emailMitra: editingItem.mitraEmail || editingItem.emailPengusul || '',
      alamatMitra: editingItem.mitraAlamat || '',
      negara: editingItem.mitraNegara || 'Indonesia',
      jenisKerjasama: editingItem.jenisDokumen,
      unitPelaksana: editingItem.namaUnitProdi,
      selectedProdiId: editingItem.unitProdiId ?? null,
      selectedProdiIds: editingItem.unitProdiIds ?? (editingItem.unitProdiId ? [editingItem.unitProdiId] : []),
      tanggalMulai: toDateInputValue(editingItem.tanggalMulai),
      tanggalBerakhir: toDateInputValue(editingItem.tanggalBerakhir),
      judulKerjasama: editingItem.judulPengajuan,
      deskripsi: editingItem.manfaat || editingItem.deskripsiPengajuan || '',
      namaKontak: editingItem.mitraPicNama || editingItem.namaPengusul,
      jabatanKontak: editingItem.mitraPicJabatan || editingItem.jabatanPengusul || '',
      emailKontak: editingItem.mitraPicEmail || editingItem.emailPengusul || '',
      teleponKontak: editingItem.mitraPicTelepon || editingItem.whatsappPengusul || '',
      picPolibatamNama: editingItem.picPolibatamNama || '',
      picPolibatamJabatan: editingItem.picPolibatamJabatan || '',
      picPolibatamEmail: editingItem.picPolibatamEmail || '',
      picPolibatamTelepon: editingItem.picPolibatamTelepon || '',
      selectedRuangLingkup: editingItem.ruangLingkup,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem?.id]);

  const editAllJurusanOptions = [...masterJurusanRows.map((row) => row.nama), ...editCustomJurusanOpts];
  const editAllUnitOptions = [...masterUnitRows.map((row) => row.nama), ...editCustomUnitOpts];
  const editAsalOptions = editAsal === 'Jurusan' ? editAllJurusanOptions : editAllUnitOptions;
  const editAllRlOptions = Array.from(new Set([...ruangLingkupRows.map((item) => item.nama_ruang_lingkup), ...editCustomRlOpts]));
  const editTemplateFiles = editForm ? (templateFilesByJenis[editForm.jenisDokumen] || []) : [];
  const editSelectedTemplate = editForm ? (editTemplateDokumenMap[editForm.jenisDokumen] || null) : null;


function openReview(item: PengajuanItem) {
    setReviewItem(item);
    setReviewDecision(item.statusPengajuan === 'Ditolak' ? 'Ditolak' : 'Disetujui');
    setReviewComment('');
    setReviewFinalFile(null);
    setReviewFinalFilePreview(null);
    setReviewFinalLink('');
    setReviewRevisiFile(null);
    setReviewDistribusiUserIds(item.distribusiUserIds ?? []);
    setReviewDistribusiSearch('');
  }

  function handleReviewFinalFileUpload(files: FileList | null) {
    const selected = Array.from(files || []);
    if (selected.length === 0) return;

    const file = selected[0];
    // Berkas final yang di-ACC wajib PDF (versi final bertanda tangan), bukan Word.
    if (!/\.pdf$/i.test(file.name)) {
      setInfoModalMessage(`${file.name}: Berkas final harus berformat PDF.`);
      return;
    }
    const validationError = validateSelectedFile(file, {
      accept: '.pdf',
      maxSizeBytes: MAX_EDIT_FILE_SIZE,
    });
    if (validationError) {
      setInfoModalMessage(`${file.name}: ${validationError}`);
      return;
    }

    setReviewFinalFile(file);
    // Create preview URL
    const reader = new FileReader();
    reader.onload = () => {
      setReviewFinalFilePreview({
        name: file.name,
        url: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  }

  function handleReviewRevisiFileUpload(files: FileList | null) {
    const file = Array.from(files || [])[0];
    if (!file) return;

    // Hanya Word: cek ekstensi eksplisit (validateSelectedFile juga menerima tipe MIME lain bila cocok).
    if (!/\.docx?$/i.test(file.name)) {
      setInfoModalMessage(`${file.name}: File revisi harus berformat Word (.doc atau .docx).`);
      return;
    }
    const validationError = validateSelectedFile(file, {
      accept: '.doc,.docx',
      maxSizeBytes: MAX_EDIT_FILE_SIZE,
    });
    if (validationError) {
      setInfoModalMessage(`${file.name}: ${validationError}`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setReviewRevisiFile({ file, url: reader.result as string });
    reader.readAsDataURL(file);
  }

  function handleRemoveReviewFinalFile() {
    setReviewFinalFile(null);
    setReviewFinalFilePreview(null);
  }

function revisiFilePayload() {
    return reviewRevisiFile
      ? { name: reviewRevisiFile.file.name, url: reviewRevisiFile.url, type: reviewRevisiFile.file.type, size: reviewRevisiFile.file.size }
      : undefined;
  }

async function saveReview() {
    if (!reviewItem) return;

    try {
      if (reviewDecision === 'Revisi') {
        if (!reviewComment.trim()) {
          setInfoModalMessage('Catatan Revisi wajib diisi.');
          return;
        }
        const updated = await savePengajuanRevisionApi(reviewItem.id, reviewComment, reviewComment, reviewItem.updatedAt, revisiFilePayload());
        setPengajuanData((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      } else {
        const updated = await savePengajuanReviewApi(reviewItem.id, reviewDecision, reviewComment, undefined, reviewItem.updatedAt);
        setPengajuanData((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      }
    } catch (err) {
      setInfoModalMessage('Gagal menyimpan review ke server: ' + (err instanceof Error ? err.message : 'Terjadi kesalahan.'));
      return;
    }

    setReviewItem(null);
    setReviewComment('');
    setInfoModalMessage('Review pengajuan berhasil disimpan.');
  }

  async function executeReview() {
    if (!reviewItem) return;
    setUploadConfirmOpen(false);

    const judulShort = reviewItem.judulPengajuan.length > 50
      ? reviewItem.judulPengajuan.slice(0, 50) + '...'
      : reviewItem.judulPengajuan;

    if (reviewDecision === 'Revisi') {
      try {
        const updated = await savePengajuanRevisionApi(reviewItem.id, reviewComment, reviewComment, reviewItem.updatedAt, revisiFilePayload());
        setPengajuanData((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
        addAdminNotification({
          title: 'Pengajuan Diminta Revisi',
          message: `Pengajuan "${judulShort}" diminta revisi. Perbarui data/dokumen pada pengajuan yang sama, tidak perlu membuat pengajuan baru. Catatan: ${reviewComment}`,
          from: 'Admin',
          href: '/internal/data_pengajuan',
          category: 'comment',
          targetRole: 'internal',
        });
        addAdminNotification({
          title: 'Pengajuan Diminta Revisi',
          message: `Pengajuan "${judulShort}" diminta revisi oleh admin. Cukup perbarui data/dokumen pada pengajuan ini, tidak perlu membuat pengajuan baru. Catatan: ${reviewComment}`,
          from: 'Admin',
          href: '/eksternal/daftar_kerjasama',
          category: 'comment',
          targetRole: 'external',
        });
        addAdminNotification({
          title: 'Revisi Pengajuan Dikirim',
          message: `Anda meminta revisi pengajuan "${judulShort}". Pengusul cukup memperbarui data/dokumen pada pengajuan yang sama dan tidak perlu membuat pengajuan baru.`,
          from: 'Sistem',
          href: '/admin/data_pengajuan',
          category: 'comment',
          targetRole: 'admin',
        });
        setInfoModalMessage('Revisi pengajuan berhasil disimpan dan notifikasi dikirim.');
        void refreshPengajuanData(true);
      } catch (err) {
        setInfoModalMessage('Gagal menyimpan revisi ke server: ' + (err instanceof Error ? err.message : 'Terjadi kesalahan.'));
        return;
      }
    } else if (reviewDecision === 'Ditolak') {
      try {
        const updated = await savePengajuanReviewApi(reviewItem.id, 'Ditolak', reviewComment, undefined, reviewItem.updatedAt);
        setPengajuanData((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
        addAdminNotification({
          title: 'Pengajuan Ditolak',
          message: `Pengajuan "${judulShort}" ditolak oleh admin. Alasan: ${reviewComment.trim()}. Pengajuan yang ditolak tidak bisa diperbaiki, silakan buat pengajuan baru bila ingin mengajukan kembali.`,
          from: 'Admin',
          href: '/internal/data_pengajuan',
          category: 'approval',
          targetRole: 'internal',
        });
        addAdminNotification({
          title: 'Pengajuan Ditolak',
          message: `Pengajuan "${judulShort}" ditolak. Alasan: ${reviewComment.trim()}. Pengajuan yang ditolak tidak bisa diperbaiki, silakan buat pengajuan baru bila ingin mengajukan kembali.`,
          from: 'Admin',
          href: '/eksternal/daftar_kerjasama',
          category: 'approval',
          targetRole: 'external',
        });
        addAdminNotification({
          title: 'Pengajuan Ditolak',
          message: `Anda menolak pengajuan "${judulShort}". Pengusul harus membuat pengajuan baru bila ingin mengajukan kembali.`,
          from: 'Sistem',
          href: '/admin/data_pengajuan',
          category: 'approval',
          targetRole: 'admin',
        });
        setInfoModalMessage('Pengajuan ditolak dan notifikasi dikirim ke pengusul.');
        void refreshPengajuanData(true);
      } catch (err) {
        setInfoModalMessage('Gagal menyimpan penolakan ke server: ' + (err instanceof Error ? err.message : 'Terjadi kesalahan.'));
        return;
      }
    } else {
      const trimmedLink = reviewFinalLink.trim();
      const usingLink = !reviewFinalFile && trimmedLink.length > 0;

      try {
        // Upload ACC dan keputusan adalah dua PATCH berurutan; token dari balasan upload
        // dipakai untuk PATCH berikutnya supaya tidak dianggap konflik dengan dirinya sendiri.
        let lockToken = reviewItem.updatedAt;
        if (reviewFinalFile && reviewFinalFilePreview) {
          const uploaded = await uploadAccFileApi(reviewItem.id, {
            name: reviewFinalFile.name,
            url: reviewFinalFilePreview.url,
            type: reviewFinalFile.type,
            size: reviewFinalFile.size,
          }, lockToken);
          lockToken = uploaded.updatedAt ?? lockToken;
        } else if (usingLink) {
          const uploaded = await uploadAccFileApi(reviewItem.id, {
            name: 'Tautan Dokumen Final',
            url: trimmedLink,
          }, lockToken);
          lockToken = uploaded.updatedAt ?? lockToken;
        }
        const reviewUpdated = await savePengajuanReviewApi(reviewItem.id, reviewDecision, reviewComment, reviewDistribusiUserIds, lockToken);
        if ((reviewFinalFile && reviewFinalFilePreview) || usingLink) {
          const accAttachment = reviewFinalFile && reviewFinalFilePreview
            ? {
                name: reviewFinalFile.name,
                url: reviewFinalFilePreview.url,
                type: reviewFinalFile.type,
                size: reviewFinalFile.size,
                isAcc: true,
              }
            : {
                name: 'Tautan Dokumen Final',
                url: trimmedLink,
                isAcc: true,
              };
          const existingAttachments = reviewUpdated.fileAttachments || reviewItem.fileAttachments || [];
          // Hindari duplikat: hanya tambahkan jika server belum menyertakannya
          const alreadyInServer = existingAttachments.some(
            (f) => f.isAcc && f.name === accAttachment.name
          );
          if (!alreadyInServer) {
            reviewUpdated.fileAttachments = [...existingAttachments, accAttachment];
          } else {
            reviewUpdated.fileAttachments = existingAttachments;
          }
        }
        setPengajuanData((prev) => prev.map((item) => {
          if (item.id !== reviewUpdated.id) return item;
          const merged = { ...item, ...reviewUpdated };
          // Guard: if the API response lost the unitProdi/mitra relation (not loaded),
          // namaUnitProdi and namaMitra would map to '-'. Preserve the existing values.
          if (!reviewUpdated.namaUnitProdi || reviewUpdated.namaUnitProdi === '-') {
            merged.namaUnitProdi = item.namaUnitProdi;
          }
          if (!reviewUpdated.unitProdiId) {
            merged.unitProdiId = item.unitProdiId;
          }
          if (!reviewUpdated.namaMitra || reviewUpdated.namaMitra === '-') {
            merged.namaMitra = item.namaMitra;
          }
          return merged;
        }));

        const catatanAcc = reviewComment.trim();
        if (reviewFinalFile || usingLink) {
          addAdminNotification({
            title: 'Dokumen Final Diupload',
            message: `Dokumen final untuk "${judulShort}" telah diupload dan di-ACC oleh admin.${catatanAcc ? ` Catatan: ${catatanAcc}` : ''}`,
            from: 'Admin',
            href: '/internal/data_pengajuan',
            category: 'approval',
            targetRole: 'internal',
          });
          addAdminNotification({
            title: 'Dokumen Final Siap Diunduh',
            message: `Dokumen final "${judulShort}" telah di-ACC dan siap diunduh.${catatanAcc ? ` Catatan: ${catatanAcc}` : ''}`,
            from: 'Admin',
            href: '/eksternal/daftar_kerjasama',
            category: 'approval',
            targetRole: 'external',
          });
        } else {
          addAdminNotification({
            title: 'Status Pengajuan Diperbarui',
            message: `Pengajuan "${judulShort}" telah disetujui oleh admin.${catatanAcc ? ` Catatan: ${catatanAcc}` : ''}`,
            from: 'Admin',
            href: '/internal/data_pengajuan',
            category: 'approval',
            targetRole: 'internal',
          });
          addAdminNotification({
            title: 'Pengajuan Disetujui',
            message: `Pengajuan "${judulShort}" telah disetujui.${catatanAcc ? ` Catatan: ${catatanAcc}` : ''}`,
            from: 'Admin',
            href: '/eksternal/daftar_kerjasama',
            category: 'approval',
            targetRole: 'external',
          });
        }
        // Dokumen final baru langsung masuk Rekap Data: buang cache daftar rekap dan kabari halaman
        // Rekap yang sedang terbuka supaya mengambil ulang (dokumen terbaru tampil paling atas).
        invalidateRekapCache();
        window.dispatchEvent(new Event('rekap-data-updated'));
        setInfoModalMessage('Review pengajuan berhasil disimpan dan notifikasi dikirim.');
      } catch (err) {
        setInfoModalMessage('Gagal menyimpan review ke server: ' + (err instanceof Error ? err.message : 'Terjadi kesalahan.'));
        return;
      }
    }
    setReviewItem(null);
    setReviewComment('');
    setReviewFinalFile(null);
    setReviewFinalFilePreview(null);
    setReviewFinalLink('');
    setReviewDistribusiUserIds([]);
    setReviewDistribusiSearch('');
  }

  // Pengajuan yang sudah difinalkan (statusnya sudah dipindah ke Rekap Data — lihat
  // PengajuanController::moveApprovedPengajuanToDokumen(), dipicu saat status_pengajuan
  // jadi 'disetujui' ATAU 'final_approved') seharusnya tidak diedit lagi lewat sini —
  // dokumen resminya sudah hidup di Rekap Data, jadi edit lanjutan diarahkan ke sana.
  function isPengajuanSudahFinal(item: PengajuanItem): boolean {
    return item.statusPengajuan === 'Disetujui' || item.statusPengajuan === 'Final Approved';
  }

  function openEdit(item: PengajuanItem) {
    if (isPengajuanSudahFinal(item)) {
      setFinalGuardItem(item);
      return;
    }

    setEditingItem(item);
  }

  function openEditLegacy(item: PengajuanItem) {
    const asalDefault: 'Jurusan' | 'Unit' = masterUnitRows.some((row) => row.nama === item.namaUnitProdi) ? 'Unit' : 'Jurusan';

    setEditForm({
      id: item.id,
      updatedAt: item.updatedAt,
      judulPengajuan: item.judulPengajuan,
      namaMitra: item.namaMitra,
      namaUnitProdi: item.namaUnitProdi,
      jenisDokumen: item.jenisDokumen,
      tanggalMulai: item.tanggalMulai || '',
      tanggalBerakhir: item.tanggalBerakhir || '',
      ruangLingkup: item.ruangLingkup || [],
    });

    setEditAsal(asalDefault);
    setEditJurusanOpen(false);
    setEditRlOpen(false);
    setEditJurusanInput('');
    setEditRlInput('');
    setEditCustomJurusanOpts([]);
    setEditCustomUnitOpts([]);
    setEditCustomRlOpts([]);
    setEditOriginalJenisDokumen(item.jenisDokumen);
    setEditUploadedFiles([]);
    setEditFileError(null);
  }

  function handleEditFileUpload(files: FileList | null) {
    const selected = Array.from(files || []);
    if (selected.length === 0) return;

    setEditUploadedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const existingTotalSize = prev.reduce((sum, f) => sum + f.size, 0);
      let cumulativeSize = existingTotalSize;
      const toAdd: File[] = [];

      for (const file of selected) {
        const validationError = validateSelectedFile(file, {
          accept: '.pdf,.doc,.docx',
          maxSizeBytes: MAX_EDIT_FILE_SIZE,
        });
        if (validationError) {
          setEditFileError(`${file.name}: ${validationError}`);
          return prev;
        }
        if (existingNames.has(file.name)) {
          setEditFileError(`${file.name}: File dengan nama ini sudah diupload.`);
          return prev;
        }
        if (cumulativeSize + file.size > MAX_EDIT_FILE_SIZE) {
          setEditFileError(`Total ukuran semua file tidak boleh melebihi 10 MB.`);
          return prev;
        }
        cumulativeSize += file.size;
        existingNames.add(file.name);
        toAdd.push(file);
      }

      setEditFileError(null);
      return [...prev, ...toAdd];
    });
  }

  function handleRemoveEditFile(indexToRemove: number) {
    setEditUploadedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  }

function addEditJurusanUnitOption() {
    const trimmed = editJurusanInput.trim();
    if (!trimmed) return;

    if (editAsal === 'Jurusan') {
      if (!editAllJurusanOptions.includes(trimmed)) setEditCustomJurusanOpts((prev) => [...prev, trimmed]);
    } else {
      if (!editAllUnitOptions.includes(trimmed)) setEditCustomUnitOpts((prev) => [...prev, trimmed]);
    }

    setEditForm((prev) => (prev ? { ...prev, namaUnitProdi: trimmed } : prev));
    setEditJurusanInput('');
    setEditJurusanOpen(false);
  }

  function removeEditJurusanUnitOption(option: string) {
    if (editAsal === 'Jurusan') {
      setEditCustomJurusanOpts((prev) => prev.filter((item) => item !== option));
    } else {
      setEditCustomUnitOpts((prev) => prev.filter((item) => item !== option));
    }

    setEditForm((prev) => {
      if (!prev) return prev;
      if (prev.namaUnitProdi === option) {
        return { ...prev, namaUnitProdi: '' };
      }
      return prev;
    });
  }

  function addEditRuangLingkupOption() {
    const trimmed = editRlInput.trim();
    if (!trimmed || editAllRlOptions.includes(trimmed)) return;

    setEditCustomRlOpts((prev) => [...prev, trimmed]);
    setEditForm((prev) => (prev ? { ...prev, ruangLingkup: [...prev.ruangLingkup, trimmed] } : prev));
    setEditRlInput('');
  }

  function removeEditRuangLingkupOption(option: string) {
    setEditCustomRlOpts((prev) => prev.filter((item) => item !== option));
    setEditForm((prev) => (prev ? { ...prev, ruangLingkup: prev.ruangLingkup.filter((item) => item !== option) } : prev));

  }

  async function saveEdit() {
    if (!editForm) return;

    if (!editForm.judulPengajuan.trim() || !editForm.namaMitra.trim() || !editForm.namaUnitProdi.trim()) {
      setInfoModalMessage('Judul, mitra, dan jurusan wajib diisi untuk menyimpan perubahan.');
      return;
    }

    if (editForm.ruangLingkup.length === 0) {
      setInfoModalMessage('Pilih minimal 1 ruang lingkup pada form edit.');
      return;
    }

    if (editForm.jenisDokumen !== editOriginalJenisDokumen && editUploadedFiles.length === 0) {
      setInfoModalMessage('Karena jenis dokumen diubah, upload dokumen baru wajib dilakukan.');
      return;
    }

    const persistentAttachments = editUploadedFiles.length > 0
      ? await buildPersistentFileAttachments(editUploadedFiles)
      : [];

    const editPayload = {
      updatedAt: editForm.updatedAt,
      judulPengajuan: editForm.judulPengajuan.trim(),
      namaMitra: editForm.namaMitra.trim(),
      namaUnitProdi: editForm.namaUnitProdi.trim(),
      jenisDokumen: editForm.jenisDokumen.trim() || 'MoU',
      tanggalMulai: editForm.tanggalMulai || undefined,
      tanggalBerakhir: editForm.tanggalBerakhir || undefined,
      ruangLingkup: editForm.ruangLingkup,
      ruangLingkupIds: (editForm.ruangLingkup || []).map((name) => ruangLingkupRows.find((r) => r.nama_ruang_lingkup === name)?.id).filter(Boolean) as number[],
      ...(editUploadedFiles.length > 0
        ? {
            fileName: editUploadedFiles.map((file) => file.name).join(', '),
            fileAttachments: persistentAttachments,
          }
        : {}),
    };

    try {
      const updated = await updatePengajuanItemApi(editForm.id, editPayload);
      setPengajuanData((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      void refreshPengajuanData(true);
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setInfoModalMessage(`Gagal memperbarui data pengajuan di server.${detail ? ` (${detail})` : ''}`);
      return;
    }

    setEditForm(null);
    setEditUploadedFiles([]);
    setEditFileError(null);
    setInfoModalMessage('Data pengajuan berhasil diperbarui.');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    const deletedId = deleteTarget.id;
    try {
      await deletePengajuanItemApi(deletedId);
    } catch {
      setInfoModalMessage('Gagal menghapus pengajuan di server.');
      return;
    }

    setDeleteTarget(null);

    if (detailItem?.id === deletedId) {
      setDetailItem(null);
    }

    if (reviewItem?.id === deletedId) {
      setReviewItem(null);
    }

    await refreshPengajuanData(false);
  }

  async function handleSubmitEditFromAjukan(payload: {
    formData: {
      namaMitra: string;
      jenisMitra: string;
      bidangUsaha: string;
      tingkatPerusahaan: string;
      teleponMitra: string;
      noTeleponMitra: string;
      emailMitra: string;
      alamatMitra: string;
      negara: string;
      jenisKerjasama: string;
      unitPelaksana: string;
      tanggalMulai: string;
      tanggalBerakhir: string;
      judulKerjasama: string;
      deskripsi: string;
      ruangLingkup: string;
      namaKontak: string;
      jabatanKontak: string;
      emailKontak: string;
      teleponKontak: string;
      picPolibatamNama?: string;
      picPolibatamJabatan?: string;
      picPolibatamEmail?: string;
      picPolibatamTelepon?: string;
    };
    asal: 'Jurusan' | 'Unit';
    selectedRuangLingkup: string[];
    dokumen: File[];
    dokumenAttachments: { file: File; dataUrl?: string }[];
    selectedProdiId: number | null;
    selectedProdiIds: number[];
    selectedJurusanIds: number[];
    existingFileAttachments?: PengajuanFileAttachment[];
  }): Promise<boolean> {
    if (!editingItem) {
      return false;
    }

    if (!payload.formData.judulKerjasama.trim() || !payload.formData.namaMitra.trim() || !payload.formData.unitPelaksana.trim()) {
      setInfoModalMessage('Judul, mitra, dan jurusan/unit wajib diisi untuk menyimpan perubahan.');
      return false;
    }

    // Gabungkan file existing yang tidak dihapus + file baru yang diupload
    const newFileAttachments = payload.dokumenAttachments.map((item) => ({
      name: item.file.name,
      type: item.file.type,
      size: item.file.size,
      url: item.dataUrl || '',
    }));
    const keptExistingFiles = payload.existingFileAttachments ?? [];
    const allFileAttachments = [...keptExistingFiles, ...newFileAttachments];

    // Hanya kirim file_attachments ke backend jika pengguna mengunggah file baru
    // atau menghapus salah satu file existing. Jika tidak ada perubahan file,
    // biarkan backend mempertahankan data file yang sudah ada (syncPengajuanFiles skip).
    const initialFileCount = editingItem.fileAttachments?.length ?? 0;
    const hasNewFiles = newFileAttachments.length > 0;
    const existingFilesRemoved = keptExistingFiles.length < initialFileCount;
    const filesWereModified = hasNewFiles || existingFilesRemoved;

    // Upsert master_mitra agar kategori, bidang usaha & tingkat tersimpan dan terhubung via mitra_id
    let resolvedMitraId: number | undefined = editingItem.mitraId;
    const jenisMitra = payload.formData.jenisMitra?.trim() || null;
    const bidangUsaha = payload.formData.bidangUsaha?.trim() || null;
    const tingkatPerusahaan = payload.formData.tingkatPerusahaan?.trim() || null;
    const namaMitraTrimmed = payload.formData.namaMitra.trim();
    const mitraNameChanged = namaMitraTrimmed.toLowerCase() !== (editingItem.namaMitra || '').trim().toLowerCase();

    // Alamat & PIC mitra juga ikut disinkronkan — sebelumnya cuma kategori/bidang usaha/tingkat
    // yang tersimpan di sini, jadi Alamat Mitra dan PIC di Rekap Data selalu kosong walau
    // sudah diisi di form.
    const mitraExtra = {
      alamat: payload.formData.alamatMitra?.trim() || editingItem.mitraAlamat || undefined,
      whatsapp_mitra: payload.formData.teleponMitra?.trim() || editingItem.mitraTelepon || undefined,
      no_telepon_mitra: payload.formData.noTeleponMitra?.trim() || editingItem.mitraNoTelepon || undefined,
      email_mitra: payload.formData.emailMitra?.trim() || editingItem.mitraEmail || undefined,
      negara: payload.formData.negara?.trim() || editingItem.mitraNegara || undefined,
      nama_kontak_utama: payload.formData.namaKontak?.trim() || editingItem.mitraPicNama || undefined,
      jabatan_kontak_utama: payload.formData.jabatanKontak?.trim() || editingItem.mitraPicJabatan || undefined,
      email_kontak_utama: payload.formData.emailKontak?.trim() || editingItem.mitraPicEmail || undefined,
      telepon_kontak_utama: payload.formData.teleponKontak?.trim() || editingItem.mitraPicTelepon || undefined,
    };

    try {
      if (resolvedMitraId && !mitraNameChanged) {
        // Nama mitra sama — cukup update kategori, bidang usaha & tingkat pada mitra yang sudah tertaut
        await updateMasterMitra(resolvedMitraId, {
          kategori_mitra: jenisMitra,
          bidang_usaha: bidangUsaha,
          tingkat_perusahaan: tingkatPerusahaan,
          ...mitraExtra,
        });
      } else if (namaMitraTrimmed) {
        // Nama mitra berubah atau belum ada mitra_id — cari/buat mitra berdasarkan nama baru
        const mitra = await upsertMasterMitraByName(namaMitraTrimmed, {
          kategoriMitra: jenisMitra,
          bidangUsaha: bidangUsaha,
          tingkatPerusahaan: tingkatPerusahaan,
          extra: mitraExtra,
        });
        resolvedMitraId = mitra.id;
      }
    } catch (err) {
      // Jika upsert gagal (misal permission), lanjutkan tanpa update mitra_id
      console.error('Gagal sinkron data mitra ke Data Kemitraan:', err);
    }

    const resolvedRuangLingkupIds = (payload.selectedRuangLingkup || [])
      .map((name) => ruangLingkupRows.find((r) => r.nama_ruang_lingkup === name)?.id)
      .filter((id): id is number => typeof id === 'number');

    const editPayload = {
      updatedAt: editingItem.updatedAt,
      judulPengajuan: payload.formData.judulKerjasama.trim(),
      namaMitra: namaMitraTrimmed,
      mitraId: resolvedMitraId,
      mitraKategori: jenisMitra ?? '',
      mitraBidangUsaha: bidangUsaha ?? '',
      mitraTingkatPerusahaan: tingkatPerusahaan ?? '',
      namaUnitProdi: payload.formData.unitPelaksana.trim(),
      unitProdiId: (() => {
        if (payload.selectedProdiId !== null) return payload.selectedProdiId;
        const unitName = payload.formData.unitPelaksana.trim().toLowerCase();
        const allUnits = [...masterJurusanRows, ...masterUnitRows, ...masterProdiRows];
        return allUnits.find((u) => u.nama.toLowerCase() === unitName)?.id ?? editingItem.unitProdiId;
      })(),
      ...(payload.selectedProdiIds.length > 0
        ? { unitProdiIds: payload.selectedProdiIds, jurusanIds: payload.selectedJurusanIds }
        : {}),
      jenisDokumen: payload.formData.jenisKerjasama.trim() || editingItem.jenisDokumen,
      tanggalMulai: payload.formData.tanggalMulai || undefined,
      tanggalBerakhir: payload.formData.tanggalBerakhir || undefined,
      ruangLingkup: payload.selectedRuangLingkup,
      ruangLingkupIds: resolvedRuangLingkupIds.length > 0 ? resolvedRuangLingkupIds : editingItem.ruangLingkupIds,
      emailPengusul: payload.formData.emailKontak || editingItem.mitraPicEmail || editingItem.emailPengusul,
      whatsappPengusul: payload.formData.teleponKontak || editingItem.mitraPicTelepon || editingItem.whatsappPengusul,
      picPolibatamNama: payload.formData.picPolibatamNama?.trim() ?? '',
      picPolibatamJabatan: payload.formData.picPolibatamJabatan?.trim() ?? '',
      picPolibatamEmail: payload.formData.picPolibatamEmail?.trim() ?? '',
      picPolibatamTelepon: payload.formData.picPolibatamTelepon?.trim() ?? '',
      mitraTelepon: payload.formData.teleponMitra || editingItem.mitraTelepon,
      mitraNoTelepon: payload.formData.noTeleponMitra || editingItem.mitraNoTelepon,
      deskripsiPengajuan: payload.formData.deskripsi.trim().slice(0, 100) || editingItem.deskripsiPengajuan,
      manfaat: payload.formData.deskripsi.trim() || editingItem.manfaat,
      jabatanPengusul: payload.formData.jabatanKontak.trim() || editingItem.mitraPicJabatan || editingItem.jabatanPengusul,
      ...(filesWereModified
        ? {
            fileName: allFileAttachments.map((f) => f.name).join(', '),
            fileAttachments: allFileAttachments,
          }
        : {}),
    };

    try {
      const updated = await updatePengajuanItemApi(editingItem.id, editPayload);
      setPengajuanData((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      void refreshPengajuanData(true);
      setInfoModalMessage('Data pengajuan berhasil diperbarui.');
      return true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setInfoModalMessage(`Gagal memperbarui data pengajuan di server.${detail ? ` (${detail})` : ''}`);
      return false;
    }
  }

  async function handleSubmitMasterReference() {
    const nama = masterNama.trim();
    if (!nama) {
      setMasterMessage('Nama master wajib diisi.');
      return;
    }

    try {
      setMasterSaving(true);
      setMasterMessage(null);

      await createMasterUnitProdi({
        parent_id: null,
        jenis_node: 'unit',
        kategori_unit: masterJenis,
        kode: masterKode.trim() || undefined,
        nama,
        aktif: true,
      });

      await refreshMasterReferenceData();
      setMasterKode('');
      setMasterNama('');
      setMasterMessage('Master berhasil disimpan.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menyimpan master.';
      setMasterMessage(message);
    } finally {
      setMasterSaving(false);
    }
  }

  async function handleAddProdiToJurusan(jurusanId: number) {
    const draft = prodiDraftByJurusan[jurusanId] || { kode: '', nama: '' };
    const nama = draft.nama.trim();

    if (!nama) {
      setMasterMessage('Nama prodi wajib diisi.');
      return;
    }

    try {
      setMasterSaving(true);
      setMasterMessage(null);

      await createMasterUnitProdi({
        parent_id: jurusanId,
        jenis_node: 'prodi',
        kategori_unit: null,
        kode: draft.kode.trim() || undefined,
        nama,
        aktif: true,
      });

      const prodiRows = await getMasterUnitProdi({ jenis_node: 'prodi', aktif: true });
      setMasterProdiRows(prodiRows);
      setProdiDraftByJurusan((prev) => ({
        ...prev,
        [jurusanId]: { kode: '', nama: '' },
      }));
      setMasterMessage('Prodi berhasil ditambahkan.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menyimpan prodi.';
      setMasterMessage(message);
    } finally {
      setMasterSaving(false);
    }
  }

  function startEditProdi(prodi: MasterUnitProdi) {
    setEditingProdiId(prodi.id);
    setEditingProdiKode(prodi.kode || '');
    setEditingProdiNama(prodi.nama || '');
  }

  function cancelEditProdi() {
    setEditingProdiId(null);
    setEditingProdiKode('');
    setEditingProdiNama('');
  }

  async function saveEditProdi(prodiId: number) {
    const nama = editingProdiNama.trim();
    if (!nama) {
      setMasterMessage('Nama prodi wajib diisi.');
      return;
    }

    try {
      setMasterSaving(true);
      setMasterMessage(null);

      await updateMasterUnitProdi(prodiId, {
        kode: editingProdiKode.trim() || '',
        nama,
      });

      const prodiRows = await getMasterUnitProdi({ jenis_node: 'prodi', aktif: true });
      setMasterProdiRows(prodiRows);
      cancelEditProdi();
      setMasterMessage('Prodi berhasil diperbarui.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal memperbarui prodi.';
      setMasterMessage(message);
    } finally {
      setMasterSaving(false);
    }
  }

  function startEditUnit(unit: MasterUnitProdi) {
    setEditingUnitId(unit.id);
    setEditingUnitKode(unit.kode || '');
    setEditingUnitNama(unit.nama || '');
  }

  function cancelEditUnit() {
    setEditingUnitId(null);
    setEditingUnitKode('');
    setEditingUnitNama('');
  }

  async function saveEditUnit(unitId: number) {
    const nama = editingUnitNama.trim();
    if (!nama) {
      setMasterMessage('Nama unit wajib diisi.');
      return;
    }

    try {
      setMasterSaving(true);
      setMasterMessage(null);

      await updateMasterUnitProdi(unitId, {
        kode: editingUnitKode.trim() || '',
        nama,
      });

      await refreshMasterReferenceData();
      cancelEditUnit();
      setMasterMessage('Unit kerja berhasil diperbarui.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal memperbarui unit kerja.';
      setMasterMessage(message);
    } finally {
      setMasterSaving(false);
    }
  }

  function startEditJurusan(jurusan: MasterUnitProdi) {
    setEditingJurusanId(jurusan.id);
    setEditingJurusanKode(jurusan.kode || '');
    setEditingJurusanNama(jurusan.nama || '');
  }

  function cancelEditJurusan() {
    setEditingJurusanId(null);
    setEditingJurusanKode('');
    setEditingJurusanNama('');
  }

  async function saveEditJurusan(jurusanId: number) {
    const nama = editingJurusanNama.trim();
    if (!nama) {
      setMasterMessage('Nama jurusan wajib diisi.');
      return;
    }

    try {
      setMasterSaving(true);
      setMasterMessage(null);

      await updateMasterUnitProdi(jurusanId, {
        kode: editingJurusanKode.trim() || '',
        nama,
      });

      await refreshMasterReferenceData();
      cancelEditJurusan();
      setMasterMessage('Jurusan berhasil diperbarui.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal memperbarui jurusan.';
      setMasterMessage(message);
    } finally {
      setMasterSaving(false);
    }
  }

  async function handleDeleteProdi(prodiId: number) {
    const confirmed = await mintaKonfirmasi('Yakin ingin menghapus prodi ini?');
    if (!confirmed) {
      return;
    }

    try {
      setMasterSaving(true);
      setMasterMessage(null);

      const deleted = await deleteMasterUnitProdi(prodiId);
      if (!deleted) {
        throw new Error('Gagal menghapus prodi.');
      }
      const prodiRows = await getMasterUnitProdi({ jenis_node: 'prodi', aktif: true });
      if (prodiRows.some((item) => item.id === prodiId)) {
        throw new Error('Delete prodi tidak tersinkron ke backend. Silakan refresh halaman lalu coba lagi.');
      }
      setMasterProdiRows(prodiRows);
      setMasterMessage('Prodi berhasil dihapus.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menghapus prodi.';
      setMasterMessage(message);
    } finally {
      setMasterSaving(false);
    }
  }

  async function handleDeleteJurusan(jurusanId: number) {
    const confirmed = await mintaKonfirmasi('Yakin ingin menghapus jurusan ini? Semua prodi di bawah jurusan ini juga akan ikut dihapus.');
    if (!confirmed) {
      return;
    }

    try {
      setMasterSaving(true);
      setMasterMessage(null);

      const deleted = await deleteMasterUnitProdi(jurusanId);
      if (!deleted) {
        throw new Error('Gagal menghapus jurusan.');
      }

      const { jurusanRows } = await refreshMasterReferenceData();

      if (jurusanRows.some((item) => item.id === jurusanId)) {
        throw new Error('Delete jurusan tidak tersinkron ke backend. Silakan refresh halaman lalu coba lagi.');
      }
      setMasterMessage('Jurusan berhasil dihapus beserta prodi terkait.');
    } catch (error) {
      let message = 'Gagal menghapus jurusan.';
      if (error instanceof Error && error.message) {
        message = error.message;
      }
      if (message.toLowerCase().includes('children')) {
        message = 'Jurusan masih memiliki prodi turunan. Silakan coba lagi atau hapus prodi terlebih dahulu.';
      }
      setMasterMessage(message);
    } finally {
      setMasterSaving(false);
    }
  }

  async function handleDeleteUnitKerja(unitId: number) {
    const confirmed = await mintaKonfirmasi('Yakin ingin menghapus unit kerja ini?');
    if (!confirmed) {
      return;
    }

    try {
      setMasterSaving(true);
      setMasterMessage(null);

      const deleted = await deleteMasterUnitProdi(unitId);
      if (!deleted) {
        throw new Error('Gagal menghapus unit kerja.');
      }

      const { unitRows } = await refreshMasterReferenceData();
      if (unitRows.some((item) => item.id === unitId)) {
        throw new Error('Delete unit kerja tidak tersinkron ke backend. Silakan refresh halaman lalu coba lagi.');
      }
      setMasterMessage('Unit kerja berhasil dihapus.');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Gagal menghapus unit kerja.';
      setMasterMessage(message);
    } finally {
      setMasterSaving(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Pengajuan Kerjasama</h1>
          <p className="page-subtitle mt-1">Kelola data pengajuan kerjasama dari seluruh jurusan dan unit di Polibatam</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMasterModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1E376C] bg-white px-3 py-2 text-[12px] font-semibold text-[#1E376C] shadow-sm transition hover:bg-[#EEF2FF]"
          >
            <Plus size={15} />
            Referensi Kampus
          </button>
          <button
            type="button"
            onClick={() => setNegaraModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1E376C] bg-white px-3 py-2 text-[12px] font-semibold text-[#1E376C] shadow-sm transition hover:bg-[#EEF2FF]"
          >
            <Plus size={15} />
            Tambah Negara
          </button>
          <button
            type="button"
            onClick={() => {
              setRuangLingkupModalOpen(true);
              setRuangLingkupMessage(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1E376C] bg-white px-3 py-2 text-[12px] font-semibold text-[#1E376C] shadow-sm transition hover:bg-[#EEF2FF]"
          >
            <Plus size={15} />
            Tambah Ruang Lingkup
          </button>
          <button
            type="button"
            onClick={() => setAjukanModalOpen(true)}
            className="btn-primary flex items-center gap-2 px-3 py-2 text-[12px] font-semibold shadow-sm flex-shrink-0"
          >
            <Plus size={16} />
            Ajukan Kerjasama Baru
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isActive = filterStatus === card.key;

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setFilterStatus(card.key)}
              className={`rounded-lg p-3 shadow-sm flex items-center gap-3 text-left border transition-all ${
                isActive
                  ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-200 shadow-md'
                  : 'bg-white border-slate-200 hover:border-sky-200 hover:shadow-md'
              }`}
            >
              <div className={`w-9 h-9 ${card.iconWrap} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={card.iconText} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500">{card.label}</p>
                <p className={`text-[17px] font-bold ${card.valueText}`}>{card.value}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter Row */}
      <div className="toolbar-shell p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-[12px] text-gray-700 font-medium">
            <Filter size={15} />
            Filter:
          </div>
          <GroupedFilterSelect
            value={filterJurusan}
            onChange={setFilterJurusan}
            allLabel="Semua Kategori Kerjasama"
            groups={[{ label: '', options: ['Internal', 'Eksternal'] }]}
          />
          <GroupedFilterSelect
            value={filterUnitProdi}
            onChange={setFilterUnitProdi}
            allLabel="Semua Jurusan/Prodi/Unit"
            groups={[
              { label: 'Jurusan', options: unitProdiGroups.jurusan },
              { label: 'Program Studi', options: unitProdiGroups.prodi },
              { label: 'Unit Kerja', options: unitProdiGroups.unit },
              { label: 'Lainnya', options: unitProdiGroups.lainnya },
            ]}
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setYearPickerOpen((prev) => !prev)}
              className="input-field inline-flex min-w-[150px] items-center justify-between gap-2 px-3 py-2 text-[12px] text-gray-700 transition-colors"
            >
              <span>{filterTahun === 'Semua Tahun' ? 'Pilih Tahun' : filterTahun}</span>
              <CalendarDays size={16} className="text-gray-500" />
            </button>

            {yearPickerOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[280px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setYearRangeStart((prev) => prev - 12)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-[12px] font-semibold text-gray-800">
                    {yearRangeStart} - {yearRangeStart + 11}
                  </p>
                  <button
                    type="button"
                    onClick={() => setYearRangeStart((prev) => prev + 12)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {yearGrid.map((year) => {
                    const yearString = String(year);
                    const isSelected = yearString === filterTahun;
                    const hasData = tahunOptions.includes(yearString);

                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setFilterTahun(yearString);
                          setYearPickerOpen(false);
                        }}
                        className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
                          isSelected
                            ? 'border-[#1E376C] bg-[#1E376C] text-white'
                            : hasData
                              ? 'border-gray-200 bg-white text-gray-800 hover:border-[#1E376C] hover:text-[#1E376C]'
                              : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                        }`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <p className="text-[10px] text-gray-500">Pilih tahun untuk menampilkan data tahunan</p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterTahun('Semua Tahun');
                      setYearPickerOpen(false);
                    }}
                    className="text-[10px] font-semibold text-[#1E376C] transition-colors hover:text-[#2B4A93]"
                  >
                    Semua Tahun
                  </button>
                </div>
              </div>
            )}
          </div>
          <GroupedFilterSelect
            value={filterStatus}
            onChange={setFilterStatus}
            allLabel="Semua Status"
            groups={[{ label: '', options: ['Menunggu', 'Diproses', 'Disetujui', 'Ditolak'] }]}
          />
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari berdasarkan nama mitra atau judul..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field w-full pl-9 pr-3 py-2 text-[12px] text-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Toolbar pilih & hapus massal */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleSelectAllPengajuan}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 hover:text-[#1E376C]"
          >
            {paginatedFiltered.length > 0 && paginatedFiltered.every((item) => selectedPengajuanIds.has(item.id))
              ? <CheckSquare size={15} className="text-[#1E376C]" />
              : <Square size={15} />}
            Pilih Semua yang Tampil
          </button>
          {selectedPengajuanIds.size > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-red-700"
            >
              <Trash2 size={14} />
              Hapus ({selectedPengajuanIds.size})
            </button>
          )}
        </div>
      )}

      {/* Cards List */}
      <div className="space-y-4">
        {paginatedFiltered.map((item) => {
          const sc = statusConfig[item.statusPengajuan] || statusConfig['Menunggu'];
          const isSelected = selectedPengajuanIds.has(item.id);
          return (
            <div
              key={item.id}
              // Klik di mana saja pada kotak membuka detail; klik pada tombol/tautan di dalamnya
              // (pilih, Final, Edit, Hapus, dst.) tetap menjalankan aksinya sendiri.
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
                setDetailItem(item);
              }}
              className={`card cursor-pointer p-4 hover:shadow-md transition-shadow ${isSelected ? 'ring-2 ring-[#1E376C]' : ''}`}
            >
              {/* Top row */}
              <div className="flex justify-between items-start gap-4">
                <div className="flex flex-1 min-w-0 items-start gap-3">
                  <button
                    type="button"
                    onClick={() => togglePengajuanSelected(item.id)}
                    className="mt-0.5 shrink-0 text-gray-400 hover:text-[#1E376C]"
                    aria-label={`Pilih pengajuan ${item.judulPengajuan}`}
                  >
                    {isSelected ? <CheckSquare size={16} className="text-[#1E376C]" /> : <Square size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500 mb-0.5">Judul Pengajuan:</p>
                    <h3 className="text-[13.5px] font-bold text-gray-900">{item.judulPengajuan}</h3>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Pengusul: {item.namaPengusul} &bull; {item.diajukanPada}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span className={`flex items-center gap-1.5 ${sc.className}`}>
                    {sc.iconEl}
                    {sc.label}
                  </span>
                  {/* Pengusul sudah mengirim ulang setelah diminta Revisi — perlu dicek ulang admin. */}
                  {item.direvisiPengusulPada && (item.statusPengajuan === 'Menunggu Review' || item.statusPengajuan === 'Menunggu') && (
                    <span
                      className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                      title={`Dikirim ulang pengusul pada ${new Date(item.direvisiPengusulPada).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`}
                    >
                      Sudah Direvisi
                    </span>
                  )}
                </div>
              </div>

              {item.statusPengajuan === 'Revisi' && (
                <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-800">
                    <FilePenLine size={13} />
                    Menunggu pengusul memperbarui pengajuan
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[11px] text-orange-900">
                    <span className="font-semibold">Catatan revisi:</span>{' '}
                    {item.catatanRevisi || item.reviewComment || item.catatan || '-'}
                  </p>
                  <p className="mt-1 text-[10px] text-orange-800">
                    Pengusul cukup memperbarui data/dokumen pada pengajuan ini, tidak perlu membuat pengajuan baru. Setelah dikirim ulang, status kembali ke Menunggu dengan penanda &quot;Sudah Direvisi&quot;.
                  </p>
                </div>
              )}

              {item.statusPengajuan === 'Ditolak' && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-800">
                    <XCircle size={13} />
                    Pengajuan ditolak
                  </p>
                  <p className="mt-1 whitespace-pre-line text-[11px] text-red-900">
                    <span className="font-semibold">Alasan:</span>{' '}
                    {item.reviewComment || item.catatan || 'Tidak ada alasan yang dicantumkan.'}
                  </p>
                  <p className="mt-1 text-[10px] text-red-800">
                    Pengajuan yang ditolak tidak bisa diperbaiki. Pengusul harus membuat pengajuan baru bila ingin mengajukan kembali.
                  </p>
                </div>
              )}

              {/* Info row + Action buttons */}
              <div className="flex flex-wrap items-start justify-between gap-3 mt-4">
                <div className="flex flex-wrap items-start gap-4">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Mitra Tujuan</p>
                    <p className="text-[12px] font-semibold text-gray-900">{item.namaMitra}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Jenis Dokumen</p>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${pengajuanDokumenBadge[item.jenisDokumen] || 'bg-[#1E376C] text-white'}`}>
                      {item.jenisDokumen}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Jurusan</p>
                    <p className="text-[12px] text-gray-700">{item.namaUnitProdi}</p>
                  </div>
                  {item.keputusan && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">Keputusan</p>
                      <p className="text-[12px] font-semibold text-gray-900">{item.keputusan}</p>
                    </div>
                  )}
                  {item.catatan && (
                    <div className="max-w-[200px]">
                      <p className="text-[10px] text-gray-400 mb-1">Catatan Review</p>
                      <p className="text-[12px] text-gray-700 truncate" title={item.catatan}>{item.catatan}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={() => setDetailItem(item)}
                    className="btn-secondary inline-flex items-center gap-1.5 text-[10px] sm:text-[12px] px-2.5 sm:px-3 py-1.5"
                  >
                    <Eye size={14} />
                    <span className="hidden xs:inline sm:inline">Detail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openReview(item)}
                    className="inline-flex items-center gap-1.5 text-[10px] sm:text-[12px] text-green-700 border border-green-300 bg-green-50 rounded-lg px-2.5 sm:px-3 py-1.5 font-medium transition-colors hover:bg-green-100"
                  >
                    <MessageSquare size={14} />
                    <span className="hidden xs:inline sm:inline">Final</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    title={isPengajuanSudahFinal(item) ? 'Sudah difinalkan — edit lewat Rekap Data' : undefined}
                    className="inline-flex items-center gap-1.5 text-[10px] sm:text-[12px] text-amber-700 border border-amber-300 bg-amber-50 rounded-lg px-2.5 sm:px-3 py-1.5 font-medium transition-colors hover:bg-amber-100"
                  >
                    <Pencil size={14} />
                    <span className="hidden xs:inline sm:inline">Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="inline-flex items-center gap-1.5 text-[10px] sm:text-[12px] text-red-700 border border-red-300 bg-red-50 rounded-lg px-2.5 sm:px-3 py-1.5 font-medium transition-colors hover:bg-red-100"
                  >
                    <Trash2 size={14} />
                    <span className="hidden xs:inline sm:inline">Hapus</span>
                  </button>
                </div>
              </div>

              {/* Ruang Lingkup */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-[10px] text-gray-500">Ruang Lingkup:</span>
                {item.ruangLingkup.map((rl) => (
                  <span
                    key={rl}
                    className="bg-gray-100 text-gray-700 rounded text-[10px] font-medium px-3 py-1"
                  >
                    {rl}
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          pengajuanLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="card animate-pulse p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3 flex-1">
                      <div className="h-4 w-3/5 rounded bg-slate-200" />
                      <div className="h-3 w-1/3 rounded bg-slate-200" />
                    </div>
                    <div className="h-6 w-24 rounded-full bg-slate-200" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-start gap-6">
                    <div className="space-y-2">
                      <div className="h-3 w-20 rounded bg-slate-200" />
                      <div className="h-4 w-36 rounded bg-slate-200" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-20 rounded bg-slate-200" />
                      <div className="h-5 w-20 rounded bg-slate-200" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-16 rounded bg-slate-200" />
                      <div className="h-4 w-28 rounded bg-slate-200" />
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="h-8 w-20 rounded-lg bg-slate-200" />
                      <div className="h-8 w-20 rounded-lg bg-slate-200" />
                      <div className="h-8 w-20 rounded-lg bg-slate-200" />
                      <div className="h-8 w-20 rounded-lg bg-slate-200" />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {Array.from({ length: 3 }).map((__, rlIndex) => (
                      <div key={rlIndex} className="h-6 w-24 rounded bg-slate-200" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-12 text-center text-gray-400">
              Tidak ada data yang sesuai dengan filter.
            </div>
          )
        )}
      </div>

      {filtered.length > ITEMS_PER_PAGE && (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-gray-500">
            Menampilkan <span className="font-semibold text-gray-700">{pageStartIndex + 1}–{Math.min(pageStartIndex + ITEMS_PER_PAGE, filtered.length)}</span> dari{' '}
            <span className="font-semibold text-gray-700">{filtered.length}</span> pengajuan
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

        {ajukanModalOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
            onClick={() => setAjukanModalOpen(false)}
          >
            <div
              className="w-full max-w-[1120px] rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <AdminAjukanKerjasamaForm
                isModal
                inisiasiId={inisiasiAsalId}
                onCancel={() => setAjukanModalOpen(false)}
                onSubmitted={() => {
                  setAjukanModalOpen(false);
                  void refreshPengajuanData();
                }}
                initialMasterUnitProdiTree={masterUnitProdiTreeForForm}
                initialMasterRuangLingkupRows={ruangLingkupRows}
                initialCustomNegaraOptions={masterNegaraRows.map((item) => item.nama_negara)}
              />
            </div>
          </div>
        )}

      {editingItem && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="w-full max-w-[1120px] rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
              <InternalAjukanKerjasamaForm
                isModal
                disableDraftPersistence
                nomorPengajuanSource="admin"
                submitButtonLabel="Simpan Perubahan"
                initialMasterUnitProdiTree={masterUnitProdiTreeForForm}
                initialMasterRuangLingkupRows={ruangLingkupRows}
                initialCustomNegaraOptions={masterNegaraRows.map((item) => item.nama_negara)}
                initialFileAttachments={editingItem.fileAttachments ?? []}
                initialData={editFormInitialData}
                onCancel={() => setEditingItem(null)}
                onSubmitted={() => {
                    setEditingItem(null);
                    void refreshPengajuanData(true);
                  }}
                onSubmitOverride={handleSubmitEditFromAjukan}
              />
          </div>
        </div>
      )}

      {detailItem && (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[1px] p-4 flex items-center justify-center">
          <div className="w-full max-w-[640px] bg-[#EFEFF1] rounded-xl shadow-xl border border-[#DBDDE3] flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-[#D5D7DD]">
              <div>
                <h3 className="text-[17px] font-bold text-gray-900">Detail Pengajuan</h3>
                <p className="text-[10px] text-gray-600">ID: {detailItem.id}</p>
                {detailItem.akunPengaju && (
                  <p className="text-[10px] text-gray-500 mt-0.5">Akun pengaju: <span className="font-semibold text-gray-700">{detailItem.akunPengaju}</span></p>
                )}
              </div>
              <button type="button" onClick={() => { setDetailItem(null); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-white rounded-lg px-4 py-3 border border-[#D9DCE4]">
                <p className="text-[10px] text-gray-500">Status:</p>
                <p className="text-[12px] font-semibold text-gray-900 mt-0.5">{statusConfig[detailItem.statusPengajuan]?.label || 'Menunggu'}</p>
              </div>

              <InisiasiAsalPanel inisiasiId={detailItem.inisiasiId} />

              <div className="bg-white rounded-lg px-4 py-3 border border-[#D9DCE4]">
                <p className="text-[12px] font-semibold text-gray-900">{detailItem.judulPengajuan}</p>
                <p className="text-[10px] text-gray-600 mt-1">Diajukan oleh: {detailItem.namaPengusul}</p>
                <div className="mt-3 grid gap-3 text-[10px] sm:grid-cols-2">
                  <div>
                    <p className="text-gray-500">Nomor WhatsApp Aktif Mitra</p>
                    {buildWhatsAppUrl(detailItem.mitraTelepon, buildPesanWhatsAppPengajuan(detailItem, detailItem.mitraPicNama), detailItem.mitraNegara) ? (
                      <a
                        href={buildWhatsAppUrl(detailItem.mitraTelepon, buildPesanWhatsAppPengajuan(detailItem, detailItem.mitraPicNama), detailItem.mitraNegara) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-green-700 underline hover:text-green-800"
                      >
                        {detailItem.mitraTelepon}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <p className="text-gray-900 font-medium">-</p>
                    )}
                  </div>
                  <div>
                    <p className="text-gray-500">No WhatsApp PIC Mitra</p>
                    {buildWhatsAppUrl(detailItem.whatsappPengusul, buildPesanWhatsAppPengajuan(detailItem, detailItem.mitraPicNama), detailItem.mitraNegara) ? (
                      <a
                        href={buildWhatsAppUrl(detailItem.whatsappPengusul, buildPesanWhatsAppPengajuan(detailItem, detailItem.mitraPicNama), detailItem.mitraNegara) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-green-700 underline hover:text-green-800"
                      >
                        {detailItem.mitraPicNama ? `${detailItem.mitraPicNama} · ` : ''}{detailItem.whatsappPengusul}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <p className="text-gray-900 font-medium">-</p>
                    )}
                  </div>
                  <div>
                    <p className="text-gray-500">No WhatsApp PIC Polibatam</p>
                    {buildPolibatamWhatsAppUrl(detailItem.picPolibatamTelepon, buildPesanWhatsAppPengajuan(detailItem, detailItem.picPolibatamNama)) ? (
                      <a
                        href={buildPolibatamWhatsAppUrl(detailItem.picPolibatamTelepon, buildPesanWhatsAppPengajuan(detailItem, detailItem.picPolibatamNama)) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-green-700 underline hover:text-green-800"
                      >
                        {detailItem.picPolibatamNama ? `${detailItem.picPolibatamNama} · ` : ''}+62 {detailItem.picPolibatamTelepon}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <p className="text-gray-900 font-medium">-</p>
                    )}
                  </div>
                  <div>
                    <p className="text-gray-500">Nomor Telepon Mitra</p>
                    {detailItem.mitraNoTelepon ? (
                      <a
                        href={`tel:${detailItem.mitraNoTelepon.replace(/[^\d+]/g, '')}`}
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-gray-900 underline hover:text-gray-700"
                      >
                        {detailItem.mitraNoTelepon}
                      </a>
                    ) : (
                      <p className="text-gray-900 font-medium">-</p>
                    )}
                  </div>
                </div>
              </div>

              <KoresponMitraCard item={detailItem} />

              <div className="bg-white rounded-lg px-4 py-3 border border-[#D9DCE4]">
                <p className="text-[12px] font-semibold text-gray-900 mb-3">Informasi Pengajuan</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[10px]">
                  <div>
                    <p className="text-gray-500">Tanggal Pengajuan</p>
                    <p className="text-gray-900 font-medium">{detailItem.diajukanPada}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Jenis Dokumen</p>
                    <span className={`inline-flex mt-1 px-2 py-0.5 rounded text-[10.5px] font-semibold ${pengajuanDokumenBadge[detailItem.jenisDokumen] || 'bg-[#1E376C] text-white'}`}>
                      {detailItem.jenisDokumen}
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-500">Jurusan/Prodi/Unit</p>
                    <p className="text-gray-900 font-medium">{detailItem.namaUnitProdi}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Mitra Tujuan</p>
                    <p className="text-gray-900 font-medium">{detailItem.namaMitra}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Jenis Mitra</p>
                    <p className="text-gray-900 font-medium">{detailItem.mitraKategori || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tingkat Perusahaan</p>
                    <p className="text-gray-900 font-medium">{detailItem.mitraTingkatPerusahaan || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tanggal Mulai</p>
                    <p className="text-gray-900 font-medium">{detailItem.tanggalMulai || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tanggal Berakhir</p>
                    <p className="text-gray-900 font-medium">{detailItem.tanggalBerakhir || '-'}</p>
                  </div>
                  {detailItem.deskripsiPengajuan && (
                    <div className="col-span-2">
                      <p className="text-gray-500">Manfaat Kerja Sama</p>
                      <p className="text-gray-900 font-medium">{detailItem.deskripsiPengajuan}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-lg px-4 py-3 border border-[#D9DCE4]">
                <p className="text-[10px] text-gray-500 mb-2">Ruang Lingkup Kerjasama:</p>
                <div className="flex flex-wrap gap-2">
                  {detailItem.ruangLingkup.map((rl) => (
                    <span key={rl} className="bg-[#ECEFF6] text-[#1E376C] rounded-md text-[10.5px] font-semibold px-2.5 py-1">
                      {rl}
                    </span>
                  ))}
                </div>
              </div>

              <FileRevisiBox files={detailItem.revisiFiles} forPengusul={false} />

              <div className="bg-white rounded-lg px-4 py-3 border border-[#D9DCE4]">
                <p className="text-[12px] font-semibold text-gray-900 mb-2">Dokumen Pendukung</p>

                {(() => {
                  const originalFiles = detailFileEntries.filter((f) => !f.isAcc);
                  // Deduplicate ACC files by name, keep the last (terbaru)
                  const accFilesRaw = detailFileEntries.filter((f) => f.isAcc);
                  const accFilesMap = new Map<string, typeof accFilesRaw[number]>();
                  for (const f of accFilesRaw) accFilesMap.set(f.name, f);
                  const accFiles = Array.from(accFilesMap.values());
                  return (
                    <>
                      {originalFiles.length === 0 ? (
                        <p className="text-[10px] text-gray-500 mb-2">Belum ada dokumen awal yang diunggah.</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {originalFiles.map((doc, index) => {
                            const sourceUrl = doc.url || detailFallbackTemplateUrl;
                            return (
                              <div key={`orig-${doc.name}-${index}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <Paperclip size={14} className="shrink-0 text-slate-500" />
                                {sourceUrl ? (
                                  <a
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="truncate text-[10px] font-medium text-blue-600 underline hover:text-blue-800"
                                  >
                                    {doc.name}
                                  </a>
                                ) : (
                                  <span className="truncate text-[10px] font-medium text-slate-400" title="File tidak ditemukan di server">
                                    {doc.name} (file tidak tersedia)
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {accFiles.length > 0 && (
                        <>
                          <div className="flex items-center gap-1.5 mb-2 mt-1">
                            <CheckCircle size={13} className="text-emerald-600" />
                            <p className="text-[10px] font-semibold text-emerald-700">Dokumen Final (ACC)</p>
                          </div>
                          <div className="space-y-2">
                            {accFiles.map((doc, index) => (
                              <div key={`acc-${doc.name}-${index}`} className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                                <Paperclip size={14} className="shrink-0 text-emerald-600" />
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={doc.name}
                                  className="truncate text-[10px] font-medium text-emerald-700 underline hover:text-emerald-800"
                                >
                                  {doc.name}
                                </a>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>

              <button
                type="button"
                onClick={() => { setDetailItem(null); }}
                className="w-full h-10 rounded-lg bg-[#1E376C] text-white text-[12px] font-semibold hover:bg-[#2A4A8F]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

{reviewItem && (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[1px] p-4 flex items-center justify-center">
          <div className="w-full max-w-[680px] bg-[#EFEFF1] rounded-xl shadow-xl border border-[#DBDDE3] flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-[#D5D7DD]">
              <div>
                <h3 className="text-[17px] font-bold text-gray-900">Final Pengajuan</h3>
                <p className="text-[12px] text-gray-700 mt-0.5">{reviewItem.judulPengajuan}</p>
              </div>
              <button type="button" onClick={() => setReviewItem(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-white rounded-lg px-4 py-3 border border-[#D9DCE4] grid grid-cols-2 gap-x-4 gap-y-3 text-[10px]">
                <div>
                  <p className="text-gray-500">Pengusul:</p>
                  <p className="text-gray-900 font-medium">{reviewItem.namaPengusul}</p>
                </div>
                <div>
                  <p className="text-gray-500">Mitra Tujuan:</p>
                  <p className="text-gray-900 font-medium">{reviewItem.namaMitra}</p>
                </div>
                <div>
                  <p className="text-gray-500">Jurusan</p>
                  <p className="text-gray-900 font-medium">{reviewItem.namaUnitProdi}</p>
                </div>
                <div>
                  <p className="text-gray-500">Jenis Dokumen</p>
                  <span className={`inline-flex mt-1 px-2 py-0.5 rounded text-[10.5px] font-semibold ${pengajuanDokumenBadge[reviewItem.jenisDokumen] || 'bg-[#1E376C] text-white'}`}>
                    {reviewItem.jenisDokumen}
                  </span>
                </div>
              </div>

              <KoresponMitraCard item={reviewItem} />

<div>
                <p className="text-[10px] font-semibold text-gray-700 mb-2">Keputusan *</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {/* Revisi button - LEFT side */}
                  <button
                    type="button"
                    onClick={() => setReviewDecision('Revisi')}
                    className={`h-11 rounded-lg text-[10px] font-semibold inline-flex items-center justify-center gap-2 border ${reviewDecision === 'Revisi' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-orange-600 border-orange-300 hover:bg-orange-50'}`}
                  >
                    <FilePenLine size={14} />
                    REVIEW/REVISI
                  </button>
                  {/* Tolak button - MIDDLE */}
                  <button
                    type="button"
                    onClick={() => setReviewDecision('Ditolak')}
                    className={`h-11 rounded-lg text-[10px] font-semibold inline-flex items-center justify-center gap-2 border ${reviewDecision === 'Ditolak' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-300 hover:bg-red-50'}`}
                  >
                    <XCircle size={14} />
                    TOLAK
                  </button>
                  {/* ACC Final Berkas button - RIGHT side */}
                  <button
                    type="button"
                    onClick={() => setReviewDecision('Disetujui')}
                    className={`h-11 rounded-lg text-[10px] font-semibold inline-flex items-center justify-center gap-2 border ${reviewDecision === 'Disetujui' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-[#1E376C] border-[#C7D2EA] hover:bg-green-50'}`}
                  >
                    <CheckCircle size={14} />
                    ACC FINAL BERKAS
                  </button>
                </div>
              </div>

              {reviewDecision === 'Revisi' && (
                <div>
                  <label className="text-[10px] font-semibold text-gray-700">Catatan Revisi</label>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    rows={3}
                    placeholder="Berikan catatan revisi untuk pengusul..."
                    className="mt-1 w-full rounded-lg border border-[#D2D7E5] bg-white px-3 py-2 text-[12px] text-gray-700 outline-none focus:border-[#1E376C]"
                  />

                  <div className="mt-3 rounded-lg border border-[#D9DCE4] bg-white p-3">
                    <p className="text-[10px] font-semibold text-gray-700">Lampirkan File Revisi (opsional)</p>
                    <p className="mb-2 mt-0.5 text-[9.5px] text-gray-500">
                      Hanya format Word (.doc / .docx), maksimal 10 MB. Pengusul (internal atau mitra) dapat mengunduhnya lalu mengunggah perbaikannya.
                    </p>
                    {reviewRevisiFile ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Paperclip size={14} className="shrink-0 text-green-600" />
                          <span className="truncate text-[10px] font-medium text-green-700">{reviewRevisiFile.file.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReviewRevisiFile(null)}
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Hapus file revisi"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-[12px] font-medium text-slate-600 hover:border-[#173B82] hover:text-[#173B82]">
                        <Upload size={16} />
                        Klik untuk Pilih File Word
                        <input
                          type="file"
                          accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={(e) => {
                            handleReviewRevisiFileUpload(e.target.files);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {reviewDecision === 'Ditolak' && (
                <div>
                  <label className="text-[10px] font-semibold text-gray-700">Alasan Penolakan *</label>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    rows={3}
                    placeholder="Jelaskan alasan pengajuan ini ditolak..."
                    className="mt-1 w-full rounded-lg border border-[#D2D7E5] bg-white px-3 py-2 text-[12px] text-gray-700 outline-none focus:border-red-500"
                  />
                  <p className="mt-1 text-[10px] text-gray-500">Status pengajuan akan menjadi Ditolak dan alasan ini dikirim ke pengusul. Pengusul harus membuat pengajuan baru (pengajuan yang ditolak tidak bisa diperbaiki).</p>
                </div>
              )}

              {reviewDecision === 'Disetujui' && (
                <div className="rounded-lg border border-[#D9DCE4] bg-white p-4">
                  <p className="text-[12px] font-semibold text-gray-900 mb-3">Upload Final Berkas</p>
                  <p className="text-[10px] text-gray-600 mb-1">Unggah dokumen final yang telah disetujui untuk disimpan sebagai arsip.</p>
                  <p className="text-[10px] font-medium text-amber-700 mb-1">
                    Dokumen yang disetujui (ACC) pada tahap ini merupakan berkas final yang telah ditandatangani oleh kedua belah pihak. Mohon pastikan dokumen yang diunggah adalah versi final yang sah dan telah ditandatangani, bukan berupa draf. Format berkas final harus PDF.
                  </p>
                  <p className="text-[10px] text-gray-500 mb-3">
                    Ukuran maksimal 10 MB. Kalau dokumennya lebih besar dari itu, pakai tautan (mis. Google Drive) di kolom bawah saja — tidak perlu upload, biar penyimpanan server tidak cepat penuh.
                  </p>

<label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-[12px] font-medium text-slate-600 hover:border-[#173B82] hover:text-[#173B82]">
                    <Upload size={16} />
                    Klik untuk Pilih File (PDF)
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        handleReviewFinalFileUpload(e.target.files);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>

                  <div className="mt-3">
                    <label className="text-[10px] font-semibold text-gray-700">Atau tautan dokumen (Google Drive, dsb.)</label>
                    <input
                      type="url"
                      value={reviewFinalLink}
                      onChange={(e) => setReviewFinalLink(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      disabled={Boolean(reviewFinalFile)}
                      className="mt-1 w-full rounded-lg border border-[#D2D7E5] bg-white px-3 py-2 text-[12px] text-gray-700 outline-none focus:border-[#1E376C] disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    {reviewFinalFile && (
                      <p className="mt-1 text-[9.5px] text-gray-400">Hapus file yang dipilih untuk memakai tautan.</p>
                    )}
                  </div>

                  {reviewFinalFilePreview && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-[10px] font-semibold text-green-700 mb-1">File Dipilih:</p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <Paperclip size={14} className="shrink-0 text-green-600" />
                          <span className="truncate text-[10px] font-medium text-green-700">{reviewFinalFilePreview.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveReviewFinalFile}
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}

{/* Display existing final files if any */}
                  {reviewItem.finalFileName && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-[10px] font-semibold text-slate-700 mb-1">File Final Terunggah:</p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <Paperclip size={14} className="shrink-0 text-slate-500" />
                          <span className="truncate text-[10px] font-medium text-blue-600">{reviewItem.finalFileName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (reviewItem.finalFilePath) {
                              openUrl(reviewItem.finalFilePath);
                            } else {
                              openUrl(`/storage/final/${reviewItem.finalFileName}`);
                            }
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-3">
                    <label className="text-[10px] font-semibold text-gray-700">Distribusi (CC ke user internal lain)</label>
                    <p className="mt-0.5 text-[9.5px] text-gray-500">
                      Tambahkan user internal lain di sini supaya mereka tahu dan ikut melihat dokumen final ini — seperti CC di email.
                    </p>
                    <div className="relative mt-1.5">
                      <input
                        type="text"
                        value={reviewDistribusiSearch}
                        onChange={(e) => setReviewDistribusiSearch(e.target.value)}
                        placeholder="Cari nama user internal..."
                        className="w-full rounded-lg border border-[#D2D7E5] bg-white px-3 py-2 text-[12px] text-gray-700 outline-none focus:border-[#1E376C]"
                      />
                      {reviewDistribusiSearch.trim() && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                          {(() => {
                            const results = internalUsersList.filter(
                              (u) =>
                                (u.id === null || !reviewDistribusiUserIds.includes(u.id)) &&
                                u.nama.toLowerCase().includes(reviewDistribusiSearch.trim().toLowerCase())
                            );
                            if (results.length === 0) {
                              return <p className="px-3 py-2 text-[11px] text-gray-400">Tidak ada user ditemukan.</p>;
                            }
                            return results.slice(0, 8).map((u) => {
                              // Satu NIK bisa muncul 2x kalau orangnya kebetulan Kajur
                              // SEKALIGUS Kaprodi (dua jabatan struktural berbeda) — jadi
                              // kuncinya harus nik+jabatan, bukan nik saja, supaya tidak
                              // duplikat/collision.
                              const kandidatKey = u.id ?? `${u.nik ?? 'x'}-${u.jabatan}-${u.unitNama ?? ''}`;
                              const sedangProses = u.nik !== null && provisioningNik === `${u.nik}-${u.jabatan}`;

                              return (
                                <button
                                  key={kandidatKey}
                                  type="button"
                                  disabled={sedangProses}
                                  onClick={async () => {
                                    if (u.id !== null) {
                                      setReviewDistribusiUserIds((prev) => [...prev, u.id as number]);
                                      setReviewDistribusiSearch('');
                                      return;
                                    }

                                    // Belum pernah login — provision dulu baris user-nya
                                    // (by NIK) sebelum bisa dipakai sebagai distribusi.
                                    if (!u.nik) return;
                                    setProvisioningNik(`${u.nik}-${u.jabatan}`);
                                    try {
                                      const provisioned = await provisionDistribusiUser({
                                        nik: u.nik,
                                        nama: u.nama,
                                        jabatan: u.jabatan,
                                      });
                                      setInternalUsersList((prev) =>
                                        prev.map((item) =>
                                          item.nik === u.nik && item.jabatan === u.jabatan
                                            ? { ...item, id: provisioned.id, sudahTerdaftar: true }
                                            : item
                                        )
                                      );
                                      setReviewDistribusiUserIds((prev) => [...prev, provisioned.id]);
                                      setReviewDistribusiSearch('');
                                    } catch {
                                      // Biarkan tetap muncul di hasil pencarian, admin bisa coba lagi.
                                    } finally {
                                      setProvisioningNik(null);
                                    }
                                  }}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  <span className="truncate">{u.nama}</span>
                                  <span className="shrink-0 text-[9.5px] text-gray-400">
                                    {sedangProses ? 'Memproses...' : !u.sudahTerdaftar ? 'Belum login · ' + (u.unitNama ?? '') : u.unitNama}
                                  </span>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                    {reviewDistribusiUserIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reviewDistribusiUserIds.map((id) => {
                          const u = internalUsersList.find((iu) => iu.id === id);
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[10px] font-medium text-[#1E376C]"
                            >
                              {u?.nama ?? `User #${id}`}
                              <button
                                type="button"
                                onClick={() => setReviewDistribusiUserIds((prev) => prev.filter((x) => x !== id))}
                                className="text-[#1E376C]/60 hover:text-[#1E376C]"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    <label className="text-[10px] font-semibold text-gray-700">Catatan ACC </label>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                      placeholder="Tambahkan catatan untuk Internal/Mitra bersama dokumen final ini..."
                      className="mt-1 w-full rounded-lg border border-[#D2D7E5] bg-white px-3 py-2 text-[12px] text-gray-700 outline-none focus:border-[#1E376C]"
                    />
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg border border-[#D9DCE4] px-3 py-2 text-[10.5px] text-gray-600">
                Notifikasi Otomatis: status akan diperbarui dan pengusul mendapat info hasil review.
              </div>

              {/* WhatsApp PIC Section */}
              {/* Kedua tombol selalu tampil; data lama yang nomornya belum ada tampil nonaktif. */}
              <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-[10px] font-semibold text-green-800 mb-2">Hubungi PIC via WhatsApp</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'WhatsApp PIC Mitra', url: buildWhatsAppUrl(reviewItem.whatsappPengusul, buildPesanWhatsAppPengajuan(reviewItem, reviewItem.mitraPicNama), reviewItem.mitraNegara) },
                    {
                      label: `WhatsApp PIC Polibatam${reviewItem.picPolibatamNama ? ` (${reviewItem.picPolibatamNama})` : ''}`,
                      url: buildPolibatamWhatsAppUrl(reviewItem.picPolibatamTelepon, buildPesanWhatsAppPengajuan(reviewItem, reviewItem.picPolibatamNama)),
                    },
                  ].map((tombol) =>
                    tombol.url ? (
                      <a
                        key={tombol.label}
                        href={tombol.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-[10px] font-semibold text-white hover:bg-green-700"
                      >
                        <MessageSquare size={14} />
                        {tombol.label}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <button
                        key={tombol.label}
                        type="button"
                        disabled
                        title="Nomor WhatsApp belum diisi"
                        className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-[10px] font-semibold text-gray-500"
                      >
                        <MessageSquare size={14} />
                        {tombol.label} · nomor belum diisi
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewItem(null)}
                  className="h-9 px-4 rounded-lg bg-gray-200 text-gray-700 text-[10px] font-semibold hover:bg-gray-300"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (reviewDecision === 'Revisi') {
                      if (!reviewComment.trim()) {
                        setInfoModalMessage('Catatan Revisi wajib diisi.');
                        return;
                      }
                      setUploadConfirmOpen(true);
                    } else if (reviewDecision === 'Ditolak') {
                      if (!reviewComment.trim()) {
                        setInfoModalMessage('Alasan Penolakan wajib diisi.');
                        return;
                      }
                      setUploadConfirmOpen(true);
                    } else {
                      if (reviewDecision === 'Disetujui' && !reviewFinalFile && !reviewFinalLink.trim()) {
                        setInfoModalMessage('Upload file dokumen final atau isi tautan dokumen terlebih dahulu sebelum ACC.');
                        return;
                      }
                      setUploadConfirmOpen(true);
                    }
                  }}
                  className="h-9 px-5 rounded-lg bg-[#1E376C] text-white text-[10px] font-semibold hover:bg-[#2A4A8F]"
                >
                  Simpan dan kirim notifikasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {masterModalOpen && (
        <div className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-[1px] p-4 flex items-center justify-center" onClick={() => setMasterModalOpen(false)}>
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Kelola Referensi Kampus</h3>
                <p className="text-[10px] text-slate-500">Tambah Jurusan/Unit kampus di atas, lalu kelola Prodi langsung per jurusan.</p>
              </div>
              <button type="button" onClick={() => setMasterModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 p-5 bg-slate-50/70">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-[10px] font-semibold text-slate-700">Tambah Jurusan / Unit Kerja</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <select
                  value={masterJenis}
                  onChange={(e) => setMasterJenis(e.target.value as 'jurusan' | 'unit_kerja')}
                  className="input-field h-10 rounded-lg px-3 text-[12px]"
                >
                  <option value="jurusan">Jurusan</option>
                  <option value="unit_kerja">Unit</option>
                </select>
                <input
                  value={masterKode}
                  onChange={(e) => setMasterKode(e.target.value)}
                  placeholder="Kode"
                  className="input-field h-10 rounded-lg px-3 text-[12px]"
                />
                <input
                  value={masterNama}
                  onChange={(e) => setMasterNama(e.target.value)}
                  placeholder="Nama master"
                  className="input-field h-10 rounded-lg px-3 text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmitMasterReference();
                  }}
                  disabled={masterSaving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1E376C] px-4 text-[12px] font-semibold text-white hover:bg-[#2A4A8F] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Plus size={14} />
                  {masterSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
                </div>
              </div>

              {masterMessage && (
                // Menempel di bawah header modal: pesan hasil hapus/simpan tetap terlihat walau daftar di-scroll ke bawah.
                <div className="sticky top-[72px] z-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-medium text-slate-800 shadow-md">
                  {masterMessage}
                </div>
              )}

              <input
                value={masterSearch}
                onChange={(e) => setMasterSearch(e.target.value)}
                placeholder="Cari jurusan atau prodi..."
                className="input-field h-10 w-full rounded-lg border-slate-300 bg-white px-3 text-[12px]"
              />

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-semibold text-slate-700">Jurusan dan Daftar Prodi</p>
                <div className="mt-2 space-y-3">
                  {filteredJurusanRows.map((jurusan) => {
                    const prodis = masterProdiRows.filter((prodi) => prodi.parent_id === jurusan.id);
                    const draft = prodiDraftByJurusan[jurusan.id] || { kode: '', nama: '' };

                    return (
                      <div key={jurusan.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                        {editingJurusanId === jurusan.id ? (
                          <div className="mb-2 grid gap-1.5 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[96px_1fr_auto_auto]">
                            <input
                              value={editingJurusanKode}
                              onChange={(e) => setEditingJurusanKode(e.target.value)}
                              placeholder="Kode"
                              className="input-field h-8 rounded-md px-2 text-[10.5px]"
                            />
                            <input
                              value={editingJurusanNama}
                              onChange={(e) => setEditingJurusanNama(e.target.value)}
                              placeholder="Nama jurusan"
                              className="input-field h-8 rounded-md px-2 text-[10.5px]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void saveEditJurusan(jurusan.id);
                              }}
                              disabled={masterSaving}
                              className="h-8 rounded-md bg-[#1E376C] px-2 text-[10.5px] font-semibold text-white hover:bg-[#2A4A8F]"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditJurusan}
                              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[10.5px] font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] text-slate-600">{jurusan.kode || '-'}</span>
                              <p className="text-[12px] font-semibold text-[#173B82]">{jurusan.nama}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditJurusan(jurusan)}
                                className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10.5px] font-semibold text-blue-700 hover:bg-blue-100"
                              >
                                Edit Jurusan
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleDeleteJurusan(jurusan.id);
                                }}
                                disabled={masterSaving}
                                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10.5px] font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Hapus Jurusan
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="grid gap-2 sm:grid-cols-[96px_1fr_auto]">
                          <input
                            value={draft.kode}
                            onChange={(e) => setProdiDraftField(jurusan.id, 'kode', e.target.value)}
                            placeholder="Kode prodi"
                            className="input-field h-9 rounded-lg px-2 text-[10px]"
                          />
                          <input
                            value={draft.nama}
                            onChange={(e) => setProdiDraftField(jurusan.id, 'nama', e.target.value)}
                            placeholder="Nama prodi"
                            className="input-field h-9 rounded-lg px-2 text-[10px]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void handleAddProdiToJurusan(jurusan.id);
                            }}
                            disabled={masterSaving}
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-[#1E376C] px-3 text-[10px] font-semibold text-white hover:bg-[#2A4A8F] disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            + Prodi
                          </button>
                        </div>

                        <div className="mt-3 space-y-2">
                          {prodis.length === 0 ? (
                            <span className="text-[10.5px] text-slate-400">Belum ada prodi</span>
                          ) : (
                            prodis.map((prodi) => {
                              const isEditing = editingProdiId === prodi.id;

                              if (isEditing) {
                                return (
                                  <div key={prodi.id} className="grid gap-1.5 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[96px_1fr_auto_auto]">
                                    <input
                                      value={editingProdiKode}
                                      onChange={(e) => setEditingProdiKode(e.target.value)}
                                      placeholder="Kode"
                                      className="input-field h-8 rounded-md px-2 text-[10.5px]"
                                    />
                                    <input
                                      value={editingProdiNama}
                                      onChange={(e) => setEditingProdiNama(e.target.value)}
                                      placeholder="Nama prodi"
                                      className="input-field h-8 rounded-md px-2 text-[10.5px]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void saveEditProdi(prodi.id);
                                      }}
                                      disabled={masterSaving}
                                      className="h-8 rounded-md bg-[#1E376C] px-2 text-[10.5px] font-semibold text-white hover:bg-[#2A4A8F]"
                                    >
                                      Simpan
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditProdi}
                                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[10.5px] font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div key={prodi.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2">
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-700">
                                    {prodi.kode ? `${prodi.kode} - ` : ''}{prodi.nama}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => startEditProdi(prodi)}
                                      className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10.5px] font-semibold text-blue-700 hover:bg-blue-100"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleDeleteProdi(prodi.id);
                                      }}
                                      className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10.5px] font-semibold text-red-700 hover:bg-red-100"
                                    >
                                      Hapus Prodi
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredJurusanRows.length === 0 && (
                    <div className="rounded-md border border-slate-200 bg-white p-3 text-center text-[10.5px] text-slate-500">
                      Tidak ada jurusan/prodi yang cocok dengan pencarian.
                    </div>
                  )}
                </div>

                <p className="mt-3 text-[10px] font-semibold text-slate-700">Daftar Unit Kerja</p>
                <div className="mt-2 space-y-2">
                  {masterUnitRows.length === 0 ? (
                    <span className="text-[10.5px] text-slate-400">Belum ada unit kerja.</span>
                  ) : (
                    masterUnitRows.map((unit) => {
                      const isEditing = editingUnitId === unit.id;

                      if (isEditing) {
                        return (
                          <div key={unit.id} className="grid gap-1.5 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[96px_1fr_auto_auto]">
                            <input
                              value={editingUnitKode}
                              onChange={(e) => setEditingUnitKode(e.target.value)}
                              placeholder="Kode"
                              className="input-field h-8 rounded-md px-2 text-[10.5px]"
                            />
                            <input
                              value={editingUnitNama}
                              onChange={(e) => setEditingUnitNama(e.target.value)}
                              placeholder="Nama unit"
                              className="input-field h-8 rounded-md px-2 text-[10.5px]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void saveEditUnit(unit.id);
                              }}
                              disabled={masterSaving}
                              className="h-8 rounded-md bg-[#1E376C] px-2 text-[10.5px] font-semibold text-white hover:bg-[#2A4A8F] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditUnit}
                              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[10.5px] font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Batal
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div key={unit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-700">
                            {unit.kode ? `${unit.kode} - ` : ''}{unit.nama}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditUnit(unit)}
                              disabled={masterSaving}
                              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10.5px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteUnitKerja(unit.id);
                              }}
                              disabled={masterSaving}
                              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10.5px] font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Hapus Unit
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {negaraModalOpen && (
        <div className="fixed inset-0 z-[76] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" onClick={() => setNegaraModalOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#EEF3FF] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#1E376C]">
                  Master Data
                </div>
                <h3 className="text-[17px] font-bold text-slate-900">Tambah Negara</h3>
                <p className="text-[12px] text-slate-500">Tambahkan opsi negara yang akan muncul di form pengajuan internal dan eksternal.</p>
              </div>
              <button type="button" onClick={() => setNegaraModalOpen(false)} className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                  <label className="flex-1 text-[12px] font-medium text-slate-700">
                    Nama Negara
                    <input
                      value={negaraInput}
                      onChange={(e) => setNegaraInput(e.target.value)}
                      placeholder="Contoh: Brunei Darussalam"
                      className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[12px] text-slate-800 shadow-sm outline-none transition focus:border-[#1E376C] focus:ring-2 focus:ring-[#1E376C]/10"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      void handleAddNegaraOption();
                    }}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1E376C] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#2A4A8F]"
                  >
                    <Plus size={15} />
                    Tambah Negara
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-slate-500">Negara yang ditambahkan langsung tersedia pada semua form pengajuan.</p>
              </div>

              {negaraMessage && (
                <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-[12px] text-slate-700">{negaraMessage}</div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-800">Daftar Negara</p>
                    <p className="text-[10px] text-slate-500">Total negara aktif: {masterNegaraRows.length}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10.5px] font-semibold text-emerald-700">Sinkron otomatis</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {masterNegaraRows.length === 0 ? (
                    <div className="w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[12px] text-slate-400">Belum ada negara yang ditambahkan.</div>
                  ) : (
                    masterNegaraRows.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                        {editingNegaraId === item.id ? (
                          <input
                            value={editingNegaraNama}
                            onChange={(e) => setEditingNegaraNama(e.target.value)}
                            className="h-9 w-40 rounded-lg border border-slate-300 bg-white px-2.5 text-[10px] text-slate-800 outline-none focus:border-[#1E376C] focus:ring-2 focus:ring-[#1E376C]/10"
                          />
                        ) : (
                          <span className="text-[12px] font-semibold text-slate-800">{item.nama_negara}</span>
                        )}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (editingNegaraId === item.id) {
                                void handleUpdateNegaraOption();
                                return;
                              }

                              setEditingNegaraId(item.id);
                              setEditingNegaraNama(item.nama_negara);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-blue-700 transition hover:bg-blue-100"
                          >
                            <Pencil size={12} />
                            {editingNegaraId === item.id ? 'Simpan' : 'Edit'}
                          </button>
                          {editingNegaraId === item.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNegaraId(null);
                                setEditingNegaraNama('');
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              Batal
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteNegaraOption(item);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-red-700 transition hover:bg-red-100"
                              aria-label={`Hapus ${item.nama_negara}`}
                            >
                              <Trash2 size={12} />
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {ruangLingkupModalOpen && (
        <div className="fixed inset-0 z-[76] bg-black/40 backdrop-blur-[1px] p-4 flex items-center justify-center" onClick={() => setRuangLingkupModalOpen(false)}>
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex-none flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Tambah Ruang Lingkup</h3>
                <p className="text-[10px] text-slate-500">Tambahkan opsi ruang lingkup untuk form pengajuan.</p>
              </div>
              <button
                type="button"
                onClick={() => setRuangLingkupModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 p-5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={ruangLingkupNama}
                  onChange={(e) => setRuangLingkupNama(e.target.value)}
                  placeholder="Contoh: Publikasi Bersama"
                  className="input-field h-10 flex-1 rounded-lg px-3 text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleSubmitRuangLingkup();
                  }}
                  disabled={ruangLingkupSaving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1E376C] px-4 text-[12px] font-semibold text-white hover:bg-[#2A4A8F] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Plus size={14} />
                  {ruangLingkupSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">Data tersimpan ke DB dan langsung dipakai di Form Pengajuan.</p>

              {ruangLingkupMessage && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-700">
                  {ruangLingkupMessage}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold text-slate-700">Daftar Ruang Lingkup</p>
                <div className="mt-2 space-y-2">
                  {ruangLingkupRows.length === 0 ? (
                    <span className="text-[10.5px] text-slate-400">Belum ada data ruang lingkup.</span>
                  ) : (
                    ruangLingkupRows.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                        {editingRuangLingkupId === item.id ? (
                          <input
                            value={editingRuangLingkupNama}
                            onChange={(e) => setEditingRuangLingkupNama(e.target.value)}
                            className="input-field h-8 flex-1 rounded-md px-2 text-[10px]"
                            placeholder="Nama ruang lingkup"
                          />
                        ) : (
                          <span className="text-[10px] font-medium text-slate-700">{item.nama_ruang_lingkup}</span>
                        )}

                        <div className="flex items-center gap-1.5">
                          {editingRuangLingkupId === item.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  void saveEditRuangLingkup(item.id);
                                }}
                                disabled={ruangLingkupSaving}
                                className="h-7 rounded-md bg-[#1E376C] px-2 text-[10.5px] font-semibold text-white hover:bg-[#2A4A8F] disabled:cursor-not-allowed disabled:bg-slate-300"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditRuangLingkup}
                                className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[10.5px] font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Batal
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditRuangLingkup(item)}
                                className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10.5px] font-semibold text-blue-700 hover:bg-blue-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleDeleteRuangLingkup(item.id);
                                }}
                                disabled={ruangLingkupSaving}
                                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10.5px] font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Hapus
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editForm && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[2px] p-4 flex items-center justify-center">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-slate-900">Edit Pengajuan</h3>
              <button type="button" onClick={() => setEditForm(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">

              <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] text-blue-700">
                Edit mengikuti form pengajuan. Jika jenis dokumen diubah (MoU/MoA/IA), upload dokumen baru wajib.
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] font-semibold text-slate-700">Judul Pengajuan</label>
                <input
                  type="text"
                  value={editForm.judulPengajuan}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, judulPengajuan: e.target.value } : prev))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] text-slate-700"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-700">Mitra Tujuan</label>
                <input
                  type="text"
                  value={editForm.namaMitra}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, namaMitra: e.target.value } : prev))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] text-slate-700"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-700">Jurusan/Unit</label>
                <input
                  type="text"
                  value={editForm.namaUnitProdi}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, namaUnitProdi: e.target.value } : prev))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] text-slate-700"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-700">Jenis Dokumen</label>

                <input
                  type="text"
                  value={editForm.jenisDokumen}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, jenisDokumen: e.target.value } : prev))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] text-slate-700"
                />

                <select
                  value={editForm.jenisDokumen}
                  onChange={(e) => {
                    const nextJenis = e.target.value;
                    setEditForm((prev) => (prev ? { ...prev, jenisDokumen: nextJenis } : prev));
                    setEditUploadedFiles([]);
                    setEditFileError(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] text-slate-700"
                >
                  <option value="">Pilih jenis kerjasama</option>
                  <option value="MoU">MoU</option>
                  <option value="MoA">MoA</option>
                  <option value="IA">IA</option>
                </select>
                {editForm.jenisDokumen !== editOriginalJenisDokumen && (
                  <p className="mt-1 text-[10.5px] font-semibold text-amber-700">Jenis dokumen berubah, upload ulang dokumen wajib.</p>
                )}

              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-700">Tanggal Mulai</label>
                <input
                  type="date"
                  value={editForm.tanggalMulai}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, tanggalMulai: e.target.value } : prev))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] text-slate-700"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-700">Tanggal Berakhir</label>
                <input
                  type="date"
                  value={editForm.tanggalBerakhir}
                  onChange={(e) => setEditForm((prev) => (prev ? { ...prev, tanggalBerakhir: e.target.value } : prev))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] text-slate-700"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-semibold text-slate-700">Ruang Lingkup</label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {editAllRlOptions.map((option) => {
                    const checked = editForm.ruangLingkup.includes(option);

                    return (
                      <label
                        key={option}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors ${
                          checked
                            ? 'border-[#1E376C] bg-[#EEF2FF] text-[#1E376C]'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-[#1E376C]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setEditForm((prev) => {
                              if (!prev) {
                                return prev;
                              }

                              const exists = prev.ruangLingkup.includes(option);
                              const ruangLingkup = exists
                                ? prev.ruangLingkup.filter((item) => item !== option)
                                : [...prev.ruangLingkup, option];

                              return { ...prev, ruangLingkup };
                            });
                          }}
                          className="h-4 w-4 accent-[#1E376C]"
                        />
                        {option}
                      </label>
                    );
                  })}
                  {editAllRlOptions.length === 0 && (
                    <span className="text-[10.5px] text-slate-500">Belum ada ruang lingkup di master.</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 rounded-2xl border border-[#D7E0F0] bg-[#F8FAFF] p-4 sm:p-5">
                <div className="mb-4">
                  <h4 className="text-[13.5px] font-bold text-slate-900">Template Dokumen</h4>
                  <p className="mt-1 text-[10px] text-slate-600">Alur edit dokumen sama seperti form pengajuan.</p>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[#D7E0F0] bg-white px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E376C] text-[10px] font-bold text-white">1</span>
                      <p className="text-[12px] font-semibold text-gray-900">Pilih Jenis</p>
                    </div>
                    <p className="text-[10px] text-gray-600">Pilih MoU, MoA, atau IA sesuai dokumen.</p>
                  </div>
                  <div className="rounded-xl border border-[#D7E0F0] bg-white px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E376C] text-[10px] font-bold text-white">2</span>
                      <p className="text-[12px] font-semibold text-gray-900">Download Template</p>
                    </div>
                    <p className="text-[10px] text-gray-600">Opsional sebagai acuan isi dokumen.</p>
                  </div>
                  <div className="rounded-xl border border-[#D7E0F0] bg-white px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E376C] text-[10px] font-bold text-white">3</span>
                      <p className="text-[12px] font-semibold text-gray-900">Upload Dokumen</p>
                    </div>
                    <p className="text-[10px] text-gray-600">Jika jenis berubah, upload ulang wajib.</p>
                  </div>
                </div>

                <p className="mb-3 text-[10px] text-slate-600">Format: PDF, Word (.doc/.docx), maksimal 10MB per file.</p>

                {editSelectedTemplate && editTemplateFiles.length > 0 && (
                  <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[15px] font-bold text-[#173B82]">{editSelectedTemplate.title}</p>
                        <p className="text-[12px] text-slate-600">{editSelectedTemplate.subtitle}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {editTemplateFiles.map((file) => (
                        <button
                          key={file.fileName}
                          type="button"
                          onClick={() => downloadTemplate(file.fileName)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#173B82] px-4 text-[10px] font-semibold text-white hover:bg-[#0f2c61]"
                        >
                          <Download size={14} />
                          Download {file.label}
                        </button>
                      ))}
                    </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-[12px] font-semibold text-[#173B82]">Isi utama dokumen:</p>
                      <div className="flex flex-wrap gap-2">
                        {editSelectedTemplate.struktur.map((item) => (
                          <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] text-slate-700">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="mt-3 text-[10px] text-slate-600">Catatan: {editSelectedTemplate.note}</p>
                  </div>
                )}

                <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-[12px] font-medium text-slate-600 hover:border-[#173B82] hover:text-[#173B82]">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    multiple
                    onChange={(e) => {
                      handleEditFileUpload(e.target.files);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                  <Upload size={16} />
                  Upload Dokumen
                </label>

                {editFileError && <p className="mt-2 text-[10px] text-red-600">{editFileError}</p>}

                {editUploadedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {editUploadedFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-semibold text-slate-800">{file.name}</p>
                          <p className="text-[10.5px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveEditFile(index)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                          aria-label={`Hapus ${file.name}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditForm(null)}
                className="h-9 px-4 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-semibold hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="h-9 px-4 rounded-lg bg-[#1E376C] text-white text-[12px] font-semibold hover:bg-[#2A4A8F]"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-[2px] p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-[15px] font-bold text-slate-900">Hapus Pengajuan</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12px] text-slate-700">
                Apakah Anda yakin ingin menghapus data pengajuan <span className="font-semibold">{deleteTarget.judulPengajuan}</span>? Pengajuan hanya hilang dari Data Pengajuan admin — pengusul (internal/eksternal) tetap bisa melihatnya.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-9 px-4 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-semibold hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="h-9 px-4 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-[2px] p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-[15px] font-bold text-slate-900">Hapus {selectedPengajuanIds.size} Pengajuan</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12px] text-slate-700">
                Yakin ingin menghapus <span className="font-semibold">{selectedPengajuanIds.size} pengajuan</span> yang dipilih? Pengajuan hanya hilang dari Data Pengajuan admin — pengusul (internal/eksternal) tetap bisa melihatnya.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="h-9 px-4 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-semibold hover:bg-slate-200 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmBulkDeletePengajuan}
                disabled={bulkDeleting}
                className="h-9 px-4 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleting ? 'Menghapus...' : 'Ya, Hapus Semua'}
              </button>
            </div>
          </div>
        </div>
      )}

      {infoModalMessage && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[2px] p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-[15px] font-bold text-slate-900">Informasi</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12px] text-slate-700">{infoModalMessage}</p>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setInfoModalMessage(null)}
                className="h-9 px-4 rounded-lg bg-[#1E376C] text-white text-[12px] font-semibold hover:bg-[#2A4A8F]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {finalGuardItem && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-[2px] p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-[15px] font-bold text-slate-900">Sudah Difinalkan</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12px] text-slate-700">
                Pengajuan ini sudah difinalkan dan datanya sudah ada di Rekap Data. Untuk mengedit, silakan lakukan lewat halaman Rekap Data.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFinalGuardItem(null)}
                className="h-9 px-4 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-semibold hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinalGuardItem(null);
                  router.push('/admin/rekap_data');
                }}
                className="h-9 px-4 rounded-lg bg-[#1E376C] text-white text-[12px] font-semibold hover:bg-[#2A4A8F]"
              >
                Buka Rekap Data
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadConfirmOpen && reviewItem && (
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-[2px] p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-[15px] font-bold text-slate-900">
                {reviewDecision === 'Revisi' ? 'Konfirmasi Kirim Review/Revisi' : reviewDecision === 'Ditolak' ? 'Konfirmasi Tolak Pengajuan' : 'Konfirmasi Upload Dokumen Final'}
              </h3>
            </div>
            <div className="px-5 py-4 space-y-2">
              {reviewDecision === 'Ditolak' ? (
                <p className="text-[12px] text-slate-700">
                  Yakin ingin menolak pengajuan ini? Status pengajuan akan berubah menjadi <span className="font-semibold text-red-600">Ditolak</span> dan alasan penolakan dikirim ke pengusul. Pengajuan yang ditolak <span className="font-semibold">tidak bisa diperbaiki</span>; pengusul harus membuat pengajuan baru.
                </p>
              ) : reviewDecision === 'Revisi' ? (
                <p className="text-[12px] text-slate-700">
                  Yakin ingin mengirim catatan revisi? Status pengajuan akan berubah menjadi <span className="font-semibold text-orange-600">Review/Revisi</span> dan notifikasi akan dikirim ke Pengaju untuk melakukan perbaikan sesuai catatan. Pengaju cukup memperbarui data/dokumen pada pengajuan yang sama, <span className="font-semibold">tidak perlu membuat pengajuan baru</span>.
                </p>
              ) : (
                <>
                  <p className="text-[12px] text-slate-700">
                    Yakin ingin ACC dan upload dokumen final? Status pengajuan akan berubah menjadi <span className="font-semibold text-emerald-600">Disetujui</span> Pastikan data dan dokumen sudah benar sebelum melanjutkan.
                  </p>
                  {reviewFinalFilePreview && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2 text-[10px]">
                      <span className="font-semibold text-emerald-700">File:</span>
                      <span className="truncate text-emerald-600">{reviewFinalFilePreview.name}</span>
                    </div>
                  )}
                  {!reviewFinalFile && reviewFinalLink.trim() && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2 text-[10px]">
                      <span className="font-semibold text-emerald-700">Tautan:</span>
                      <span className="truncate text-emerald-600">{reviewFinalLink.trim()}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUploadConfirmOpen(false)}
                className="h-9 px-4 rounded-lg bg-gray-200 text-gray-700 text-[12px] font-semibold hover:bg-gray-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => { void executeReview(); }}
                className="h-9 px-5 rounded-lg bg-[#1E376C] text-white text-[12px] font-semibold hover:bg-[#2A4A8F]"
              >
                Ya, Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={konfirmasiPesan !== null}
        title="Konfirmasi hapus"
        message={konfirmasiPesan}
        confirmLabel="Ya, hapus"
        onConfirm={() => tutupKonfirmasi(true)}
        onCancel={() => tutupKonfirmasi(false)}
      />
    </div>
  );
}

