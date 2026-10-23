<?php

namespace App\Http\Controllers;

use App\Models\MasterUnitProdi;
use App\Models\User;
use App\Services\StructuralAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class AdminUserController extends Controller
{
    private const APPROVAL_STATUSES = ['active', 'pending', 'rejected'];

    // Akhiran email placeholder akun titipan Distribusi CC (lihat PengajuanController::provisionDistribusiUser()).
    private const EMAIL_PLACEHOLDER_DISTRIBUSI = '@no-email.sikerma.local';

    private const STRUCTURAL_POSITION_LABELS = [
        'ketua_jurusan' => 'Ketua Jurusan',
        'ketua_prodi'   => 'Ketua Program Studi',
        'kepala_unit'   => 'Kepala Unit',
    ];

    private function allowedRoles(): array
    {
        return ['admin', 'pimpinan', 'internal', 'external', 'unit', 'jurusan', 'prodi'];
    }

    private function ensureAdminAccess(Request $request): void
    {
        $actor = $request->user();

        if (! $actor || $actor->role !== 'admin') {
            abort(403, 'Akses ditolak. Hanya admin yang dapat mengelola user.');
        }
    }

    /**
     * Jabatan struktural (Ketua Jurusan/Ketua Prodi/Kepala Unit) + nama unit/jurusan/
     * prodi-nya, buat ditampilkan di Manajemen User — dihitung dari NIK vs data Civitas
     * (StructuralAccessService), BUKAN dari role. Cuma dihitung untuk role internal/unit
     * (role lain sudah punya mekanisme akses sendiri, tidak relevan di sini).
     *
     * @return array{structural_position: ?string, structural_position_label: ?string, structural_unit_id: ?int, structural_unit_name: ?string}
     */
    private function resolveStructuralInfo(User $user): array
    {
        $empty = [
            'structural_position' => null,
            'structural_position_label' => null,
            'structural_unit_id' => null,
            'structural_unit_name' => null,
        ];

        if (! in_array(strtolower(trim((string) $user->role)), ['internal', 'unit', 'jurusan', 'prodi'], true)) {
            return $empty;
        }

        $access = app(StructuralAccessService::class)->getUserStructuralAccess($user);
        $position = $access['structural_position'];

        if (! isset(self::STRUCTURAL_POSITION_LABELS[$position])) {
            // 'dosen' (tidak terdeteksi jabatan struktural apa pun) — tetap internal/unit
            // biasa, tidak ada unit yang perlu ditampilkan.
            return $empty;
        }

        $unitProdiId = $access['jurusan_id'] ?? $access['program_studi_id'] ?? $access['unit_id'] ?? null;

        return [
            'structural_position' => $position,
            'structural_position_label' => self::STRUCTURAL_POSITION_LABELS[$position],
            'structural_unit_id' => $unitProdiId,
            'structural_unit_name' => $unitProdiId ? MasterUnitProdi::find($unitProdiId)?->nama : null,
        ];
    }

    private function toUserPayload(User $user): array
    {
        return array_merge([
            'id' => (string) $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone' => $user->phone,
            'position' => $user->position,
            'institution_name' => $user->institution_name,
            'account_type' => $user->account_type,
            'approval_status' => $user->approval_status,
            'role' => $user->role,
            // Unit yang di-assign ADMIN secara manual (beda dari structural_unit_name di
            // atas, yang itu Kepala Unit resmi terdeteksi via NIK) — ini yang ditampilkan
            // & di-prefill di form Manajemen User untuk role 'unit'.
            'unit_prodi_id' => $user->unit_prodi_id,
            'unit_prodi_nama' => $user->unitProdi?->nama,
        ], $this->resolveStructuralInfo($user));
    }

    // Rule tambahan untuk unit_prodi_id: kalau diisi, node yang direferensikan wajib
    // unit kerja (jenis_node=unit & kategori_unit=unit_kerja) — mencegah akun role
    // 'unit' salah ditautkan ke node Jurusan/Prodi.
    private function unitProdiMustBeUnitKerja(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if ($value === null) {
                return;
            }

            $isUnitKerja = MasterUnitProdi::query()
                ->where('id', $value)
                ->where('jenis_node', 'unit')
                ->where('kategori_unit', 'unit_kerja')
                ->exists();

            if (!$isUnitKerja) {
                $fail('Unit yang dipilih tidak valid. Pilih salah satu Unit kerja.');
            }
        };
    }

    private function ensureAtLeastOneAdmin(?User $targetUser = null, ?string $nextRole = null): void
    {
        $activeAdminCount = User::query()->where('role', 'admin')->count();

        if ($targetUser && $targetUser->role === 'admin') {
            if ($nextRole !== null && $nextRole !== 'admin' && $activeAdminCount <= 1) {
                abort(422, 'Minimal harus ada 1 akun admin aktif di sistem.');
            }

            if ($nextRole === null && $activeAdminCount <= 1) {
                abort(422, 'Akun admin terakhir tidak dapat dihapus.');
            }
        }
    }

    public function index(Request $request): JsonResponse
    {
        $this->ensureAdminAccess($request);

        // Akun titipan hasil pemilihan Distribusi CC (email placeholder, belum pernah login) tidak ditampilkan:
        // Manajemen User baru memuat akun kampus setelah orangnya benar-benar login ke SIKERMA.
        // Distribusi CC sendiri tidak terpengaruh (akun titipan tetap ada dan dipakai di sana).
        $users = User::query()
            ->where(function ($query) {
                $query->whereNotNull('last_login_at')
                    ->orWhereNull('email')
                    ->orWhere('email', 'not like', '%'.self::EMAIL_PLACEHOLDER_DISTRIBUSI);
            })
            ->latest('id')
            ->get()
            ->map(fn (User $user) => $this->toUserPayload($user));

        return response()->json([
            'data' => $users,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureAdminAccess($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'institution_name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:4', 'max:50', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['required', 'string', 'max:30'],
            'position' => ['nullable', 'string', 'max:100'],
            'account_type' => ['nullable', 'string', 'max:100'],
            'approval_status' => ['required', 'string', Rule::in(self::APPROVAL_STATUSES)],
            'role' => ['required', 'string', Rule::in($this->allowedRoles())],
            'unit_prodi_id' => [
                Rule::requiredIf($request->input('role') === 'unit'),
                'nullable',
                'integer',
                'exists:master_unit_prodi,id',
                $this->unitProdiMustBeUnitKerja(),
            ],
            'password' => ['required', 'string', Password::min(8)],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'institution_name' => $validated['institution_name'],
            'username' => Str::lower($validated['username']),
            'email' => Str::lower($validated['email']),
            'phone' => $validated['phone'],
            'position' => $validated['position'] ?? null,
            'role' => $validated['role'],
            'account_type' => $validated['account_type'] ?? null,
            'approval_status' => $validated['approval_status'],
            'unit_prodi_id' => $validated['unit_prodi_id'] ?? null,
            'password' => Hash::make($validated['password']),
        ]);

        return response()->json([
            'message' => 'User berhasil dibuat.',
            'user' => $this->toUserPayload($user),
        ], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->ensureAdminAccess($request);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'institution_name' => ['sometimes', 'required', 'string', 'max:255'],
            'username' => [
                'sometimes',
                'required',
                'string',
                'min:4',
                'max:50',
                'alpha_dash',
                Rule::unique('users', 'username')->ignore($user->id),
            ],
            'email' => ['sometimes', 'required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['sometimes', 'required', 'string', 'max:30'],
            'position' => ['sometimes', 'nullable', 'string', 'max:100'],
            'account_type' => ['sometimes', 'nullable', 'string', 'max:100'],
            'role' => ['sometimes', 'required', 'string', Rule::in($this->allowedRoles())],
            'unit_prodi_id' => [
                Rule::requiredIf(($request->input('role') ?? $user->role) === 'unit'),
                'nullable',
                'integer',
                'exists:master_unit_prodi,id',
                $this->unitProdiMustBeUnitKerja(),
            ],
            'password' => ['sometimes', 'required', 'string', Password::min(8)],
        ]);

        $this->ensureAtLeastOneAdmin($user, $validated['role'] ?? null);

        if (array_key_exists('username', $validated)) {
            $validated['username'] = Str::lower($validated['username']);
        }

        if (array_key_exists('email', $validated)) {
            $validated['email'] = Str::lower($validated['email']);
        }

        if (array_key_exists('password', $validated)) {
            $validated['password'] = Hash::make($validated['password']);
        }

        $user->update($validated);

        return response()->json([
            'message' => 'User berhasil diperbarui.',
            'user' => $this->toUserPayload($user),
        ]);
    }

    public function updateApprovalStatus(Request $request, User $user): JsonResponse
    {
        $this->ensureAdminAccess($request);

        $validated = $request->validate([
            'approval_status' => ['required', 'string', Rule::in(self::APPROVAL_STATUSES)],
        ]);

        $user->update([
            'approval_status' => $validated['approval_status'],
        ]);

        return response()->json([
            'message' => 'Status user berhasil diperbarui.',
            'user' => $this->toUserPayload($user),
        ]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->ensureAdminAccess($request);

        $this->ensureAtLeastOneAdmin($user);

        $user->delete();

        return response()->json([
            'message' => 'User berhasil dihapus.',
        ]);
    }
}
