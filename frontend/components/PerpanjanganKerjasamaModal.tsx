'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import RenewalFullForm from '@/app/admin/monitoring/RenewalFullForm';
import { showNotice } from '@/lib/dialog';
import { addRenewalRequest } from '@/services/adminRenewalRequestService';

export interface PerpanjanganTarget {
  /** ID dokumen_kerjasama (bukan ID pengajuan). */
  dokumenId: number;
  namaMitra: string;
  noDokumen: string;
  berlakuHingga: string;
  /** Ruang lingkup kerja sama saat ini (nama), dipakai sebagai pilihan awal. */
  ruangLingkup?: string[];
  jenisKerjasama?: string;
  judulKerjasama?: string;
  /** Tanggal mulai kerja sama saat ini (ditampilkan apa adanya). */
  tanggalMulai?: string;
  /** Tanggal berakhir format ISO (YYYY-MM-DD); jadi tanggal mulai awal perpanjangan. */
  berlakuHinggaRaw?: string;
}

type Props = {
  target: PerpanjanganTarget;
  onClose: () => void;
  /** Dipanggil setelah permintaan berhasil terkirim ke admin. */
  onSubmitted: (message: string) => void;
};

export default function PerpanjanganKerjasamaModal({ target, onClose, onSubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-16 z-[80] overflow-y-auto bg-slate-900/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="relative mx-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl md:max-w-4xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-[#1E376C]">Ajukan Perpanjangan Kerja Sama</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {target.namaMitra} · {target.noDokumen} · berlaku hingga {target.berlakuHingga}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <RenewalFullForm
            initialData={{
              namaMitra: target.namaMitra,
              jenisMitra: '',
              teleponMitra: '',
              emailMitra: '',
              alamatLengkap: '',
              negara: 'Indonesia',
              jenisKerjasama: target.jenisKerjasama ?? '',
              unitPelaksana: '',
              tanggalMulai: target.tanggalMulai ?? '',
              tanggalBerakhir: target.berlakuHinggaRaw ?? target.berlakuHingga,
              judulKerjasama: target.judulKerjasama ?? '',
              deskripsi: '',
              ruangLingkup: target.ruangLingkup ?? [],
              kontakNama: '',
              kontakJabatan: '',
              kontakEmail: '',
              kontakTelepon: '',
              tanggalMulaiBaru: '',
              tanggalBerakhirBaru: '',
              catatanPerpanjangan: '',
            }}
            onSubmit={async (data) => {
              setSubmitting(true);
              try {
                await addRenewalRequest({
                  kerjasamaId: target.dokumenId,
                  namaMitra: target.namaMitra,
                  noDokumen: target.noDokumen,
                  tanggalMulaiBaru: data.tanggalMulaiBaru,
                  tanggalBerakhirBaru: data.tanggalBerakhirBaru,
                  catatan: data.catatanPerpanjangan,
                  buktiPerpanjangan: data.dokumen?.url ?? null,
                  buktiPerpanjanganNama: data.dokumen?.nama ?? null,
                  ruangLingkup: data.ruangLingkup ?? [],
                });
                onSubmitted('Permintaan perpanjangan terkirim. Admin akan memeriksa dokumen dan memutuskan persetujuan.');
              } catch (err) {
                showNotice(err instanceof Error ? err.message : 'Gagal mengirim permintaan perpanjangan.');
              } finally {
                setSubmitting(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
