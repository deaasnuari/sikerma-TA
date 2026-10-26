'use client';

import { useRouter } from 'next/navigation';
import { CalendarDays, CheckCircle, ChevronDown, Download, MessageCircle, Paperclip, Pencil, Plus, Upload, X } from 'lucide-react';
import MultiSelectDropdown from '@/components/MultiSelectDropdown';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  pengajuanJurusanOptions,
  submitPengajuanApi,
  type PengajuanFileAttachment,
} from '@/services/adminPengajuanService';
import {
  getMasterUnitProdiTree,
  type MasterUnitProdi,
} from '@/services/masterUnitProdiService';
import {
  getMasterRuangLingkup,
  type MasterRuangLingkup,
} from '@/services/masterRuangLingkupService';
import { getMasterNegara } from '@/services/masterNegaraService';
import { useMasterMitra } from '@/hooks/useMasterData';
import { formatTanggalInisiasi, getInisiasi, type InisiasiItem } from '@/services/inisiasiService';
import { validateSelectedFile } from '@/lib/fileUploadUtils';
import { downloadTemplate, templateFilesByJenis, templateHintByLabel, type TemplateFile } from '@/lib/templateDokumen';

type TemplateDokumenConfig = {
  title: string;
  subtitle: string;
  struktur: string[];
  note: string;
  files: TemplateFile[];
};

const defaultTemplateDokumenMap: Record<string, TemplateDokumenConfig> = {
  MoU: {
    title: 'Memorandum of Understanding (MoU)',
    subtitle: 'Template untuk kesepahaman awal kerja sama',
    struktur: ['Pembukaan', 'Para Pihak', 'Tujuan Kerja Sama', 'Ruang Lingkup', 'Jangka Waktu', 'Penutup'],
    note: 'Template bisa diunduh sebagai acuan. Anda tetap bisa langsung mengunggah dokumen sendiri.',
    files: templateFilesByJenis.MoU,
  },
  MoA: {
    title: 'Memorandum of Agreement (MoA)',
    subtitle: 'Template untuk perjanjian teknis pelaksanaan',
    struktur: ['Dasar Kerja Sama', 'Hak dan Kewajiban', 'Program Pelaksanaan', 'Pendanaan', 'Monitoring', 'Penutup'],
    note: 'Gunakan format MoA resmi agar isi dokumen sesuai standar admin.',
    files: templateFilesByJenis.MoA,
  },
  IA: {
    title: 'Implementation Arrangement (IA)',
    subtitle: 'Template rincian implementasi program',
    struktur: ['Informasi Program', 'Target Kegiatan', 'Peran Tim', 'Timeline', 'Output', 'Pelaporan'],
    note: 'Template IA dipakai untuk detail implementasi kerja sama yang sudah disepakati.',
    files: templateFilesByJenis.IA,
  },
};

const jurusanOptions = pengajuanJurusanOptions;


const normalizeText = (value: string) => value.trim().toLowerCase();

const countryPhoneCodeMap: Record<string, string> = {
  'Indonesia':       '+62',
  'Malaysia':        '+60',
  'Singapura':       '+65',
  'Amerika Serikat': '+1',
  'Jepang':          '+81',
  'Korea Selatan':   '+82',
  'Australia':       '+61',
  'Jerman':          '+49',
  'Belanda':         '+31',
  'Inggris':         '+44',
  'Tiongkok':        '+86',
  'Taiwan':          '+886',
  'Prancis':         '+33',
  'Filipina':        '+63',
  'Vietnam':         '+84',
  'Palestina':       '+970',
};

const JENIS_MITRA_OPTIONS = [
  'Pemerintahan',
  'Perguruan Tinggi',
  'Swasta/Dunia Usaha dan Dunia Industri (DUDI)',
  'Sekolah/Institusi Pendidikan Lain',
  'Organisasi Non-Profit / LSM',
  'Lainnya',
] as const;

const TINGKAT_PERUSAHAAN_OPTIONS = ['Lokal', 'Nasional', 'Internasional', 'Multinasional'] as const;

const BIDANG_USAHA_OPTIONS = [
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
] as const;

const initialForm = {
  namaMitra: '',
  jenisMitra: '',
  bidangUsaha: '',
  tingkatPerusahaan: '',
  teleponMitra: '',
  noTeleponMitra: '',
  emailMitra: '',
  alamatMitra: '',
  negara: 'Indonesia',
  jenisKerjasama: '',
  unitPelaksana: '',
  tanggalMulai: '',
  tanggalBerakhir: '',
  judulKerjasama: '',
  deskripsi: '',
  ruangLingkup: '',
  namaKontak: '',
  jabatanKontak: '',
  emailKontak: '',
  teleponKontak: '',
  // PIC dari pihak Polibatam (pengaju internal), terpisah dari kontak person mitra di atas.
  picPolibatamNama: '',
  picPolibatamJabatan: '',
  picPolibatamEmail: '',
  picPolibatamTelepon: '',
};

// v2: draft v1 bisa berisi data instansi dari Inisiasi (bug lama), jadi dibuang dengan mengganti kunci.
const INTERNAL_PENGAJUAN_DRAFT_KEY = 'internal-pengajuan-draft-v2';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const JENIS_KERJASAMA_OPTIONS = ['MoU', 'MoA', 'IA', 'Lainnya'] as const;

const JENIS_KERJASAMA_LABELS: Record<string, string> = {
  MoU: 'Memorandum of Understanding',
  MoA: 'Memorandum of Agreement',
  IA: 'Implementation Agreement',
  Lainnya: 'Dokumen Lainnya',
};

function parseJenisKerjasamaSelection(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is (typeof JENIS_KERJASAMA_OPTIONS)[number] =>
      JENIS_KERJASAMA_OPTIONS.includes(item as (typeof JENIS_KERJASAMA_OPTIONS)[number])
    );
}

function serializeJenisKerjasamaSelection(values: string[]): string {
  return JENIS_KERJASAMA_OPTIONS.filter((item) => values.includes(item)).join(', ');
}

type InternalPengajuanDraft = {
  asal: 'Jurusan' | 'Unit';
  formData: typeof initialForm;
  selectedRuangLingkup?: string[];
  customJurusanOpts?: string[];
  customUnitOpts?: string[];
  customNegaraOpts?: string[];
};

const HIDDEN_JURUSAN_ALIASES = new Set(['EL', 'TM', 'MB']);

const prodiAktifOf = (jurusan: MasterUnitProdi) =>
  (jurusan.children ?? []).filter((child) => child.jenis_node === 'prodi' && child.aktif);

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type InternalAjukanKerjasamaFormProps = {
  // Pengajuan dibuat admin dari satu Inisiasi (tautan disimpan; nama instansi mengisi kolom mitra).
  inisiasiId?: number | null;
  onCancel?: () => void;
  onSubmitted?: () => void;
  enableAppearanceEdit?: boolean;
  appearanceStorageKey?: string;
  initialData?: Partial<typeof initialForm> & {
    asal?: 'Jurusan' | 'Unit';
    selectedRuangLingkup?: string[];
    selectedJurusanId?: number | null;
    selectedProdiId?: number | null;
    selectedJurusanIds?: number[];
    selectedProdiIds?: number[];
    nomorPengajuan?: string;
  };
  initialFileAttachments?: PengajuanFileAttachment[];
  // Bagian "Kontak Person Polibatam"; dimatikan untuk pengajuan mitra eksternal.
  showKontakPolibatam?: boolean;
  initialMasterUnitProdiTree?: MasterUnitProdi[];
  initialMasterRuangLingkupRows?: MasterRuangLingkup[];
  initialCustomNegaraOptions?: string[];
  disableDraftPersistence?: boolean;
  lockJenisKerjasama?: boolean;
  submitButtonLabel?: string;
  isModal?: boolean;
  onSubmitOverride?: (payload: {
    formData: typeof initialForm;
    asal: 'Jurusan' | 'Unit';
    selectedRuangLingkup: string[];
    dokumen: File[];
    dokumenAttachments: { file: File; dataUrl?: string }[];
    selectedProdiId: number | null;
    selectedProdiIds: number[];
    selectedJurusanIds: number[];
    existingFileAttachments: PengajuanFileAttachment[];
  }) => boolean | void | Promise<boolean | void>;
};

type FormAppearanceSettings = {
  topBadgeText: string;
  pageTitle: string;
  pageSubtitle: string;
  sectionInformasiMitraTitle: string;
  sectionInformasiMitraSubtitle: string;
  sectionDetailKerjasamaTitle: string;
  sectionDetailKerjasamaSubtitle: string;
  sectionKontakTitle: string;
  sectionKontakSubtitle: string;
  sectionDokumenTitle: string;
  sectionDokumenSubtitle: string;
  labelNamaMitra: string;
  labelJenisMitra: string;
  labelTeleponMitra: string;
  labelEmailMitra: string;
  labelAlamatMitra: string;
  labelJenisKerjasama: string;
  labelDari: string;
  labelTanggalMulai: string;
  labelTanggalBerakhir: string;
  labelJudulKerjasama: string;
  labelDeskripsi: string;
  labelRuangLingkup: string;
  labelNamaKontak: string;
  labelJabatanKontak: string;
  labelEmailKontak: string;
  labelTeleponKontak: string;
};

