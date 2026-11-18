<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mitra eksternal hanya boleh memakai API selama akunnya berstatus 'active'.
 *
 * Login sudah menolak mitra 'rejected'/'pending' (AuthController::login), tapi mitra yang SEDANG
 * login saat admin mengubah statusnya masih memegang token. Middleware ini mengecek status di setiap
 * permintaan ber-auth: begitu tidak aktif, token yang dipakai dicabut dan dijawab 401 dengan `reason`
 * supaya frontend bisa menampilkan alasan yang jelas di halaman login (bukan "sesi berakhir").
 */
class PastikanAkunMitraAktif
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->role === 'external' && $user->approval_status !== 'active') {
            $token = $user->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                $token->delete();
            }

            $ditolak = $user->approval_status === 'rejected';

            return response()->json([
                'message' => $ditolak
                    ? 'Akun mitra Anda ditolak. Silakan hubungi admin kampus.'
                    : 'Akun mitra Anda masih menunggu persetujuan admin.',
                'reason' => $ditolak ? 'account_rejected' : 'account_pending',
            ], 401);
        }

        return $next($request);
    }
}
