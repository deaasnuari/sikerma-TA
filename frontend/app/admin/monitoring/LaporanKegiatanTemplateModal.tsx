'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Save, Upload, X } from 'lucide-react';
import { compressImageFileIfNeeded, validateSelectedFile } from '@/lib/fileUploadUtils';

interface LaporanKegiatanTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    namaMitra: string;
    noDokumen: string;
    jenis: 'MoU' | 'MoA' | 'IA';
    ruangLingkup: string[];
  } | null;
}

interface UploadedTemplateFile {
  nama: string;
  ukuran: string;
  uploadedAt: string;
  tipe: string;
}

interface TemplateFormState {
  judulKerjasama: string;
  referensiKerjasama: string;
  mitraKerjasama: string;
  kegiatanPelaksanaanText: string;
  capaianKinerjaText: string;
  ruangLingkupText: string;
  hasilPelaksanaanText: string;
  tautanDokumentasi: string;
  uploadLaporan: UploadedTemplateFile | null;
  namaPenanggungJawab: string;
  nipPenanggungJawab: string;
  jabatanMengetahui: string;
  namaMengetahui: string;
  nipMengetahui: string;
}

const detailKegiatan = [
  'Koordinasi awal pelaksanaan program antara Polibatam dan mitra kerja sama.',
  'Pelaksanaan kegiatan inti sesuai jadwal, target, dan ruang lingkup yang telah disepakati.',
  'Monitoring, evaluasi, dan penyusunan dokumentasi kegiatan untuk bahan laporan.',
];

const detailRuangLingkup = [
  'Penyelenggaraan program pelatihan Bahasa Mandarin dan keterampilan vokasi (Garuda Talent Program) secara online bagi mahasiswa.',
  'Seleksi, penempatan, serta pengelompokan mahasiswa peserta program oleh Polibatam dan mitra.',
  'Pelaksanaan kegiatan pembelajaran, monitoring kehadiran, serta evaluasi program oleh pengajar dari mitra.',
  'Fasilitasi sertifikasi (HSK) dan dukungan rekomendasi kerja bagi peserta setelah program.',
];

const capaianKinerjaAwal = [
  'Kegiatan terlaksana sesuai rencana kerja dan jadwal pelaksanaan.',
  'Dokumentasi, daftar hadir, dan bukti pendukung kegiatan tersedia dengan baik.',
  'Tersusun bahan evaluasi serta tindak lanjut untuk periode kerja sama berikutnya.',
];

const hasilPelaksanaan = [
  'Dokumentasi pelaksanaan program.',
  'Sertifikat program (joint certificate) bagi peserta yang memenuhi syarat (kehadiran dan HSK).',
  'Rekomendasi peluang kerja ke perusahaan mitra (khususnya perusahaan investasi Tiongkok), meskipun tidak bersifat jaminan.',
];