const defaultAppearanceSettings: FormAppearanceSettings = {
  topBadgeText: 'Pengajuan Kerjasama Baru',
  pageTitle: 'Form Pengajuan Kerjasama',
  pageSubtitle: 'Isi formulir untuk mengajukan kerja sama baru dari unit internal.',
  sectionInformasiMitraTitle: 'Informasi Mitra',
  sectionInformasiMitraSubtitle: 'Data lengkap mitra kerja sama',
  sectionDetailKerjasamaTitle: 'Detail Kerjasama',
  sectionDetailKerjasamaSubtitle: 'Informasi dasar kerja sama yang akan diajukan',
  sectionKontakTitle: 'Kontak Person PIC / Koresponden Mitra',
  sectionKontakSubtitle: 'Informasi kontak person dari pihak mitra',
  sectionDokumenTitle: 'Dokumen Pendukung',
  sectionDokumenSubtitle: 'Pilih jenis dokumen, unduh template bila diperlukan, lalu upload berkas pendukung.',
  labelNamaMitra: 'Nama Mitra',
  labelJenisMitra: 'Jenis Mitra',
  labelTeleponMitra: 'WhatsApp Mitra',
  labelEmailMitra: 'Email Mitra',
  labelAlamatMitra: 'Alamat Lengkap',
  labelJenisKerjasama: 'Jenis Kerjasama',
  labelDari: 'Tujuan Kerja Sama',
  labelTanggalMulai: 'Tanggal Mulai',
  labelTanggalBerakhir: 'Tanggal Berakhir',
  labelJudulKerjasama: 'Judul Kerjasama',
  labelDeskripsi: 'Manfaat Kerja Sama',
  labelRuangLingkup: 'Ruang Lingkup',
  labelNamaKontak: 'Nama Lengkap',
  labelJabatanKontak: 'Jabatan',
  labelEmailKontak: 'Email',
  labelTeleponKontak: 'WhatsApp',
};

const DEFAULT_APPEARANCE_STORAGE_KEY = 'internal-pengajuan-appearance-v1';

