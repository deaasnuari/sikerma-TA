<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Dilempar saat pengajuan sudah diubah orang lain sejak form edit dibuka
 * (token updated_at yang dikirim klien tidak cocok dengan yang ada di database).
 */
class PengajuanKonflikException extends RuntimeException
{
}
