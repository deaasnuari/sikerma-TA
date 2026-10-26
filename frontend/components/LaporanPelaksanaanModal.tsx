'use client';

import { openUrl } from '@/lib/api';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Download, ExternalLink, FilePlus, FileText, Save, Send, Upload, X } from 'lucide-react';
import { compressImageFileIfNeeded, validateSelectedFile } from '@/lib/fileUploadUtils';
import { submitLaporanPelaksanaan } from '@/services/laporanPelaksanaanService';
import { downloadTemplate, templateLaporanPelaksanaan } from '@/lib/templateDokumen';
import { buildLaporanPelaksanaanDocx, DEFAULT_JABATAN_MENGETAHUI } from '@/lib/laporanPelaksanaanDocx';
import { LINK_DRIVE_LAPORAN_KEGIATAN } from '@/lib/laporanKegiatanConfig';
import { showNotice } from '@/lib/dialog';

export interface LaporanPelaksanaanData {
  namaMitra: string;
  noDokumen: string;
  jenis: 'MoU' | 'MoA' | 'IA';
  ruangLingkup: string[];
  unit?: string;
  // Salah satu dari dua ini wajib ada agar laporan bisa dikirim ke admin dan
  // muncul di Story Aktivitas (dikelompokkan lewat pengajuanId) atau di data dokumen.
  pengajuanId?: number;
  dokumenKerjasamaId?: number;
  // Membedakan draft laporan antar aktivitas dalam mitra/dokumen yang sama,
  // supaya membuat laporan untuk aktivitas baru tidak menimpa/menampilkan
  // draft & status kirim dari aktivitas sebelumnya.
  aktivitasKey?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: LaporanPelaksanaanData | null;
}

type WorkflowStatus = 'draft' | 'dikirim_ke_pic' | 'selesai';

interface FormState {
  // Periode Monev yang jadi tujuan laporan ini — menentukan di Triwulan mana laporan
  // muncul pada Rekap Data -> Detail Kerjasama -> Monev. Defaultnya triwulan berjalan,
  // tapi HARUS bisa diganti manual supaya laporan bisa dikaitkan ke triwulan yang sama
  // dengan aktivitas yang dilaporkan (mis. aktivitas Mei tapi laporan baru dikirim Agustus).
  tahun: number;
  triwulan: number;
  judulKerjasama: string;
  referensiKerjasama: string;
  mitraKerjasama: string;
  unitPengaju: string;
  kegiatanText: string;
  hasilText: string;
  tautanDokumentasi: string;
  namaPenanggungJawab: string;
  nipPenanggungJawab: string;
  namaTtdMitra: string;
  jabatanTtdMitra: string;
  jabatanMengetahui: string;
  namaMengetahui: string;
  nipMengetahui: string;
  workflowStatus: WorkflowStatus;
  uploadedFile: { nama: string; ukuran: string; uploadedAt: string; tipe: string } | null;
}

const triwulanOptions = [
  { value: 1, label: 'Triwulan I (Jan-Mar)' },
  { value: 2, label: 'Triwulan II (Apr-Jun)' },
  { value: 3, label: 'Triwulan III (Jul-Sep)' },
  { value: 4, label: 'Triwulan IV (Okt-Des)' },
] as const;

