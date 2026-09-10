<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Email pengingat masa berlaku kerja sama (dibangun oleh KerjasamaReminderService).
 * Subjek & isi HTML sudah jadi saat konstruksi supaya logika pemilihan template
 * tetap di satu tempat (service) dan Mailable ini cukup jadi pembungkus.
 */
class KerjasamaReminderMail extends Mailable
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public string $subjek,
        public string $htmlBody,
        public string $jenis,
        public int $dokumenKerjasamaId,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->subjek,
            from: new \Illuminate\Mail\Mailables\Address(
                config('mail.from.address'),
                config('mail.from.name'),
            ),
        );
    }

    public function content(): Content
    {
        return new Content(htmlString: $this->htmlBody);
    }
}
