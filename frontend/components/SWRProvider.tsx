'use client';

import { SWRConfig } from 'swr';

/**
 * Cache SWR di sini cuma dipakai untuk data referensi/master yang SAMA untuk semua user
 * (unit/prodi, mitra, ruang lingkup, negara — lihat hooks/useMasterData.ts), BUKAN untuk
 * data yang scoped per user/role (pengajuan, dokumen kerjasama, dsb). Kalau nanti ada yang
 * mau pakai SWR untuk data scoped-per-user, tiru pola invalidateUserScopedCaches() di
 * context/AuthContext.tsx supaya cache-nya ikut dikosongkan saat ganti akun di tab yang sama.
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 30000,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
