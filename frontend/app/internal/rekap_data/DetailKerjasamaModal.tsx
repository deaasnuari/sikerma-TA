'use client';

import JenisBadges from '@/components/JenisBadges';

import { useState } from 'react';
import { ArrowLeft, Calendar, CheckCircle2, Clock, Download, FileText, Mail, Pencil, Phone, User } from 'lucide-react';
import { generateNoDokumen } from '@/services/adminMonitoringService';
import type { PengajuanItem } from '@/services/adminPengajuanService';
import type { JenisBerkas } from '@/services/adminRekapDataService';
import JenisBerkasBadge from '@/components/JenisBerkasBadge';
import { updateNilaiKerjasama } from '@/services/dokumenKerjasamaApiService';

type ApprovalStatus = 'Menunggu' | 'Disetujui' | 'Ditolak';
type Jenis = 'MoU' | 'MoA' | 'IA';
type TabKey = 'informasi' | 'dokumen' | 'kontak' | 'histori';

interface KerjasamaItem {
  id?: number;
  noDokumen: string;
  namaMitra: string;
  jenis: Jenis;
  jenisList?: Jenis[];
  unit: string;
  tanggalMulai: string;
  berlakuHingga: string;
  status: ApprovalStatus;
  // --- Field tambahan (sama seperti kolom Rekap Data) supaya tab detail berisi data asli,
  // bukan data contoh/dummy lagi.
  ruangLingkup?: string[];
  bidangUsaha?: string;
  alamatMitra?: string;
  picMitra?: string;
  kodePerusahaan?: string;
  judulKegiatan?: string;
  manfaatSebenarnya?: string;
  manfaatKerjasama?: string;
  luaranKerjaSama?: string;
  durasiBulan?: number;
  nilaiKerjasama?: string;
  jurusanNama?: string;
  prodiNama?: string;
  unitKerjaNama?: string;
  sourcePengajuanId?: number;
}

