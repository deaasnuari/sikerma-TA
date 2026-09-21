'use client';

import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { bulanOptions, semuaBulanLabel, tanpaBulanLabel } from '@/services/adminRekapDataService';

const POPUP_WIDTH = 320;

type MonthPickerProps = {
  value: string;
  onChange: (value: string) => void;
  buttonClassName?: string;
};

/**
 * Picker bulan bergaya sama dengan picker tahun di halaman Rekap Data / Monitoring:
 * tombol + popup grid, dengan tautan "Semua Bulan" untuk reset.
 */
export default function MonthPicker({
  value,
  onChange,
  buttonClassName = 'input-field inline-flex min-w-[150px] items-center justify-between gap-2 px-3 py-2 text-[12px] text-gray-700 transition-colors',
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  // Popup default rata kiri dengan tombol (tombol bisa ada di ujung kiri layar, mis. saat filter
  // membungkus ke baris baru, dan kalau rata kanan popup-nya tertutup sidebar). Balik ke rata
  // kanan hanya kalau rata kiri bakal keluar dari layar sebelah kanan.
  const [alignRight, setAlignRight] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setAlignRight(rect.left + POPUP_WIDTH > window.innerWidth - 16 && rect.right - POPUP_WIDTH >= 16);
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className="relative">
      <button ref={buttonRef} type="button" onClick={handleToggle} className={buttonClassName}>
        <span>{value === semuaBulanLabel ? 'Pilih Bulan' : value}</span>
        <CalendarDays size={16} className="text-gray-500" />
      </button>

      {open && (
        <div
          className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-[calc(100%+8px)] z-20 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg`}
        >
          <div className="grid grid-cols-3 gap-2">
            {bulanOptions.map((bulan) => {
              const isSelected = bulan === value;

              return (
                <button
                  key={bulan}
                  type="button"
                  onClick={() => {
                    onChange(bulan);
                    setOpen(false);
                  }}
                  className={`rounded-lg border px-2 py-2 text-[11.5px] font-medium transition-colors ${
                    isSelected
                      ? 'border-[#1E376C] bg-[#1E376C] text-white'
                      : 'border-gray-200 bg-white text-gray-800 hover:border-[#1E376C] hover:text-[#1E376C]'
                  }`}
                >
                  {bulan}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                onChange(tanpaBulanLabel);
                setOpen(false);
              }}
              className={`col-span-3 rounded-lg border px-2 py-2 text-[11.5px] font-medium transition-colors ${
                value === tanpaBulanLabel
                  ? 'border-[#1E376C] bg-[#1E376C] text-white'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-[#1E376C] hover:text-[#1E376C]'
              }`}
            >
              {tanpaBulanLabel}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <p className="text-[10px] text-gray-500">Pilih bulan untuk menampilkan data bulanan</p>
            <button
              type="button"
              onClick={() => {
                onChange(semuaBulanLabel);
                setOpen(false);
              }}
              className="text-[10px] font-semibold text-[#1E376C] transition-colors hover:text-[#2B4A93]"
            >
              Semua Bulan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
