<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Pengingat masa berlaku kerja sama
    |--------------------------------------------------------------------------
    |
    | Dipakai oleh App\Services\KerjasamaReminderService + command
    | sikerma:kirim-reminder-kerjasama (dijadwalkan harian di routes/console.php).
    |
    | 'reminder_fallback_email' : alamat yang dikirimi notifikasi kalau dokumen
    |   tidak punya email pengusul maupun email mitra. Kosongkan (null) untuk
    |   melewati dokumen tanpa kontak (akan tercatat berstatus 'dilewati').
    |
    | 'windows' : ambang hari sebelum tanggal_berakhir untuk tiap jenis reminder.
    |   Reminder dikirim sekali saat sisa hari <= 'max' dan > 'min'.
    |
    */

    'reminder_fallback_email' => env('SIKERMA_REMINDER_EMAIL'),

    'windows' => [
        'reminder-3bulan' => ['min' => 30, 'max' => 90],
        'reminder-1bulan' => ['min' => 7, 'max' => 30],
        'urgent'          => ['min' => -1, 'max' => 7],
    ],
];
