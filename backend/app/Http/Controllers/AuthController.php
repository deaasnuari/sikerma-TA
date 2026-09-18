<?php

namespace App\Http\Controllers;

use App\Mail\SendResetPasswordMail;
use App\Models\MasterMitra;
use App\Models\OtpCode;
use App\Models\User;
use App\Services\CivitasAuthService;
use App\Services\StructuralAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class AuthController extends Controller
{
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
            // Unit kerja apa adanya dari data Civitas (data.UNIT_KERJA saat login LDAP) —
            // dipakai frontend buat nampilin "Unit — <nama unit kerjanya>" di navbar,
            // bukan cuma label role generik.
            'unit_kerja' => $user->unit_kerja,
        ];
    }

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'institution_name' => ['required', 'string', 'max:255'],
            'negara' => ['required', 'string', 'max:100'],
            'username' => ['required', 'string', 'min:4', 'max:50', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['required', 'string', 'max:30'],
            'position' => ['required', 'string', 'max:100'],
            'account_type' => ['required', 'string', 'max:150'],
            'tingkat_perusahaan' => ['nullable', 'string', 'in:Lokal,Nasional,Internasional,Multinasional'],
            'role' => ['nullable', 'string', Rule::in(['external'])],
            'password' => ['required', 'string', 'confirmed', Password::min(8)->letters()->mixedCase()->numbers()->symbols()],
        ]);

        $existingUser = User::query()
            ->where('email', Str::lower($validated['email']))
            ->orWhere('username', Str::lower($validated['username']))
            ->first();

        if ($existingUser) {
            throw ValidationException::withMessages([
                'email' => ['Email atau username sudah terdaftar dan tidak bisa dipakai lagi.'],
            ]);
        }

        $user = DB::transaction(function () use ($validated) {
            $user = User::create([
                'name' => $validated['name'],
                'institution_name' => $validated['institution_name'],
                'username' => Str::lower($validated['username']),
                'email' => Str::lower($validated['email']),
                'phone' => $validated['phone'],
                'position' => $validated['position'],
                'role' => 'external',
                'account_type' => $validated['account_type'],
                'approval_status' => 'active',
                'password' => Hash::make($validated['password']),
            ]);

            MasterMitra::updateOrCreate(
                ['nama_mitra' => $validated['institution_name']],
                [
                    'kategori_mitra' => $validated['account_type'],
                    'tingkat_perusahaan' => $validated['tingkat_perusahaan'] ?? null,
                    'negara' => $validated['negara'],
                    'website' => null,
                    'alamat' => null,
                    'email_mitra' => Str::lower($validated['email']),
                    'whatsapp_mitra' => $validated['phone'],
                    'nama_kontak_utama' => $validated['name'],
                    'jabatan_kontak_utama' => $validated['position'],
                    'email_kontak_utama' => Str::lower($validated['email']),
                    'telepon_kontak_utama' => $validated['phone'],
                    'aktif' => true,
                ]
            );

            return $user;
        });

        return response()->json([
            'message' => 'Registrasi mitra berhasil. Akun Anda sudah aktif dan bisa langsung login.',
            'user' => $this->toUserPayload($user),
        ], 201);
    }

    /**
     * Role yang wajib login lewat LDAP (tombol "Login dengan Akun Kampus"),
     * tidak boleh lagi login manual pakai email + password di sini.
     *
     * 'unit'/'jurusan'/'prodi' ikut di sini karena role-role ini dipakai akun civitas asli
     * hasil login LDAP — begitu login berhasil, role di-set otomatis (lihat
     * determineLdapRole()/StructuralAccessService::determineCivitasRole()) jadi salah satu
     * dari internal/jurusan/prodi/unit tergantung NIK-nya cocok Kajur/KPS/Kepala-Unit atau
     * tidak. Tidak berdampak ke akun dummy migrasi lama yang role-nya juga 'unit' — mereka
     * auth_provider='local', bukan 'ldap', jadi baris login() di bawah (yang mensyaratkan
     * KEDUANYA role masuk daftar ini DAN auth_provider='ldap') tidak ikut memblokir mereka.
     *
     * 'admin'/'admin-humas' ikut supaya akun civitas asli yang dipromosikan admin lewat
     * Manajemen User tetap bisa login lewat tombol "Login dengan Akun Kampus" (dulu ditolak
     * "bukan akun civitas Polibatam"). Role admin TIDAK ikut di-refresh otomatis
     * (lihat autoRefreshableCivitasRoles()), jadi tidak akan turun jadi internal saat login.
     */
    private function ldapOnlyRoles(): array
    {
        return ['internal', 'pimpinan', 'unit', 'jurusan', 'prodi', 'admin', 'admin-humas'];
    }

    /**
     * Role yang otomatis di-refresh tiap kali login LDAP berhasil (lihat loginLdap()) —
     * supaya kalau ada pergantian Kajur/KPS/Kepala Unit di kampus, role user langsung ikut
     * update begitu dia login lagi, tanpa perlu admin ubah manual. 'pimpinan' SENGAJA tidak
     * ikut — itu jabatan pimpinan institusi (bukan struktural jurusan/prodi/unit), murni
     * ditentukan manual oleh admin, tidak boleh ketimpa oleh deteksi NIK di sini.
     */
    private function autoRefreshableCivitasRoles(): array
    {
        return ['internal', 'jurusan', 'prodi', 'unit'];
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $identifier = Str::lower(trim($validated['email']));

        $user = User::query()
            ->whereRaw('LOWER(email) = ?', [$identifier])
            ->orWhereRaw('LOWER(username) = ?', [$identifier])
            ->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['Email atau username tidak terdaftar.'],
            ]);
        }

        
        if (in_array($user->role, $this->ldapOnlyRoles(), true) && $user->auth_provider === 'ldap') {
            throw ValidationException::withMessages([
                'email' => ['Akun civitas Polibatam sekarang login lewat tombol "Login dengan Akun Kampus".'],
            ]);
        }

        if (! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['Password yang Anda masukkan salah.'],
            ]);
        }

        if ($user->role === 'external' && $user->approval_status === 'rejected') {
            throw ValidationException::withMessages([
                'email' => ['Akun mitra Anda ditolak. Silakan hubungi admin kampus.'],
            ]);
        }

        $token = $user->createToken('web-login')->plainTextToken;

        return response()->json([
            'message' => 'Login berhasil.',
            'token_type' => 'Bearer',
            'access_token' => $token,
            'user' => $this->toUserPayload($user),
        ]);
    }
