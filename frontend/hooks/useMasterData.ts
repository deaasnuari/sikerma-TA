import useSWR from 'swr';
import { getMasterUnitProdi, type MasterUnitProdi } from '@/services/masterUnitProdiService';
import { getMasterMitra, type MasterMitra } from '@/services/masterMitraService';
import { getMasterRuangLingkup, type MasterRuangLingkup } from '@/services/masterRuangLingkupService';
import { getMasterNegara, type MasterNegara } from '@/services/masterNegaraService';

type UnitProdiFilters = Parameters<typeof getMasterUnitProdi>[0];
type MitraFilters = Parameters<typeof getMasterMitra>[0];
type RuangLingkupFilters = Parameters<typeof getMasterRuangLingkup>[0];
type NegaraFilters = Parameters<typeof getMasterNegara>[0];

/**
 * Data referensi ini (unit/prodi, mitra, ruang lingkup, negara) dipakai berulang di banyak
 * halaman/modal (dropdown form pengajuan, filter rekap data, dst) — sebelumnya tiap komponen
 * fetch sendiri-sendiri lewat useEffect, jadi pindah antar halaman/buka-tutup modal yang sama
 * berkali-kali memicu request identik berulang. SWR meng-cache per kombinasi filter dan
 * men-dedupe request yang sama dalam window dedupingInterval (lihat SWRProvider), jadi
 * komponen manapun yang minta filter yang SAMA otomatis berbagi 1 hasil.
 *
 * Key JSON.stringify aman di sini karena filter object-nya kecil & flat (bukan data besar).
 */
function filterKey(prefix: string, filters?: object): string {
  return filters && Object.keys(filters).length > 0 ? `${prefix}:${JSON.stringify(filters)}` : prefix;
}

export function useMasterUnitProdi(filters?: UnitProdiFilters) {
  const { data, error, isLoading, mutate } = useSWR<MasterUnitProdi[]>(
    filterKey('master-unit-prodi', filters),
    () => getMasterUnitProdi(filters),
  );

  return { data: data ?? [], error, isLoading, mutate };
}

export function useMasterMitra(filters?: MitraFilters) {
  const { data, error, isLoading, mutate } = useSWR<MasterMitra[]>(
    filterKey('master-mitra', filters),
    () => getMasterMitra(filters),
  );

  return { data: data ?? [], error, isLoading, mutate };
}

export function useMasterRuangLingkup(filters?: RuangLingkupFilters) {
  const { data, error, isLoading, mutate } = useSWR<MasterRuangLingkup[]>(
    filterKey('master-ruang-lingkup', filters),
    () => getMasterRuangLingkup(filters),
  );

  return { data: data ?? [], error, isLoading, mutate };
}

export function useMasterNegara(filters?: NegaraFilters) {
  const { data, error, isLoading, mutate } = useSWR<MasterNegara[]>(
    filterKey('master-negara', filters),
    () => getMasterNegara(filters),
  );

  return { data: data ?? [], error, isLoading, mutate };
}
