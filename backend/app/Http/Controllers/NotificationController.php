<?php

namespace App\Http\Controllers;

use App\Models\DokumenKerjasama;
use App\Models\NotifikasiKerjasama;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Mail\Message;

class NotificationController extends Controller
{
    /**
     * Riwayat notifikasi (otomatis + manual) untuk satu dokumen kerja sama.
     * Dipakai halaman Monitoring — menggantikan data contoh yang dulu di localStorage.
     */
    public function riwayat(DokumenKerjasama $dokumen_kerjasama)
    {
        $riwayat = NotifikasiKerjasama::query()
            ->where('dokumen_kerjasama_id', $dokumen_kerjasama->id)
            ->orderByDesc('dikirim_pada')
            ->orderByDesc('id')
            ->get()
            ->map(fn (NotifikasiKerjasama $n) => [
                'id'          => $n->id,
                'jenis'       => $n->jenis,
                'status'      => $n->status,
                'email'       => $n->email_tujuan,
                'keterangan'  => $n->keterangan,
                'dikirim_pada' => optional($n->dikirim_pada)->toIso8601String(),
                'dibuat_pada' => $n->created_at?->toIso8601String(),
            ]);

        return response()->json(['success' => true, 'data' => $riwayat]);
    }

    /**
     * Kirim notifikasi email ke mitra kerjasama
     */
    public function sendEmail(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'subject' => 'required|string',
            'body' => 'required|string',
            'jenis' => 'required|string|in:reminder-3bulan,reminder-1bulan,urgent',
            'noDokumen' => 'required|string',
            'namaMitra' => 'required|string',
            'dokumenId' => 'nullable|integer|exists:dokumen_kerjasama,id',
        ]);

            $jenisLabel = match ($validated['jenis']) {
            'reminder-3bulan' => '⏰ Reminder 3 Bulan',
            'reminder-1bulan' => '⚠️ Reminder 1 Bulan',
            'urgent'          => '🚨 URGENT',
            default           => 'Notifikasi',
        };

        $borderColor = match ($validated['jenis']) {
            'reminder-3bulan' => '#3B82F6',
            'reminder-1bulan' => '#F59E0B',
            'urgent'          => '#EF4444',
            default           => '#173B82',
        };

        $bodyLines = nl2br(htmlspecialchars($validated['body']));

        $html = <<<HTML
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        </head>
        <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 0;">
                <tr>
                    <td align="center">
                        <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);border-top:4px solid {$borderColor};">
                            <tr>
                                <td style="background-color:#173B82;padding:24px 32px;text-align:center;">
                                    <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">SIKERMA Polibatam</p>
                                    <p style="margin:6px 0 0;font-size:12px;color:#93c5fd;">Sistem Informasi Kerja Sama — Politeknik Negeri Batam</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:28px 32px;">
                                    <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:{$borderColor};">{$jenisLabel}</p>
                                    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">No. Dokumen: <strong style="color:#1e293b;">{$validated['noDokumen']}</strong></p>
                                    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">Mitra: <strong style="color:#1e293b;">{$validated['namaMitra']}</strong></p>
                                    <div style="background:#f8fafc;border-left:4px solid {$borderColor};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
                                        <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">{$bodyLines}</p>
                                    </div>
                                    <p style="margin:0;font-size:12px;color:#94a3b8;">Email ini dikirim secara otomatis melalui sistem SIKERMA Polibatam. Harap jangan membalas email ini.</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
                                    <p style="margin:0;font-size:11px;color:#94a3b8;">© 2026 Politeknik Negeri Batam • SIKERMA</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        HTML;

        try {
            Mail::html($html, function (Message $message) use ($validated) {
                $message
                    ->to($validated['email'])
                    ->subject($validated['subject'])
                    ->from(config('mail.from.address'), config('mail.from.name'));
            });

            $this->catatPengirimanManual($validated);

            return response()->json([
                'success' => true,
                'message' => 'Email notifikasi berhasil dikirim ke ' . $validated['email'],
                'data' => [
                    'email'     => $validated['email'],
                    'jenis'     => $validated['jenis'],
                    'noDokumen' => $validated['noDokumen'],
                    'sentAt'    => now()->toIso8601String(),
                ],
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal mengirim email: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Catat pengiriman manual ke tabel notifikasi_kerjasama supaya muncul di riwayat
     * halaman Monitoring (sejajar dengan reminder terjadwal). Hanya kalau dokumenId dikirim.
     */
    private function catatPengirimanManual(array $validated): void
    {
        if (empty($validated['dokumenId'])) {
            return;
        }

        $dokumen = DokumenKerjasama::find($validated['dokumenId']);
        if ($dokumen === null) {
            return;
        }

        NotifikasiKerjasama::updateOrCreate(
            [
                'dokumen_kerjasama_id'   => $dokumen->id,
                'jenis'                  => $validated['jenis'],
                'tanggal_berakhir_acuan' => optional($dokumen->tanggal_berakhir)->toDateString(),
            ],
            [
                'email_tujuan' => $validated['email'],
                'status'       => 'terkirim',
                'keterangan'   => 'Dikirim manual dari halaman Monitoring',
                'dikirim_pada' => Carbon::now(),
            ],
        );
    }

    /**
     * Kirim notifikasi email bulk ke multiple mitra
     */
    public function sendBulk(Request $request)
    {
        $validated = $request->validate([
            'recipients' => 'required|array',
            'recipients.*.email' => 'required|email',
            'recipients.*.nama' => 'required|string',
            'recipients.*.noDokumen' => 'required|string',
            'subject' => 'required|string',
            'body' => 'required|string',
        ]);

        $results = [];
        $failed = [];

        foreach ($validated['recipients'] as $recipient) {
            try {
                Mail::raw($validated['body'], function (Message $message) use ($recipient, $validated) {
                    $message
                        ->to($recipient['email'])
                        ->subject($validated['subject'])
                        ->from(config('mail.from.address'), config('mail.from.name'));
                });

                $results[] = [
                    'email' => $recipient['email'],
                    'status' => 'success',
                ];
            } catch (\Exception $e) {
                $failed[] = [
                    'email' => $recipient['email'],
                    'error' => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'success' => \count($failed) === 0,
            'message' => 'Email notifikasi berhasil dikirim ke ' . \count($results) . ' mitra',
            'results' => $results,
            'failed' => $failed,
        ], \count($failed) === 0 ? 200 : 207);
    }
}
