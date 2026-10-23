'use client';

import { useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const POPUP_WIDTH = 320;
// 24 tahun sekaligus (sama seperti filter tahun di Rekap Data) supaya rentang yang bisa dipilih panjang.
const YEAR_PICKER_SIZE = 24;

type YearPickerProps = {
  // Tahun terpilih; null = semua tahun.
  value: string | null;
  onChange: (value: string | null) => void;
  // Tahun yang punya data: ditampilkan lebih tegas daripada tahun kosong (tetap bisa dipilih).
  availableYears?: number[];
  buttonClassName?: string;
};

/**
 * Picker tahun bergaya kalender, sama seperti filter tahun di Rekap Data: tombol + popup grid
 * 24 tahun dengan panah geser rentang, dan tautan "Semua Tahun" untuk reset.
 */
export default function YearPicker({
  value,
  onChange,
  availableYears = [],
  buttonClassName = 'input-field inline-flex min-w-[150px] items-center justify-between gap-2 px-3 py-2 text-[12px] text-gray-700 transition-colors',
}: YearPickerProps) {
  const currentYear = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [rangeStart, setRangeStart] = useState(() => Math.min(currentYear - 4, ...availableYears));
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setAlignRight(rect.left + POPUP_WIDTH > window.innerWidth - 16 && rect.right - POPUP_WIDTH >= 16);

      // Buka di rentang yang memuat tahun terpilih (atau tahun berdata terbaru), bukan rentang terakhir dilihat.
      const target = value ? Number(value) : availableYears[0];
      if (target && (target < rangeStart || target >= rangeStart + YEAR_PICKER_SIZE)) {
        setRangeStart(Math.min(target, currentYear - 4));
      }
    }
    setOpen((prev) => !prev);
  };

  const years = Array.from({ length: YEAR_PICKER_SIZE }, (_, index) => rangeStart + index);

  return (
    <div className="relative">
      <button ref={buttonRef} type="button" onClick={handleToggle} className={buttonClassName} aria-label="Filter tahun">
        <span>{value ?? 'Pilih Tahun'}</span>
        <CalendarDays size={16} className="text-gray-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-[calc(100%+8px)] z-20 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg`}
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRangeStart((prev) => prev - YEAR_PICKER_SIZE)}
                aria-label="Rentang tahun sebelumnya"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="text-[12px] font-semibold text-gray-800">
                {rangeStart} - {rangeStart + YEAR_PICKER_SIZE - 1}
              </p>
              <button
                type="button"
                onClick={() => setRangeStart((prev) => prev + YEAR_PICKER_SIZE)}
                aria-label="Rentang tahun berikutnya"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {years.map((year) => {
                const isSelected = String(year) === value;
                const hasData = availableYears.includes(year);

                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      onChange(String(year));
                      setOpen(false);
                    }}
                    className={`rounded-lg border px-2 py-2 text-[11.5px] font-medium transition-colors ${
                      isSelected
                        ? 'border-[#1E376C] bg-[#1E376C] text-white'
                        : hasData
                          ? 'border-gray-200 bg-white text-gray-800 hover:border-[#1E376C] hover:text-[#1E376C]'
                          : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <p className="text-[10px] text-gray-500">Pilih tahun untuk menampilkan data tahunan</p>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-[10px] font-semibold text-[#1E376C] transition-colors hover:text-[#2B4A93]"
              >
                Semua Tahun
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
