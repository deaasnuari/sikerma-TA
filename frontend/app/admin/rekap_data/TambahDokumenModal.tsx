'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Download, FileText, Upload, X } from 'lucide-react';
import { rekapJurusanOptions, rekapUnitOptions, type DokumenData, type DokumenTerkait } from '@/services/adminRekapDataService';
import { getMasterUnitProdi, getMasterUnitProdiTree, type MasterUnitProdi } from '@/services/masterUnitProdiService';
import { getMasterMitra, type MasterMitra } from '@/services/masterMitraService';
import { getMasterRuangLingkup, type MasterRuangLingkup } from '@/services/masterRuangLingkupService';
import { getMasterNegara } from '@/services/masterNegaraService';
import { validateSelectedFile } from '@/lib/fileUploadUtils';

const defaultNegaraOptions = [
  'Indonesia',
  'Malaysia',
  'Singapura',
  'Amerika Serikat',
  'Jepang',
  'Korea Selatan',
  'Australia',
  'Jerman',
  'Belanda',
  'Inggris',
  'Tiongkok',
  'Taiwan',
  'Prancis',
  'Filipina',
  'Vietnam',
  'Palestina',
];

interface TambahDokumenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: DokumenData) => void;
  initialData?: DokumenData | null;
  title?: string;
  submitLabel?: string;
}

