'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Download, FileText, Save, Send, Upload, X } from 'lucide-react';
import { compressImageFileIfNeeded, validateSelectedFile } from '@/lib/fileUploadUtils';
import { submitLaporanPelaksanaan } from '@/services/laporanPelaksanaanService';

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
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: LaporanPelaksanaanData | null;
}

type WorkflowStatus = 'draft' | 'dikirim_ke_pic' | 'selesai';

interface FormState {
  nomorIAPolibatam: string;
  nomorIAMitra: string;
  judulKerjasama: string;
  referensiKerjasama: string;
  mitraKerjasama: string;
  unitPengaju: string;
  kegiatanText: string;
  maksudTujuanText: string;
  capaianText: string;
  hasilText: string;
  timelineText: string;
  skemaPembiayaanText: string;
  jumlahPeserta: string;
  ringkasanCatatanText: string;
  tautanDokumentasi: string;
  namaPenanggungJawab: string;
  jabatanPenanggungJawab: string;
  nipPenanggungJawab: string;
  namaTtdMitra: string;
  jabatanTtdMitra: string;
  jabatanMengetahui: string;
  namaMengetahui: string;
  nipMengetahui: string;
  workflowStatus: WorkflowStatus;
  uploadedFile: { nama: string; ukuran: string; uploadedAt: string; tipe: string } | null;
}

const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const workflowSteps = [
  { key: 'draft',            label: 'Isi & Upload',             desc: 'Jurusan/unit mengisi dan mengupload laporan' },
  { key: 'dikirim_ke_pic',   label: 'Terkirim ke Admin',        desc: 'Laporan sudah dikirim dan langsung terlihat oleh admin/humas' },
  { key: 'selesai',          label: 'PIC Sudah Tanda Tangan',    desc: 'Catatan internal: laporan sudah ditandatangani PIC (opsional)' },
] as const;

function stepIndex(status: WorkflowStatus): number {
  return workflowSteps.findIndex((s) => s.key === status);
}

