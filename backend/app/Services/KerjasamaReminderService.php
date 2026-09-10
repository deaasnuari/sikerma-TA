<?php

namespace App\Services;

use App\Mail\KerjasamaReminderMail;
use App\Models\DokumenKerjasama;
use App\Models\NotifikasiKerjasama;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Mengirim email pengingat masa berlaku dokumen kerja sama secara otomatis.
 *
 * Dipakai oleh command sikerma:kirim-reminder-kerjasama yang dijadwalkan harian
 * (routes/console.php). Aman dijalankan berkali-kali dalam sehari: tabel
 * notifikasi_kerjasama mencatat tiap pengiriman dan mencegah kirim dobel lewat
 * kombinasi unik (dokumen, jenis, tanggal_berakhir_acuan).
 */
class KerjasamaReminderService
{
    /**
     * @return array{terkirim:int, gagal:int, dilewati:int, sudah_pernah:int, baris:array<int,array<string,mixed>>}
     */
    public function jalankan(?Carbon $hariIni = null, bool $dryRun = false): array
    {
        $hariIni = CarbonImmutable::parse(($hariIni ?? Carbon::now())->toDateString());

        $ringkas = ['terkirim' => 0, 'gagal' => 0, 'dilewati' => 0, 'sudah_pernah' => 0, 'baris' => []];

        foreach (config('sikerma.windows') as $jenis => $window) {
            // Kirim saat sisa hari <= max DAN > min  =>  batas tanggal_berakhir:
            //   tanggal_berakhir <= hariIni + max   (sisa <= max)
            //   tanggal_berakhir >= hariIni + min+1 (sisa > min)
            $batasAtas = $hariIni->addDays((int) $window['max'])->toDateString();
            $batasBawah = $hariIni->addDays((int) $window['min'] + 1)->toDateString();

            $dokumenList = DokumenKerjasama::query()
                ->with(['mitra', 'pengajuan', 'unitProdi'])
                ->whereIn('status_siklus', ['active', 'expiring'])
                ->whereNull('dihapus_admin_pada')
                ->whereNull('dihapus_user_pada')
                ->whereNull('diarsipkan_pada')
                ->whereNotNull('tanggal_berakhir')
                ->whereDate('tanggal_berakhir', '<=', $batasAtas)
                ->whereDate('tanggal_berakhir', '>=', $batasBawah)
                ->orderBy('tanggal_berakhir')
                ->get();

            foreach ($dokumenList as $dokumen) {
                $tanggalAcuan = $dokumen->tanggal_berakhir->toDateString();

                $sudahTerkirim = NotifikasiKerjasama::query()
                    ->where('dokumen_kerjasama_id', $dokumen->id)
                    ->where('jenis', $jenis)
                    ->where('tanggal_berakhir_acuan', $tanggalAcuan)
                    ->where('status', 'terkirim')
                    ->exists();

                if ($sudahTerkirim) {
                    $ringkas['sudah_pernah']++;
                    continue;
                }

                $sisaHari = $hariIni->diffInDays(CarbonImmutable::parse($tanggalAcuan), false);
                $email = $this->cariEmailTujuan($dokumen);
                $namaMitra = $this->namaMitra($dokumen);
                $nomor = $this->nomorDokumen($dokumen);

                $baris = [
                    'dokumen_id' => $dokumen->id,
                    'nomor' => $nomor,
                    'mitra' => $namaMitra,
                    'jenis' => $jenis,
                    'tanggal_berakhir' => $tanggalAcuan,
                    'sisa_hari' => $sisaHari,
                    'email' => $email,
                    'status' => null,
                ];

                if ($email === null) {
                    $baris['status'] = 'dilewati';
                    $ringkas['dilewati']++;
                    if (! $dryRun) {
                        $this->catat($dokumen, $jenis, $tanggalAcuan, [
                            'status' => 'dilewati',
                            'email_tujuan' => null,
                            'keterangan' => 'Tidak ada email pengusul/mitra yang valid',
                            'dikirim_pada' => null,
                        ]);
                    }
                    $ringkas['baris'][] = $baris;
                    continue;
                }

                if ($dryRun) {
                    $baris['status'] = 'akan-dikirim';
                    $ringkas['baris'][] = $baris;
                    continue;
                }

                try {
                    $subjek = $this->subjek($jenis, $nomor, $tanggalAcuan);
                    $html = $this->html($jenis, $nomor, $namaMitra, $dokumen, $tanggalAcuan, $sisaHari);

                    Mail::to($email)->send(
                        new KerjasamaReminderMail($subjek, $html, $jenis, $dokumen->id),
                    );

                    $this->catat($dokumen, $jenis, $tanggalAcuan, [
                        'status' => 'terkirim',
                        'email_tujuan' => $email,
                        'keterangan' => null,
                        'dikirim_pada' => Carbon::now(),
                    ]);
                    $baris['status'] = 'terkirim';
                    $ringkas['terkirim']++;
                } catch (\Throwable $e) {
                    $this->catat($dokumen, $jenis, $tanggalAcuan, [
                        'status' => 'gagal',
                        'email_tujuan' => $email,
                        'keterangan' => Str::limit($e->getMessage(), 500),
                        'dikirim_pada' => null,
                    ]);
                    $baris['status'] = 'gagal';
                    $ringkas['gagal']++;
                }

                $ringkas['baris'][] = $baris;
            }
        }

        return $ringkas;
    }