const jenisOptions = ['Pilih Jenis', 'MoU', 'MoA', 'IA', 'Lainnya'];
const kategoriOptions = ['Pilih Kategori', 'Pemerintahan', 'Perguruan Tinggi', 'Swasta/Dunia Usaha dan Dunia Industri (DUDI)', 'Sekolah/Institusi Pendidikan Lain', 'Organisasi Non-Profit / LSM', 'Lainnya'];
const bidangUsahaOptions = [
  'Pilih Bidang Usaha',
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
];
const tingkatPerusahaanOptions = ['Pilih Tingkat Perusahaan', 'Lokal', 'Nasional', 'Internasional', 'Multinasional'];
const statusOptions = ['Pilih Status', 'Aktif', 'Akan Berakhir', 'Kadaluarsa'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type TemplateKey = 'MoU' | 'MoA' | 'IA';

type TemplateDokumenConfig = {
  title: string;
  subtitle: string;
  struktur: string[];
  note: string;
  fileName: string;
  downloadUrl: string;
};

const defaultTemplateDokumenMap: Record<TemplateKey, TemplateDokumenConfig> = {
  MoU: {
    title: 'Memorandum of Understanding (MoU)',
    subtitle: 'Template untuk kesepahaman awal kerjasama',
    struktur: ['Pembukaan', 'Para Pihak', 'Latar Belakang', 'Tujuan Kerjasama', 'Ruang Lingkup', 'Jangka Waktu', 'Penutup'],
    note: 'Template bersifat opsional. Kamu bisa langsung upload dokumen PDF tanpa download template.',
    fileName: 'Draft MOU Industri.docx',
    downloadUrl: '/templates/Draft%20MOU%20Industri.docx',
  },
  MoA: {
    title: 'Memorandum of Agreement (MoA)',
    subtitle: 'Template untuk perjanjian teknis pelaksanaan kerjasama',
    struktur: ['Pembukaan', 'Dasar Pelaksanaan', 'Hak dan Kewajiban', 'Program Magang', 'Pendanaan', 'Monitoring dan Evaluasi', 'Penutup'],
    note: 'Template bersifat opsional. Kamu bisa langsung upload dokumen PDF tanpa download template.',
    fileName: 'Draft MOA Magang.docx',
    downloadUrl: '/templates/Draft%20MOA%20Magang.docx',
  },
  IA: {
    title: 'Implementation Arrangement (IA)',
    subtitle: 'Template untuk rincian implementasi program/kegiatan',
    struktur: ['Informasi Program', 'Target dan Indikator', 'Peran Tim Pelaksana', 'Timeline', 'Output', 'Pelaporan', 'Penutup'],
    note: 'Template bersifat opsional. Kamu bisa langsung upload dokumen PDF tanpa download template.',
    fileName: 'DRAFT IA POLIBATAM.docx',
    downloadUrl: '/templates/DRAFT%20IA%20POLIBATAM.docx',
  },
};

const emptyFormData: DokumenData = {
  nomorDokumen: '',
  jenisDokumen: '',
  namaPIC: '',
  kategoriMitra: '',
  bidangUsaha: '',
  tingkatPerusahaan: '',
  namaMitra: '',
  status: '',
  jabatanMitra: '',
  emailMitra: '',
  tanggalMulai: '',
  tanggalBerakhir: '',
  alamatMitra: '',
  whatsappMitra: '',
  negara: 'Indonesia',
  asalKategori: 'Jurusan',
  unitKerja: '',
  prodiId: null,
  ruangLingkup: [],
  ruangLingkupIds: [],
  judulKegiatan: '',
  manfaatKerjasama: '',
  luaranKerjaSama: '',
  keterangan: '',
};

export default function TambahDokumenModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  title = '+ Tambah Dokumen Baru',
  submitLabel = 'Tambah Dokumen',
}: TambahDokumenModalProps) {
  const [formData, setFormData] = useState<DokumenData>(emptyFormData);
  const [jurusanOptions, setJurusanOptions] = useState<string[]>(rekapJurusanOptions);
  const [unitOptions, setUnitOptions] = useState<string[]>(rekapUnitOptions);
  const [errors, setErrors] = useState<Partial<Record<keyof DokumenData, string>>>({});
  const [uploadErrors, setUploadErrors] = useState<{ fileDokumen?: string; fileDokumenPendukung?: string }>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentMode, setDocumentMode] = useState<'keep' | 'replace'>('replace');
  const [selectedFilePendukung, setSelectedFilePendukung] = useState<File | null>(null);
  const [mitraSuggestions, setMitraSuggestions] = useState<MasterMitra[]>([]);
  const [showMitraSuggestions, setShowMitraSuggestions] = useState(false);

  // Master data & UI state untuk field yang disamakan dengan form "Tambah Pengajuan Baru":
  // Negara Mitra, Ruang Lingkup (multi-select), dan Prodi (drill-down di bawah Jurusan).
  const [negaraOptions, setNegaraOptions] = useState<string[]>(defaultNegaraOptions);
  const [masterRuangLingkupRows, setMasterRuangLingkupRows] = useState<MasterRuangLingkup[]>([]);
  const [rlOpen, setRlOpen] = useState(false);
  const [rlSearch, setRlSearch] = useState('');
  const [masterUnitProdiTree, setMasterUnitProdiTree] = useState<MasterUnitProdi[]>([]);
  const [selectedJurusanId, setSelectedJurusanId] = useState<number | null>(null);

  const isEditMode = initialData !== null;
  const existingDokumen: DokumenTerkait[] = formData.dokumenTerkait ?? [];
  const hasExistingDokumen = isEditMode && existingDokumen.length > 0;
  const existingDokumenPendukung: DokumenTerkait[] = formData.dokumenPendukung ?? [];
  const selectedRuangLingkup = formData.ruangLingkup ?? [];
  // Dokumen Pendukung (TOR/KAK/Proposal) wajib untuk jenis MoA/IA — sama seperti form Pengajuan.
  const requiresDokumenPendukung = formData.jenisDokumen === 'MoA' || formData.jenisDokumen === 'IA';

  const pilihanUnit = useMemo(
    () => (formData.asalKategori === 'Jurusan' ? ['Pilih Jurusan', ...jurusanOptions] : ['Pilih Unit', ...unitOptions]),
    [formData.asalKategori, jurusanOptions, unitOptions]
  );
  const selectedTemplate = formData.jenisDokumen && formData.jenisDokumen in defaultTemplateDokumenMap
    ? defaultTemplateDokumenMap[formData.jenisDokumen as TemplateKey]
    : null;

  const hiddenJurusanAliases = new Set(['EL', 'TM', 'MB']);
  const allJurusanRows = masterUnitProdiTree.filter(
    (item) =>
      item.jenis_node === 'unit' &&
      item.kategori_unit === 'jurusan' &&
      item.aktif &&
      !hiddenJurusanAliases.has(item.nama.trim().toUpperCase()),
  );
  const selectedJurusanNode = allJurusanRows.find((item) => item.id === selectedJurusanId) ?? null;
  const prodiOptionsForJurusan = (selectedJurusanNode?.children ?? []).filter((child) => child.jenis_node === 'prodi' && child.aktif);
  const masterRuangLingkupOpts = Array.from(new Set(masterRuangLingkupRows.map((item) => item.nama_ruang_lingkup)));
  const filteredRlOptions = masterRuangLingkupOpts.filter((opt) => opt.toLowerCase().includes(rlSearch.trim().toLowerCase()));

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFormData(initialData ?? emptyFormData);
    setErrors({});
    setUploadErrors({});
    setSelectedFile(null);
    setSelectedFilePendukung(null);
    setDocumentMode(initialData?.dokumenTerkait?.length ? 'keep' : 'replace');
    setSelectedJurusanId(null);
    setRlSearch('');
  }, [initialData, isOpen]);

  // Kalau edit mode dan dokumennya nyangkut ke Prodi, cari Jurusan induknya di tree supaya
  // dropdown Jurusan → Prodi ke-prefill dengan benar (bukan cuma kosong).
  useEffect(() => {
    if (!isOpen || !initialData?.prodiId || masterUnitProdiTree.length === 0) {
      return;
    }

    const parent = masterUnitProdiTree.find(
      (item) =>
        item.jenis_node === 'unit' &&
        item.kategori_unit === 'jurusan' &&
        (item.children ?? []).some((child) => child.id === initialData.prodiId)
    );

    if (parent) {
      setSelectedJurusanId(parent.id);
    }
  }, [isOpen, initialData, masterUnitProdiTree]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;

    async function loadMasterOptions() {
      try {
        const [jurusanRows, unitRows, tree, ruangLingkupRows, negaraRows] = await Promise.all([
          getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'jurusan', aktif: true }),
          getMasterUnitProdi({ jenis_node: 'unit', kategori_unit: 'unit_kerja', aktif: true }),
          getMasterUnitProdiTree(),
          getMasterRuangLingkup({ aktif: true }),
          getMasterNegara({ aktif: true }),
        ]);

        if (!isMounted) {
          return;
        }

        const nextJurusan = Array.from(new Set(jurusanRows.map((item) => item.nama).filter(Boolean)));
        const nextUnit = Array.from(new Set(unitRows.map((item) => item.nama).filter(Boolean)));

        if (nextJurusan.length > 0) {
          setJurusanOptions(nextJurusan);
        }
        if (nextUnit.length > 0) {
          setUnitOptions(nextUnit);
        }
        setMasterUnitProdiTree(tree);
        setMasterRuangLingkupRows(ruangLingkupRows);
        if (negaraRows.length > 0) {
          setNegaraOptions(Array.from(new Set([...defaultNegaraOptions, ...negaraRows.map((n) => n.nama_negara)])));
        }
      } catch {
        // fallback tetap gunakan opsi service lokal.
      }
    }

    loadMasterOptions();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const query = formData.namaMitra.trim();
    if (query.length < 2) {
      setMitraSuggestions([]);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const results = await getMasterMitra({ search: query });
        if (active) {
          setMitraSuggestions(results.slice(0, 8));
        }
      } catch {
        if (active) {
          setMitraSuggestions([]);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [formData.namaMitra, isOpen]);

  if (!isOpen) {
    return null;
  }

  const readFileAsDataUrl = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}.`));
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Partial<Record<keyof DokumenData, string>> = {};
    if (!formData.jenisDokumen || formData.jenisDokumen === 'Pilih Jenis') newErrors.jenisDokumen = 'Jenis dokumen wajib dipilih';
    if (!formData.namaMitra.trim()) newErrors.namaMitra = 'Nama mitra wajib diisi';
    if (!isEditMode && !formData.namaPIC.trim()) newErrors.namaPIC = 'Nama PIC wajib diisi';
    if (!isEditMode && (!formData.kategoriMitra || formData.kategoriMitra === 'Pilih Kategori')) newErrors.kategoriMitra = 'Kategori mitra wajib dipilih';
    if (!formData.unitKerja || formData.unitKerja === 'Pilih Jurusan' || formData.unitKerja === 'Pilih Unit') newErrors.unitKerja = `${formData.asalKategori} wajib dipilih`;
    // Sama seperti form Pengajuan: kalau asal dari Jurusan, Prodi di bawahnya wajib dipilih juga.
    if (formData.asalKategori === 'Jurusan' && selectedJurusanNode && prodiOptionsForJurusan.length > 0 && !formData.prodiId) {
      newErrors.unitKerja = 'Prodi wajib dipilih';
    }
    if (!formData.status || formData.status === 'Pilih Status') newErrors.status = 'Status wajib dipilih';
    if (!formData.tanggalMulai) newErrors.tanggalMulai = 'Tanggal mulai wajib diisi';
    if (!formData.tanggalBerakhir) newErrors.tanggalBerakhir = 'Tanggal berakhir wajib diisi';
    if (!isEditMode && !formData.alamatMitra.trim()) newErrors.alamatMitra = 'Alamat mitra wajib diisi';

    const nextUploadErrors: { fileDokumen?: string; fileDokumenPendukung?: string } = {};
    const needNewFile = !hasExistingDokumen || documentMode === 'replace';
    if (needNewFile && formData.jenisDokumen && !selectedFile) {
      nextUploadErrors.fileDokumen = 'Upload dokumen wajib diisi';
    }
    // Dokumen Pendukung (TOR/KAK/Proposal) wajib untuk jenis MoA/IA — sama seperti form Pengajuan.
    if (requiresDokumenPendukung && existingDokumenPendukung.length === 0 && !selectedFilePendukung) {
      nextUploadErrors.fileDokumenPendukung = 'Dokumen pendukung (TOR, KAK, atau Proposal/Laporan Kegiatan) wajib diunggah untuk jenis dokumen MoA atau IA.';
    }

    if (Object.keys(newErrors).length > 0 || Object.keys(nextUploadErrors).length > 0) {
      setErrors(newErrors);
      setUploadErrors(nextUploadErrors);
      return;
    }

    setErrors({});
    setUploadErrors({});

    // In edit mode, keep existing nomor dokumen
    let nomorDokumen = formData.nomorDokumen;
    if (!isEditMode) {
      let allData = [];
      try {
        allData = JSON.parse(window.localStorage.getItem('adminRekapDokumenData') || '[]');
      } catch {}
      const lastId = allData.length > 0 ? Math.max(...allData.map((d: any) => d.id ?? 0)) : 0;
      const nextId = lastId + 1;

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { generateNoDokumen } = require('@/services/adminMonitoringService');
        nomorDokumen = generateNoDokumen({
          urutan: nextId,
          jenis: formData.jenisDokumen,
          tanggal: formData.tanggalMulai,
          unitName: formData.unitKerja,
        });
      } catch {
        nomorDokumen = nextId.toString().padStart(2, '0');
      }
    }

    let dokumenTerkait = formData.dokumenTerkait;
    if (selectedFile && (documentMode === 'replace' || !hasExistingDokumen)) {
      const dataUrl = await readFileAsDataUrl(selectedFile);
      dokumenTerkait = [{
        nama: selectedFile.name,
        url: dataUrl,
        ukuran: `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`,
        tanggal: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      }];
    } else if (isEditMode && documentMode === 'keep') {
      dokumenTerkait = existingDokumen;
    }

    let dokumenPendukung = formData.dokumenPendukung;
    if (selectedFilePendukung) {
      const dataUrl = await readFileAsDataUrl(selectedFilePendukung);
      dokumenPendukung = [{
        nama: selectedFilePendukung.name,
        url: dataUrl,
        ukuran: `${(selectedFilePendukung.size / (1024 * 1024)).toFixed(2)} MB`,
        tanggal: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      }];
    } else if (isEditMode) {
      dokumenPendukung = existingDokumenPendukung;
    }

    if (onSubmit) {
      onSubmit({
        ...formData,
        nomorDokumen,
        dokumenTerkait,
        dokumenPendukung,
        prodiId: formData.asalKategori === 'Jurusan' ? formData.prodiId : null,
      });
    }
    setFormData(emptyFormData);
    setSelectedFile(null);
    setSelectedFilePendukung(null);
    onClose();
  };

  const handleInputChange = (field: keyof DokumenData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    if (field === 'jenisDokumen') {
      setSelectedFile(null);
      setSelectedFilePendukung(null);
      setUploadErrors({});
    }
  };

  const toggleRuangLingkup = (opt: string) => {
    setFormData((prev) => {
      const current = prev.ruangLingkup ?? [];
      const nextNames = current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
      const nextIds = nextNames
        .map((name) => masterRuangLingkupRows.find((r) => r.nama_ruang_lingkup === name)?.id)
        .filter((id): id is number => typeof id === 'number');
      return { ...prev, ruangLingkup: nextNames, ruangLingkupIds: nextIds };
    });
  };

  const handleDownloadTemplate = () => {
    if (!selectedTemplate) {
      return;
    }

    const link = document.createElement('a');
    link.href = selectedTemplate.downloadUrl;
    link.download = selectedTemplate.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      setUploadErrors((prev) => ({ ...prev, fileDokumen: undefined }));
      return;
    }

    const validationError = validateSelectedFile(file, {
      maxSizeBytes: MAX_FILE_SIZE,
      accept: ['.pdf'],
    });

    if (validationError) {
      setSelectedFile(null);
      setUploadErrors((prev) => ({ ...prev, fileDokumen: validationError }));
      return;
    }

    setSelectedFile(file);
    setUploadErrors((prev) => ({ ...prev, fileDokumen: undefined }));
  };

  const handleFileChangePendukung = (file: File | null) => {
    if (!file) {
      setSelectedFilePendukung(null);
      setUploadErrors((prev) => ({ ...prev, fileDokumenPendukung: undefined }));
      return;
    }

    const validationError = validateSelectedFile(file, {
      maxSizeBytes: MAX_FILE_SIZE,
      accept: ['.pdf', '.doc', '.docx'],
    });

    if (validationError) {
      setSelectedFilePendukung(null);
      setUploadErrors((prev) => ({ ...prev, fileDokumenPendukung: validationError }));
      return;
    }

    setSelectedFilePendukung(file);
    setUploadErrors((prev) => ({ ...prev, fileDokumenPendukung: undefined }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/35 px-2 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-8">
      <div className="relative max-h-[96vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[24px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-bold text-[#1E376C] sm:text-[20px]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Tutup modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:gap-y-5 md:grid-cols-2">
            <Field label={isEditMode ? 'Nomor Dokumen (dapat diubah)' : 'Nomor Dokumen'} error={errors.nomorDokumen}>
              <TextInput
                placeholder="Contoh: 001/MoU/2026"
                value={formData.nomorDokumen}
                onChange={(e) => handleInputChange('nomorDokumen', e.target.value)}
                hasError={!!errors.nomorDokumen}
              />
              {isEditMode && (
                <p className="mt-1 text-[11px] text-slate-400">Ubah nomor dokumen jika diperlukan, lalu simpan perubahan.</p>
              )}
            </Field>

            <Field label="Judul Kegiatan Kerja Sama">
              <TextInput
                placeholder="Judul atau nama kegiatan kerja sama"
                value={formData.judulKegiatan || ''}
                onChange={(e) => handleInputChange('judulKegiatan', e.target.value)}
              />
            </Field>

            <Field label="Jenis Dokumen *" error={errors.jenisDokumen}>
              <SelectInput
                options={jenisOptions}
                value={formData.jenisDokumen}
                onChange={(e) => handleInputChange('jenisDokumen', e.target.value)}
                hasError={!!errors.jenisDokumen}
              />
            </Field>

            {formData.jenisDokumen && formData.jenisDokumen !== 'Pilih Jenis' && (
              <div className="space-y-4 rounded-2xl border border-[#D7E0F0] bg-[#F8FAFF] p-3 sm:p-5 md:col-span-2">
                {selectedTemplate ? (
                  <>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 sm:text-xl">Template Dokumen</h3>
                  <p className="mt-1 text-xs text-gray-600 sm:text-sm">Template opsional. Kamu bisa download sebagai referensi atau langsung upload dokumen PDF.</p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[#D7E0F0] bg-white px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E376C] text-xs font-bold text-white">1</span>
                      <p className="text-sm font-semibold text-gray-900">Opsional: Download Template</p>
                    </div>
                    <p className="text-xs text-gray-600">Unduh file sesuai jenis dokumen bila diperlukan.</p>
                  </div>
                  <div className="rounded-xl border border-[#D7E0F0] bg-white px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E376C] text-xs font-bold text-white">2</span>
                      <p className="text-sm font-semibold text-gray-900">Siapkan Dokumen</p>
                    </div>
                    <p className="text-xs text-gray-600">Siapkan dokumen final dalam format PDF.</p>
                  </div>
                  <div className="rounded-xl border border-[#D7E0F0] bg-white px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E376C] text-xs font-bold text-white">3</span>
                      <p className="text-sm font-semibold text-gray-900">Upload PDF</p>
                    </div>
                    <p className="text-xs text-gray-600">Upload dokumen langsung tanpa wajib download template.</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-bold text-[#173B82] sm:text-xl">{selectedTemplate.title}</p>
                      <p className="text-xs text-gray-600 sm:text-sm">{selectedTemplate.subtitle}</p>
                      <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#C9D8F5] bg-[#EEF4FF] px-3 py-1.5">
                        <FileText size={14} className="text-[#173B82]" />
                        <span className="text-xs font-bold text-[#0F2F6B]">{selectedTemplate.fileName}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="btn-primary inline-flex h-10 w-full items-center justify-center gap-2 px-4 text-sm font-semibold shadow-sm sm:h-11 sm:w-auto"
                    >
                      <Download size={16} />
                      Download Template
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-sm font-semibold text-[#173B82]">Isi utama dokumen:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.struktur.map((item) => (
                        <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-gray-700">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-[#173B82]">Catatan: {selectedTemplate.note}</p>
                </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-base font-bold text-slate-800">Dokumen Lainnya</p>
                    <p className="mt-1 text-sm text-slate-600">Gunakan format atau template milik instansi Anda sendiri. Upload dokumen langsung di bawah ini tanpa perlu mengikuti template standar.</p>
                  </div>
                )}

                {/* Dokumen section */}
                <div>
                  <label className="mb-3 block text-base font-semibold leading-none text-gray-900 sm:text-lg">
                    Dokumen Kerjasama {!hasExistingDokumen || documentMode === 'replace' ? '*' : ''}
                  </label>

                  {/* Existing docs (edit mode only) */}
                  {hasExistingDokumen && (
                    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Dokumen tersimpan</p>
                      <div className="space-y-2">
                        {existingDokumen.map((doc, idx) => (
                          <div key={idx} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1E376C]/10">
                              <FileText size={14} className="text-[#1E376C]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-gray-800">{doc.nama}</p>
                              <p className="text-xs text-gray-400">{doc.ukuran} · {doc.tanggal}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Toggle keep / replace */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDocumentMode('keep');
                            setSelectedFile(null);
                            setUploadErrors({});
                          }}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                            documentMode === 'keep'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                          }`}
                        >
                          <CheckCircle2 size={15} />
                          Gunakan Dokumen Lama
                        </button>
                        <button
                          type="button"
                          onClick={() => setDocumentMode('replace')}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                            documentMode === 'replace'
                              ? 'border-[#1E376C] bg-[#EEF3FF] text-[#1E376C]'
                              : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                          }`}
                        >
                          <Upload size={15} />
                          Ganti Dokumen
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Upload area — shown in add mode OR when replacing */}
                  {(!hasExistingDokumen || documentMode === 'replace') && (
                    <>
                      {!hasExistingDokumen && (
                        <p className="mb-2 rounded-lg border border-[#D7E0F0] bg-[#EEF3FF] px-3 py-2 text-xs text-[#1E376C]">
                          Upload dokumen langsung di sini. Download template tidak wajib.
                        </p>
                      )}

                      <label
                        className={`block w-full rounded-2xl border-2 border-dashed p-4 text-center transition-all sm:p-5 ${
                          selectedFile
                            ? 'cursor-pointer border-green-400 bg-green-50 shadow-sm'
                            : 'cursor-pointer border-[#BFD0EE] bg-[#F5F8FF]'
                        }`}
                      >
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                        <Upload className={`mx-auto ${selectedFile ? 'text-green-600' : 'text-[#1E376C]'}`} size={22} />
                        <p className={`mt-2 text-base font-semibold ${selectedFile ? 'text-green-700' : 'text-[#1E376C]'}`}>
                          {selectedFile ? 'Dokumen Berhasil Dipilih' : 'Upload Dokumen PDF'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {selectedFile ? 'File siap dikirim bersama data dokumen.' : 'Upload file PDF dokumen kerjasama di sini'}
                        </p>
                        <span className={`mt-3 inline-flex rounded-lg px-3 py-1 text-xs font-semibold ${selectedFile ? 'bg-green-600 text-white' : 'bg-[#1E376C] text-white'}`}>
                          {selectedFile ? 'Ganti File' : 'Pilih File PDF'}
                        </span>
                        <p className="mt-2 text-[11px] text-gray-500">Format: .pdf</p>
                        <p className="text-[11px] text-gray-500">Ukuran maksimal 10 MB</p>
                        {selectedFile && (
                          <div className="mt-3 space-y-1">
                            <div className="inline-flex items-center rounded-lg border border-green-200 bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700">
                              File dipilih: {selectedFile.name}
                            </div>
                            <p className="text-[11px] text-green-700">Ukuran file: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                          </div>
                        )}
                      </label>

                      {uploadErrors.fileDokumen && <p className="mt-1 text-xs text-red-500">{uploadErrors.fileDokumen}</p>}
                    </>
                  )}
                </div>

                {/* Dokumen Pendukung — sama seperti section "Dokumen Pendukung" di form Pengajuan,
                    wajib diisi untuk jenis MoA/IA. */}
                {requiresDokumenPendukung && (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        Dokumen Pendukung <span className="text-rose-500">*</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-amber-700">
                        Jenis dokumen <span className="font-semibold">{formData.jenisDokumen}</span> wajib dilampirkan minimal satu dokumen pendukung: <span className="font-semibold">TOR, KAK, atau Proposal/Laporan Kegiatan</span>.
                      </p>
                    </div>

                    {existingDokumenPendukung.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Dokumen pendukung tersimpan</p>
                        {existingDokumenPendukung.map((doc, idx) => (
                          <div key={idx} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                              <FileText size={14} className="text-amber-700" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-gray-800">{doc.nama}</p>
                              <p className="text-xs text-gray-400">{doc.ukuran} · {doc.tanggal}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {existingDokumenPendukung.length === 0 && !selectedFilePendukung && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-[11px] text-amber-800">
                        <span className="mt-0.5 shrink-0">⚠</span>
                        <span>Belum ada dokumen pendukung yang dilampirkan. Harap unggah TOR, KAK, atau Proposal/Laporan Kegiatan.</span>
                      </div>
                    )}

                    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-amber-300 bg-white p-4 text-center transition hover:border-amber-500 hover:bg-amber-50/50">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => handleFileChangePendukung(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <Upload className={`mx-auto ${selectedFilePendukung ? 'text-green-600' : 'text-amber-600'}`} size={20} />
                      <p className="mt-2 text-sm font-semibold text-slate-800">
                        {existingDokumenPendukung.length > 0 ? 'Ganti Dokumen Pendukung' : 'Upload TOR / KAK / Proposal / Laporan Kegiatan'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">PDF, DOC, atau DOCX — maks. 10 MB</p>
                      {selectedFilePendukung && (
                        <div className="mt-3 inline-flex items-center rounded-lg border border-green-200 bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700">
                          File dipilih: {selectedFilePendukung.name}
                        </div>
                      )}
                    </label>

                    {uploadErrors.fileDokumenPendukung && <p className="mt-1 text-xs text-red-500">{uploadErrors.fileDokumenPendukung}</p>}
                  </div>
                )}
              </div>
            )}

            <Field label={`Nama PIC${!isEditMode ? ' *' : ''}`} error={errors.namaPIC}>
              <TextInput
                placeholder="Nama PIC"
                value={formData.namaPIC}
                onChange={(e) => handleInputChange('namaPIC', e.target.value)}
                hasError={!!errors.namaPIC}
              />
            </Field>

            <Field label={`Kategori Mitra${!isEditMode ? ' *' : ''}`} error={errors.kategoriMitra}>
              <SelectInput
                options={kategoriOptions}
                value={formData.kategoriMitra}
                onChange={(e) => handleInputChange('kategoriMitra', e.target.value)}
                hasError={!!errors.kategoriMitra}
              />
            </Field>

            <Field label="Bidang Usaha">
              <SelectInput
                options={bidangUsahaOptions}
                value={formData.bidangUsaha || ''}
                onChange={(e) => handleInputChange('bidangUsaha', e.target.value === 'Pilih Bidang Usaha' ? '' : e.target.value)}
              />
            </Field>

            <Field label="Tingkat Perusahaan">
              <SelectInput
                options={tingkatPerusahaanOptions}
                value={formData.tingkatPerusahaan || ''}
                onChange={(e) => handleInputChange('tingkatPerusahaan', e.target.value === 'Pilih Tingkat Perusahaan' ? '' : e.target.value)}
              />
            </Field>

            <Field label="Nama Mitra *" error={errors.namaMitra}>
              <div className="relative">
                <TextInput
                  placeholder="Cari atau ketik Nama Perusahaan/Institusi"
                  value={formData.namaMitra}
                  onChange={(e) => {
                    handleInputChange('namaMitra', e.target.value);
                    setFormData((prev) => ({ ...prev, mitraId: undefined, kodePerusahaan: undefined }));
                    setShowMitraSuggestions(true);
                  }}
                  onFocus={() => setShowMitraSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowMitraSuggestions(false), 150)}
                  hasError={!!errors.namaMitra}
                />
                {showMitraSuggestions && mitraSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                    {mitraSuggestions.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            namaMitra: m.nama_mitra,
                            mitraId: m.id,
                            kodePerusahaan: m.kode_mitra || undefined,
                          }));
                          setShowMitraSuggestions(false);
                          setMitraSuggestions([]);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-slate-50"
                      >
                        <span className="truncate">{m.nama_mitra}</span>
                        <span className="ml-2 shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          {m.kode_mitra || 'Belum ada kode'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!formData.mitraId && formData.namaMitra.trim() && (
                <p className="mt-1 text-[11px] text-amber-600">
                  Mitra belum terdaftar di Data Kemitraan. Kode Perusahaan akan terisi otomatis setelah mitra ini terdaftar.
                </p>
              )}
            </Field>

            <Field label="Kode Perusahaan">
              <input
                type="text"
                readOnly
                disabled
                value={formData.kodePerusahaan || (formData.mitraId ? 'Belum ada kode' : 'Otomatis dari Data Kemitraan')}
                className="input-field h-11 w-full cursor-not-allowed bg-slate-100 px-4 text-sm text-gray-500"
              />
            </Field>

            <Field label="Status *" error={errors.status}>
              <SelectInput
                options={statusOptions}
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                hasError={!!errors.status}
              />
            </Field>

            <Field label="Kategori Asal *">
              <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-slate-50 p-2">
                {(['Jurusan', 'Unit'] as const).map((item) => {
                  const isActive = formData.asalKategori === item;

                  return (
                    <label
                      key={item}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive ? 'bg-[#1E376C] text-white shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="asalKategori"
                        value={item}
                        checked={isActive}
                        onChange={() => {
                          handleInputChange('asalKategori', item);
                          handleInputChange('unitKerja', '');
                          setSelectedJurusanId(null);
                          setFormData((prev) => ({ ...prev, prodiId: null }));
                        }}
                        className="sr-only"
                      />
                      {item}
                    </label>
                  );
                })}
              </div>
            </Field>

            {formData.asalKategori === 'Jurusan' ? (
              <div className="space-y-3">
                <Field label="Pilih Jurusan *" error={errors.unitKerja}>
                  <select
                    value={selectedJurusanId ?? ''}
                    onChange={(e) => {
                      const nextId = e.target.value ? Number(e.target.value) : null;
                      setSelectedJurusanId(nextId);
                      setFormData((prev) => ({ ...prev, prodiId: null }));
                      const nextJurusan = allJurusanRows.find((item) => item.id === nextId);
                      handleInputChange('unitKerja', nextJurusan?.nama ?? '');
                    }}
                    className={`input-field h-11 w-full bg-white px-4 text-sm text-gray-700 ${errors.unitKerja ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}`}
                  >
                    <option value="">Pilih jurusan</option>
                    {allJurusanRows.map((item) => (
                      <option key={item.id} value={item.id}>{item.nama}</option>
                    ))}
                  </select>
                </Field>

                {selectedJurusanNode && prodiOptionsForJurusan.length > 0 && (
                  <Field label="Prodi *" error={errors.unitKerja}>
                    <select
                      value={formData.prodiId ?? ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, prodiId: e.target.value ? Number(e.target.value) : null }))}
                      className={`input-field h-11 w-full bg-white px-4 text-sm text-gray-700 ${errors.unitKerja ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}`}
                    >
                      <option value="">Pilih prodi</option>
                      {prodiOptionsForJurusan.map((item) => (
                        <option key={item.id} value={item.id}>{item.nama}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            ) : (
              <Field label="Pilih Unit *" error={errors.unitKerja}>
                <SelectInput
                  options={pilihanUnit}
                  value={formData.unitKerja}
                  onChange={(e) => handleInputChange('unitKerja', e.target.value)}
                  hasError={!!errors.unitKerja}
                />
              </Field>
            )}

            <Field label="Jabatan Mitra">
              <TextInput
                placeholder="jabatan"
                value={formData.jabatanMitra}
                onChange={(e) => handleInputChange('jabatanMitra', e.target.value)}
              />
            </Field>

            <Field label="Email Mitra">
              <TextInput
                placeholder="email@mitra.com"
                type="email"
                value={formData.emailMitra}
                onChange={(e) => handleInputChange('emailMitra', e.target.value)}
              />
            </Field>

            <Field label="Tanggal Mulai *" error={errors.tanggalMulai}>
              <DateInput
                placeholder="mm/dd/yy"
                value={formData.tanggalMulai}
                onChange={(e) => handleInputChange('tanggalMulai', e.target.value)}
                hasError={!!errors.tanggalMulai}
              />
            </Field>

            <Field label="Tanggal Berakhir *" error={errors.tanggalBerakhir}>
              <DateInput
                placeholder="mm/dd/yy"
                value={formData.tanggalBerakhir}
                onChange={(e) => handleInputChange('tanggalBerakhir', e.target.value)}
                hasError={!!errors.tanggalBerakhir}
              />
            </Field>

            <Field label={`Alamat Mitra${!isEditMode ? ' *' : ''}`} error={errors.alamatMitra}>
              <TextInput
                placeholder="Alamat Lengkap Mitra"
                value={formData.alamatMitra}
                onChange={(e) => handleInputChange('alamatMitra', e.target.value)}
                hasError={!!errors.alamatMitra}
              />
            </Field>

            <Field label="Whatsapp Mitra">
              <TextInput
                placeholder="+628 ..."
                type="tel"
                value={formData.whatsappMitra}
                onChange={(e) => handleInputChange('whatsappMitra', e.target.value)}
              />
            </Field>

            <Field label="Negara Mitra">
              <SelectInput
                options={negaraOptions}
                value={formData.negara || 'Indonesia'}
                onChange={(e) => handleInputChange('negara', e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                {formData.negara && formData.negara !== 'Indonesia' ? '🌐 Luar Negeri' : '🇮🇩 Dalam Negeri'}
              </p>
            </Field>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-gray-900">Ruang Lingkup</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setRlOpen((prev) => {
                      const next = !prev;
                      if (!next) setRlSearch('');
                      return next;
                    });
                  }}
                  className="input-field flex min-h-[44px] w-full items-start justify-between gap-2 rounded-lg px-4 py-2 text-sm text-left"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRuangLingkup.length === 0 ? (
                      <span className="text-slate-400">Pilih ruang lingkup kerjasama...</span>
                    ) : (
                      selectedRuangLingkup.map((rl) => (
                        <span key={rl} className="inline-flex items-center gap-1 rounded-full bg-[#1E376C] px-2 py-0.5 text-xs font-semibold text-white">
                          {rl}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRuangLingkup(rl);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleRuangLingkup(rl);
                              }
                            }}
                            className="cursor-pointer hover:opacity-75"
                            aria-label={`Hapus ${rl}`}
                          >
                            <X size={10} />
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                  <ChevronDown size={14} className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${rlOpen ? 'rotate-180' : ''}`} />
                </button>
                {rlOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setRlOpen(false); setRlSearch(''); }} />
                    <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
                      <div className="border-b border-slate-100 p-2">
                        <input
                          type="text"
                          value={rlSearch}
                          onChange={(e) => setRlSearch(e.target.value)}
                          placeholder="Cari ruang lingkup..."
                          className="input-field h-8 w-full rounded-lg px-2 text-xs"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {filteredRlOptions.map((opt) => (
                          <label key={opt} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selectedRuangLingkup.includes(opt)}
                              onChange={() => toggleRuangLingkup(opt)}
                              className="h-4 w-4 accent-[#1E376C]"
                            />
                            <span className="flex-1 text-sm text-slate-800">{opt}</span>
                          </label>
                        ))}
                        {filteredRlOptions.length === 0 && (
                          <p className="px-3 py-2 text-xs text-slate-500">Tidak ada ruang lingkup yang cocok.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-900">Manfaat bagi Polibatam/Prodi</span>
                <textarea
                  value={formData.manfaatKerjasama || ''}
                  onChange={(e) => handleInputChange('manfaatKerjasama', e.target.value)}
                  maxLength={2000}
                  placeholder="Jelaskan manfaat kerja sama"
                  className="input-field min-h-[80px] w-full px-4 py-2 text-sm text-gray-700"
                />
                <p className={`mt-1 text-right text-xs ${(formData.manfaatKerjasama || '').length >= 2000 ? 'text-red-500' : 'text-gray-400'}`}>{(formData.manfaatKerjasama || '').length}/2000</p>
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-900">Luaran Kerja Sama</span>
                <textarea
                  value={formData.luaranKerjaSama || ''}
                  onChange={(e) => handleInputChange('luaranKerjaSama', e.target.value)}
                  maxLength={2000}
                  placeholder="Jelaskan luaran/output yang dihasilkan dari kerja sama ini"
                  className="input-field min-h-[80px] w-full px-4 py-2 text-sm text-gray-700"
                />
                <p className={`mt-1 text-right text-xs ${(formData.luaranKerjaSama || '').length >= 2000 ? 'text-red-500' : 'text-gray-400'}`}>{(formData.luaranKerjaSama || '').length}/2000</p>
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-900">Keterangan</span>
                <textarea
                  value={formData.keterangan || ''}
                  onChange={(e) => handleInputChange('keterangan', e.target.value)}
                  maxLength={2000}
                  placeholder="Catatan tambahan (opsional)"
                  className="input-field min-h-[80px] w-full px-4 py-2 text-sm text-gray-700"
                />
              </label>
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-2 sm:mt-10 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary inline-flex h-11 w-full items-center justify-center px-8 text-sm font-semibold sm:w-auto"
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary inline-flex h-11 w-full items-center justify-center px-8 text-sm font-semibold sm:w-auto"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-gray-900">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </label>
  );
}

function TextInput({ placeholder, type = 'text', value, onChange, onFocus, onBlur, hasError }: { placeholder: string; type?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onFocus?: () => void; onBlur?: () => void; hasError?: boolean }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`input-field h-11 w-full px-4 text-sm text-gray-700 placeholder:text-gray-400 ${hasError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}`}
    />
  );
}

function SelectInput({ options, value, onChange, hasError }: { options: string[]; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; hasError?: boolean }) {
  return (
    <select value={value} onChange={onChange} className={`input-field h-11 w-full bg-white px-4 text-sm text-gray-700 ${hasError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}`}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function DateInput({ placeholder, value, onChange, hasError }: { placeholder: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; hasError?: boolean }) {
  return (
    <input
      type="date"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`input-field h-11 w-full px-4 text-sm text-gray-700 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:text-[#173B82] [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 ${hasError ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}`}
    />
  );
}
