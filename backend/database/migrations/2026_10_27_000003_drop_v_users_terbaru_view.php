<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('DROP VIEW IF EXISTS v_users_terbaru');
    }

    public function down(): void
    {
        // View tidak dipakai aplikasi; tidak dibuat ulang.
    }
};
