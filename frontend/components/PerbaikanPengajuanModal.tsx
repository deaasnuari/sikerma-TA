'use client';

import { useMemo, type ComponentProps } from 'react';
import AjukanKerjasamaForm from '@/app/internal/data_pengajuan/AjukanKerjasamaForm';
import {
  refreshPengajuanDataFromApi,
  updatePengajuanItemApi,
  type PengajuanFileAttachment,
  type PengajuanItem,
  type PengajuanStatus,
} from '@/services/adminPengajuanService';
import { useMasterRuangLingkup, useMasterUnitProdi } from '@/hooks/useMasterData';

// Pengusul (internal/eksternal) hanya boleh mengubah pengajuannya selama belum diproses admin —
// sama dengan PengajuanController::STATUS_BOLEH_DIUBAH_PENGUSUL di backend.
const STATUS_BOLEH_DIUBAH_PENGUSUL: PengajuanStatus[] = ['Menunggu', 'Menunggu Review', 'Revisi'];

export function bolehDiubahPengusul(status: PengajuanStatus): boolean {
  return STATUS_BOLEH_DIUBAH_PENGUSUL.includes(status);
}

type PerbaikanPayload = Parameters<NonNullable<ComponentProps<typeof AjukanKerjasamaForm>['onSubmitOverride']>>[0];

function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const normalized = value.trim();
  const dayFirstMatch = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dayFirstMatch) {
    return `${dayFirstMatch[3]}-${dayFirstMatch[2].padStart(2, '0')}-${dayFirstMatch[1].padStart(2, '0')}`;
  }
  return normalized.slice(0, 10);
}

type Props = {
  item: PengajuanItem;
  nomorPengajuanSource: 'internal' | 'eksternal';
  onClose: () => void;
  /** Dipanggil dengan pesan hasil (berhasil maupun gagal) untuk ditampilkan halaman pemanggil. */
  onMessage: (message: string) => void;
};

/**
 * Form edit pengajuan milik pengusul sendiri. Kalau status pengajuan Revisi, menyimpan form ini
 * = mengirim ulang perbaikan: backend mengembalikan status ke Menunggu Review dan menandainya
 * "Sudah Direvisi" untuk admin.
 */