export default function AdminAjukanKerjasamaForm({
  inisiasiId = null,
  onCancel,
  onSubmitted,
  enableAppearanceEdit = false,
  appearanceStorageKey = DEFAULT_APPEARANCE_STORAGE_KEY,
  initialData,
  initialFileAttachments,
  showKontakPolibatam = true,
  initialMasterUnitProdiTree,
  initialMasterRuangLingkupRows,
  initialCustomNegaraOptions = [],
  disableDraftPersistence = false,
  lockJenisKerjasama = false,
  submitButtonLabel = 'Ajukan Kerjasama',
  isModal = false,
  onSubmitOverride,
}: InternalAjukanKerjasamaFormProps) {
  const router = useRouter();
  const [asal, setAsal] = useState<'Jurusan' | 'Unit'>('Jurusan');
  const [dokumen, setDokumen] = useState<{ file: File; dataUrl?: string }[]>([]);
  const [dokumenPendukung, setDokumenPendukung] = useState<{ file: File; dataUrl?: string }[]>([]);
  const [existingFileAttachments, setExistingFileAttachments] = useState<PengajuanFileAttachment[]>(() => initialFileAttachments ?? []);
  const [dokumenError, setDokumenError] = useState<string | null>(null);
  const [dokumenPendukungError, setDokumenPendukungError] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialForm);
  const [isAppearanceEditMode, setIsAppearanceEditMode] = useState(false);
  const [appearanceSettings, setAppearanceSettings] = useState<FormAppearanceSettings>(defaultAppearanceSettings);
  const [selectedRuangLingkup, setSelectedRuangLingkup] = useState<string[]>([]);
  const [masterRuangLingkupRows, setMasterRuangLingkupRows] = useState<MasterRuangLingkup[]>(initialMasterRuangLingkupRows ?? []);
  const [masterUnitProdiTree, setMasterUnitProdiTree] = useState<MasterUnitProdi[]>(initialMasterUnitProdiTree ?? []);
  const [selectedJurusanIds, setSelectedJurusanIds] = useState<number[]>([]);
  const selectedJenisKerjasama = useMemo(
    () => parseJenisKerjasamaSelection(formData.jenisKerjasama),
    [formData.jenisKerjasama]
  );
  const requiresDokumenPendukung = selectedJenisKerjasama.some((j) => j === 'MoA' || j === 'IA');
  const [selectedProdiIds, setSelectedProdiIds] = useState<number[]>([]);
  const [rlOpen, setRlOpen] = useState(false);
  const [rlSearch, setRlSearch] = useState('');
  const [juOpen, setJuOpen] = useState(false);
  const [customJurusanOpts, setCustomJurusanOpts] = useState<string[]>([]);
  const [customUnitOpts, setCustomUnitOpts] = useState<string[]>([]);
  const [customNegaraOpts, setCustomNegaraOpts] = useState<string[]>(initialCustomNegaraOptions);
  const [jurusanUnitInput, setJurusanUnitInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // State isSubmitting baru berlaku setelah render; ref ini menahan klik ganda yang masuk sebelum itu.
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedInfo, setSubmittedInfo] = useState<{ judul: string; mitra: string; jenis: string } | null>(null);
  const [showDocumentReminderModal, setShowDocumentReminderModal] = useState(false);
  // Lewat SWR: daftar mitra di-cache, jadi membuka form lagi tidak mengunduh ulang semua mitra.
  const { data: masterMitraRows } = useMasterMitra({ aktif: true });
  const [selectedMitraId, setSelectedMitraId] = useState<number | null>(null);
  const [inisiasiAsal, setInisiasiAsal] = useState<InisiasiItem | null>(null);
  const [mitraOpen, setMitraOpen] = useState(false);
  const [mitraSearch, setMitraSearch] = useState('');
  const allJurusanOptions = [...jurusanOptions, ...customJurusanOpts];
  const allJurusanRows = useMemo(
    () =>
      masterUnitProdiTree.filter(
        (item) =>
          item.jenis_node === 'unit' &&
          item.kategori_unit === 'jurusan' &&
          item.aktif &&
          !HIDDEN_JURUSAN_ALIASES.has(item.nama.trim().toUpperCase()),
      ),
    [masterUnitProdiTree],
  );
  // Sumbernya sama dengan Data Master (bukan lagi daftar hardcode pengajuanUnitOptions) —
  // supaya kalau nama unit di Data Master diubah/disinkron ulang, pilihan di sini ikut berubah.
  const allUnitRows = masterUnitProdiTree.filter(
    (item) => item.jenis_node === 'unit' && item.kategori_unit === 'unit_kerja' && item.aktif,
  );
  const allUnitOptions = [...allUnitRows.map((item) => item.nama), ...customUnitOpts];
  const selectedJurusanNodes = useMemo(
    () =>
      selectedJurusanIds
        .map((id) => allJurusanRows.find((item) => item.id === id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [selectedJurusanIds, allJurusanRows],
  );
  // Prodi dari SEMUA jurusan terpilih, diberi nama jurusannya untuk pengelompokan di dropdown.
  const prodiOptionsForJurusan = useMemo(
    () => selectedJurusanNodes.flatMap((jurusan) => prodiAktifOf(jurusan).map((child) => ({ ...child, jurusanNama: jurusan.nama }))),
    [selectedJurusanNodes],
  );
  // Opsi dropdown dibuat sekali per perubahan data, supaya dropdown (React.memo) tidak ikut
  // render ulang setiap kali bagian lain form yang besar ini berubah.
  const jurusanSelectOptions = useMemo(
    () => allJurusanRows.map((item) => ({ value: item.id, label: item.nama })),
    [allJurusanRows],
  );
  const prodiSelectOptions = useMemo(
    () => prodiOptionsForJurusan.map((item) => ({ value: item.id, label: item.nama, group: item.jurusanNama })),
    [prodiOptionsForJurusan],
  );
  // Yang dikirim ke backend: prodi terpilih, plus jurusan yang memang tidak punya prodi aktif
  // (supaya jurusan itu tetap tercatat, bukan hilang).
  const unitProdiIdsToSend =
    asal === 'Jurusan'
      ? [
          ...selectedProdiIds,
          ...selectedJurusanNodes.filter((jurusan) => prodiAktifOf(jurusan).length === 0).map((jurusan) => jurusan.id),
        ]
      : [];
  const asalOptions = asal === 'Jurusan' ? allJurusanOptions : allUnitOptions;
  const masterRuangLingkupOpts = masterRuangLingkupRows.map((item) => item.nama_ruang_lingkup);
  const allRlOptions = Array.from(new Set(masterRuangLingkupOpts));
  const filteredRlOptions = allRlOptions.filter((opt) => opt.toLowerCase().includes(rlSearch.trim().toLowerCase()));
  // Daftar negara sepenuhnya dari master data (master_negara di database, dikelola admin lewat
  // Data Pengajuan > Tambah Negara) — tidak ada lagi daftar default yang di-hardcode di sini.
  const allNegaraOptions = Array.from(new Set(customNegaraOpts));
  const filteredMitraOptions = masterMitraRows.filter(
    (m) =>
      !mitraSearch ||
      m.nama_mitra.toLowerCase().includes(mitraSearch.toLowerCase()) ||
      (m.kode_mitra || '').toLowerCase().includes(mitraSearch.toLowerCase()),
  );

  // Dibuka dari kartu Inisiasi: ambil datanya, isi kolom mitra yang masih kosong dengan nama instansinya.
  useEffect(() => {
    if (!inisiasiId) {
      setInisiasiAsal(null);
      return;
    }
    let aktif = true;
    getInisiasi(inisiasiId)
      .then((item) => {
        if (!aktif) return;
        setInisiasiAsal(item);
        setFormData((prev) => (prev.namaMitra ? prev : { ...prev, namaMitra: item.nama_mitra }));
      })
      .catch(() => {});
    return () => {
      aktif = false;
    };
  }, [inisiasiId]);

  // Cocokkan nama instansi dengan master mitra (sekali, setelah keduanya termuat) supaya tertaut ke mitra yang sama.
  useEffect(() => {
    if (!inisiasiAsal || selectedMitraId !== null || masterMitraRows.length === 0) return;
    const cocok = masterMitraRows.find((m) => m.nama_mitra.trim().toLowerCase() === inisiasiAsal.nama_mitra.trim().toLowerCase());
    if (cocok && formData.namaMitra.trim().toLowerCase() === cocok.nama_mitra.trim().toLowerCase()) {
      setSelectedMitraId(cocok.id);
      // Sama seperti memilih mitra manual dari dropdown: jenis & tingkat ikut terisi dari master mitra.
      setFormData((prev) => ({
        ...prev,
        jenisMitra: prev.jenisMitra || cocok.kategori_mitra || '',
        tingkatPerusahaan: prev.tingkatPerusahaan || cocok.tingkat_perusahaan || '',
      }));
    }
  }, [inisiasiAsal, masterMitraRows, selectedMitraId, formData.namaMitra]);

  useEffect(() => {
    setCustomNegaraOpts(initialCustomNegaraOptions);
  }, [initialCustomNegaraOptions]);

  useEffect(() => {
    const syncNegaraOptions = async () => {
      try {
        const rows = await getMasterNegara({ aktif: true });
        setCustomNegaraOpts(rows.map((item) => item.nama_negara));
      } catch {
        setCustomNegaraOpts(initialCustomNegaraOptions);
      }
    };

    // Halaman induk sudah membawa daftar negara; unduh ulang hanya kalau belum ada atau master diubah.
    if (initialCustomNegaraOptions.length === 0) {
      void syncNegaraOptions();
    }

    const handleMasterNegaraUpdated = () => {
      void syncNegaraOptions();
    };

    window.addEventListener('master-negara-updated', handleMasterNegaraUpdated);

    return () => {
      window.removeEventListener('master-negara-updated', handleMasterNegaraUpdated);
    };
  }, [initialCustomNegaraOptions]);

  useEffect(() => {
    if (Array.isArray(initialMasterRuangLingkupRows)) {
      setMasterRuangLingkupRows(initialMasterRuangLingkupRows);
      return;
    }

    let mounted = true;

    const loadMasterRuangLingkup = async () => {
      try {
        const rows = await getMasterRuangLingkup({ aktif: true });

        if (!mounted) {
          return;
        }

        setMasterRuangLingkupRows(rows);
      } catch {
        if (mounted) {
          setMasterRuangLingkupRows([]);
        }
      }
    };

    loadMasterRuangLingkup();

    return () => {
      mounted = false;
    };
  }, [initialMasterRuangLingkupRows]);

  useEffect(() => {
    if (Array.isArray(initialMasterUnitProdiTree)) {
      setMasterUnitProdiTree(initialMasterUnitProdiTree);
      return;
    }

    let mounted = true;

    const loadMasterUnitProdiTree = async () => {
      try {
        const rows = await getMasterUnitProdiTree();

        if (!mounted) {
          return;
        }

        setMasterUnitProdiTree(rows);
      } catch {
        if (mounted) {
          setMasterUnitProdiTree([]);
        }
      }
    };

    loadMasterUnitProdiTree();

    return () => {
      mounted = false;
    };
  }, [initialMasterUnitProdiTree]);

  // Jurusan/prodi hanya berlaku untuk asal 'Jurusan'; pindah ke 'Unit' mengosongkannya.
  useEffect(() => {
    if (asal !== 'Jurusan') {
      setSelectedJurusanIds((prev) => (prev.length > 0 ? [] : prev));
      setSelectedProdiIds((prev) => (prev.length > 0 ? [] : prev));
    }
  }, [asal]);

  // Pilihan tersimpan (mode edit) hanya membawa id unit/prodi: turunkan jurusannya dari induk tiap
  // prodi begitu master data termuat. Id yang ternyata sebuah jurusan (jurusan tanpa prodi) menjadi
  // pilihan jurusan, bukan pilihan prodi.
  useEffect(() => {
    if (asal !== 'Jurusan' || allJurusanRows.length === 0) {
      return;
    }
    if (selectedProdiIds.length === 0 || selectedJurusanIds.length > 0) {
      return;
    }

    const jurusanLangsung = selectedProdiIds.filter((id) => allJurusanRows.some((item) => item.id === id));
    const prodiIds = selectedProdiIds.filter((id) => !jurusanLangsung.includes(id));
    const jurusanDariProdi = allJurusanRows
      .filter((item) => (item.children ?? []).some((child) => prodiIds.includes(child.id)))
      .map((item) => item.id);
    const jurusanIds = Array.from(new Set([...jurusanDariProdi, ...jurusanLangsung]));
    if (jurusanIds.length === 0) {
      return;
    }

    setSelectedJurusanIds(jurusanIds);
    setSelectedProdiIds(prodiIds);
    setFormData((prev) => ({
      ...prev,
      unitPelaksana: jurusanIds
        .map((id) => allJurusanRows.find((item) => item.id === id)?.nama)
        .filter(Boolean)
        .join(', '),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asal, masterUnitProdiTree, selectedProdiIds, selectedJurusanIds.length]);

  useEffect(() => {
    if (initialData) {
      const nextAsal = initialData.asal;
      if (nextAsal === 'Jurusan' || nextAsal === 'Unit') {
        setAsal(nextAsal);
      }

      setFormData({ ...initialForm, ...initialData });
      setSelectedJurusanIds(initialData.selectedJurusanIds ?? (initialData.selectedJurusanId ? [initialData.selectedJurusanId] : []));
      setSelectedProdiIds(initialData.selectedProdiIds ?? (initialData.selectedProdiId ? [initialData.selectedProdiId] : []));
      setExistingFileAttachments(initialFileAttachments ?? []);
      setDokumen([]);
      setDokumenPendukung([]);

      if (Array.isArray(initialData.selectedRuangLingkup)) {
        setSelectedRuangLingkup(initialData.selectedRuangLingkup.filter(Boolean));
      }

      return;
    }

    // Form dari Inisiasi selalu mulai bersih (diisi dari data Inisiasi), tidak memakai draft tersimpan.
    if (typeof window === 'undefined' || inisiasiId) {
      return;
    }

    try {
      const storedRaw = window.localStorage.getItem(INTERNAL_PENGAJUAN_DRAFT_KEY);
      if (!storedRaw) {
        return;
      }

      const parsed = JSON.parse(storedRaw) as Partial<InternalPengajuanDraft>;

      if (parsed.asal === 'Jurusan' || parsed.asal === 'Unit') {
        setAsal(parsed.asal);
      }

      if (parsed.formData) {
        setFormData({ ...initialForm, ...parsed.formData });
      }
      if (parsed.selectedRuangLingkup) setSelectedRuangLingkup(parsed.selectedRuangLingkup);
      if (parsed.customJurusanOpts) setCustomJurusanOpts(parsed.customJurusanOpts);
      if (parsed.customUnitOpts) setCustomUnitOpts(parsed.customUnitOpts);
      if (parsed.customNegaraOpts) setCustomNegaraOpts(parsed.customNegaraOpts);
    } catch {
      // Abaikan draft rusak agar form tetap bisa dipakai normal.
    }
  }, [initialData, initialFileAttachments, inisiasiId]);

  useEffect(() => {
    if (!enableAppearanceEdit || typeof window === 'undefined') {
      return;
    }

    try {
      const storedRaw = window.localStorage.getItem(appearanceStorageKey);
      if (!storedRaw) {
        return;
      }

      const parsed = JSON.parse(storedRaw) as Partial<FormAppearanceSettings>;
      setAppearanceSettings((prev) => {
        const next = { ...prev, ...parsed };

        if (!next.labelTeleponMitra || next.labelTeleponMitra === 'Telepon' || next.labelTeleponMitra === 'WhatsApp Aktif / No. Telepon') {
          next.labelTeleponMitra = 'WhatsApp Mitra';
        }

        if (!next.labelTeleponKontak || next.labelTeleponKontak === 'Telepon' || next.labelTeleponKontak === 'WhatsApp Aktif / No. Telepon') {
          next.labelTeleponKontak = 'WhatsApp';
        }

        return next;
      });
    } catch {
      window.localStorage.removeItem(appearanceStorageKey);
    }
  }, [appearanceStorageKey, enableAppearanceEdit]);

  useEffect(() => {
    // Form dari Inisiasi tidak disimpan sebagai draft, supaya data instansinya tidak muncul di form pengajuan biasa.
    if (disableDraftPersistence || initialData || inisiasiId) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    // Form baru direset (kosong) setelah submit: jangan simpan lagi sebagai draft.
    if (formData === initialForm) {
      return;
    }

    const draft: InternalPengajuanDraft = {
      asal,
      formData,
      selectedRuangLingkup,
      customJurusanOpts,
      customUnitOpts,
      customNegaraOpts,
    };

    let idleId: number | null = null;
    const timer = window.setTimeout(() => {
      const writeDraft = () => window.localStorage.setItem(INTERNAL_PENGAJUAN_DRAFT_KEY, JSON.stringify(draft));

      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(writeDraft, { timeout: 1200 });
        return;
      }

      writeDraft();
    }, 900);

    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [asal, formData, selectedRuangLingkup, customJurusanOpts, customUnitOpts, customNegaraOpts, disableDraftPersistence, initialData, inisiasiId]);

  useEffect(() => {
    if (!enableAppearanceEdit || typeof window === 'undefined') {
      return;
    }

    const timer = window.setTimeout(() => {
      window.localStorage.setItem(appearanceStorageKey, JSON.stringify(appearanceSettings));
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [appearanceSettings, appearanceStorageKey, enableAppearanceEdit]);

  const updateAppearance = (field: keyof FormAppearanceSettings, value: string) => {
    setAppearanceSettings((prev) => ({ ...prev, [field]: value }));
  };

  const resetAppearance = () => {
    setAppearanceSettings(defaultAppearanceSettings);
  };

  const addJurusanUnitOption = () => {
    const trimmed = jurusanUnitInput.trim();
    if (!trimmed) return;
    if (asal === 'Jurusan') {
      if (!allJurusanOptions.includes(trimmed)) setCustomJurusanOpts((prev) => [...prev, trimmed]);
    } else {
      if (!allUnitOptions.includes(trimmed)) setCustomUnitOpts((prev) => [...prev, trimmed]);
    }
    handleChange('unitPelaksana', trimmed);
    setJuOpen(false);
    setJurusanUnitInput('');
  };

  const removeJurusanUnitCustomOption = (option: string) => {
    if (asal === 'Jurusan') {
      setCustomJurusanOpts((prev) => prev.filter((item) => item !== option));
    } else {
      setCustomUnitOpts((prev) => prev.filter((item) => item !== option));
    }

    if (formData.unitPelaksana === option) {
      handleChange('unitPelaksana', '');
    }
  };

  const handleJenisDokumenChange = (value: string) => {
    if (lockJenisKerjasama) {
      return;
    }

    setFormData((prev) => {
      const current = parseJenisKerjasamaSelection(prev.jenisKerjasama);
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];

      return {
        ...prev,
        jenisKerjasama: serializeJenisKerjasamaSelection(next),
      };
    });
  };

  const handleDownloadTemplate = downloadTemplate;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setDokumen((prev) => {
      const existingNames = new Set(prev.map((d) => d.file.name));
      const existingTotalSize = prev.reduce((sum, d) => sum + d.file.size, 0);
      let cumulativeSize = existingTotalSize;
      const toAdd: { file: File; dataUrl?: string }[] = [];

      for (const file of files) {
        // File utama (MoU/MoA/IA) wajib Word; PDF dan format lain tidak diterima.
        if (!/\.docx?$/i.test(file.name)) {
          setDokumenError(`${file.name}: File utama harus berformat Word (.doc atau .docx).`);
          event.target.value = '';
          return prev;
        }
        const validationError = validateSelectedFile(file, {
          accept: '.doc,.docx',
          maxSizeBytes: MAX_FILE_SIZE,
        });
        if (validationError) {
          setDokumenError(`${file.name}: ${validationError}`);
          event.target.value = '';
          return prev;
        }
        if (existingNames.has(file.name)) {
          setDokumenError(`${file.name}: File dengan nama ini sudah diupload.`);
          event.target.value = '';
          return prev;
        }
        if (cumulativeSize + file.size > MAX_FILE_SIZE) {
          setDokumenError(`Total ukuran semua file tidak boleh melebihi 10 MB.`);
          event.target.value = '';
          return prev;
        }
        cumulativeSize += file.size;
        existingNames.add(file.name);
        toAdd.push({ file });
      }

      event.target.value = '';
      setDokumenError(null);

      toAdd.forEach((item) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setDokumen((cur) => cur.map((d) => d.file === item.file ? { ...d, dataUrl } : d));
        };
        reader.readAsDataURL(item.file);
      });

      return [...prev, ...toAdd];
    });

    event.target.value = '';
  };

  const handleRemoveDokumen = (indexToRemove: number) => {
    setDokumen((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleDokumenPendukungUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setDokumenPendukung((prev) => {
      const existingNames = new Set(prev.map((d) => d.file.name));
      const existingTotalSize = prev.reduce((sum, d) => sum + d.file.size, 0);
      let cumulativeSize = existingTotalSize;
      const toAdd: { file: File; dataUrl?: string }[] = [];

      for (const file of files) {
        // Dokumen pendukung (TOR/KAK/Proposal/Laporan) juga wajib Word; PDF dan format lain ditolak.
        if (!/\.docx?$/i.test(file.name)) {
          setDokumenPendukungError(`${file.name}: Dokumen pendukung harus berformat Word (.doc atau .docx).`);
          event.target.value = '';
          return prev;
        }
        const validationError = validateSelectedFile(file, {
          accept: '.doc,.docx',
          maxSizeBytes: MAX_FILE_SIZE,
        });
        if (validationError) {
          setDokumenPendukungError(`${file.name}: ${validationError}`);
          event.target.value = '';
          return prev;
        }
        if (existingNames.has(file.name)) {
          setDokumenPendukungError(`${file.name}: File dengan nama ini sudah diupload.`);
          event.target.value = '';
          return prev;
        }
        if (cumulativeSize + file.size > MAX_FILE_SIZE) {
          setDokumenPendukungError(`Total ukuran semua file tidak boleh melebihi 10 MB.`);
          event.target.value = '';
          return prev;
        }
        cumulativeSize += file.size;
        existingNames.add(file.name);
        toAdd.push({ file });
      }

      event.target.value = '';
      setDokumenPendukungError(null);

      toAdd.forEach((item) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setDokumenPendukung((cur) => cur.map((d) => d.file === item.file ? { ...d, dataUrl } : d));
        };
        reader.readAsDataURL(item.file);
      });

      return [...prev, ...toAdd];
    });

    event.target.value = '';
  };

  const handleRemoveDokumenPendukung = (indexToRemove: number) => {
    setDokumenPendukung((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleRemoveExistingFile = (indexToRemove: number) => {
    setExistingFileAttachments((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleChange = (field: keyof typeof initialForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Ganti pilihan jurusan: prodi yang induknya sudah tidak dipilih ikut dibuang, dan teks
  // "unit pelaksana" mengikuti daftar jurusan terpilih.
  const handleJurusanChange = useCallback(
    (nextIds: number[]) => {
      const prodiTersedia = new Set(
        nextIds.flatMap((id) => {
          const jurusan = allJurusanRows.find((item) => item.id === id);
          return jurusan ? prodiAktifOf(jurusan).map((child) => child.id) : [];
        }),
      );
      setSelectedJurusanIds(nextIds);
      setSelectedProdiIds((prev) => prev.filter((id) => prodiTersedia.has(id)));
      setFormData((prev) => ({
        ...prev,
        unitPelaksana: nextIds
          .map((id) => allJurusanRows.find((item) => item.id === id)?.nama)
          .filter(Boolean)
          .join(', '),
      }));
    },
    [allJurusanRows],
  );

  const buildFileAttachments = () => {
    return [...dokumen, ...dokumenPendukung].map((item) => ({
      name: item.file.name,
      type: item.file.type,
      size: item.file.size,
      url: item.dataUrl || '',
    }));
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    if (onSubmitted) {
      onSubmitted();
      return;
    }
    router.push('/admin/data_pengajuan');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  if (isSubmitting || submittingRef.current) {
    return;
  }

  if (selectedJenisKerjasama.length === 0) {
    setSubmitError('Pilih minimal 1 jenis kerjasama.');
    return;
  }

  if (asal === 'Jurusan' && selectedJurusanIds.length === 0) {
    setSubmitError('Pilih minimal 1 jurusan.');
    return;
  }

  if (asal === 'Jurusan' && prodiOptionsForJurusan.length > 0 && selectedProdiIds.length === 0) {
    setSubmitError('Pilih minimal 1 prodi.');
    return;
  }

  if (requiresDokumenPendukung) {
    if (dokumen.length === 0 && existingFileAttachments.length === 0) {
      setSubmitError('File utama wajib diunggah untuk jenis dokumen MoA atau IA.');
      return;
    }
    if (dokumenPendukung.length === 0) {
      setSubmitError('Dokumen pendukung (TOR, KAK, atau Proposal/Laporan Kegiatan) wajib dilampirkan untuk jenis dokumen MoA atau IA.');
      return;
    }
  }

  // TAMBAHAN BARU: Cek apakah ada dokumen yang diupload
  if (dokumen.length > 0 && !showDocumentReminderModal) {
    setShowDocumentReminderModal(true);
    return;
  }

  if ([...dokumen, ...dokumenPendukung].some((item) => !item.dataUrl)) {
    setSubmitError('File masih diproses, mohon tunggu beberapa detik lalu klik tombol ajukan lagi.');
    return;
  }

  setSubmitError(null);
  submittingRef.current = true;
  setIsSubmitting(true);

  try {
    if (onSubmitOverride) {
      for (const jenisKerjasama of selectedJenisKerjasama) {
        const submitResult = await Promise.resolve(onSubmitOverride({
          formData: {
            ...formData,
            jenisKerjasama,
          },
          asal,
          selectedRuangLingkup,
          dokumen: dokumen.map((item) => item.file),
          dokumenAttachments: dokumen,
          selectedProdiId: unitProdiIdsToSend[0] ?? null,
          selectedProdiIds: unitProdiIdsToSend,
          selectedJurusanIds,
          existingFileAttachments,
        }));

        if (submitResult === false) {
          return;
        }
      }

      if (onSubmitted) {
        onSubmitted();
        return;
      }

      return;
    }

    for (const jenisKerjasama of selectedJenisKerjasama) {
      const submitPayload: Parameters<typeof submitPengajuanApi>[0] = {
        judulPengajuan: formData.judulKerjasama,
        // deskripsiPengajuan dibatasi 100 karakter di backend (kolom lama) — kirim versi
        // terpotong untuk kompatibilitas, sementara manfaat lengkap masuk ke field manfaat.
        deskripsiPengajuan: formData.deskripsi.trim().slice(0, 100) || undefined,
        manfaat: formData.deskripsi.trim() || undefined,
        namaPengusul: formData.namaKontak || 'Internal Polibatam',
        namaMitra: formData.namaMitra,
        mitraId: selectedMitraId ?? undefined,
        inisiasiId: inisiasiId ?? undefined,
        // Alamat & PIC mitra disinkronkan ke Data Kemitraan oleh BACKEND (lihat
        // PengajuanController), bukan lewat panggilan langsung ke endpoint /master/mitra.
        mitraAlamat: formData.alamatMitra.trim() || undefined,
        mitraPicNama: formData.namaKontak.trim() || undefined,
        mitraPicJabatan: formData.jabatanKontak.trim() || undefined,
        mitraPicEmail: formData.emailKontak.trim() || undefined,
        mitraPicTelepon: formData.teleponKontak.trim() || undefined,
        picPolibatamNama: formData.picPolibatamNama.trim() || undefined,
        picPolibatamJabatan: formData.picPolibatamJabatan.trim() || undefined,
        picPolibatamEmail: formData.picPolibatamEmail.trim() || undefined,
        picPolibatamTelepon: formData.picPolibatamTelepon.trim() || undefined,
        mitraKategori: formData.jenisMitra.trim() || undefined,
        mitraBidangUsaha: formData.bidangUsaha.trim() || undefined,
        mitraTingkatPerusahaan: formData.tingkatPerusahaan.trim() || undefined,
        jenisDokumen: jenisKerjasama,
        namaUnitProdi: formData.unitPelaksana,
        unitProdiId: unitProdiIdsToSend[0] ?? null,
        unitProdiIds: unitProdiIdsToSend,
        jurusanIds: asal === 'Jurusan' ? selectedJurusanIds : [],
        kategoriPengajuan: 'Internal',
        tanggalMulai: formData.tanggalMulai,
        tanggalBerakhir: formData.tanggalBerakhir,
        emailPengusul: formData.emailKontak,
        whatsappPengusul: formData.teleponKontak,
        mitraTelepon: formData.teleponMitra,
        mitraNoTelepon: formData.noTeleponMitra,
        ruangLingkup: selectedRuangLingkup,
        ruangLingkupIds: (selectedRuangLingkup || []).map((name) => masterRuangLingkupRows.find((r) => r.nama_ruang_lingkup === name)?.id).filter(Boolean) as number[],
        fileName: [...dokumen, ...dokumenPendukung].map((item) => item.file.name).join(', ') || 'Dokumen pendukung internal',
        fileAttachments: buildFileAttachments(),
      };

      await submitPengajuanApi(submitPayload, true, 'admin');
    }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(INTERNAL_PENGAJUAN_DRAFT_KEY);
    }

    setSubmittedInfo({
      judul: formData.judulKerjasama || '—',
      mitra: formData.namaMitra || '—',
      jenis: selectedJenisKerjasama.join(', ') || '—',
    });
    setShowSuccessModal(true);

    // Kosongkan form supaya kalau mau ajukan lagi (mis. modal ini tetap kebuka), tidak
    // kebawa data pengajuan sebelumnya.
    setFormData(initialForm);
    setAsal('Jurusan');
    setSelectedRuangLingkup([]);
    setSelectedMitraId(null);
    setSelectedJurusanIds([]);
    setSelectedProdiIds([]);
    setDokumen([]);
    setDokumenPendukung([]);
    setExistingFileAttachments([]);
    setDokumenError(null);
    setDokumenPendukungError(null);
    setMitraSearch('');
    setRlSearch('');
    setCustomJurusanOpts([]);
    setCustomUnitOpts([]);
    setJurusanUnitInput('');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengirim pengajuan ke server.';
    setSubmitError(message);
  } finally {
    submittingRef.current = false;
    setIsSubmitting(false);
  }
};

  return (
    <>
    <div className={`mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-sm${isModal ? ' flex flex-col max-h-[92vh]' : ''}`}>
      <div className={`${isModal ? 'flex-none ' : 'sticky top-0 z-10 '}flex items-start justify-between gap-4 rounded-t-2xl border-b border-slate-200 bg-white px-6 py-5`}>
        <div>
          <p className="text-sm font-semibold text-[#173B82]">{appearanceSettings.topBadgeText}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{appearanceSettings.pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">{appearanceSettings.pageSubtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          {enableAppearanceEdit && (
            <button
              type="button"
              onClick={() => setIsAppearanceEditMode((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${isAppearanceEditMode ? 'border-[#1E376C] bg-[#1E376C] text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-[#1E376C] hover:text-[#1E376C]'}`}
            >
              <Pencil size={15} />
              {isAppearanceEditMode ? 'Tutup Ubah Nama Form' : 'Ubah Nama Form'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (onCancel) {
                onCancel();
                return;
              }

              router.push('/internal/data_pengajuan');
            }}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Tutup"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className={`space-y-5 px-6 py-5${isModal ? ' flex-1 overflow-y-auto scrollbar-rounded' : ''}`}>
        {enableAppearanceEdit && isAppearanceEditMode && (
          <section className="rounded-2xl border border-[#D7E0F0] bg-[#F8FAFF] p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[#173B82]">Ubah Nama Form</h2>
                <p className="text-sm text-gray-600 mt-1">Sesuaikan label form tanpa mengubah alur submit atau validasi data.</p>
              </div>
              <button
                type="button"
                onClick={resetAppearance}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#1E376C] hover:text-[#1E376C]"
              >
                Reset Default
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Judul halaman</label>
                <input value={appearanceSettings.pageTitle} onChange={(e) => updateAppearance('pageTitle', e.target.value)} className="input-field h-10 w-full px-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Subjudul halaman</label>
                <input value={appearanceSettings.pageSubtitle} onChange={(e) => updateAppearance('pageSubtitle', e.target.value)} className="input-field h-10 w-full px-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Nama field jenis kerjasama</label>
                <input value={appearanceSettings.labelJenisKerjasama} onChange={(e) => updateAppearance('labelJenisKerjasama', e.target.value)} className="input-field h-10 w-full px-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Nama field ruang lingkup</label>
                <input value={appearanceSettings.labelRuangLingkup} onChange={(e) => updateAppearance('labelRuangLingkup', e.target.value)} className="input-field h-10 w-full px-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Nama field nama mitra</label>
                <input value={appearanceSettings.labelNamaMitra} onChange={(e) => updateAppearance('labelNamaMitra', e.target.value)} className="input-field h-10 w-full px-3 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Nama field email kontak</label>
                <input value={appearanceSettings.labelEmailKontak} onChange={(e) => updateAppearance('labelEmailKontak', e.target.value)} className="input-field h-10 w-full px-3 text-sm" />
              </div>
            </div>
          </section>
        )}
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-base font-bold text-slate-900">{appearanceSettings.sectionInformasiMitraTitle}</h2>
          <p className="mb-4 text-xs text-slate-500">{appearanceSettings.sectionInformasiMitraSubtitle}</p>

          <div className="grid gap-4 md:grid-cols-2">
            {inisiasiAsal && (
              <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Pengajuan dari Inisiasi: <span className="font-semibold">{inisiasiAsal.judul}</span> ({formatTanggalInisiasi(inisiasiAsal.tanggal_kegiatan)}).
                Pilih jurusan/prodi/unit pelaksana pada form ini; pengajuan akan terlihat oleh unit tersebut.
              </div>
            )}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelNamaMitra}</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMitraOpen((prev) => !prev)}
                  className="input-field flex h-10 w-full items-center justify-between rounded-lg px-3 text-sm text-left"
                >
                  <span className={formData.namaMitra ? 'text-slate-900' : 'text-slate-400'}>
                    {formData.namaMitra || 'Pilih mitra dari daftar...'}
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-slate-400" />
                </button>
                {mitraOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="p-2 border-b border-slate-100">
                      <input
                        autoFocus
                        value={mitraSearch}
                        onChange={(e) => setMitraSearch(e.target.value)}
                        placeholder="Cari kode atau nama mitra..."
                        className="input-field h-8 w-full rounded-lg px-3 text-sm"
                      />
                    </div>
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {filteredMitraOptions.length === 0 && !mitraSearch.trim() && (
                        <li className="px-4 py-3 text-sm text-slate-400">Tidak ada mitra ditemukan</li>
                      )}
                      {filteredMitraOptions.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMitraId(m.id);
                              handleChange('namaMitra', m.nama_mitra);
                              handleChange('jenisMitra', m.kategori_mitra || '');
                              handleChange('tingkatPerusahaan', m.tingkat_perusahaan || '');
                              setMitraOpen(false);
                              setMitraSearch('');
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            {m.kode_mitra && (
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{m.kode_mitra}</span>
                            )}
                            <span className="flex-1 text-slate-800">{m.nama_mitra}</span>
                          </button>
                        </li>
                      ))}
                      {mitraSearch.trim() && (
                        <li className="border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMitraId(null);
                              handleChange('namaMitra', mitraSearch.trim());
                              setMitraOpen(false);
                              setMitraSearch('');
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[#173B82] hover:bg-slate-50"
                          >
                            <Plus size={14} className="shrink-0" />
                            <span>
                              Pakai &quot;<span className="font-semibold">{mitraSearch.trim()}</span>&quot; (mitra belum terdaftar)
                            </span>
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelJenisMitra}</label>
              <select
                value={(JENIS_MITRA_OPTIONS.filter(o => o !== 'Lainnya') as string[]).includes(formData.jenisMitra) || formData.jenisMitra === '' ? formData.jenisMitra : 'Lainnya'}
                onChange={(e) => handleChange('jenisMitra', e.target.value)}
                className="input-field h-10 w-full rounded-lg px-3 text-sm"
                required
              >
                <option value="">Pilih jenis mitra</option>
                {JENIS_MITRA_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              {!(JENIS_MITRA_OPTIONS.filter(o => o !== 'Lainnya') as string[]).includes(formData.jenisMitra) && formData.jenisMitra !== '' && (
                <input
                  value={formData.jenisMitra === 'Lainnya' ? '' : formData.jenisMitra}
                  onChange={(e) => handleChange('jenisMitra', e.target.value || 'Lainnya')}
                  className="input-field mt-2 h-10 w-full rounded-lg px-3 text-sm"
                  placeholder="Ketik jenis mitra..."
                  required
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Bidang Usaha</label>
              <select
                value={(BIDANG_USAHA_OPTIONS.filter(o => o !== 'Lainnya') as string[]).includes(formData.bidangUsaha) || formData.bidangUsaha === '' ? formData.bidangUsaha : 'Lainnya'}
                onChange={(e) => handleChange('bidangUsaha', e.target.value)}
                className="input-field h-10 w-full rounded-lg px-3 text-sm"
              >
                <option value="">Pilih bidang usaha</option>
                {BIDANG_USAHA_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              {!(BIDANG_USAHA_OPTIONS.filter(o => o !== 'Lainnya') as string[]).includes(formData.bidangUsaha) && formData.bidangUsaha !== '' && (
                <input
                  value={formData.bidangUsaha === 'Lainnya' ? '' : formData.bidangUsaha}
                  onChange={(e) => handleChange('bidangUsaha', e.target.value || 'Lainnya')}
                  className="input-field mt-2 h-10 w-full rounded-lg px-3 text-sm"
                  placeholder="Ketik bidang usaha..."
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Tingkat Perusahaan</label>
              <select value={formData.tingkatPerusahaan} onChange={(e) => handleChange('tingkatPerusahaan', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm">
                <option value="">Pilih tingkat perusahaan</option>
                {TINGKAT_PERUSAHAAN_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelTeleponMitra}</label>
              <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
                {countryPhoneCodeMap[formData.negara] && (
                  <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-100 px-2.5 text-xs font-semibold text-slate-600">
                    {countryPhoneCodeMap[formData.negara]}
                  </span>
                )}
                <input value={formData.teleponMitra} onChange={(e) => handleChange('teleponMitra', e.target.value)} className="h-10 flex-1 bg-transparent px-3 text-sm outline-none" placeholder={formData.negara === 'Indonesia' ? '812 3456 7890' : 'Nomor telepon'} required />
              </div>
              {formData.negara === 'Indonesia' && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                  <MessageCircle size={12} className="shrink-0" />
                  Pastikan nomor ini aktif di WhatsApp agar mudah dihubungi
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">No. Telepon</label>
              <input
                value={formData.noTeleponMitra}
                onChange={(e) => handleChange('noTeleponMitra', e.target.value)}
                className="input-field h-10 w-full rounded-lg px-3 text-sm"
                placeholder="(0778) 469 858"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelEmailMitra}</label>
              <input type="email" value={formData.emailMitra} onChange={(e) => handleChange('emailMitra', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" placeholder="mitra@email.com" required />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelAlamatMitra}</label>
              <textarea value={formData.alamatMitra} onChange={(e) => handleChange('alamatMitra', e.target.value)} className="input-field min-h-[90px] w-full rounded-lg px-3 py-2 text-sm" placeholder="Masukkan alamat lengkap mitra" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Negara Mitra</label>
              <select value={formData.negara} onChange={(e) => handleChange('negara', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" required>
                {allNegaraOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {formData.negara && formData.negara !== 'Indonesia' ? '🌐 Luar Negeri' : '🇮🇩 Dalam Negeri'}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-base font-bold text-slate-900">{appearanceSettings.sectionDetailKerjasamaTitle}</h2>
          <p className="mb-4 text-xs text-slate-500">{appearanceSettings.sectionDetailKerjasamaSubtitle}</p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelJenisKerjasama}</label>
              <div className={`rounded-xl border border-slate-200 bg-white p-3 ${lockJenisKerjasama ? 'bg-slate-100' : ''}`}>
                <div className="flex flex-wrap gap-2">
{JENIS_KERJASAMA_OPTIONS.map((item) => {
                    const checked = selectedJenisKerjasama.includes(item);
                    const label = JENIS_KERJASAMA_LABELS[item] || item;
                    const labelParts = label.split(' (');
                    const mainLabel = labelParts[0];
                    const subLabel = labelParts[1] ? ` (${labelParts[1]}` : '';

                    return (
                      <label
                        key={item}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${checked ? 'border-[#173B82] bg-blue-50 text-[#173B82]' : 'border-slate-200 text-slate-700'} ${lockJenisKerjasama ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-[#173B82]'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleJenisDokumenChange(item)}
                          disabled={lockJenisKerjasama}
                          className="h-4 w-4 accent-[#173B82]"
                        />
                        <span>
                          <span className="font-semibold">{item}</span>
                          {subLabel && <span className="font-normal">{subLabel}</span>}
                          {!subLabel && item !== 'Lainnya' && <span className="font-normal text-slate-500"> - {mainLabel}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">Bisa pilih lebih dari satu jenis kerjasama.</p>
              </div>
              {lockJenisKerjasama && (
                <p className="mt-1 text-[11px] text-slate-500">Jenis dokumen tidak bisa diubah saat edit. Jika dokumen direvisi, silakan upload ulang file dokumen.</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelDari}</label>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAsal('Jurusan');
                    setJuOpen(false);
                    handleChange('unitPelaksana', '');
                    setSelectedProdiIds([]);
                    setSelectedJurusanIds([]);
                  }}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    asal === 'Jurusan'
                      ? 'border-[#173B82] bg-[#173B82] text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-[#173B82]'
                  }`}
                >
                  Jurusan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAsal('Unit');
                    setJuOpen(false);
                    handleChange('unitPelaksana', '');
                    setSelectedProdiIds([]);
                    setSelectedJurusanIds([]);
                  }}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    asal === 'Unit'
                      ? 'border-[#173B82] bg-[#173B82] text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-[#173B82]'
                  }`}
                >
                  Unit
                </button>
              </div>
              {asal === 'Jurusan' ? (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Jurusan</label>
                    <MultiSelectDropdown
                      options={jurusanSelectOptions}
                      selected={selectedJurusanIds}
                      onChange={handleJurusanChange}
                      placeholder="Pilih jurusan"
                      searchPlaceholder="Cari jurusan..."
                      ariaLabel="Pilih jurusan"
                      textClassName="text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Prodi</label>
                    <MultiSelectDropdown
                      options={prodiSelectOptions}
                      selected={selectedProdiIds}
                      onChange={setSelectedProdiIds}
                      disabled={selectedJurusanIds.length === 0 || prodiOptionsForJurusan.length === 0}
                      placeholder={
                        selectedJurusanIds.length === 0
                          ? '-- Pilih jurusan terlebih dahulu --'
                          : prodiOptionsForJurusan.length === 0
                            ? '-- Tidak ada prodi untuk jurusan ini --'
                            : 'Pilih prodi'
                      }
                      searchPlaceholder="Cari prodi..."
                      ariaLabel="Pilih prodi"
                      textClassName="text-sm"
                    />
                    {selectedProdiIds.length > 0 && <p className="mt-1 text-xs text-slate-500">{selectedProdiIds.length} prodi terpilih</p>}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setJuOpen(!juOpen)}
                    className="input-field flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-left"
                  >
                    <div className="flex items-center gap-2">
                      {formData.unitPelaksana ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#173B82] px-2 py-0.5 text-xs font-semibold text-white">
                          {formData.unitPelaksana}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChange('unitPelaksana', '');
                              setSelectedProdiIds([]);
                              setSelectedJurusanIds([]);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleChange('unitPelaksana', '');
                                setSelectedProdiIds([]);
                                setSelectedJurusanIds([]);
                              }
                            }}
                            className="cursor-pointer hover:opacity-75"
                            aria-label={`Hapus ${asal}`}
                          >
                            <X size={10} />
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">-- Pilih {asal} --</span>
                      )}
                    </div>
                    <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${juOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {juOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setJuOpen(false)} />
                      <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
                        <div className="max-h-48 overflow-y-auto p-1">
                          {asalOptions.map((option) => {
                            return (
                              <div key={option} className="flex items-center gap-2 rounded-lg hover:bg-slate-50">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleChange('unitPelaksana', option);
                                    setSelectedProdiIds([]);
                                    setSelectedJurusanIds([]);
                                    setJuOpen(false);
                                  }}
                                  className={`flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                                    formData.unitPelaksana === option ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700'
                                  }`}
                                >
                                  <span>{option}</span>
                                  {formData.unitPelaksana === option && <span className="text-xs text-[#173B82]">Dipilih</span>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelTanggalMulai}</label>
              <div className="relative">
                <input type="date" value={formData.tanggalMulai} onChange={(e) => handleChange('tanggalMulai', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 pr-10 text-sm" />
                <CalendarDays size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelTanggalBerakhir}</label>
              <div className="relative">
                <input type="date" value={formData.tanggalBerakhir} onChange={(e) => handleChange('tanggalBerakhir', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 pr-10 text-sm" />
                <CalendarDays size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelJudulKerjasama}</label>
              <input value={formData.judulKerjasama} onChange={(e) => handleChange('judulKerjasama', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" placeholder="Judul atau nama kerjasama" required />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelDeskripsi}</label>
              <textarea value={formData.deskripsi} onChange={(e) => handleChange('deskripsi', e.target.value)} maxLength={2000} className="input-field min-h-[90px] w-full rounded-lg px-3 py-2 text-sm" placeholder="Jelaskan manfaat kerja sama yang diajukan" />
              <p className={`mt-1 text-right text-xs ${formData.deskripsi.length >= 2000 ? 'text-red-500' : 'text-gray-400'}`}>{formData.deskripsi.length}/2000</p>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelRuangLingkup}</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setRlOpen((prev) => {
                      const next = !prev;
                      if (!next) {
                        setRlSearch('');
                      }
                      return next;
                    });
                  }}
                  className="input-field flex min-h-[40px] w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-sm text-left"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRuangLingkup.length === 0 ? (
                      <span className="text-slate-400">Pilih ruang lingkup kerjasama...</span>
                    ) : (
                      selectedRuangLingkup.map((rl) => (
                        <span key={rl} className="inline-flex items-center gap-1 rounded-full bg-[#173B82] px-2 py-0.5 text-xs font-semibold text-white">
                          {rl}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRuangLingkup((prev) => prev.filter((x) => x !== rl));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedRuangLingkup((prev) => prev.filter((x) => x !== rl));
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
                    <div className="fixed inset-0 z-10" onClick={() => {
                      setRlOpen(false);
                      setRlSearch('');
                    }} />
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
                        {filteredRlOptions.map((opt) => {
                          return (
                          <label key={opt} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selectedRuangLingkup.includes(opt)}
                              onChange={() => setSelectedRuangLingkup((prev) => prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt])}
                              className="h-4 w-4 accent-[#173B82]"
                            />
                            <span className="flex flex-1 items-center justify-between gap-2 text-sm text-slate-800">
                              <span>{opt}</span>
                            </span>
                          </label>
                          );
                        })}
                        {filteredRlOptions.length === 0 && (
                          <p className="px-3 py-2 text-xs text-slate-500">Tidak ada ruang lingkup yang cocok.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-base font-bold text-slate-900">{appearanceSettings.sectionKontakTitle}</h2>
          <p className="mb-4 text-xs text-slate-500">{appearanceSettings.sectionKontakSubtitle}</p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelNamaKontak}</label>
              <input value={formData.namaKontak} onChange={(e) => handleChange('namaKontak', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" placeholder="Nama kontak person" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelJabatanKontak}</label>
              <input value={formData.jabatanKontak} onChange={(e) => handleChange('jabatanKontak', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" placeholder="Jabatan di perusahaan" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelEmailKontak}</label>
              <input type="email" value={formData.emailKontak} onChange={(e) => handleChange('emailKontak', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" placeholder="email@contoh.com" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{appearanceSettings.labelTeleponKontak}</label>
              <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
                {countryPhoneCodeMap[formData.negara] && (
                  <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-100 px-2.5 text-xs font-semibold text-slate-600">
                    {countryPhoneCodeMap[formData.negara]}
                  </span>
                )}
                <input value={formData.teleponKontak} onChange={(e) => handleChange('teleponKontak', e.target.value)} className="h-10 flex-1 bg-transparent px-3 text-sm outline-none" placeholder={formData.negara === 'Indonesia' ? '812 3457 6789' : 'Nomor telepon'} required />
              </div>
              {formData.negara === 'Indonesia' && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                  <MessageCircle size={12} className="shrink-0" />
                  Pastikan nomor ini aktif di WhatsApp agar mudah dihubungi
                </p>
              )}
            </div>
          </div>
        </section>

        {showKontakPolibatam && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-base font-bold text-slate-900">Kontak Person Polibatam</h2>
          <p className="mb-4 text-xs text-slate-500">PIC dari pihak Polibatam yang mengajukan kerja sama ini</p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Nama Lengkap</label>
              <input value={formData.picPolibatamNama} onChange={(e) => handleChange('picPolibatamNama', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" placeholder="Nama PIC Polibatam" required={!initialData} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Jabatan</label>
              <input value={formData.picPolibatamJabatan} onChange={(e) => handleChange('picPolibatamJabatan', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" placeholder="Jabatan di Polibatam" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
              <input type="email" value={formData.picPolibatamEmail} onChange={(e) => handleChange('picPolibatamEmail', e.target.value)} className="input-field h-10 w-full rounded-lg px-3 text-sm" placeholder="email@polibatam.ac.id" required={!initialData} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">WhatsApp</label>
              <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100">
                <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-100 px-2.5 text-xs font-semibold text-slate-600">
                  +62
                </span>
                <input value={formData.picPolibatamTelepon} onChange={(e) => handleChange('picPolibatamTelepon', e.target.value)} className="h-10 flex-1 bg-transparent px-3 text-sm outline-none" placeholder="812 3457 6789" required={!initialData} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                <MessageCircle size={12} className="shrink-0" />
                Pastikan nomor ini aktif di WhatsApp agar mudah dihubungi
              </p>
            </div>
          </div>
        </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-base font-bold text-slate-900">{appearanceSettings.sectionDokumenTitle}</h2>
          <p className="mb-4 text-xs text-slate-500">{appearanceSettings.sectionDokumenSubtitle}</p>

          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-slate-700">
            <p className="font-semibold text-[#173B82]">Ada 2 bagian upload di bawah, pilih sesuai isi berkasnya:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>
                <span className="font-semibold">File Utama</span>: berkas <span className="font-semibold">MoU / MoA / IA</span> itu sendiri (dokumen perjanjiannya).
              </li>
              <li>
                <span className="font-semibold">Dokumen Pendukung</span>: <span className="font-semibold">TOR, KAK, atau Proposal/Laporan Kegiatan</span>. Bagian ini muncul otomatis bila Anda memilih <span className="font-semibold">MoA</span> atau <span className="font-semibold">IA</span>.
              </li>
            </ol>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {JENIS_KERJASAMA_OPTIONS.map((key) => {
              const template = defaultTemplateDokumenMap[key as keyof typeof defaultTemplateDokumenMap];
              const active = selectedJenisKerjasama.includes(key);
              const isLainnya = key === 'Lainnya';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleJenisDokumenChange(key)}
                  disabled={lockJenisKerjasama}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    active
                      ? 'border-[#173B82] bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${lockJenisKerjasama ? 'cursor-not-allowed opacity-80' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold text-white ${isLainnya ? 'bg-slate-500' : 'bg-[#173B82]'}`}>{key}</span>
                    {active && <span className="text-xs font-semibold text-[#173B82]">Terpilih</span>}
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">{isLainnya ? 'Dokumen Lainnya' : template?.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{isLainnya ? 'Format/template milik instansi sendiri' : template?.subtitle}</p>
                </button>
              );
            })}
          </div>

          {selectedJenisKerjasama.length === 0 && (
            <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
              Belum ada jenis dipilih. Pilih minimal satu jenis dokumen di atas.
            </div>
          )}

          {selectedJenisKerjasama.length > 0 && (
            <div className="mb-4 space-y-4">
              {selectedJenisKerjasama.map((jenisKerjasama) => {
                const template = defaultTemplateDokumenMap[jenisKerjasama as keyof typeof defaultTemplateDokumenMap];
                const isLainnya = jenisKerjasama === 'Lainnya';

                if (isLainnya) {
                  return (
                    <div key={jenisKerjasama} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex rounded-full bg-slate-500 px-2.5 py-1 text-xs font-bold text-white">Lainnya</span>
                      </div>
                      <p className="text-base font-bold text-slate-800">Dokumen Lainnya</p>
                      <p className="mt-1 text-sm text-slate-600">Gunakan format atau template milik instansi Anda sendiri. Upload dokumen langsung di bawah ini tanpa perlu mengikuti template standar.</p>
                    </div>
                  );
                }

                if (!template) return null;

                return (
                  <div key={jenisKerjasama} className="rounded-xl border border-[#D7E0F0] bg-[#F8FAFF] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="mb-2 inline-flex rounded-full bg-[#173B82] px-2.5 py-1 text-xs font-bold text-white">{jenisKerjasama}</div>
                        <p className="text-lg font-bold text-[#173B82]">{template.title}</p>
                        <p className="text-sm text-slate-600">{template.subtitle}</p>
                      </div>

                      <div className="flex flex-col gap-2 md:max-w-sm">
                        {template.files.length > 1 && (
                          <p className="text-xs font-semibold text-[#173B82]">
                            Ada {template.files.length} template. Pilih yang sesuai jenis instansi mitra:
                          </p>
                        )}
                        {template.files.map((file) => (
                          <div key={file.fileName} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => handleDownloadTemplate(file.fileName)}
                              className="inline-flex w-full items-center gap-2 rounded-lg bg-[#173B82] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2c61]"
                            >
                              <Download size={16} />
                              Download {file.label}
                            </button>
                            {template.files.length > 1 && templateHintByLabel[file.label] && (
                              <p className="px-1 text-[11px] leading-snug text-slate-500">{templateHintByLabel[file.label]}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {template.struktur.map((item) => (
                        <div key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                          {item}
                        </div>
                      ))}
                    </div>

                    <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-slate-700">
                      <span className="font-semibold">Catatan:</span> {template.note} Anda juga dapat mengunggah dokumen dengan format atau template milik instansi sendiri jika sudah tersedia — tidak wajib menggunakan template di atas.
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-700">
                File Utama
                {requiresDokumenPendukung && <span className="ml-1 text-rose-500">*</span>}
              </p>
              <p className="-mt-2 text-[11px] text-slate-500">
                Unggah berkas MoU/MoA/IA-nya di sini dalam format Word (.doc/.docx). TOR, KAK, atau proposal diunggah di bagian Dokumen Pendukung.
              </p>

              {existingFileAttachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600">File yang sudah diunggah:</p>
                  {existingFileAttachments.map((file, index) => (
                    <div key={`existing-${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700">
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip size={15} className="shrink-0 text-blue-500" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{file.name}</p>
                          <p className="text-xs text-slate-500">{file.size > 0 ? formatFileSize(file.size) : 'File tersimpan'}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingFile(index)}
                        className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                        aria-label={`Hapus ${file.name}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label className="block cursor-pointer rounded-xl border-2 border-dashed border-[#173B82]/30 bg-white p-5 transition hover:border-[#173B82] hover:bg-slate-50">
                <input
                  type="file"
                  multiple
                  accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#173B82]/10 text-[#173B82]">
                    <Upload size={20} />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">Klik untuk upload file utama</p>
                  <p className="mt-1 text-xs text-slate-400">atau drag &amp; drop file ke sini</p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                    {['DOC', 'DOCX'].map((fmt) => (
                      <span key={fmt} className="rounded-md bg-[#173B82]/8 px-2 py-0.5 text-[11px] font-semibold text-[#173B82]">{fmt}</span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Ukuran maksimal per file: <span className="font-semibold text-slate-500">10 MB</span></p>
                </div>
              </label>

              {dokumenError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <span>{dokumenError}</span>
                </div>
              )}

              {dokumen.length > 0 && (
                <div className="space-y-2">
                  {dokumen.map((file, index) => (
                    <div key={`${file.file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip size={15} className="shrink-0 text-slate-500" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{file.file.name}</p>
                          <p className="text-xs text-slate-500">{formatFileSize(file.file.size)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDokumen(index)}
                        className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                        aria-label={`Hapus ${file.file.name}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {requiresDokumenPendukung && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div>
                  <p className="text-xs font-semibold text-amber-800">
                    Dokumen Pendukung <span className="text-rose-500">*</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    Jenis dokumen <span className="font-semibold">{selectedJenisKerjasama.filter((j) => j === 'MoA' || j === 'IA').join(' dan ')}</span> wajib dilampirkan minimal satu dokumen pendukung: <span className="font-semibold">TOR, KAK, atau Proposal/Laporan Kegiatan</span>.
                  </p>
                </div>

                {dokumenPendukung.length === 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-[11px] text-amber-800">
                    <span className="mt-0.5 shrink-0">⚠</span>
                    <span>Belum ada dokumen pendukung yang dilampirkan. Harap unggah TOR, KAK, atau Proposal/Laporan Kegiatan.</span>
                  </div>
                )}

                <label className="block cursor-pointer rounded-xl border-2 border-dashed border-amber-300 bg-white p-4 transition hover:border-amber-500 hover:bg-amber-50/50">
                  <input
                    type="file"
                    multiple
                    accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleDokumenPendukungUpload}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <Upload size={18} />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">Upload TOR / KAK / Proposal / Laporan Kegiatan</p>
                    <p className="mt-1 text-xs text-slate-400">DOC atau DOCX — maks. 10 MB</p>
                  </div>
                </label>

                {dokumenPendukungError && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                    <span className="mt-0.5 shrink-0">⚠</span>
                    <span>{dokumenPendukungError}</span>
                  </div>
                )}

                {dokumenPendukung.length > 0 && (
                  <div className="space-y-2">
                    {dokumenPendukung.map((file, index) => (
                      <div key={`pendukung-${file.file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <div className="flex min-w-0 items-center gap-2">
                          <Paperclip size={15} className="shrink-0 text-amber-500" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">{file.file.name}</p>
                            <p className="text-xs text-slate-500">{formatFileSize(file.file.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDokumenPendukung(index)}
                          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                          aria-label={`Hapus ${file.file.name}`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {submitError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {submitError}
          </div>
        )}

        <div className="-mx-6 -mb-5 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 pb-5 pt-4">
          <button
            type="button"
            onClick={() => {
              if (onCancel) {
                onCancel();
                return;
              }

              router.push('/internal/data_pengajuan');
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-[#173B82] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2c61] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Mengirim...' : submitButtonLabel}
          </button>
        </div>
      </form>

    </div>

      {/* Success Modal */}

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex flex-col items-center gap-3 rounded-t-2xl bg-gradient-to-br from-[#091222] to-[#173B82] px-6 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
                <CheckCircle size={36} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Pengajuan Berhasil Dikirim!</h2>
              <p className="text-center text-sm text-blue-100">
                Pengajuan kerjasama Anda telah berhasil dikirim dan sedang menunggu review dari admin.
              </p>
            </div>

            {/* Detail */}
            <div className="space-y-3 px-6 py-5">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Judul</span>
                  <span className="break-words text-sm font-semibold text-slate-800">{submittedInfo?.judul}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Mitra</span>
                  <span className="break-words text-sm text-slate-700">{submittedInfo?.mitra}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Jenis</span>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                    {submittedInfo?.jenis}
                  </span>
                </div>
              </div>
              <p className="text-center text-xs text-slate-500">
                Anda akan dihubungi oleh tim admin apabila ada tindak lanjut.
              </p>
            </div>

            {/* Action */}
            <div className="border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={handleSuccessModalClose}
                className="w-full rounded-xl bg-[#173B82] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2c61]"
              >
                Kembali ke Daftar Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Document Reminder Modal */}
      {showDocumentReminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex flex-col items-center gap-3 rounded-t-2xl bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
                <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Peringatan Dokumen!</h2>
            </div>

            {/* Content */}
            <div className="space-y-4 px-6 py-6">
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-center text-sm font-semibold text-amber-900">
                  Pastikan dokumen yang diupload sudah terisi lengkap!
                </p>
                <p className="mt-2 text-center text-xs text-amber-700">
                  Jangan upload dokumen kosong atau template yang belum diisi.
                </p>
              </div>

              <div className="space-y-2 rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-700">Dokumen yang akan dikirim:</p>
                {dokumen.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs text-slate-600">
                    <Paperclip size={12} className="text-slate-400" />
                    <span className="truncate">{file.file.name}</span>
                  </div>
                ))}
              </div>

              <p className="text-center text-xs text-slate-500">
                Silakan cek kembali dokumen Anda sebelum melanjutkan pengajuan.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowDocumentReminderModal(false)}
                className="flex-1 rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cek Lagi
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDocumentReminderModal(false);
                  // Trigger submit lagi dengan flag bahwa modal sudah ditampilkan
                  const form = document.querySelector('form');
                  if (form) {
                    // Set flag bahwa modal sudah ditampilkan
                    setTimeout(() => {
                      handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>);
                    }, 100);
                  }
                }}
                className="flex-1 rounded-xl bg-[#173B82] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2c61]"
              >
                Lanjutkan Submit
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
