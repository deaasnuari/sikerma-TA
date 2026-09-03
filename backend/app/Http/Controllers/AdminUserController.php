<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class AdminUserController extends Controller
{
    private const APPROVAL_STATUSES = ['active', 'pending', 'rejected'];

    private function allowedRoles(): array
    {
        //ini 
        return ['admin', 'pimpinan', 'internal', 'external', 'unit'];
    }

    private function ensureAdminAccess(Request $request): void
    {
        $actor = $request->user();

        if (! $actor || $actor->role !== 'admin') {
            abort(403, 'Akses ditolak. Hanya admin yang dapat mengelola user.');
        }
    }

    private function toUserPayload(User $user): array
    {
        return [
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
        ];
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

        $users = User::query()
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
