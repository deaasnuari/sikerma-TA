<?php

namespace Tests\Unit;

use App\Support\KerjasamaStatus;
use Tests\TestCase;

/**
 * Aturan tunggal status kerjasama (active/expiring/archived) yang dipakai bersama oleh
 * Rekap Data, Monitoring, Status & Progres Kerjasama, dan Arsip Dokumen lewat
 * DokumenKerjasama::status_efektif — supaya jumlah "Kadaluarsa" selalu konsisten.
 */
class KerjasamaStatusTest extends TestCase
{
    public function test_diarsipkan_manual_selalu_archived_walau_belum_lewat_tanggal(): void
    {
        $tanggalJauhDiMasaDepan = now()->addYear()->toDateString();

        $this->assertSame(
            'archived',
            KerjasamaStatus::fromTanggalBerakhir($tanggalJauhDiMasaDepan, 'archived')
        );
    }

    public function test_tanggal_berakhir_sudah_lewat_otomatis_archived_walau_status_siklus_masih_active(): void
    {
        $tanggalSudahLewat = now()->subDay()->toDateString();

        $this->assertSame(
            'archived',
            KerjasamaStatus::fromTanggalBerakhir($tanggalSudahLewat, 'active')
        );
    }

    public function test_dalam_90_hari_ke_depan_expiring(): void
    {
        $this->assertSame(
            'expiring',
            KerjasamaStatus::fromTanggalBerakhir(now()->addDays(30)->toDateString(), 'active')
        );

        $this->assertSame(
            'expiring',
            KerjasamaStatus::fromTanggalBerakhir(now()->addDays(90)->toDateString(), 'active')
        );
    }

    public function test_lebih_dari_90_hari_ke_depan_active(): void
    {
        $this->assertSame(
            'active',
            KerjasamaStatus::fromTanggalBerakhir(now()->addDays(91)->toDateString(), 'active')
        );
    }

    public function test_tanggal_berakhir_kosong_dianggap_active(): void
    {
        $this->assertSame('active', KerjasamaStatus::fromTanggalBerakhir(null, 'active'));
        $this->assertSame('active', KerjasamaStatus::fromTanggalBerakhir('', null));
    }

    public function test_tanggal_tidak_valid_dianggap_active_bukan_error(): void
    {
        $this->assertSame('active', KerjasamaStatus::fromTanggalBerakhir('bukan-tanggal', 'active'));
    }
}
