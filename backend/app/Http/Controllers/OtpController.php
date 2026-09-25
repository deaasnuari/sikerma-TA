<?php

namespace App\Http\Controllers;

use App\Mail\SendOtpMail;
use App\Models\MasterMitra;
use App\Services\MasterMitraResolver;
use App\Models\OtpCode;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class OtpController extends Controller
{
    /**
     * Step 1: Terima data form, generate OTP 6 digit, kirim ke email, simpan ke DB.
     */
    public function sendOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'                  => ['required', 'string', 'max:255'],
            'institution_name'      => ['required', 'string', 'max:255'],
            'negara'                => ['required', 'string', 'max:100'],
            'username'              => ['required', 'string', 'min:4', 'max:50', 'alpha_dash'],
            'email'                 => ['required', 'string', 'email', 'max:255'],
            'phone'                 => ['required', 'string', 'max:30'],
            'position'              => ['required', 'string', 'max:100'],
            'account_type'          => ['required', 'string', 'max:150'],
            'tingkat_perusahaan'    => ['nullable', 'string', 'in:Lokal,Nasional,Internasional,Multinasional'],
            'mitra_id'              => ['nullable', 'integer', 'exists:master_mitra,id'],
            'password'              => ['required', 'string', 'confirmed', Password::min(8)->letters()->mixedCase()->numbers()->symbols()],
            'password_confirmation' => ['required', 'string'],
        ]);

        // Cek apakah email atau username sudah terdaftar di tabel users
        $existingUser = User::query()
            ->where('email', Str::lower($validated['email']))
            ->orWhere('username', Str::lower($validated['username']))
            ->first();

        if ($existingUser) {
            throw ValidationException::withMessages([
                'email' => ['Email atau username sudah terdaftar.'],
            ]);
        }

        // Generate OTP 6 digit
        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        // Hapus OTP lama untuk email yang sama (cleanup sebelum insert baru)
        OtpCode::query()->where('email', Str::lower($validated['email']))->delete();

        // Simpan OTP baru beserta data form ke database
        OtpCode::create([
            'email'      => Str::lower($validated['email']),
            'otp'        => $otp,
            // Password disimpan sebagai hash, bukan teks asli (tabel ini menyimpan isi form
            // sampai OTP diverifikasi).
            'form_data'  => array_merge(
                collect($validated)->except(['password', 'password_confirmation'])->all(),
                ['password_hash' => Hash::make($validated['password'])]
            ),
            'expires_at' => now()->addMinutes(5),
            'is_used'    => false,
        ]);

        // Kirim email OTP
        Mail::to($validated['email'])->send(new SendOtpMail($otp));

        return response()->json([
            'message' => 'Kode OTP berhasil dikirim ke email Anda. Berlaku selama 5 menit.',
        ]);
    }

    /**
     * Step 2: Verifikasi OTP, jika valid simpan user ke database.
     */
    public function verifyOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
            'otp'   => ['required', 'string', 'size:6'],
        ]);

        $emailLower = Str::lower($validated['email']);

        // Cari record OTP yang belum dipakai
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

        // Cek kedaluwarsa
        if ($otpRecord->isExpired()) {
            throw ValidationException::withMessages([
                'otp' => ['Kode OTP sudah kedaluwarsa. Silakan minta kode baru.'],
            ]);
        }

        // Ambil data form yang disimpan saat send-otp
        $formData = $otpRecord->form_data;

        $user = DB::transaction(function () use ($formData, $emailLower, $otpRecord) {
            $user = User::create([
                'name'             => $formData['name'],
                'institution_name' => $formData['institution_name'],
                'username'         => Str::lower($formData['username']),
                'email'            => $emailLower,
                'phone'            => $formData['phone'],
                'position'         => $formData['position'],
                'role'             => 'external',
                'account_type'     => $formData['account_type'],
                'approval_status'  => 'active',
                // password_hash = format baru; 'password' = OTP lama yang dikirim sebelum perubahan ini.
                'password'         => $formData['password_hash'] ?? Hash::make($formData['password']),
            ]);

            // Satu instansi = satu baris Data Kemitraan: pakai mitra yang dipilih di form
            // (autocomplete) atau yang namanya cocok; data yang sudah ada tidak ditimpa.
            app(MasterMitraResolver::class)->resolveForRegistration(
                isset($formData['mitra_id']) ? (int) $formData['mitra_id'] : null,
                $formData['institution_name'],
                [
                    'kategori_mitra' => $formData['account_type'],
                    'tingkat_perusahaan' => $formData['tingkat_perusahaan'] ?? null,
                    'negara' => $formData['negara'],
                    'email_mitra' => $emailLower,
                    'whatsapp_mitra' => $formData['phone'],
                    'nama_kontak_utama' => $formData['name'],
                    'jabatan_kontak_utama' => $formData['position'],
                    'email_kontak_utama' => $emailLower,
                    'telepon_kontak_utama' => $formData['phone'],
                ],
                $user->id
            );

            // Isi form (termasuk hash password) tidak disimpan lagi setelah akun dibuat.
            $otpRecord->update(['is_used' => true, 'form_data' => []]);

            return $user;
        });

        return response()->json([
            'message' => 'Registrasi mitra berhasil. Akun Anda sudah aktif dan bisa langsung login.',
            'user'    => [
                'id'              => (string) $user->id,
                'name'            => $user->name,
                'username'        => $user->username,
                'email'           => $user->email,
                'phone'           => $user->phone,
                'position'        => $user->position,
                'institution_name'=> $user->institution_name,
                'negara'          => $formData['negara'],
                'account_type'    => $user->account_type,
                'approval_status' => $user->approval_status,
                'role'            => $user->role,
            ],
        ], 201);
    }
}