interface DetailKerjasamaModalProps {
  item: KerjasamaItem;
  // Dipakai untuk mengisi tab Kontak & Histori di modal Detail Kerjasama dengan data pengajuan
  pengajuan?: PengajuanItem;
  onClose: () => void;
  // Dipanggil setelah Nilai Kerja Sama berhasil disimpan, supaya daftar di halaman ikut diperbarui.
  onNilaiSaved?: (nilai: string | undefined) => void;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function initialsOf(name?: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '-';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '-';
}

const jenisBadgeMap: Record<Jenis, string> = {
  MoU: 'bg-violet-100 text-violet-700',
  MoA: 'bg-cyan-100 text-cyan-700',
  IA: 'bg-orange-100 text-orange-700',
};

const statusLabelMap: Record<ApprovalStatus, { label: string; className: string }> = {
  Menunggu: { label: 'Menunggu Approval', className: 'bg-amber-400 text-white' },
  Disetujui: { label: 'Disetujui', className: 'bg-green-500 text-white' },
  Ditolak: { label: 'Ditolak', className: 'bg-red-500 text-white' },
};

const tabs: { key: TabKey; label: string }[] = [
  { key: 'informasi', label: 'Informasi' },
  { key: 'dokumen', label: 'Dokumen' },
  { key: 'kontak', label: 'Kontak' },
  { key: 'histori', label: 'Histori' },
];

const jenisFullName: Record<Jenis, string> = {
  MoU: 'Memorandum of Understanding (MoU)',
  MoA: 'Memorandum of Agreement (MoA)',
  IA: 'Implementation Agreement (IA)',
};

interface DokumenTerkait {
  nama: string;
  /** Berkas ini untuk jenis dokumen apa bila dokumennya memuat MoU + MoA. */
  jenisDokumen?: string;
  ukuran: string;
  tanggal: string;
  url?: string;
}


interface KontakMitra {
  nama: string;
  inisial: string;
  jabatan: string;
  email: string;
  telepon: string;
}

// Kontak PIC diambil dari pengajuan asli (mitraPicNama dkk, disinkron server-side saat submit),
// dengan fallback ke field PIC yang tersimpan di dokumen kerjasama kalau pengajuannya tidak ditemukan.
function buildKontakFromSumber(pengajuan?: PengajuanItem, item?: KerjasamaItem): KontakMitra | null {
  const nama = pengajuan?.mitraPicNama || item?.picMitra || '';
  const jabatan = pengajuan?.mitraPicJabatan || '';
  const email = pengajuan?.mitraPicEmail || pengajuan?.mitraEmail || '';
  const telepon = pengajuan?.mitraPicTelepon || pengajuan?.mitraTelepon || '';

  if (!nama && !jabatan && !email && !telepon) {
    return null;
  }

  return {
    nama: nama || '-',
    inisial: initialsOf(nama),
    jabatan: jabatan || '-',
    email: email || '-',
    telepon: telepon || '-',
  };
}

interface HistoriItem {
  judul: string;
  oleh: string;
  tanggal: string;
  ikon: 'dibuat' | 'review';
}

// Histori diambil dari pengajuan asli (tahapanRiwayat dkk, disinkron server-side saat submit),
function buildHistoriFromSumber(pengajuan?: PengajuanItem): HistoriItem[] {
  if (!pengajuan) return [];

  if (pengajuan.tahapanRiwayat && pengajuan.tahapanRiwayat.length > 0) {
    return pengajuan.tahapanRiwayat.map((r) => ({
      judul: r.stage,
      oleh: r.changedBy ? `oleh ${r.changedBy}` : 'oleh System',
      tanggal: formatDateTime(r.changedAt),
      ikon: r.group === 'complete' ? 'dibuat' : 'review',
    }));
  }

  const events: HistoriItem[] = [];
  if (pengajuan.diajukanPada) {
    events.push({
      judul: 'Pengajuan dibuat',
      oleh: `oleh ${pengajuan.akunPengaju || pengajuan.namaPengusul || 'Pengusul'}`,
      tanggal: formatDateTime(pengajuan.diajukanPada),
      ikon: 'dibuat',
    });
  }
  if (pengajuan.accInternalAt) {
    events.push({ judul: 'Disetujui Internal', oleh: 'oleh Admin', tanggal: formatDateTime(pengajuan.accInternalAt), ikon: 'review' });
  }
  if (pengajuan.accMitraAt) {
    events.push({ judul: 'Disetujui Mitra', oleh: 'oleh Mitra', tanggal: formatDateTime(pengajuan.accMitraAt), ikon: 'review' });
  }
  if (pengajuan.finalApprovedAt) {
    events.push({ judul: 'Dokumen Final Disetujui (ACC Admin)', oleh: 'oleh Admin', tanggal: formatDateTime(pengajuan.finalApprovedAt), ikon: 'dibuat' });
  }
  return events;
}

export default function DetailKerjasamaModal({ item, pengajuan, onClose, onNilaiSaved }: DetailKerjasamaModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('informasi');

  // Modal internal rekap_data tidak punya tipe proper untuk dokumen pendukung,
  // jadi kita baca dari field dinamis pada item.
  const dokumenTerkait = (item as any).dokumenTerkait as
    | { nama: string; url?: string; ukuran: string; tanggal: string; jenisBerkas?: JenisBerkas; jenisDokumen?: string }[]
    | undefined;

  const statusInfo = statusLabelMap[item.status];
  const kontak = buildKontakFromSumber(pengajuan, item);
  const histori = buildHistoriFromSumber(pengajuan);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-[2px]">
      <div className="flex w-full max-w-[580px] max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Detail Kerjasama</h2>
              <p className="text-[10px] text-gray-500">{generateNoDokumen({ urutan: 1, jenis: item.jenis, tanggal: item.tanggalMulai })}</p>
            </div>
          </div>
        </div>

        {/* Partner Info Bar */}
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E376C] text-[12px] font-bold text-white">
              P
            </div>
            <div>
              <p className="text-[12px] font-bold text-gray-900">{item.namaMitra}</p>
              <div className="mt-1 flex items-center gap-2">
                <JenisBadges jenis={item.jenisList ?? [item.jenis]} warna={jenisBadgeMap} className="rounded px-2 py-0.5 text-[9.5px] font-bold" />
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[9.5px] font-medium text-gray-600">
                  {item.unit}
                </span>
              </div>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 text-center text-[12px] font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-b-2 border-[#1E376C] text-[#1E376C]'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'informasi' && <TabInformasi item={item} onNilaiSaved={onNilaiSaved} />}
          {activeTab === 'dokumen' && <TabDokumen dokumenTerkait={dokumenTerkait} />}
          {activeTab === 'kontak' && <TabKontak kontak={kontak} />}
          {activeTab === 'histori' && <TabHistori histori={histori} />}
        </div>

        {/* Bottom Action Bar */}
        {item.status === 'Menunggu' && (
          <div className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-6 py-3">
            <div>
              <p className="text-[12px] font-semibold text-amber-900">Pengajuan Menunggu Persetujuan</p>
              <p className="text-[10px] text-amber-700">Tindakan diperlukan untuk melanjutkan proses kerjasama.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                ✕ Tolak
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[#1E376C] px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#2B4A93]"
              >
                ✓ Setujui
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabInformasi({ item, onNilaiSaved }: { item: KerjasamaItem; onNilaiSaved?: (nilai: string | undefined) => void }) {
  const [nilaiTersimpan, setNilaiTersimpan] = useState<string | undefined>(item.nilaiKerjasama);
  const [isEditingNilai, setIsEditingNilai] = useState(false);
  const [nilaiDraft, setNilaiDraft] = useState('');
  const [savingNilai, setSavingNilai] = useState(false);
  const [nilaiError, setNilaiError] = useState<string | null>(null);

  const handleSimpanNilai = async () => {
    if (typeof item.id !== 'number') return;
    const nilai = nilaiDraft.trim();
    setSavingNilai(true);
    setNilaiError(null);
    try {
      await updateNilaiKerjasama(item.id, nilai || null);
      setNilaiTersimpan(nilai || undefined);
      setIsEditingNilai(false);
      onNilaiSaved?.(nilai || undefined);
    } catch (err) {
      setNilaiError(err instanceof Error ? err.message : 'Gagal menyimpan nilai kerja sama.');
    } finally {
      setSavingNilai(false);
    }
  };

  const jurusanUnitDisplay = item.jurusanNama
    ? `${item.jurusanNama}${item.prodiNama ? ` / ${item.prodiNama}` : ''}`
    : (item.unitKerjaNama || item.unit || '-');
  const manfaat = item.manfaatSebenarnya || item.manfaatKerjasama;
  const ruangLingkup = (item.ruangLingkup ?? []).filter(Boolean);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[12px] font-bold text-gray-900">Informasi Kerjasama</h3>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500">Nomor Dokumen</p>
            <p className="mt-0.5 text-[12px] font-semibold text-gray-900">{item.noDokumen}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Jenis Kerjasama</p>
            <p className="mt-0.5 text-[12px] font-semibold text-gray-900">{(item.jenisList ?? [item.jenis]).map((j) => jenisFullName[j]).join(' + ')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500">Tanggal Mulai</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Calendar size={13} className="text-gray-400" />
              <p className="text-[12px] font-semibold text-gray-900">{item.tanggalMulai}</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Tanggal Berakhir</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Calendar size={13} className="text-gray-400" />
              <p className="text-[12px] font-semibold text-gray-900">{item.berlakuHingga}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500">Jurusan/Prodi/Unit</p>
            <p className="mt-0.5 text-[12px] font-semibold text-gray-900">{jurusanUnitDisplay}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Durasi</p>
            <p className="mt-0.5 text-[12px] font-semibold text-gray-900">{item.durasiBulan ? `${item.durasiBulan} bulan` : '-'}</p>
          </div>
        </div>

        {/* Nilai kerja sama bisa diisi admin dan akun internal pemilik dokumen / pimpinan unitnya. */}
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-500">Nilai Kerja Sama</p>
            {!isEditingNilai && typeof item.id === 'number' && (
              <button
                type="button"
                onClick={() => {
                  setNilaiDraft(nilaiTersimpan || '');
                  setNilaiError(null);
                  setIsEditingNilai(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[#1E376C] transition-colors hover:bg-[#1E376C]/10"
              >
                <Pencil size={11} />
                Edit
              </button>
            )}
          </div>
          {isEditingNilai ? (
            <div className="mt-1 space-y-2">
              <input
                type="text"
                value={nilaiDraft}
                onChange={(e) => setNilaiDraft(e.target.value)}
                maxLength={255}
                className="input-field h-10 w-full rounded-lg px-3 text-[12px]"
                placeholder="Contoh: Rp 50.000.000 atau USD 5,000"
              />
              <p className="text-[10px] text-gray-400">Tulis nominal beserta mata uangnya (Rp, USD, dll.). Boleh tambah keterangan, mis. &quot;Rp 20 juta per tahun&quot;.</p>
              {nilaiError && <p className="text-[11px] text-red-500">{nilaiError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingNilai(false)}
                  disabled={savingNilai}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSimpanNilai}
                  disabled={savingNilai}
                  className="rounded-lg bg-[#1E376C] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2B4A93] disabled:opacity-60"
                >
                  {savingNilai ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-[12px] font-semibold text-gray-900">{nilaiTersimpan || '-'}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500">Bidang Usaha Mitra</p>
            <p className="mt-0.5 text-[12px] font-semibold text-gray-900">{item.bidangUsaha || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Kode Perusahaan</p>
            <p className="mt-0.5 text-[12px] font-semibold text-gray-900">{item.kodePerusahaan || '-'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-3">
        <div>
          <p className="text-[10px] text-gray-500">Judul Kegiatan Kerja Sama</p>
          <p className="mt-1 text-[12px] text-gray-700 leading-relaxed">{item.judulKegiatan || item.noDokumen}</p>
        </div>

        <div>
          <p className="text-[10px] text-gray-500">Manfaat bagi Polibatam/Prodi</p>
          <p className="mt-1 text-[12px] text-gray-700 leading-relaxed">{manfaat || 'Belum diisi.'}</p>
        </div>

        <div>
          <p className="text-[10px] text-gray-500">Luaran Kerja Sama</p>
          <p className="mt-1 text-[12px] text-gray-700 leading-relaxed">{item.luaranKerjaSama || 'Belum diisi.'}</p>
        </div>

        <div>
          <p className="text-[10px] text-gray-500">Ruang Lingkup</p>
          {ruangLingkup.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {ruangLingkup.map((scope) => (
                <li key={scope} className="flex items-center gap-2 text-[12px] text-gray-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                  {scope}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-gray-500">Belum diisi.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TabDokumen({
  dokumenTerkait,
}: {
  dokumenTerkait?: { nama: string; url?: string; ukuran: string; tanggal: string; jenisBerkas?: JenisBerkas; jenisDokumen?: string }[];
}) {
  if (!dokumenTerkait || dokumenTerkait.length === 0) {

    return (
      <div className="space-y-4">
        <h3 className="text-[12px] font-bold text-gray-900">Dokumen Terkait</h3>
        <div className="text-gray-500 text-[12px]">Belum ada dokumen terlampir.</div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h3 className="text-[12px] font-bold text-gray-900">Dokumen Terkait</h3>
      <div className="space-y-3">
        {dokumenTerkait.map((doc) => (
          <div key={doc.nama} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <FileText size={18} className="text-red-500" />
              </div>
              <div className="min-w-0">
                <div className="mb-1">
                  <JenisBerkasBadge jenis={doc.jenisBerkas} jenisDokumen={doc.jenisDokumen} />
                </div>
                <p className="text-[12px] font-semibold text-gray-900">{doc.nama}</p>
                <p className="text-[10px] text-gray-500">{doc.ukuran} • {doc.tanggal}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 transition-colors hover:text-blue-800 border border-blue-100 rounded px-2 py-1"
                style={{ textDecoration: 'none' }}
              >
                Lihat
              </a>
              <a
                href={doc.url}
                download={doc.nama}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 transition-colors hover:text-gray-800"
              >
                <Download size={14} />
                Download
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabKontak({ kontak }: { kontak: KontakMitra | null }) {
  if (!kontak) {
    return (
      <div className="space-y-4">
        <h3 className="text-[12px] font-bold text-gray-900">Kontak Mitra</h3>
        <div className="text-gray-500 text-[12px]">Belum ada data kontak PIC mitra untuk dokumen ini.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-[12px] font-bold text-gray-900">Kontak Mitra</h3>

      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-5 space-y-5">
        {/* Person */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-[12px] font-bold text-gray-600">
            {kontak.inisial}
          </div>
          <div>
            <p className="text-[12px] font-bold text-gray-900">{kontak.nama}</p>
            <p className="text-[10px] text-gray-500">{kontak.jabatan}</p>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Email */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100">
            <Mail size={15} className="text-orange-500" />
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Email</p>
            <p className="text-[12px] font-medium text-gray-900">{kontak.email}</p>
          </div>
        </div>

        {/* Phone */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
            <Phone size={15} className="text-green-500" />
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Telepon</p>
            <p className="text-[12px] font-medium text-gray-900">{kontak.telepon}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabHistori({ histori }: { histori: HistoriItem[] }) {
  if (histori.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-[12px] font-bold text-gray-900">Histori Perubahan</h3>
        <div className="text-gray-500 text-[12px]">Belum ada histori tercatat untuk dokumen ini.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-[12px] font-bold text-gray-900">Histori Perubahan</h3>

      <div className="space-y-0">
        {histori.map((h, index) => (
          <div key={`${h.judul}-${index}`} className="relative flex gap-4 pb-6">
            {/* Vertical line */}
            {index < histori.length - 1 && (
              <div className="absolute left-[17px] top-9 bottom-0 w-px bg-gray-200" />
            )}

            {/* Icon */}
            <div className="relative z-10 flex-shrink-0">
              {h.ikon === 'dibuat' ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 size={16} className="text-green-500" />
                </div>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                  <Clock size={16} className="text-amber-500" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="pt-1">
              <p className="text-[12px] font-semibold text-gray-900">{h.judul}</p>
              <p className="text-[10px] text-gray-500">{h.oleh}</p>
              <p className="text-[10px] text-gray-400">{h.tanggal}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
