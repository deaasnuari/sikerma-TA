'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import InternalAjukanKerjasamaForm from '@/app/internal/data_pengajuan/AjukanKerjasamaForm';
import { submitExternalPengajuan } from '@/services/externalPengajuanService';
import { getCachedMasterUnitProdiTree, getMasterUnitProdiTree, type MasterUnitProdi } from '@/services/masterUnitProdiService';
import { getCachedMasterRuangLingkup, getMasterRuangLingkup, type MasterRuangLingkup } from '@/services/masterRuangLingkupService';
import { getCachedMasterNegara, getMasterNegara, type MasterNegara } from '@/services/masterNegaraService';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[12px]">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value}</span>
    </div>
  );
}

type UploadedDokumenLike = { file: File; dataUrl?: string };

function normalizeUploadedDokumen(items: UploadedDokumenLike[]) {
  return items
    .map((item) => {
      if (item && 'file' in item && item.file instanceof File) {
        return { file: item.file, dataUrl: item.dataUrl || '' };
      }

      return null;
    })
    .filter((item): item is { file: File; dataUrl: string } => item !== null);
}

export default function PengajuanBaruEksternalPage() {
  const router = useRouter();
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [submittedInfo, setSubmittedInfo] = useState<{
    namaMitra: string;
    jenisDokumen: string;
    judulKerjasama: string;
  } | null>(null);
  // Berubah tiap kali pengajuan berhasil dikirim -> dipakai sebagai key supaya form
  // di-remount total (state internalnya kereset) alih-alih tetap kebawa data lama saat
  // user mau ajukan pengajuan baru lagi tanpa pindah halaman.
  const [formResetKey, setFormResetKey] = useState(0);
  const [masterUnitProdiTree, setMasterUnitProdiTree] = useState<MasterUnitProdi[]>(() => getCachedMasterUnitProdiTree());
  const [masterRuangLingkupRows, setMasterRuangLingkupRows] = useState<MasterRuangLingkup[]>(() => getCachedMasterRuangLingkup());
  const [masterNegaraRows, setMasterNegaraRows] = useState<MasterNegara[]>(() => getCachedMasterNegara());

  const masterUnitProdiTreeForForm = useMemo(() => masterUnitProdiTree, [masterUnitProdiTree]);

  useEffect(() => {
    let mounted = true;

    async function loadMasterData() {
      try {
        const [unitProdiRows, ruangLingkupRows, negaraRows] = await Promise.all([
          getMasterUnitProdiTree(),
          getMasterRuangLingkup({ aktif: true }),
          getMasterNegara({ aktif: true }),
        ]);

        if (!mounted) {
          return;
        }

        setMasterUnitProdiTree(unitProdiRows);
        setMasterRuangLingkupRows(ruangLingkupRows);
        setMasterNegaraRows(negaraRows);
      } catch {
        if (mounted) {
          setMasterUnitProdiTree([]);
          setMasterRuangLingkupRows([]);
          setMasterNegaraRows([]);
        }
      }
    }

    void loadMasterData();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-bold text-slate-900">Pengajuan Kerjasama</h2>
        <p className="text-[12px] text-slate-500">Form pengajuan eksternal menggunakan tampilan dan alur yang sama seperti role admin.</p>
      </div>

      <InternalAjukanKerjasamaForm
        key={formResetKey}
        disableDraftPersistence
        showKontakPolibatam={false}
        nomorPengajuanSource="eksternal"
        initialMasterUnitProdiTree={masterUnitProdiTreeForForm}
        initialMasterRuangLingkupRows={masterRuangLingkupRows}
        initialCustomNegaraOptions={masterNegaraRows.map((item) => item.nama_negara)}
        onCancel={() => router.push('/eksternal/daftar_kerjasama')}
        onSubmitOverride={async ({ formData, selectedRuangLingkup, dokumenAttachments, selectedProdiId, selectedProdiIds, selectedJurusanIds }) => {
          const normalizedDokumen = normalizeUploadedDokumen(dokumenAttachments);
          const ruangLingkupIds = (selectedRuangLingkup || [])
            .map((name) => masterRuangLingkupRows.find((row) => row.nama_ruang_lingkup === name)?.id)
            .filter((id): id is number => typeof id === 'number');

          await submitExternalPengajuan({
            judulPengajuan: formData.judulKerjasama,
            // deskripsi pengajuan dibatasi 100 karakter, manfaat lengkap tidak dibatasi.
            // Luaran Kerja Sama sengaja tidak diambil dari pengajuan — diisi admin sendiri
            // lewat Rekap Data setelah dokumen final ada.
            deskripsiPengajuan: formData.deskripsi.trim().slice(0, 100) || undefined,
            manfaat: formData.deskripsi.trim() || undefined,
            namaPengusul: formData.namaKontak || 'Mitra Eksternal',
            namaMitra: formData.namaMitra,
            // Alamat & PIC mitra disinkronkan ke Data Kemitraan oleh BACKEND (lihat
            // PengajuanController) — endpoint /master/mitra sendiri admin-only, jadi tidak
            // dipanggil langsung dari sini.
            mitraAlamat: formData.alamatMitra.trim() || undefined,
            mitraPicNama: formData.namaKontak.trim() || undefined,
            mitraPicJabatan: formData.jabatanKontak.trim() || undefined,
            mitraPicEmail: formData.emailKontak.trim() || undefined,
            mitraPicTelepon: formData.teleponKontak.trim() || undefined,
            mitraKategori: formData.jenisMitra.trim() || undefined,
            mitraBidangUsaha: formData.bidangUsaha.trim() || undefined,
            mitraTingkatPerusahaan: formData.tingkatPerusahaan.trim() || undefined,
            mitraTelepon: formData.teleponMitra.trim() || undefined,
            mitraNoTelepon: formData.noTeleponMitra.trim() || undefined,
            jenisDokumen: formData.jenisKerjasama,
            namaUnitProdi: formData.unitPelaksana,
            unitProdiId: selectedProdiId,
            unitProdiIds: selectedProdiIds,
            jurusanIds: selectedJurusanIds,
            kategoriPengajuan: 'Eksternal',
            tanggalMulai: formData.tanggalMulai,
            tanggalBerakhir: formData.tanggalBerakhir,
            emailPengusul: formData.emailKontak,
            whatsappPengusul: formData.teleponKontak,
            ruangLingkupIds,
            ruangLingkup: selectedRuangLingkup,
            fileName: normalizedDokumen.map((item) => item.file.name).join(', ') || 'Dokumen pendukung eksternal',
            fileAttachments: normalizedDokumen.map((item) => ({
              name: item.file.name,
              type: item.file.type,
              size: item.file.size,
              url: item.dataUrl,
            })),
          });

          setSubmittedInfo({
            namaMitra: formData.namaMitra,
            jenisDokumen: formData.jenisKerjasama,
            judulKerjasama: formData.judulKerjasama,
          });
          setIsSuccessModalOpen(true);
          // Remount form-nya (lewat perubahan key) supaya kosong lagi kalau mau ajukan
          // pengajuan baru, tidak kebawa data dari pengajuan yang barusan dikirim.
          setFormResetKey((prev) => prev + 1);
          return false;
        }}
      />

      {isSuccessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-col items-center px-6 pb-2 pt-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 size={36} className="text-emerald-500" />
              </div>
              <h3 className="text-[17px] font-bold text-slate-900">Pengajuan Berhasil Dikirim</h3>
              <p className="mt-2 text-[12px] text-slate-500">
                Pengajuan kerjasama Anda telah berhasil dikirim dan sedang dalam proses review oleh tim kami.
              </p>
            </div>

            {submittedInfo && (
              <div className="mx-6 my-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <InfoRow label="Nama Mitra" value={submittedInfo.namaMitra} />
                <InfoRow label="Jenis Dokumen" value={submittedInfo.jenisDokumen} />
                {submittedInfo.judulKerjasama && (
                  <InfoRow label="Judul Kerjasama" value={submittedInfo.judulKerjasama} />
                )}
              </div>
            )}

            <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <p className="mb-3 text-[10px] text-slate-500">
                Langkah selanjutnya: tim humas/kerjasama akan memproses dokumen Anda dan menghubungi mitra bila diperlukan.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsSuccessModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/eksternal/daftar_kerjasama')}
                  className="rounded-lg bg-[#1E376C] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#16305c]"
                >
                  Lihat Daftar Kerjasama
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