//akses login untuk akun kampus (internal) menggunakan LDAP
    public function loginLdap(Request $request, CivitasAuthService $civitasAuth): JsonResponse
    {
        $validated = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        try {
            $civitasData = $civitasAuth->loginStaff($validated['username'], $validated['password']);
        } catch (RuntimeException $e) {
            throw ValidationException::withMessages([
                'password' => [$e->getMessage()],
            ]);
        }

        $email = Str::lower(trim((string) ($civitasData['EMAIL'] ?? '')));
        $nik = $civitasData['NIK'] ?? null;

        $user = null;
        if ($nik) {
            $user = User::query()->where('nik', $nik)->first();
        }
        if (! $user && $email) {
            $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();
        }

        if (! $user) {
            $user = User::create([
                'name' => $civitasData['NAMA'] ?? $validated['username'],
                'username' => $validated['username'],
                'email' => $email ?: null,
                'nik' => $nik,
                'nip' => $civitasData['NIP'] ?? null,
                'unit_kerja' => $civitasData['UNIT_KERJA'] ?? null,
                'position' => $civitasData['STAFF'] ?? null,
                'role' => 'internal',
                'approval_status' => 'active',
                'auth_provider' => 'ldap',
                'password' => Hash::make(Str::random(40)),
            ]);
        }

        // Pastikan akun civitas Polibatam tidak bisa login manual pakai email + password di sini
        if (! in_array($user->role, $this->ldapOnlyRoles(), true)) {
            throw ValidationException::withMessages([
                'password' => ['Akun ini bukan akun civitas Polibatam. Silakan login lewat form Email & Password biasa.'],
            ]);
        }

        // Sinkronkan unit_kerja/jabatan/NIP tiap login berhasil, biar navbar dkk selalu
        // nampilin data terbaru dari Civitas (bukan cuma snapshot pas akun pertama dibuat).
        $freshProfile = array_filter([
            'unit_kerja' => $civitasData['UNIT_KERJA'] ?? null,
            'position' => $civitasData['STAFF'] ?? null,
            'nip' => $civitasData['NIP'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');

        $profileChanges = [];
        foreach ($freshProfile as $field => $value) {
            if ($user->{$field} !== $value) {
                $profileChanges[$field] = $value;
            }
        }

        if ($profileChanges) {
            $user->update($profileChanges);
        }

        // Refresh role struktural (jurusan/prodi/unit/internal) tiap login berhasil,
        // berdasarkan NIK vs data Civitas terbaru — supaya pergantian Kajur/KPS/Kepala
        // Unit langsung kepakai tanpa admin perlu ubah manual. 'pimpinan' tidak disentuh
        // (lihat autoRefreshableCivitasRoles()).
        if (in_array($user->role, $this->autoRefreshableCivitasRoles(), true)) {
            $newRole = app(StructuralAccessService::class)->determineCivitasRole(
                $user,
                $civitasData['UNIT_KERJA'] ?? null,
            );

            if ($newRole !== $user->role) {
                $user->update(['role' => $newRole]);
            }
        }

        $token = $user->createToken('web-login-ldap')->plainTextToken;

        return response()->json([
            'message' => 'Login berhasil.',
            'token_type' => 'Bearer',
            'access_token' => $token,
            'user' => $this->toUserPayload($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'message' => 'Akun tidak ditemukan atau telah dihapus.',
            ], 401);
        }

        return response()->json([
            'user' => $this->toUserPayload($user),
        ]);
    }

    public function users(): JsonResponse
    {
        $users = User::query()
            ->select(['id', 'name', 'username', 'email', 'phone', 'position', 'institution_name', 'account_type', 'approval_status', 'role'])
            ->latest('id')
            ->get()
            ->map(fn (User $user) => [
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
            ]);

        return response()->json([
            'data' => $users,
        ]);
    }

    public function updateApprovalStatus(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'approval_status' => ['required', 'string', Rule::in(['active', 'pending', 'rejected'])],
        ]);

        $user->update([
            'approval_status' => $validated['approval_status'],
        ]);

        return response()->json([
            'message' => 'Status persetujuan akun berhasil diperbarui.',
            'user' => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'approval_status' => $user->approval_status,
                'role' => $user->role,
            ],
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
        ]);

        $emailLower = Str::lower(trim($validated['email']));

        $user = User::query()->whereRaw('LOWER(email) = ?', [$emailLower])->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['Email tidak terdaftar dalam sistem.'],
            ]);
        }

        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        OtpCode::query()->where('email', $emailLower)->delete();

        OtpCode::create([
            'email'      => $emailLower,
            'otp'        => $otp,
            'form_data'  => ['type' => 'password_reset'],
            'expires_at' => now()->addMinutes(5),
            'is_used'    => false,
        ]);

        Mail::to($user->email)->send(new SendResetPasswordMail($otp));

        return response()->json([
            'message' => 'Kode OTP reset password berhasil dikirim ke email Anda. Berlaku selama 5 menit.',
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email'                 => ['required', 'string', 'email'],
            'otp'                   => ['required', 'string', 'size:6'],
            'password'              => ['required', 'string', 'confirmed', Password::min(8)],
            'password_confirmation' => ['required', 'string'],
        ]);

        $emailLower = Str::lower(trim($validated['email']));

        $otpRecord = OtpCode::query()
            ->where('email', $emailLower)
            ->where('otp', $validated['otp'])
            ->where('is_used', false)
            ->first();

        if (! $otpRecord) {
            throw ValidationException::withMessages([
                'otp' => ['Kode OTP tidak valid atau sudah digunakan.'],
            ]);
        }

        if ($otpRecord->isExpired()) {
            throw ValidationException::withMessages([
                'otp' => ['Kode OTP sudah kedaluwarsa. Silakan minta kode baru.'],
            ]);
        }

        $formData = $otpRecord->form_data;
        if (! isset($formData['type']) || $formData['type'] !== 'password_reset') {
            throw ValidationException::withMessages([
                'otp' => ['Kode OTP tidak valid untuk reset password.'],
            ]);
        }

        $user = User::query()->whereRaw('LOWER(email) = ?', [$emailLower])->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['Akun tidak ditemukan.'],
            ]);
        }

        $user->update(['password' => Hash::make($validated['password'])]);
        $otpRecord->update(['is_used' => true]);

        return response()->json([
            'message' => 'Password berhasil direset. Silakan login dengan password baru Anda.',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user && $user->currentAccessToken()) {
            $user->currentAccessToken()->delete();
        }

        return response()->json([
            'message' => 'Logout berhasil.',
        ]);
    }
}
