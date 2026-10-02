'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import RenewalUploadForm from '@/app/admin/monitoring/RenewalUploadForm';
import { addRenewalRequest } from '@/services/adminRenewalRequestService';

export interface PerpanjanganTarget {
  /** ID dokumen_kerjasama (bukan ID pengajuan). */
  dokumenId: number;
  namaMitra: string;
  noDokumen: string;
  berlakuHingga: string;
}

type Props = {
  target: PerpanjanganTarget;
  onClose: () => void;
  /** Dipanggil setelah permintaan berhasil terkirim ke admin. */
  onSubmitted: (message: string) => void;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca file dokumen.'));
    reader.readAsDataURL(file);
  });
}

export default function PerpanjanganKerjasamaModal({ target, onClose, onSubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
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
          <RenewalUploadForm
            singleFile
            submitting={submitting}
            onSubmit={async ({ tanggalMulaiBaru, tanggalBerakhirBaru, catatan, dokumen }) => {
              setSubmitting(true);
              try {
                const file = dokumen[0];
                await addRenewalRequest({
                  kerjasamaId: target.dokumenId,
                  namaMitra: target.namaMitra,
                  noDokumen: target.noDokumen,
                  tanggalMulaiBaru,
                  tanggalBerakhirBaru,
                  catatan,
                  buktiPerpanjangan: await fileToDataUrl(file),
                  buktiPerpanjanganNama: file.name,
                });
              } finally {
                setSubmitting(false);
              }
              onSubmitted('Permintaan perpanjangan terkirim. Admin akan memeriksa dokumen dan memutuskan persetujuan.');
            }}
          />
        </div>
      </div>
    </div>
  );
}
