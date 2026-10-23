'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Opsi berupa teks biasa (value = teks tampilan) atau pasangan value/label bila nilai yang dikirim
// berbeda dari teks yang ditampilkan (mis. value "id:12", label "Teknik Informatika").
export type FilterOption = string | { value: string; label: string };

export type FilterOptionGroup = {
  label: string;
  options: FilterOption[];
};

const optionValue = (option: FilterOption) => (typeof option === 'string' ? option : option.value);
const optionLabel = (option: FilterOption) => (typeof option === 'string' ? option : option.label);

type GroupedFilterSelectProps = {
  value: string;
  onChange: (value: string) => void;
  /** Teks yang ditampilkan untuk opsi teratas ("semua data"). */
  allLabel: string;
  /** Value yang dikirim ke onChange saat opsi teratas dipilih — default sama dengan allLabel.
   *  Pakai ini kalau teks tampilan berubah-ubah (mis. per tab) tapi value harus tetap konstan. */
  allValue?: string;
  groups: FilterOptionGroup[];
  className?: string;
  buttonClassName?: string;
};

/**
 * Pengganti <select><optgroup> bawaan browser — dipakai di halaman yang butuh dropdown
 * filter terkelompok (Jurusan/Program Studi/Unit Kerja) TAPI juga butuh kontrol penuh atas
 * posisi & tinggi popup-nya (native <select> tidak bisa diatur lewat CSS sama sekali).
 *
 * Otomatis membuka ke atas kalau ruang di bawah tidak cukup, supaya tidak kepotong/mepet
 * footer atau navbar — dan tinggi list dibatasi + bisa di-scroll (max-h-80).
 */
export default function GroupedFilterSelect({
  value,
  onChange,
  allLabel,
  allValue,
  groups,
  className = '',
  buttonClassName,
}: GroupedFilterSelectProps) {
  const resolvedAllValue = allValue ?? allLabel;
  const selectedLabel =
    groups.flatMap((group) => group.options).map((option) => ({ value: optionValue(option), label: optionLabel(option) })).find((option) => option.value === value)?.label ??
    value;
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const trigger = containerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedPanelHeight = 320; // ~ max-h-80
      setDropUp(spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow);
    }

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={
          buttonClassName ??
          'input-field flex min-w-[220px] items-center justify-between gap-2 px-3 py-2 text-[12px] text-gray-700 cursor-pointer'
        }
      >
        <span className="truncate">{value === resolvedAllValue ? allLabel : selectedLabel || allLabel}</span>
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute left-0 z-30 w-full min-w-[240px] rounded-xl border border-gray-200 bg-white shadow-lg ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <div className="max-h-80 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange(resolvedAllValue);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-[12px] ${
                value === resolvedAllValue ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {allLabel}
            </button>

            {groups.map((group, groupIndex) =>
              group.options.length > 0 ? (
                <div key={group.label || `group-${groupIndex}`} className="mt-1">
                  {group.label && (
                    <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{group.label}</p>
                  )}
                  {group.options.map((option) => (
                    <button
                      key={optionValue(option)}
                      type="button"
                      onClick={() => {
                        onChange(optionValue(option));
                        setOpen(false);
                      }}
                      className={`block w-full rounded-lg px-3 py-2 text-left text-[12px] ${
                        value === optionValue(option) ? 'bg-[#173B82]/10 font-semibold text-[#173B82]' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {optionLabel(option)}
                    </button>
                  ))}
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}