    private function catat(DokumenKerjasama $dokumen, string $jenis, string $tanggalAcuan, array $data): void
    {
        NotifikasiKerjasama::updateOrCreate(
            [
                'dokumen_kerjasama_id' => $dokumen->id,
                'jenis' => $jenis,
                'tanggal_berakhir_acuan' => $tanggalAcuan,
            ],
            $data,
        );
    }

    private function cariEmailTujuan(DokumenKerjasama $dokumen): ?string
    {
        $kandidat = [
            $dokumen->pengajuan->email_pengusul ?? null,
            $dokumen->snap_email_pengusul,
            $dokumen->mitra->email_mitra ?? null,
            $dokumen->mitra->email_kontak_utama ?? null,
            config('sikerma.reminder_fallback_email'),
        ];

        foreach ($kandidat as $email) {
            $email = trim((string) $email);
            if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $email;
            }
        }

        return null;
    }

    private function namaMitra(DokumenKerjasama $dokumen): string
    {
        return $dokumen->mitra->nama_mitra
            ?? $dokumen->pengajuan->nama_mitra
            ?? $dokumen->snap_nama_mitra
            ?? '-';
    }

    private function nomorDokumen(DokumenKerjasama $dokumen): string
    {
        return $dokumen->nomor_dokumen
            ?: ($dokumen->no_permohonan ?: 'DOK-' . $dokumen->id);
    }

    private function subjek(string $jenis, string $nomor, string $tanggalBerakhir): string
    {
        return match ($jenis) {
            'reminder-3bulan' => "[SIKERMA] Pengingat: kerja sama {$nomor} berakhir dalam ±3 bulan",
            'reminder-1bulan' => "[SIKERMA] Pengingat: kerja sama {$nomor} berakhir dalam ±1 bulan",
            'urgent'          => "[SIKERMA] URGENT: kerja sama {$nomor} berakhir {$tanggalBerakhir}",
            default           => "[SIKERMA] Pengingat masa berlaku kerja sama {$nomor}",
        };
    }

    private function html(
        string $jenis,
        string $nomor,
        string $namaMitra,
        DokumenKerjasama $dokumen,
        string $tanggalBerakhir,
        int $sisaHari,
    ): string {
        $label = match ($jenis) {
            'reminder-3bulan' => '⏰ Pengingat 3 Bulan',
            'reminder-1bulan' => '⚠️ Pengingat 1 Bulan',
            'urgent'          => '🚨 URGENT — Segera Berakhir',
            default           => 'Pengingat',
        };
        $warna = match ($jenis) {
            'reminder-3bulan' => '#3B82F6',
            'reminder-1bulan' => '#F59E0B',
            'urgent'          => '#EF4444',
            default           => '#173B82',
        };

        $unit = $dokumen->unitProdi->nama ?? '-';
        $jenisDok = strtoupper((string) $dokumen->jenis_dokumen) ?: '-';
        $sisaTeks = $sisaHari <= 0 ? 'jatuh tempo hari ini / terlewat' : "{$sisaHari} hari lagi";

        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES);
        $nomor = $e($nomor);
        $namaMitra = $e($namaMitra);
        $unit = $e($unit);
        $jenisDok = $e($jenisDok);
        $tanggalBerakhir = $e($tanggalBerakhir);
        $sisaTeks = $e($sisaTeks);

        return <<<HTML
        <!DOCTYPE html>
        <html lang="id">
        <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
        <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 0;">
                <tr><td align="center">
                    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);border-top:4px solid {$warna};">
                        <tr><td style="background-color:#173B82;padding:24px 32px;text-align:center;">
                            <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">SIKERMA Polibatam</p>
                            <p style="margin:6px 0 0;font-size:12px;color:#93c5fd;">Sistem Informasi Kerja Sama — Politeknik Negeri Batam</p>
                        </td></tr>
                        <tr><td style="padding:28px 32px;">
                            <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:{$warna};">{$label}</p>
                            <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.7;">Dokumen kerja sama berikut akan segera berakhir masa berlakunya. Mohon ditindaklanjuti: ajukan perpanjangan atau hubungi mitra terkait melalui menu <strong>Monitoring</strong> di SIKERMA.</p>
                            <table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;color:#334155;background:#f8fafc;border-left:4px solid {$warna};border-radius:0 8px 8px 0;padding:4px 0;">
                                <tr><td style="padding:6px 20px;color:#64748b;">Nomor dokumen</td><td style="padding:6px 20px;font-weight:700;">{$nomor}</td></tr>
                                <tr><td style="padding:6px 20px;color:#64748b;">Jenis</td><td style="padding:6px 20px;font-weight:700;">{$jenisDok}</td></tr>
                                <tr><td style="padding:6px 20px;color:#64748b;">Mitra</td><td style="padding:6px 20px;font-weight:700;">{$namaMitra}</td></tr>
                                <tr><td style="padding:6px 20px;color:#64748b;">Unit</td><td style="padding:6px 20px;font-weight:700;">{$unit}</td></tr>
                                <tr><td style="padding:6px 20px;color:#64748b;">Tanggal berakhir</td><td style="padding:6px 20px;font-weight:700;">{$tanggalBerakhir} ({$sisaTeks})</td></tr>
                            </table>
                            <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">Email ini dikirim otomatis oleh sistem SIKERMA Polibatam. Harap jangan membalas email ini.</p>
                        </td></tr>
                        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
                            <p style="margin:0;font-size:11px;color:#94a3b8;">© 2026 Politeknik Negeri Batam • SIKERMA</p>
                        </td></tr>
                    </table>
                </td></tr>
            </table>
        </body>
        </html>
        HTML;
    }
}