export default function LaporanKegiatanTemplateModal({ isOpen, onClose, data }: LaporanKegiatanTemplateModalProps) {
  const [judulKerjasama, setJudulKerjasama] = useState('');
  const [referensiKerjasama, setReferensiKerjasama] = useState('');
  const [mitraKerjasama, setMitraKerjasama] = useState('');
  const [kegiatanPelaksanaanText, setKegiatanPelaksanaanText] = useState('');
  const [capaianKinerjaText, setCapaianKinerjaText] = useState('');
  const [ruangLingkupText, setRuangLingkupText] = useState('');
  const [hasilPelaksanaanText, setHasilPelaksanaanText] = useState('');
  const [tautanDokumentasi, setTautanDokumentasi] = useState('');
  const [uploadLaporan, setUploadLaporan] = useState<UploadedTemplateFile | null>(null);
  const [namaPenanggungJawab, setNamaPenanggungJawab] = useState('');
  const [nipPenanggungJawab, setNipPenanggungJawab] = useState('');
  const [jabatanMengetahui, setJabatanMengetahui] = useState('');
  const [namaMengetahui, setNamaMengetahui] = useState('');
  const [nipMengetahui, setNipMengetahui] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedKeyRef = useRef<string | null>(null);

  function isInlinePreviewSupported(fileType?: string) {
    if (!fileType) {
      return false;
    }

    return fileType.startsWith('image/') || fileType === 'application/pdf';
  }

  function getStorageKey(currentData: NonNullable<LaporanKegiatanTemplateModalProps['data']>) {
    return `laporan-kegiatan-template-${currentData.noDokumen}-${currentData.jenis}`;
  }

  function buildDefaultState(currentData: NonNullable<LaporanKegiatanTemplateModalProps['data']>): TemplateFormState {
    const defaultJudul = `Program ${currentData.ruangLingkup[0] || 'Kerja Sama'} dengan ${currentData.namaMitra}`;
    const defaultReferensi = `${currentData.noDokumen}/${currentData.jenis}/${new Date().getFullYear()}`;
    const defaultKegiatan = [
      ...detailKegiatan,
      ...currentData.ruangLingkup.map(
        (item, index) => `${index + 1}. Pelaksanaan kegiatan pada bidang ${item} bersama ${currentData.namaMitra}.`
      ),
    ].join('\n');
    const defaultRuangLingkup = [...detailRuangLingkup, `Fokus tambahan: ${currentData.ruangLingkup.join(', ') || '-'}`].join('\n');
    const defaultCapaian = [
      ...capaianKinerjaAwal,
      `Peningkatan kolaborasi pada bidang ${currentData.ruangLingkup.join(', ') || 'kerja sama'}.`,
    ].join('\n');

    return {
      judulKerjasama: defaultJudul,
      referensiKerjasama: defaultReferensi,
      mitraKerjasama: currentData.namaMitra,
      kegiatanPelaksanaanText: defaultKegiatan,
      capaianKinerjaText: defaultCapaian,
      ruangLingkupText: defaultRuangLingkup,
      hasilPelaksanaanText: hasilPelaksanaan.join('\n'),
      tautanDokumentasi: 'https://polibatam.ac.id/kerjasama/laporan-kegiatan',
      uploadLaporan: null,
      namaPenanggungJawab: 'Siti Noor Chayati',
      nipPenanggungJawab: '199203192022032006',
      jabatanMengetahui: 'Wakil Direktur Bidang Kemahasiswaan, Alumni dan Kerja Sama',
      namaMengetahui: 'Dr. Muhammad Zaenuddin',
      nipMengetahui: '197602142014041008',
    };
  }

  function applyState(next: TemplateFormState) {
    setJudulKerjasama(next.judulKerjasama);
    setReferensiKerjasama(next.referensiKerjasama);
    setMitraKerjasama(next.mitraKerjasama);
    setKegiatanPelaksanaanText(next.kegiatanPelaksanaanText);
    setCapaianKinerjaText(next.capaianKinerjaText);
    setRuangLingkupText(next.ruangLingkupText);
    setHasilPelaksanaanText(next.hasilPelaksanaanText);
    setTautanDokumentasi(next.tautanDokumentasi);
    setUploadLaporan(next.uploadLaporan ?? null);
    setNamaPenanggungJawab(next.namaPenanggungJawab);
    setNipPenanggungJawab(next.nipPenanggungJawab);
    setJabatanMengetahui(next.jabatanMengetahui);
    setNamaMengetahui(next.namaMengetahui);
    setNipMengetahui(next.nipMengetahui);
  }

  useEffect(() => {
    if (!isOpen || !data) {
      return;
    }

    const key = getStorageKey(data);

    // Guard against parent re-renders that pass a new object identity for the same modal data.
    if (initializedKeyRef.current === key) {
      return;
    }

    const defaultState = buildDefaultState(data);
    const saved = localStorage.getItem(key);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as TemplateFormState;
        applyState({ ...defaultState, ...parsed });
      } catch {
        applyState(defaultState);
      }
    } else {
      applyState(defaultState);
    }

    initializedKeyRef.current = key;
  }, [isOpen, data]);

  useEffect(() => {
    if (!isOpen) {
      initializedKeyRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrl) {
        URL.revokeObjectURL(uploadedPreviewUrl);
      }
    };
  }, [uploadedPreviewUrl]);

  function getCurrentState(): TemplateFormState {
    return {
      judulKerjasama,
      referensiKerjasama,
      mitraKerjasama,
      kegiatanPelaksanaanText,
      capaianKinerjaText,
      ruangLingkupText,
      hasilPelaksanaanText,
      tautanDokumentasi,
      uploadLaporan,
      namaPenanggungJawab,
      nipPenanggungJawab,
      jabatanMengetahui,
      namaMengetahui,
      nipMengetahui,
    };
  }

  function handleSave() {
    if (!data) return;

    localStorage.setItem(getStorageKey(data), JSON.stringify(getCurrentState()));
    setSaveMessage('Laporan pelaksanaan berhasil disimpan.');
    window.setTimeout(() => setSaveMessage(''), 2200);
  }

  function formatFileSize(size: number) {
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function handleUploadLaporan(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateSelectedFile(file, {
      accept: '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',
      maxSizeBytes: 10 * 1024 * 1024,
    });

    if (validationError) {
      alert(validationError);
      event.target.value = '';
      return;
    }

    const processedFile = await compressImageFileIfNeeded(file, {
      maxDimension: 1920,
      quality: 0.8,
      minBytesToCompress: 400 * 1024,
    });

    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(processedFile);
    setUploadedPreviewUrl(nextPreviewUrl);

    setUploadLaporan({
      nama: processedFile.name,
      ukuran: formatFileSize(processedFile.size),
      uploadedAt: new Date().toLocaleString('id-ID'),
      tipe: processedFile.type,
    });

    const isCompressed = processedFile.size < file.size;
    setSaveMessage(
      isCompressed
        ? 'File gambar dikompres sebelum disimpan. Klik Simpan untuk menyimpan data.'
        : 'File laporan dipilih. Klik Simpan untuk menyimpan data.'
    );
    window.setTimeout(() => setSaveMessage(''), 2200);
  }

  function handleRemoveUpload() {
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
      setUploadedPreviewUrl(null);
    }

    setUploadLaporan(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleOpenUploadedFile() {
    if (!uploadedPreviewUrl) {
      setSaveMessage('File belum tersedia untuk dibuka. Upload ulang file terlebih dahulu.');
      window.setTimeout(() => setSaveMessage(''), 2200);
      return;
    }

    window.open(uploadedPreviewUrl, '_blank', 'noopener,noreferrer');
  }

  function escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatMultiline(value: string) {
    return escapeHtml(value).replaceAll('\n', '<br />');
  }

  async function loadImageAsDataUrl(imagePath: string) {
    const response = await fetch(imagePath);
    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Gagal membaca file logo'));
      reader.readAsDataURL(blob);
    });
  }

  async function handleDownloadWord() {
    if (!data) return;

    const infoUpload = uploadLaporan
      ? `${uploadLaporan.nama} (${uploadLaporan.ukuran}) - ${uploadLaporan.uploadedAt}`
      : '-';

    let polibatamLogoSrc = '';
    try {
      polibatamLogoSrc = await loadImageAsDataUrl('/polibatam_logo.png');
    } catch {
      polibatamLogoSrc = '';
    }

    const polibatamLogoHtml = polibatamLogoSrc
      ? `<img src="${polibatamLogoSrc}" alt="Logo Polibatam" style="max-height:56px; width:auto; object-fit:contain;" />`
      : `<div style="font-size:18px; font-weight:800; color:#1A4EA1;">POLIBATAM</div>`;

    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
        <head>
          <meta charset='utf-8' />
          <title>Laporan Pelaksanaan Kerja Sama</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; }
            table { border-collapse: collapse; width: 100%; }
            td { border: 1px solid #888; padding: 6px; vertical-align: top; }
            .title { text-align: center; font-weight: 700; margin: 10px 0; }
            .label { width: 220px; font-weight: 700; }
            .no { width: 30px; text-align: center; }
            .header { display:flex; justify-content:space-between; align-items:center; border:1px solid #cbd5e1; padding:10px 14px; background:#f8fbff; margin-bottom:10px; }
            .mitra-wrap { display:flex; align-items:center; gap:10px; }
            .mitra-box { width:56px; height:56px; border:1px dashed #94a3b8; text-align:center; line-height:56px; font-size:10px; font-weight:700; color:#475569; background:#fff; }
            .mitra-name { font-weight:700; color:#1F429A; }
            .mitra-note { font-size:10px; color:#64748b; }
          </style>
        </head>
        <body>
          <div class='header'>
            <div class='mitra-wrap'>
              <div class='mitra-box'>LOGO MITRA</div>
              <div>
                <div class='mitra-name'>${escapeHtml(data.namaMitra)}</div>
                <div class='mitra-note'>Area logo mitra kerja sama</div>
              </div>
            </div>
            <div>${polibatamLogoHtml}</div>
          </div>

          <div class='title'>LAPORAN PELAKSANAAN KERJA SAMA</div>
          <table>
            <tr><td class='no'>1</td><td class='label'>JUDUL KERJASAMA</td><td>${escapeHtml(judulKerjasama)}</td></tr>
            <tr><td class='no'>2</td><td class='label'>REFERENSI KERJA SAMA (MOA/IA)</td><td>${escapeHtml(referensiKerjasama)}</td></tr>
            <tr><td class='no'>3</td><td class='label'>MITRA KERJA SAMA</td><td>${escapeHtml(mitraKerjasama)}</td></tr>
            <tr><td class='no'>4</td><td class='label'>KEGIATAN YANG DILAKSANAKAN</td><td>${formatMultiline(kegiatanPelaksanaanText)}</td></tr>
            <tr><td class='no'>5</td><td class='label'>CAPAIAN KINERJA</td><td>${formatMultiline(capaianKinerjaText)}</td></tr>
            <tr><td class='no'>6</td><td class='label'>RUANG LINGKUP</td><td>${formatMultiline(ruangLingkupText)}</td></tr>
            <tr><td class='no'>7</td><td class='label'>HASIL PELAKSANAAN (OUTPUT & OUTCOME)</td><td>${formatMultiline(hasilPelaksanaanText)}</td></tr>
            <tr><td class='no'>8</td><td class='label'>TAUTAN/LINK DOKUMENTASI KEGIATAN DAN LAPORAN KEGIATAN</td><td>${escapeHtml(tautanDokumentasi)}</td></tr>
            <tr><td class='no'>9</td><td class='label'>FILE LAPORAN TERLAMPIR</td><td>${escapeHtml(infoUpload)}</td></tr>
          </table>
          <br />
          <table>
            <tr>
              <td style='width:50%'>
                <strong>PENANGGUNG JAWAB KEGIATAN</strong><br /><br /><br />
                <strong>${escapeHtml(namaPenanggungJawab)}</strong><br />
                NIP. ${escapeHtml(nipPenanggungJawab)}
              </td>
              <td style='width:50%'>
                <strong>Mengetahui</strong><br />
                <strong>${escapeHtml(jabatanMengetahui)}</strong><br /><br />
                <strong>${escapeHtml(namaMengetahui)}</strong><br />
                NIP. ${escapeHtml(nipMengetahui)}
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.open();
      previewWindow.document.write(docHtml);
      previewWindow.document.close();
    }

    const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Template_Laporan_Pelaksanaan_${data.noDokumen}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSaveMessage('Template berhasil diunduh dan preview langsung dibuka.');
    window.setTimeout(() => setSaveMessage(''), 2500);
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  if (!isOpen || !data) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 px-3 py-6">
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
          <h2 className="text-base font-bold text-[#1E376C]">Upload Laporan Pelaksanaan Kerjasama</h2>
          <div className="flex items-center gap-2">
            {saveMessage && <p className="text-xs font-semibold text-green-600">{saveMessage}</p>}
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Save size={13} />
              Simpan Upload
            </button>
            <button
              type="button"
              onClick={handleDownloadWord}
              className="inline-flex items-center gap-1 rounded-md bg-[#1E376C] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#28478A]"
            >
              <Download size={13} />
              Unduh & Buka
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
              aria-label="Tutup"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Alurnya sekarang: unduh template, isi di luar sistem, lalu upload kembali file laporan yang sudah selesai.
          </div>

          <div className="overflow-hidden rounded-lg border-2 border-[#2A3DA8]">
            <div className="grid grid-cols-2 items-center border-b border-gray-300 bg-[#F9FAFF] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center text-[10px] font-bold text-slate-600">
                  LOGO MITRA
                </div>
                <div>
                  <p className="text-sm font-black tracking-wide text-[#1F429A]">{data.namaMitra}</p>
                  <p className="text-xs text-slate-500">Area logo mitra kerja sama</p>
                </div>
              </div>
              <div className="flex justify-end">
                <img src="/logo-polibatam.png" alt="Logo Polibatam" className="h-14 w-auto object-contain" />
              </div>
            </div>

            <div className="border-b border-gray-300 px-3 py-2 text-center">
              <p className="text-sm font-black tracking-wide text-gray-900">LAPORAN PELAKSANAAN KERJA SAMA</p>
            </div>

            <div className="p-4">
              <table className="w-full border-collapse text-[13px] text-gray-900">
                <tbody>
                  <TemplateRow no="1" label="JUDUL KERJASAMA" value={<span>{judulKerjasama}</span>} />
                  <TemplateRow no="2" label="REFERENSI KERJA SAMA (MOA/IA)" value={<span>{referensiKerjasama}</span>} />
                  <TemplateRow no="3" label="MITRA KERJA SAMA" value={<span>{mitraKerjasama}</span>} />
                </tbody>
              </table>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-[#1E376C]">Langkah 1</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Unduh Template</p>
                  <p className="mt-1 text-xs text-gray-600">Unduh format laporan pelaksanaan untuk diisi di luar sistem.</p>
                  <button
                    type="button"
                    onClick={handleDownloadWord}
                    className="mt-3 inline-flex items-center gap-1 rounded-md bg-[#1E376C] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#28478A]"
                  >
                    <Download size={14} />
                    Unduh & Buka Template
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-[#1E376C]">Langkah 2</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Lengkapi Laporan</p>
                  <p className="mt-1 text-xs text-gray-600">Isi bagian kegiatan, capaian kinerja, dokumentasi, dan tanda tangan pada template yang sudah diunduh.</p>
                  <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    Template memuat kegiatan, capaian kinerja, dan hasil pelaksanaan secara otomatis.
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-[#1E376C]">Langkah 3</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Upload Hasil</p>
                  <p className="mt-1 text-xs text-gray-600">Setelah selesai diisi, upload file laporan final pada area di bawah.</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">Preview Kegiatan</p>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-gray-600">{kegiatanPelaksanaanText}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-gray-900">Preview Capaian Kinerja</p>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-gray-600">{capaianKinerjaText}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF] text-[#1E376C]">
                      <FileText size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Upload Laporan Pelaksanaan</p>
                      <p className="mt-1 text-xs text-gray-600">
                        Upload file yang sudah Anda isi setelah mengunduh template.
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Format: PDF, Word, Excel, JPG, PNG | Maksimal ukuran: 10MB
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                      onChange={handleUploadLaporan}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-md bg-[#1E376C] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#28478A]"
                    >
                      <Upload size={14} />
                      Upload File
                    </button>
                    {uploadLaporan && (
                      <button
                        type="button"
                        onClick={handleRemoveUpload}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>

                {uploadLaporan ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                      <p className="font-semibold">File terpilih: {uploadLaporan.nama}</p>
                      <p className="mt-1">Ukuran: {uploadLaporan.ukuran}</p>
                      <p>Tipe file: {uploadLaporan.tipe || '-'}</p>
                      <p>Waktu upload: {uploadLaporan.uploadedAt}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenUploadedFile}
                        className="inline-flex items-center gap-1 rounded-md border border-[#1E376C] px-3 py-2 text-xs font-semibold text-[#1E376C] transition-colors hover:bg-[#EEF2FF]"
                      >
                        <FileText size={14} />
                        Lihat File Upload
                      </button>
                      {!isInlinePreviewSupported(uploadLaporan.tipe) && (
                        <p className="text-[11px] text-gray-500">
                          Preview inline untuk tipe ini tidak didukung browser. File tetap bisa dibuka/diunduh lewat tombol.
                        </p>
                      )}
                    </div>

                    {uploadedPreviewUrl && isInlinePreviewSupported(uploadLaporan.tipe) && (
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        {uploadLaporan.tipe.startsWith('image/') ? (
                          <img
                            src={uploadedPreviewUrl}
                            alt={uploadLaporan.nama}
                            className="max-h-[360px] w-full rounded object-contain"
                          />
                        ) : (
                          <iframe
                            src={uploadedPreviewUrl}
                            title="Preview file laporan"
                            className="h-[420px] w-full rounded"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-500">Belum ada file yang diupload.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateRow({
  no,
  label,
  value,
}: {
  no: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <tr className="align-top">
      <td className="w-8 border-b border-r border-gray-300 px-2 py-2 text-center">{no}</td>
      <td className="w-64 border-b border-r border-gray-300 px-3 py-2 font-semibold">{label}</td>
      <td className="border-b border-gray-300 px-3 py-2">{value}</td>
    </tr>
  );
}