function currentTriwulan(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

const workflowSteps = [
  { key: 'draft',            label: 'Isi & Upload',             desc: 'Jurusan/unit mengisi dan mengupload laporan' },
  { key: 'dikirim_ke_pic',   label: 'Terkirim ke Admin',        desc: 'Laporan sudah dikirim dan langsung terlihat oleh admin/humas' },
  { key: 'selesai',          label: 'PIC Sudah Tanda Tangan',    desc: 'Catatan internal: laporan sudah ditandatangani PIC (opsional)' },
] as const;

function stepIndex(status: WorkflowStatus): number {
  return workflowSteps.findIndex((s) => s.key === status);
}

export default function LaporanPelaksanaanModal({ isOpen, onClose, data }: Props) {
  const [tahun, setTahun]                               = useState<number>(new Date().getFullYear());
  const [triwulan, setTriwulan]                         = useState<number>(currentTriwulan());
  const [judulKerjasama, setJudulKerjasama]             = useState('');
  const [referensiKerjasama, setReferensiKerjasama]     = useState('');
  const [mitraKerjasama, setMitraKerjasama]             = useState('');
  const [unitPengaju, setUnitPengaju]                   = useState('');
  const [kegiatanText, setKegiatanText]                 = useState('');
  const [hasilText, setHasilText]                       = useState('');
  const [tautanDokumentasi, setTautanDokumentasi]       = useState('');
  const [namaPenanggungJawab, setNamaPenanggungJawab]   = useState('');
  const [nipPenanggungJawab, setNipPenanggungJawab]     = useState('');
  const [namaTtdMitra, setNamaTtdMitra]                 = useState('');
  const [jabatanTtdMitra, setJabatanTtdMitra]           = useState('');
  const [jabatanMengetahui, setJabatanMengetahui]       = useState('');
  const [namaMengetahui, setNamaMengetahui]             = useState('');
  const [nipMengetahui, setNipMengetahui]               = useState('');
  const [workflowStatus, setWorkflowStatus]             = useState<WorkflowStatus>('draft');
  const [uploadedFile, setUploadedFile]                 = useState<FormState['uploadedFile']>(null);
  const [uploadedFileRaw, setUploadedFileRaw]           = useState<File | Blob | null>(null);
  const [previewUrl, setPreviewUrl]                     = useState<string | null>(null);
  const [toastMsg, setToastMsg]                         = useState('');
  const [isSubmitting, setIsSubmitting]                 = useState(false);
  const [submitError, setSubmitError]                   = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedKeyRef = useRef<string | null>(null);

  function storageKey(d: LaporanPelaksanaanData) {
    return `laporan-pelaksanaan-${d.noDokumen}-${d.jenis}-${d.aktivitasKey ?? 'default'}`;
  }

  function buildDefault(d: LaporanPelaksanaanData): FormState {
    const tahun = new Date().getFullYear();
    return {
      tahun,
      triwulan: currentTriwulan(),
      judulKerjasama:      `Program ${d.ruangLingkup[0] || 'Kerja Sama'} dengan ${d.namaMitra}`,
      referensiKerjasama:  `${d.jenis} No. ${d.noDokumen}`,
      mitraKerjasama:      d.namaMitra,
      unitPengaju:         d.unit || '',
      kegiatanText: [
        ...d.ruangLingkup.map((rl, i) => `${i + 1}. ${rl}`),
      ].join('\n'),
      hasilText:           '',
      tautanDokumentasi:   '',
      namaPenanggungJawab: '',
      nipPenanggungJawab:  '',
      namaTtdMitra:        '',
      jabatanTtdMitra:     '',
      jabatanMengetahui:   DEFAULT_JABATAN_MENGETAHUI,
      namaMengetahui:      'Dr. Muhammad Zaenuddin',
      nipMengetahui:       '197602142014041008',
      workflowStatus:      'draft',
      uploadedFile:        null,
    };
  }

  function applyState(s: FormState) {
    setTahun(s.tahun ?? new Date().getFullYear());
    setTriwulan(s.triwulan ?? currentTriwulan());
    setJudulKerjasama(s.judulKerjasama);
    setReferensiKerjasama(s.referensiKerjasama);
    setMitraKerjasama(s.mitraKerjasama);
    setUnitPengaju(s.unitPengaju);
    setKegiatanText(s.kegiatanText);
    setHasilText(s.hasilText);
    setTautanDokumentasi(s.tautanDokumentasi);
    setNamaPenanggungJawab(s.namaPenanggungJawab);
    setNipPenanggungJawab(s.nipPenanggungJawab);
    setNamaTtdMitra(s.namaTtdMitra);
    setJabatanTtdMitra(s.jabatanTtdMitra);
    setJabatanMengetahui(s.jabatanMengetahui);
    setNamaMengetahui(s.namaMengetahui);
    setNipMengetahui(s.nipMengetahui);
    setWorkflowStatus(s.workflowStatus ?? 'draft');
    setUploadedFile(s.uploadedFile ?? null);
  }

  function currentState(): FormState {
    return {
      tahun, triwulan,
      judulKerjasama, referensiKerjasama, mitraKerjasama, unitPengaju,
      kegiatanText, hasilText, tautanDokumentasi,
      namaPenanggungJawab, nipPenanggungJawab,
      namaTtdMitra, jabatanTtdMitra, jabatanMengetahui,
      namaMengetahui, nipMengetahui, workflowStatus, uploadedFile,
    };
  }

  useEffect(() => {
    if (!isOpen || !data) return;
    const key = storageKey(data);
    if (initializedKeyRef.current === key) return;
    const defaults = buildDefault(data);
    const saved = localStorage.getItem(key);
    if (saved) {
      try { applyState({ ...defaults, ...JSON.parse(saved) }); }
      catch { applyState(defaults); }
    } else {
      applyState(defaults);
    }
    initializedKeyRef.current = key;
  }, [isOpen, data]);

  useEffect(() => {
    if (!isOpen) initializedKeyRef.current = null;
  }, [isOpen]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function showToast(msg: string) {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(''), 3000);
  }

  function handleSave() {
    if (!data) return;
    localStorage.setItem(storageKey(data), JSON.stringify(currentState()));
    showToast('Laporan berhasil disimpan.');
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const err = validateSelectedFile(file, { accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png', maxSizeBytes: 10 * 1024 * 1024 });
    if (err) { showNotice(err); event.target.value = ''; return; }
    const processed = await compressImageFileIfNeeded(file, { maxDimension: 1920, quality: 0.8, minBytesToCompress: 400 * 1024 });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(processed));
    setUploadedFileRaw(processed);
    const size = processed.size < 1024 * 1024
      ? `${(processed.size / 1024).toFixed(1)} KB`
      : `${(processed.size / (1024 * 1024)).toFixed(2)} MB`;
    setUploadedFile({ nama: processed.name, ukuran: size, uploadedAt: new Date().toLocaleString('id-ID'), tipe: processed.type });
    showToast('File dipilih. Klik Simpan untuk menyimpan.');
  }

  function handleRemoveUpload() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setUploadedFile(null);
    setUploadedFileRaw(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleKirimPIC() {
    if (!data) return;
    if (!uploadedFile) { showNotice('Upload file laporan terlebih dahulu sebelum mengirim.'); return; }
    if (!namaPenanggungJawab.trim()) { showNotice('Isi nama penanggung jawab kegiatan terlebih dahulu.'); return; }
    if (!data.pengajuanId && !data.dokumenKerjasamaId) {
      showNotice('Laporan ini tidak terhubung ke pengajuan atau dokumen manapun sehingga tidak bisa dikirim ke admin.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      await submitLaporanPelaksanaan({
        pengajuanId: data.pengajuanId,
        dokumenKerjasamaId: data.dokumenKerjasamaId,
        tahun,
        triwulan,
        nomorDokumen: data.noDokumen,
        namaMitra: mitraKerjasama,
        jenisDokumen: data.jenis,
        judulKerjasama,
        referensiKerjasama,
        unitPengaju,
        kegiatan: kegiatanText,
        hasil: hasilText,
        tautanDokumentasi: LINK_DRIVE_LAPORAN_KEGIATAN || tautanDokumentasi,
        namaPenanggungJawab,
        nipPenanggungJawab,
        jabatanMengetahui,
        namaMengetahui,
        nipMengetahui,
        file: uploadedFileRaw,
        fileName: uploadedFile?.nama,
      });

      const next: WorkflowStatus = 'dikirim_ke_pic';
      setWorkflowStatus(next);
      localStorage.setItem(storageKey(data), JSON.stringify({ ...currentState(), workflowStatus: next }));
      showToast('Laporan berhasil dikirim ke admin.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Gagal mengirim laporan ke admin.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Setelah laporan terkirim, formnya terkunci. Tombol ini mengosongkan form (isian & file) untuk
  // laporan berikutnya; laporan yang sudah terkirim tetap tersimpan di server dan tidak terhapus.
  function handleLaporanBaru() {
    if (!data) return;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setUploadedFileRaw(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSubmitError('');
    applyState(buildDefault(data));
    localStorage.removeItem(storageKey(data));
    showToast('Form baru siap diisi.');
  }

  async function handleDownload() {
    if (!data) return;
    try {
      const blob = await buildLaporanPelaksanaanDocx({
        judulKerjasama,
        referensiKerjasama,
        mitraKerjasama,
        ruangLingkup: kegiatanText,
        hasilPelaksanaan: hasilText,
        tautanDokumentasi: LINK_DRIVE_LAPORAN_KEGIATAN || tautanDokumentasi,
        namaPenanggungJawab,
        namaTtdMitra,
        jabatanTtdMitra,
        namaMengetahui,
        jabatanMengetahui,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan_Pelaksanaan_Kerjasama_${data.noDokumen.replace(/[\\/:*?"<>|]+/g, '-')}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast('Laporan berhasil diunduh.');
    } catch {
      // Gagal mengisi otomatis: tetap berikan template kosong supaya user tidak buntu.
      downloadTemplate(templateLaporanPelaksanaan);
      showToast('Gagal mengisi otomatis, template kosong diunduh.');
    }
  }

  if (!isOpen || !data) return null;

  const currentStep = stepIndex(workflowStatus);
  const isDraftEditable = workflowStatus === 'draft';

  return (
    // Kartu diberi jarak dari navbar (atas) dan footer/tepi layar (bawah), tingginya dibatasi
    // ke area yang tersisa; yang menggulir hanya isi kartu, header tetap di atas.
    <div className="fixed inset-x-0 bottom-0 top-16 z-[70] flex items-start justify-center bg-slate-900/40 px-3 pb-10 pt-6">
      <div className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex flex-none items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
          <h2 className="text-base font-bold text-[#1E376C]">Laporan Pelaksanaan Kerjasama</h2>
          <div className="flex items-center gap-2">
            {toastMsg && <p className="text-xs font-semibold text-green-600">{toastMsg}</p>}
            {isDraftEditable && (
              <button type="button" onClick={handleSave}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                <Save size={13} /> Simpan
              </button>
            )}
            <button type="button" onClick={handleDownload}
              className="inline-flex items-center gap-1 rounded-md bg-[#1E376C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#28478A]">
              <Download size={13} /> Unduh Template
            </button>
            <button type="button" onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">

          {/* Workflow Steps */}
          <div className="rounded-xl border border-[#1E376C]/20 bg-[#EEF2FF] p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#1E376C]">Alur Laporan Pelaksanaan</p>
            <div className="flex flex-wrap items-start gap-0">
              {workflowSteps.map((step, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={step.key} className="flex items-center">
                    <div className={`flex flex-col items-center text-center max-w-[120px] ${active ? 'opacity-100' : done ? 'opacity-100' : 'opacity-40'}`}>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-green-500 text-white' : active ? 'bg-[#1E376C] text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {done ? <CheckCircle2 size={16} /> : i + 1}
                      </div>
                      <p className={`mt-1 text-[11px] font-semibold ${active ? 'text-[#1E376C]' : done ? 'text-green-700' : 'text-slate-500'}`}>{step.label}</p>
                      <p className="text-[10px] text-slate-500 leading-tight">{step.desc}</p>
                    </div>
                    {i < workflowSteps.length - 1 && (
                      <ChevronRight size={18} className={`mx-1 mt-[-20px] shrink-0 ${i < currentStep ? 'text-green-500' : 'text-slate-300'}`} />
                    )}
                  </div>
                );
              })}
            </div>
            {workflowStatus === 'dikirim_ke_pic' && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                <strong>Terkirim.</strong> Laporan sudah dikirim ke admin dan bisa langsung dilihat di Story Aktivitas.
              </div>
            )}
            {workflowStatus === 'selesai' && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                <strong>Selesai.</strong> Laporan sudah dikirim ke admin dan ditandai sudah ditandatangani PIC.
              </div>
            )}
          </div>

          {/* Info dokumen */}
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3 text-xs text-slate-700">
            <div><p className="font-semibold text-slate-500">Mitra</p><p className="mt-0.5 font-medium">{data.namaMitra}</p></div>
            <div><p className="font-semibold text-slate-500">No. Dokumen</p><p className="mt-0.5 font-medium">{data.noDokumen}</p></div>
            <div><p className="font-semibold text-slate-500">Jenis</p><p className="mt-0.5 font-medium">{data.jenis}</p></div>
          </div>

          {/* Periode Monev — menentukan laporan ini muncul di Triwulan mana pada Rekap
              Data -> Detail Kerjasama -> Monev. Default triwulan berjalan, tapi WAJIB bisa
              diganti manual supaya laporan bisa disamakan triwulannya dengan aktivitas yang
              dilaporkan (mis. aktivitas terjadi Mei tapi laporannya baru dikirim Agustus). */}
          <div className="rounded-xl border border-[#1E376C]/20 bg-[#EEF2FF] p-4">
            <p className="mb-2 text-xs font-bold text-[#1E376C]">Periode Monev</p>
            <p className="mb-3 text-[11px] text-slate-600">
              Pilih tahun &amp; triwulan sesuai periode aktivitas yang dilaporkan, supaya laporan ini muncul bersama aktivitasnya di Monev Triwulan pada Rekap Data.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tahun</label>
                <input
                  type="number" value={tahun} disabled={!isDraftEditable}
                  onChange={(e) => setTahun(Number(e.target.value) || new Date().getFullYear())}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E376C] disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Triwulan</label>
                <select
                  value={triwulan} disabled={!isDraftEditable}
                  onChange={(e) => setTriwulan(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E376C] disabled:bg-slate-50 disabled:text-slate-500"
                >
                  {triwulanOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Langkah-langkah */}
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { no: '1', title: 'Unduh Laporan', desc: 'Isi form di bawah, lalu unduh file LPK yang sudah terisi otomatis untuk dilengkapi & ditandatangani.',
                action: <button type="button" onClick={handleDownload} className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#1E376C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#28478A]"><Download size={13}/> Unduh & Buka</button> },
              { no: '2', title: 'Lengkapi & Upload', desc: 'Isi seluruh bagian laporan lalu upload file yang sudah selesai.',
                action: null },
              { no: '3', title: 'Kirim ke Admin', desc: 'Setelah upload, kirim laporan supaya langsung terlihat oleh admin.',
                action: null },
            ].map((s) => (
              <div key={s.no} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold text-[#1E376C]">Langkah {s.no}</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{s.title}</p>
                <p className="mt-1 text-xs text-gray-600">{s.desc}</p>
                {s.action}
              </div>
            ))}
          </div>

          {/* Form isian */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-sm font-bold text-[#1E376C]">Data Laporan Pelaksanaan Kerjasama (LPK)</p>
            {[
              { label: 'Judul Kerjasama', val: judulKerjasama, set: setJudulKerjasama },
              { label: 'Referensi Kerja Sama (MoA/IA)', val: referensiKerjasama, set: setReferensiKerjasama },
              { label: 'Mitra Kerjasama', val: mitraKerjasama, set: setMitraKerjasama },
              { label: 'Unit/Jurusan Pelaksana', val: unitPengaju, set: setUnitPengaju },
            ].map((f) => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                <input
                  type="text" value={f.val} disabled={!isDraftEditable}
                  onChange={(e) => f.set(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E376C] disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            ))}
            {[
              { label: 'Ruang Lingkup', val: kegiatanText, set: setKegiatanText },
              { label: 'Hasil Pelaksanaan (Output & Outcome)', val: hasilText, set: setHasilText },
            ].map((f) => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                <textarea
                  rows={4} value={f.val} disabled={!isDraftEditable}
                  onChange={(e) => f.set(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E376C] disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tautan/Link Dokumentasi Kegiatan dan Laporan Kegiatan</label>
              {LINK_DRIVE_LAPORAN_KEGIATAN ? (
                <>
                  <a
                    href={LINK_DRIVE_LAPORAN_KEGIATAN}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-[#1E376C] underline hover:bg-slate-100"
                  >
                    <span className="break-all">{LINK_DRIVE_LAPORAN_KEGIATAN}</span>
                    <ExternalLink size={14} className="shrink-0" />
                  </a>
                  <p className="mt-1 text-xs text-slate-500">
                    Unggah dokumentasi kegiatan dan laporan kegiatan ke folder Google Drive Admin Kerja Sama di atas.
                  </p>
                </>
              ) : (
                <input type="text" value={tautanDokumentasi} disabled={!isDraftEditable}
                  onChange={(e) => setTautanDokumentasi(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E376C] disabled:bg-slate-50 disabled:text-slate-500"
                />
              )}
              <p className="mt-1 text-xs font-semibold text-amber-600">*Link bisa diakses semua orang</p>
            </div>
          </div>

          {/* Tanda Tangan */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-sm font-bold text-[#1E376C]">Tanda Tangan</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Penanggung Jawab Kegiatan (Pelaksana Polibatam)</p>
                {[
                  { label: 'Nama', val: namaPenanggungJawab, set: setNamaPenanggungJawab },
                  { label: 'NIP (opsional)', val: nipPenanggungJawab, set: setNipPenanggungJawab },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">{f.label}</label>
                    <input type="text" value={f.val} disabled={!isDraftEditable}
                      onChange={(e) => f.set(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#1E376C] disabled:bg-white disabled:text-slate-500"
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Mitra/Partner</p>
                {[
                  { label: 'Nama', val: namaTtdMitra, set: setNamaTtdMitra },
                  { label: 'Jabatan', val: jabatanTtdMitra, set: setJabatanTtdMitra },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">{f.label}</label>
                    <input type="text" value={f.val} disabled={!isDraftEditable}
                      onChange={(e) => f.set(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#1E376C] disabled:bg-white disabled:text-slate-500"
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Mengetahui</p>
                {[
                  { label: 'Jabatan', val: jabatanMengetahui, set: setJabatanMengetahui },
                  { label: 'Nama', val: namaMengetahui, set: setNamaMengetahui },
                  { label: 'NIP (opsional)', val: nipMengetahui, set: setNipMengetahui },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">{f.label}</label>
                    <input type="text" value={f.val} disabled={!isDraftEditable}
                      onChange={(e) => f.set(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#1E376C] disabled:bg-white disabled:text-slate-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Upload laporan */}
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF] text-[#1E376C]">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Upload Laporan yang Sudah Diisi</p>
                  <p className="mt-0.5 text-xs text-gray-600">Upload file laporan yang telah dilengkapi (PDF, Word, JPG, PNG — maks 10 MB)</p>
                </div>
              </div>
              {isDraftEditable && (
                <div className="flex flex-wrap gap-2">
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleUpload} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-md bg-[#1E376C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#28478A]">
                    <Upload size={13}/> Upload File
                  </button>
                  {uploadedFile && (
                    <button type="button" onClick={handleRemoveUpload}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                      Hapus
                    </button>
                  )}
                </div>
              )}
            </div>
            {uploadedFile ? (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                <p className="font-semibold">File: {uploadedFile.nama}</p>
                <p>Ukuran: {uploadedFile.ukuran} · Diupload: {uploadedFile.uploadedAt}</p>
                {previewUrl && (
                  <button type="button" onClick={() => openUrl(previewUrl)}
                    className="mt-2 inline-flex items-center gap-1 text-[#1E376C] underline underline-offset-2 hover:text-[#28478A]">
                    <FileText size={12}/> Lihat File
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-500">Belum ada file yang diupload.</p>
            )}
          </div>

          {/* Tombol Kirim ke Admin */}
          {isDraftEditable && (
            <div className="flex flex-col items-end gap-2">
              {submitError && <p className="text-xs font-semibold text-red-600">{submitError}</p>}
              <button type="button" onClick={handleKirimPIC} disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1E376C] px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#28478A] disabled:cursor-not-allowed disabled:opacity-60">
                <Send size={15}/> {isSubmitting ? 'Mengirim...' : 'Kirim Laporan ke Admin'}
              </button>
            </div>
          )}
          {!isDraftEditable && (
            <div className="flex justify-end">
              <button type="button" onClick={handleLaporanBaru}
                className="inline-flex items-center gap-2 rounded-xl border border-[#1E376C] bg-white px-5 py-2.5 text-sm font-semibold text-[#1E376C] shadow-sm hover:bg-[#EEF2FF]">
                <FilePlus size={15}/> Buat Laporan Baru
              </button>
            </div>
          )}
          {workflowStatus === 'dikirim_ke_pic' && (
            <div className="flex justify-end">
              <button type="button"
                onClick={() => {
                  setWorkflowStatus('selesai');
                  if (data) localStorage.setItem(storageKey(data), JSON.stringify({ ...currentState(), workflowStatus: 'selesai' }));
                  showToast('Ditandai sudah ditandatangani PIC.');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-green-500 bg-green-500 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-green-600">
                <CheckCircle2 size={15}/> Tandai: Sudah Ditandatangani PIC
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