export default function PerbaikanPengajuanModal({ item, nomorPengajuanSource, onClose, onMessage }: Props) {
  const { data: ruangLingkupRows } = useMasterRuangLingkup();
  const { data: unitProdiRows, isLoading: unitProdiLoading } = useMasterUnitProdi();

  const isRevisi = item.statusPengajuan === 'Revisi';

  const initialData = useMemo(() => {
    const unitRow = unitProdiRows.find((row) => row.nama === item.namaUnitProdi);
    return {
      nomorPengajuan: item.nomorPengajuan,
      asal: (unitRow?.kategori_unit === 'unit_kerja' ? 'Unit' : 'Jurusan') as 'Jurusan' | 'Unit',
      namaMitra: item.namaMitra,
      jenisMitra: item.mitraKategori || '',
      bidangUsaha: item.mitraBidangUsaha || '',
      tingkatPerusahaan: item.mitraTingkatPerusahaan || '',
      teleponMitra: item.mitraTelepon || '',
      noTeleponMitra: item.mitraNoTelepon || '',
      emailMitra: item.mitraEmail || '',
      alamatMitra: item.mitraAlamat || '',
      negara: item.mitraNegara || 'Indonesia',
      jenisKerjasama: item.jenisDokumen,
      unitPelaksana: item.namaUnitProdi,
      selectedProdiId: item.unitProdiId ?? null,
      tanggalMulai: toDateInputValue(item.tanggalMulai),
      tanggalBerakhir: toDateInputValue(item.tanggalBerakhir),
      judulKerjasama: item.judulPengajuan,
      deskripsi: item.manfaat || item.deskripsiPengajuan || '',
      namaKontak: item.mitraPicNama || item.namaPengusul,
      jabatanKontak: item.mitraPicJabatan || item.jabatanPengusul || '',
      emailKontak: item.mitraPicEmail || item.emailPengusul || '',
      teleponKontak: item.mitraPicTelepon || item.whatsappPengusul || '',
      selectedRuangLingkup: item.ruangLingkup,
    };
  // Dihitung sekali per pengajuan (form baru dirender setelah master unit termuat) — kalau
  // ikut berubah tiap polling, form akan ter-reset di tengah pengisian.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, unitProdiLoading]);

  async function handleSubmit(payload: PerbaikanPayload): Promise<boolean> {
    const form = payload.formData;

    if (!form.judulKerjasama.trim() || !form.namaMitra.trim() || !form.unitPelaksana.trim()) {
      onMessage('Judul, mitra, dan jurusan/unit wajib diisi.');
      return false;
    }

    // File: pertahankan file lama yang tidak dihapus + file baru. Hanya dikirim kalau ada
    // perubahan, supaya backend tidak menyinkron ulang lampiran yang sama.
    const newFiles: PengajuanFileAttachment[] = payload.dokumenAttachments.map((doc) => ({
      name: doc.file.name,
      type: doc.file.type,
      size: doc.file.size,
      url: doc.dataUrl || '',
    }));
    const keptFiles = payload.existingFileAttachments ?? [];
    const allFiles = [...keptFiles, ...newFiles];
    const filesChanged = newFiles.length > 0 || keptFiles.length < (item.fileAttachments?.length ?? 0);

    const namaMitra = form.namaMitra.trim();
    const mitraSama = namaMitra.toLowerCase() === (item.namaMitra || '').trim().toLowerCase();

    const ruangLingkupIds = payload.selectedRuangLingkup
      .map((name) => ruangLingkupRows.find((row) => row.nama_ruang_lingkup === name)?.id)
      .filter((id): id is number => typeof id === 'number');

    const unitName = form.unitPelaksana.trim().toLowerCase();
    const unitProdiId =
      payload.selectedProdiId ??
      unitProdiRows.find((row) => row.nama.toLowerCase() === unitName)?.id ??
      item.unitProdiId;

    try {
      await updatePengajuanItemApi(
        item.id,
        {
          judulPengajuan: form.judulKerjasama.trim(),
          namaMitra,
          // Nama mitra diganti -> biarkan backend mencari/membuat mitra dari nama baru.
          ...(mitraSama && item.mitraId ? { mitraId: item.mitraId } : {}),
          mitraKategori: form.jenisMitra.trim(),
          mitraBidangUsaha: form.bidangUsaha.trim(),
          mitraTingkatPerusahaan: form.tingkatPerusahaan.trim(),
          mitraTelepon: form.teleponMitra.trim(),
          mitraNoTelepon: form.noTeleponMitra.trim(),
          unitProdiId,
          jenisDokumen: form.jenisKerjasama.trim() || item.jenisDokumen,
          tanggalMulai: form.tanggalMulai || undefined,
          tanggalBerakhir: form.tanggalBerakhir || undefined,
          ...(ruangLingkupIds.length > 0 ? { ruangLingkupIds } : {}),
          deskripsiPengajuan: form.deskripsi.trim().slice(0, 100),
          manfaat: form.deskripsi.trim(),
          emailPengusul: form.emailKontak.trim(),
          whatsappPengusul: form.teleponKontak.trim(),
          jabatanPengusul: form.jabatanKontak.trim(),
          ...(filesChanged
            ? { fileName: allFiles.map((f) => f.name).join(', '), fileAttachments: allFiles }
            : {}),
        },
        {
          // Alamat & PIC disinkronkan ke Data Kemitraan oleh backend (endpoint /master/mitra
          // sendiri admin-only).
          mitra_alamat: form.alamatMitra.trim() || null,
          mitra_nama_kontak_utama: form.namaKontak.trim() || null,
          mitra_jabatan_kontak_utama: form.jabatanKontak.trim() || null,
          mitra_email_kontak_utama: form.emailKontak.trim() || null,
          mitra_telepon_kontak_utama: form.teleponKontak.trim() || null,
        }
      );
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
      onMessage(`Gagal menyimpan perubahan pengajuan.${detail}`);
      return false;
    }

    onMessage(
      isRevisi
        ? 'Perbaikan berhasil dikirim. Pengajuan kembali menunggu review admin.'
        : 'Perubahan pengajuan berhasil disimpan.'
    );
    void refreshPengajuanDataFromApi(true);
    return true;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="w-full max-w-[1120px] rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {unitProdiLoading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Memuat form…</div>
        ) : (
        <AjukanKerjasamaForm
          isModal
          disableDraftPersistence
          nomorPengajuanSource={nomorPengajuanSource}
          submitButtonLabel={isRevisi ? 'Kirim Ulang Perbaikan' : 'Simpan Perubahan'}
          initialFileAttachments={item.fileAttachments ?? []}
          initialData={initialData}
          onCancel={onClose}
          onSubmitted={onClose}
          onSubmitOverride={handleSubmit}
        />
        )}
      </div>
    </div>
  );
}
