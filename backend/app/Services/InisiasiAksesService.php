<?php

namespace App\Services;

use App\Models\Inisiasi;
use App\Models\Pengajuan;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Siapa boleh melihat Inisiasi. Admin mengelola semuanya (diatur di InisiasiController); pengguna
 * internal (Kajur/Kaprodi/Kepala Unit) hanya boleh MELIHAT inisiasi yang di-CC kepadanya (peserta yang
 * tertaut akunnya) atau yang melibatkan unit dalam cakupan jabatannya (aturan scope sama dengan daftar Data Pengajuan) dan memilihnya sebagai
 * tindak lanjut di form pengajuan. Pengguna lain tidak punya akses.
 */
class InisiasiAksesService
{
    public function __construct(private StructuralAccessService $struktural) {}

    public function isAdmin(User $user): bool
    {
        return in_array($this->normalisasiRole($user), ['admin', 'admin-humas'], true);
    }

    public function isInternal(User $user): bool
    {
        return in_array($this->normalisasiRole($user), ['internal', 'unit', 'jurusan', 'prodi'], true);
    }

    /**
     * Id master unit/prodi yang inisiasinya boleh dilihat pengguna internal (kosong = tidak ada).
     *
     * @return array<int, int>
     */
    public function unitIdsInternal(User $user): array
    {
        if (! $this->isInternal($user)) {
            return [];
        }

        $akses = $this->struktural->getUserStructuralAccess($user);

        return array_values(array_filter(
            $this->struktural->resolveScopedUnitProdiIds($akses) ?? [],
            fn ($id) => (int) $id > 0,
        ));
    }

    public function bisaMelihat(User $user, Inisiasi $inisiasi): bool
    {
        if ($this->isAdmin($user)) {
            return true;
        }

        // Di-CC (dipilih sebagai peserta) selalu boleh melihat, di luar cakupan unitnya.
        if ($this->isInternal($user) && $inisiasi->peserta()->where('user_id', $user->id)->exists()) {
            return true;
        }

        $ids = $this->unitIdsInternal($user);

        return $ids !== [] && $inisiasi->units()->whereIn('unit_prodi_id', $ids)->exists();
    }

    /** Batasi query inisiasi ke yang boleh dilihat pengguna non-admin. */
    public function batasiUntuk(Builder $query, User $user): Builder
    {
        $ids = $this->unitIdsInternal($user);

        return $query->where(function (Builder $q) use ($ids, $user) {
            $q->whereHas('units', fn ($u) => $u->whereIn('unit_prodi_id', $ids ?: [0]))
                ->orWhereHas('peserta', fn ($p) => $p->where('user_id', $user->id));
        });
    }

    /**
     * Teruskan CC inisiasi ke pengajuan yang dibuat dari inisiasi itu: akun yang di-CC di inisiasi ditambahkan
     * ke distribusi_user_ids pengajuan (mekanisme Distribusi/CC yang sudah dikenali daftar, detail, dan berkas
     * pengajuan), sehingga pengajuannya ikut tampil di Data Pengajuan mereka. Hanya menambah; CC yang sudah
     * ada tidak dicabut. Mengembalikan jumlah pengajuan yang berubah.
     */
    public function teruskanCcKePengajuan(Inisiasi $inisiasi, ?Pengajuan $hanya = null): int
    {
        $ccIds = $inisiasi->peserta()->whereNotNull('user_id')->pluck('user_id')->map(fn ($id) => (int) $id)->all();
        if ($ccIds === []) {
            return 0;
        }

        $query = Pengajuan::query()->where('inisiasi_id', $inisiasi->id);
        if ($hanya) {
            $query->whereKey($hanya->id);
        }

        $berubah = 0;
        foreach ($query->get() as $pengajuan) {
            $sekarang = array_map('intval', (array) ($pengajuan->distribusi_user_ids ?? []));
            $gabung = array_values(array_unique(array_merge($sekarang, $ccIds)));

            if (count($gabung) !== count($sekarang)) {
                $pengajuan->forceFill(['distribusi_user_ids' => $gabung])->save();
                $berubah++;
            }
        }

        return $berubah;
    }

    private function normalisasiRole(User $user): string
    {
        return strtolower(str_replace([' ', '_'], '-', trim((string) $user->role)));
    }
}
