'use client';

import { memo, useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export type MultiSelectOption = {
  value: number;
  label: string;
  // Header kelompok (mis. nama jurusan untuk daftar prodi). Opsi dengan group sama dikumpulkan.
  group?: string;
};

type Props = {
  options: MultiSelectOption[];
  selected: number[];
  onChange: (next: number[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  // Kotak cari baru muncul kalau opsi sebanyak ini atau lebih.
  searchThreshold?: number;
  ariaLabel?: string;
  textClassName?: string;
};

/**
 * Dropdown pilih banyak: pilihan tampil sebagai chip di dalam field (bisa dihapus satu per satu),
 * daftar opsi punya kotak cari bila cukup panjang. Gaya mengikuti field form SIKERMA (input-field).
 */
function MultiSelectDropdownImpl({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder = 'Cari...',
  emptyText = 'Tidak ada pilihan',
  disabled = false,
  searchThreshold = 6,
  ariaLabel,
  textClassName = 'text-[12px]',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const selectedOptions = useMemo(() => {
    const byValue = new Map(options.map((option) => [option.value, option]));
    return selected.map((id) => byValue.get(id)).filter((option): option is MultiSelectOption => Boolean(option));
  }, [options, selected]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) => option.label.toLowerCase().includes(keyword) || (option.group ?? '').toLowerCase().includes(keyword));
  }, [options, query]);

  const grouped = useMemo(() => {
    const groups: { name: string; items: MultiSelectOption[] }[] = [];
    filtered.forEach((option) => {
      const name = option.group ?? '';
      const existing = groups.find((group) => group.name === name);
      if (existing) existing.items.push(option);
      else groups.push({ name, items: [option] });
    });
    return groups;
  }, [filtered]);

  const toggle = (value: number) => {
    onChange(selected.includes(value) ? selected.filter((id) => id !== value) : [...selected, value]);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const showSearch = options.length >= searchThreshold;

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          } else if (e.key === 'Escape') {
            close();
          }
        }}
        className={`input-field flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left ${textClassName} ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selectedOptions.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : (
            selectedOptions.map((option) => (
              <span
                key={option.value}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#173B82] px-2 py-0.5 text-[10px] font-semibold text-white"
              >
                <span className="truncate">{option.label}</span>
                <button
                  type="button"
                  aria-label={`Hapus ${option.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(option.value);
                  }}
                  className="shrink-0 hover:opacity-75"
                >
                  <X size={10} />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
            {showSearch && (
              <div className="relative border-b border-slate-100 p-2">
                <Search size={13} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={`input-field h-8 w-full rounded-lg pl-8 pr-3 ${textClassName}`}
                />
              </div>
            )}
            <div className="max-h-56 overflow-y-auto p-1">
              {grouped.length === 0 ? (
                <p className={`px-3 py-2 ${textClassName} text-slate-400`}>{emptyText}</p>
              ) : (
                grouped.map((group) => (
                  <div key={group.name || '_'}>
                    {group.name && (
                      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group.name}</p>
                    )}
                    {group.items.map((option) => {
                      const isSelected = selectedSet.has(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggle(option.value)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left ${textClassName} hover:bg-slate-50 ${
                            isSelected ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              isSelected ? 'border-[#173B82] bg-[#173B82] text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check size={11} />}
                          </span>
                          <span className="flex-1">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// memo: form induknya sangat besar dan sering render ulang; dropdown cukup render saat props-nya berubah.
const MultiSelectDropdown = memo(MultiSelectDropdownImpl);

export default MultiSelectDropdown;
