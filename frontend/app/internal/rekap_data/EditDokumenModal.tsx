'use client';

import { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { generateNoDokumen } from '@/services/adminMonitoringService';

type ApprovalStatus = 'Menunggu' | 'Disetujui' | 'Ditolak';
type Jenis = 'MoU' | 'MoA' | 'IA';

interface KerjasamaItem {
  noDokumen: string;
  namaMitra: string;
  jenis: Jenis;
  unit: string;
  tanggalMulai: string;
  berlakuHingga: string;
  status: ApprovalStatus;
}

interface DokumenTerkait {
  nama: string;
  url: string;
  ukuran: string;
  tanggal: string;
}

interface EditFormData {
  nomorDokumen: string;
  jenisDokumen: string;
  namaMitra: string;
  status: string;
  tanggalMulai: string;
  tanggalBerakhir: string;
  emailMitra: string;
  alamatMitra: string;
  dokumenTerkait?: DokumenTerkait[];
}

interface EditDokumenModalProps {
  item: KerjasamaItem;
  onClose: () => void;
  onSave: (data: EditFormData) => void;
}

function toDateInputValue(dateStr: string): string {
  if (!dateStr || dateStr === '-') return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export default function EditDokumenModal({ item, onClose, onSave }: EditDokumenModalProps) {
  const [form, setForm] = useState<EditFormData>({
    nomorDokumen: item.noDokumen,
    jenisDokumen: item.jenis,
    namaMitra: item.namaMitra,
    status: item.status === 'Menunggu' ? 'Aktif' : item.status === 'Disetujui' ? 'Aktif' : 'Kadaluarsa',
    tanggalMulai: toDateInputValue(item.tanggalMulai),
    tanggalBerakhir: toDateInputValue(item.berlakuHingga),
    emailMitra: '',
    alamatMitra: '',
    dokumenTerkait: (item as any).dokumenTerkait || [],
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function handleChange(field: keyof EditFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }


  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const newDoc = {
        nama: file.name,
        url,
        ukuran: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        tanggal: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
      };
      setForm((prev) => ({
        ...prev,
        dokumenTerkait: [...(prev.dokumenTerkait || []), newDoc],
      }));
    };
    reader.readAsDataURL(file);
  }

  function handleDeleteDoc(idx: number) {
    setForm((prev) => ({
      ...prev,
      dokumenTerkait: (prev.dokumenTerkait || []).filter((_, i) => i !== idx),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-[600px] max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header with blue gradient */}
        <div className="bg-gradient-to-r from-[#091222] to-[#173B82] px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Pencil size={20} className="text-white" />
              <div>
                <h2 className="text-[15px] font-bold text-white">Edit Dokumen</h2>
                <p className="text-[10px] text-blue-200">{generateNoDokumen({ urutan: 1, jenis: item.jenis, tanggal: item.tanggalMulai })}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Row 1: Nomor Dokumen & Jenis Dokumen */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Nomor Dokumen</label>
              <input
                type="text"
                value={form.nomorDokumen}
                onChange={(e) => handleChange('nomorDokumen', e.target.value)}
                className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Jenis Dokumen</label>
              <select
                value={form.jenisDokumen}
                onChange={(e) => handleChange('jenisDokumen', e.target.value)}
                className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
              >
                <option value="MoU">MoU</option>
                <option value="MoA">MoA</option>
                <option value="IA">IA</option>
              </select>
            </div>
          </div>

          {/* Row 2: Nama Mitra & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Nama Mitra</label>
              <input
                type="text"
                value={form.namaMitra}
                onChange={(e) => handleChange('namaMitra', e.target.value)}
                className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
              >
                <option value="Aktif">Aktif</option>
                <option value="Akan Berakhir">Akan Berakhir</option>
                <option value="Kadaluarsa">Kadaluarsa</option>
              </select>
            </div>
          </div>

          {/* Row 3: Tanggal Mulai & Tanggal Berakhir */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Tanggal Mulai</label>
              <input
                type="date"
                value={form.tanggalMulai}
                onChange={(e) => handleChange('tanggalMulai', e.target.value)}
                className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Tanggal Berakhir</label>
              <input
                type="date"
                value={form.tanggalBerakhir}
                onChange={(e) => handleChange('tanggalBerakhir', e.target.value)}
                className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
              />
            </div>
          </div>

          {/* Row 4: Email Mitra */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Email Mitra</label>
            <input
              type="email"
              value={form.emailMitra}
              onChange={(e) => handleChange('emailMitra', e.target.value)}
              className="input-field h-10 w-full px-3 text-[12px] text-gray-700"
            />
          </div>

          {/* Row 5: Alamat Mitra */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Alamat Mitra</label>
            <textarea
              rows={3}
              value={form.alamatMitra}
              onChange={(e) => handleChange('alamatMitra', e.target.value)}
              className="input-field w-full px-3 py-2 text-[12px] text-gray-700 resize-y"
            />
          </div>

          {/* Row 6: Upload Dokumen */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-800 mb-1.5">Upload Dokumen (PDF, max 10MB)</label>
            <input
              type="file"
              onChange={handleFileChange}
              className="input-field w-full px-3 py-2 text-[12px] text-gray-700"
            />
            {form.dokumenTerkait && form.dokumenTerkait.length > 0 && (
              <ul className="mt-2 space-y-2">
                {form.dokumenTerkait.map((doc, idx) => (
                  <li key={doc.nama} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 bg-gray-50">
                    <span className="text-[10px] font-medium text-gray-700">{doc.nama} ({doc.ukuran})</span>
                    <button type="button" onClick={() => handleDeleteDoc(idx)} className="ml-2 text-red-500 hover:text-red-700 text-[10px]">Hapus</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            className="btn-primary px-5 py-2 text-[12px] font-semibold"
          >
            Simpan Perubahan
          </button>
        </div>
      </div>
    </div>
  );
}