export default function LaporanPelaksanaanModal({ isOpen, onClose, data }: Props) {
  const [nomorIAPolibatam, setNomorIAPolibatam]         = useState('');
  const [nomorIAMitra, setNomorIAMitra]                 = useState('');
  const [judulKerjasama, setJudulKerjasama]             = useState('');
  const [referensiKerjasama, setReferensiKerjasama]     = useState('');
  const [mitraKerjasama, setMitraKerjasama]             = useState('');
  const [unitPengaju, setUnitPengaju]                   = useState('');
  const [kegiatanText, setKegiatanText]                 = useState('');
  const [maksudTujuanText, setMaksudTujuanText]         = useState('');
  const [capaianText, setCapaianText]                   = useState('');
  const [hasilText, setHasilText]                       = useState('');
  const [timelineText, setTimelineText]                 = useState('');
  const [skemaPembiayaanText, setSkemaPembiayaanText]   = useState('');
  const [jumlahPeserta, setJumlahPeserta]               = useState('');
  const [ringkasanCatatanText, setRingkasanCatatanText] = useState('');
  const [tautanDokumentasi, setTautanDokumentasi]       = useState('');
  const [namaPenanggungJawab, setNamaPenanggungJawab]   = useState('');
  const [jabatanPenanggungJawab, setJabatanPenanggungJawab] = useState('');
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
    return `laporan-pelaksanaan-${d.noDokumen}-${d.jenis}`;
  }

  function buildDefault(d: LaporanPelaksanaanData): FormState {
    const now = new Date();
    const tahun = now.getFullYear();
    const bulanRomawi = romanMonths[now.getMonth()];
    return {
      nomorIAPolibatam:    `${d.noDokumen}/IA.PL29/${bulanRomawi}/${tahun}`,
      nomorIAMitra:        '',
      judulKerjasama:      `Program ${d.ruangLingkup[0] || 'Kerja Sama'} dengan ${d.namaMitra}`,
      referensiKerjasama:  `${d.noDokumen}/${d.jenis}/${tahun}`,
      mitraKerjasama:      d.namaMitra,
      unitPengaju:         d.unit || '',
      kegiatanText: [
        ...d.ruangLingkup.map((rl, i) => `${i + 1}. ${rl}`),
      ].join('\n'),
      maksudTujuanText:    '',
      capaianText:         '',
      hasilText:           '',
      timelineText:        '',
      skemaPembiayaanText: '',
      jumlahPeserta:       '',
      ringkasanCatatanText: '',
      tautanDokumentasi:   '',
      namaPenanggungJawab: '',
      jabatanPenanggungJawab: '',
      nipPenanggungJawab:  '',
      namaTtdMitra:        '',
      jabatanTtdMitra:     '',
      jabatanMengetahui:   'Wakil Direktur Bidang Kemahasiswaan, Alumni dan Kerja Sama',
      namaMengetahui:      'Dr. Muhammad Zaenuddin',
      nipMengetahui:       '197602142014041008',
      workflowStatus:      'draft',
      uploadedFile:        null,
    };
  }

  function applyState(s: FormState) {
    setNomorIAPolibatam(s.nomorIAPolibatam);
    setNomorIAMitra(s.nomorIAMitra);
    setJudulKerjasama(s.judulKerjasama);
    setReferensiKerjasama(s.referensiKerjasama);
    setMitraKerjasama(s.mitraKerjasama);
    setUnitPengaju(s.unitPengaju);
    setKegiatanText(s.kegiatanText);
    setMaksudTujuanText(s.maksudTujuanText);
    setCapaianText(s.capaianText);
    setHasilText(s.hasilText);
    setTimelineText(s.timelineText);
    setSkemaPembiayaanText(s.skemaPembiayaanText);
    setJumlahPeserta(s.jumlahPeserta);
    setRingkasanCatatanText(s.ringkasanCatatanText);
    setTautanDokumentasi(s.tautanDokumentasi);
    setNamaPenanggungJawab(s.namaPenanggungJawab);
    setJabatanPenanggungJawab(s.jabatanPenanggungJawab);
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
      nomorIAPolibatam, nomorIAMitra, judulKerjasama, referensiKerjasama, mitraKerjasama, unitPengaju,
      kegiatanText, maksudTujuanText, capaianText, hasilText, timelineText, skemaPembiayaanText,
      jumlahPeserta, ringkasanCatatanText, tautanDokumentasi,
      namaPenanggungJawab, jabatanPenanggungJawab, nipPenanggungJawab,
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
    if (err) { alert(err); event.target.value = ''; return; }
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
    if (!uploadedFile) { alert('Upload file laporan terlebih dahulu sebelum mengirim.'); return; }
    if (!namaPenanggungJawab.trim()) { alert('Isi nama penanggung jawab kegiatan terlebih dahulu.'); return; }
    if (!data.pengajuanId && !data.dokumenKerjasamaId) {
      alert('Laporan ini tidak terhubung ke pengajuan atau dokumen manapun sehingga tidak bisa dikirim ke admin.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      await submitLaporanPelaksanaan({
        pengajuanId: data.pengajuanId,
        dokumenKerjasamaId: data.dokumenKerjasamaId,
        nomorDokumen: data.noDokumen,
        namaMitra: mitraKerjasama,
        jenisDokumen: data.jenis,
        judulKerjasama,
        referensiKerjasama,
        unitPengaju,
        kegiatan: kegiatanText,
        capaian: capaianText,
        hasil: hasilText,
        tautanDokumentasi,
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

  function escapeHtml(v: string) {
    return v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }

  async function handleDownload() {
    if (!data) return;
    let logoSrc = '';
    try {
      const res = await fetch('/polibatam_logo.png');
      const blob = await res.blob();
      logoSrc = await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onloadend = () => ok(typeof r.result === 'string' ? r.result : '');
        r.onerror = () => fail(new Error('logo error'));
        r.readAsDataURL(blob);
      });
    } catch { logoSrc = ''; }

    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" alt="Logo Polibatam" style="max-height:56px;width:auto;object-fit:contain;" />`
      : `<div style="font-size:18px;font-weight:800;color:#1A4EA1;">POLIBATAM</div>`;

    const bilingual = (id: string, en: string) => `${escapeHtml(id)}<br/><em>${escapeHtml(en)}</em>`;
    const multi = (v: string) => escapeHtml(v).replaceAll('\n', '<br/>');

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
<head><meta charset='utf-8'/><title>Implementation Arrangement</title>
<style>
body{font-family:Arial,sans-serif;font-size:12px;padding:24px;}
table{border-collapse:collapse;width:100%;}
td{border:1px solid #888;padding:6px;vertical-align:top;}
.title{text-align:center;font-weight:700;font-size:15px;margin:4px 0;}
.center{text-align:center;}
.label{width:260px;font-weight:700;}
.no{width:30px;text-align:center;}
.header{display:flex;justify-content:space-between;align-items:center;border:1px solid #cbd5e1;padding:10px 14px;background:#f8fbff;margin-bottom:10px;}
.mitra-wrap{display:flex;align-items:center;gap:10px;}
.mitra-box{width:56px;height:56px;border:1px dashed #94a3b8;text-align:center;line-height:56px;font-size:10px;font-weight:700;color:#475569;background:#fff;}
.nomor-table td{border:none;text-align:center;padding:2px;}
.intro{margin:14px 0;text-align:justify;}
.sign-table td{text-align:center;vertical-align:top;padding:10px 8px;}
</style></head>
<body>
<div class='header'>
  <div class='mitra-wrap'>
    <div class='mitra-box'>LOGO MITRA</div>
    <div><div style='font-weight:700;color:#1F429A;'>${escapeHtml(data.namaMitra)}</div><div style='font-size:10px;color:#64748b;'>Area logo mitra kerja sama</div></div>
  </div>
  <div>${logoHtml}</div>
</div>

<div class='title'>IMPLEMENTATION ARRANGEMENT</div>
<div class='center'>ANTARA</div>
<div class='center' style='font-weight:700;'>POLITEKNIK NEGERI BATAM</div>
<div class='center'>DENGAN</div>
<div class='center' style='font-weight:700;'>${escapeHtml(mitraKerjasama)}</div>

<table class='nomor-table'>
  <tr>
    <td style='width:50%'>NOMOR: ${escapeHtml(nomorIAPolibatam)}</td>
    <td style='width:50%'>NOMOR: ${escapeHtml(nomorIAMitra || '..............................')}</td>
  </tr>
</table>

<p class='intro'>Dokumen ini disusun sebagai bentuk pelaksanaan dan implementasi atas Nota Kesepahaman (MoU) dan/atau Memorandum of Agreement (MOA) yang telah ditandatangani antara Politeknik Negeri Batam dengan ${escapeHtml(mitraKerjasama)}, PARA PIHAK sepakat untuk melaksanakan kerja sama sebagai berikut:</p>

<table>
  <tr><td class='no'>1</td><td class='label'>${bilingual('Judul Kegiatan/Project/Penelitian/Pengabdian', 'Project / Activity Title')}</td><td>${escapeHtml(judulKerjasama)}</td></tr>
  <tr><td class='no'>2</td><td class='label'>${bilingual('Dasar Referensi Pelaksanaan (MOU/MOA)', 'Legal Basis of Implementation')}</td><td>${escapeHtml(referensiKerjasama)}</td></tr>
  <tr><td class='no'>3</td><td class='label'>Nama Mitra/Partner</td><td>${escapeHtml(mitraKerjasama)}</td></tr>
  <tr><td class='no'>4</td><td class='label'>${bilingual('Ruang Lingkup', 'Scope of Activities')}</td><td>${multi(kegiatanText)}</td></tr>
  <tr><td class='no'>5</td><td class='label'>${bilingual('Maksud dan Tujuan', 'Purpose and Objective')}</td><td>${multi(maksudTujuanText)}</td></tr>
  <tr><td class='no'>6</td><td class='label'>${bilingual('Peran dan Tanggung Jawab Para Pihak', 'Roles and Responsibilities of the Parties')}</td><td>${multi(capaianText)}</td></tr>
  <tr><td class='no'>7</td><td class='label'>Output/outcome</td><td>${multi(hasilText)}</td></tr>
  <tr><td class='no'>8</td><td class='label'>${bilingual('Timeline/Waktu Pelaksanaan', 'Date and Time of Implementation')}</td><td>${multi(timelineText)}</td></tr>
  <tr><td class='no'>9</td><td class='label'>${bilingual('Skema Pembiayaan', 'Financing Scheme')}</td><td>${multi(skemaPembiayaanText)}</td></tr>
  <tr><td class='no'>10</td><td class='label'>${bilingual('Jumlah Peserta', 'Number of Participants')}</td><td>${escapeHtml(jumlahPeserta)}</td></tr>
  <tr><td class='no'>11</td><td class='label'>${bilingual('Ringkasan/Catatan', 'Meeting Summary and Notes')}</td><td>${multi(ringkasanCatatanText)}</td></tr>
  <tr><td class='no'>12</td><td class='label'>${bilingual('Lampiran IA dalam bentuk link', 'Annexes (Accessible via Link)')}</td><td>${escapeHtml(tautanDokumentasi)}</td></tr>
</table>

<br/>
<table class='sign-table'>
  <tr>
    <td style='width:33.33%'><strong>Pelaksana<br/>Unit/Prodi</strong></td>
    <td style='width:33.33%'><strong>Mitra/Partner</strong></td>
    <td style='width:33.34%'><strong>Mengetahui<br/>(WD/Kajur/Ka.Unit)</strong></td>
  </tr>
  <tr>
    <td><br/><br/><br/>(${escapeHtml(namaPenanggungJawab || 'NAMA')})</td>
    <td><br/><br/><br/>(${escapeHtml(namaTtdMitra || 'NAMA')})</td>
    <td><br/><br/><br/>(${escapeHtml(namaMengetahui || 'NAMA')})</td>
  </tr>
  <tr>
    <td>(${escapeHtml(jabatanPenanggungJawab || 'JABATAN')})</td>
    <td>(${escapeHtml(jabatanTtdMitra || 'JABATAN')})</td>
    <td>(${escapeHtml(jabatanMengetahui || 'JABATAN')})</td>
  </tr>
  <tr>
    <td>Tanggal :</td>
    <td>Tanggal :</td>
    <td>Tanggal :</td>
  </tr>
</table>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.open(); win.document.write(html); win.document.close(); }
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Implementation_Arrangement_${data.noDokumen}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('Template berhasil diunduh.');
  }

  if (!isOpen || !data) return null;

  const currentStep = stepIndex(workflowStatus);
  const isDraftEditable = workflowStatus === 'draft';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 px-3 py-6">
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
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

        <div className="p-5 space-y-5">

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

          {/* Langkah-langkah */}
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { no: '1', title: 'Unduh Template', desc: 'Unduh format laporan lalu isi di luar sistem.',
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
            <p className="text-sm font-bold text-[#1E376C]">Data Implementation Arrangement (IA)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Nomor IA - Polibatam', val: nomorIAPolibatam, set: setNomorIAPolibatam },
                { label: 'Nomor IA - Mitra', val: nomorIAMitra, set: setNomorIAMitra },
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
            </div>
            {[
              { label: 'Judul Kegiatan/Project/Penelitian/Pengabdian (Project / Activity Title)', val: judulKerjasama, set: setJudulKerjasama },
              { label: 'Dasar Referensi Pelaksanaan - MOU/MOA (Legal Basis of Implementation)', val: referensiKerjasama, set: setReferensiKerjasama },
              { label: 'Nama Mitra/Partner', val: mitraKerjasama, set: setMitraKerjasama },
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
              { label: 'Ruang Lingkup (Scope of Activities)', val: kegiatanText, set: setKegiatanText },
              { label: 'Maksud dan Tujuan (Purpose and Objective)', val: maksudTujuanText, set: setMaksudTujuanText },
              { label: 'Peran dan Tanggung Jawab Para Pihak (Roles and Responsibilities of the Parties)', val: capaianText, set: setCapaianText },
              { label: 'Output/Outcome', val: hasilText, set: setHasilText },
              { label: 'Timeline/Waktu Pelaksanaan (Date and Time of Implementation)', val: timelineText, set: setTimelineText },
              { label: 'Skema Pembiayaan (Financing Scheme)', val: skemaPembiayaanText, set: setSkemaPembiayaanText },
              { label: 'Ringkasan/Catatan (Meeting Summary and Notes)', val: ringkasanCatatanText, set: setRingkasanCatatanText },
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">Jumlah Peserta (Number of Participants)</label>
              <input type="text" value={jumlahPeserta} disabled={!isDraftEditable}
                onChange={(e) => setJumlahPeserta(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E376C] disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Lampiran IA dalam bentuk Link (Annexes Accessible via Link)</label>
              <input type="text" value={tautanDokumentasi} disabled={!isDraftEditable}
                onChange={(e) => setTautanDokumentasi(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E376C] disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          {/* Tanda Tangan */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-sm font-bold text-[#1E376C]">Tanda Tangan</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Pelaksana Unit/Prodi</p>
                {[
                  { label: 'Nama', val: namaPenanggungJawab, set: setNamaPenanggungJawab },
                  { label: 'Jabatan', val: jabatanPenanggungJawab, set: setJabatanPenanggungJawab },
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
                <p className="text-xs font-semibold text-slate-700">Mengetahui (WD/Kajur/Ka.Unit)</p>
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
                  <button type="button" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
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
