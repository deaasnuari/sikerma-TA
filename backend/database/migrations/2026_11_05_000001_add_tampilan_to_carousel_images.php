<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Pengaturan tampilan foto di carousel landing page (seperti crop/zoom di Word): perbesaran dan
    // titik fokus (0-100%) di dalam bingkai. Default = tampilan lama (tanpa zoom, tengah).
    public function up(): void
    {
        Schema::table('carousel_images', function (Blueprint $table) {
            $table->decimal('zoom', 4, 2)->default(1);
            $table->decimal('pos_x', 5, 2)->default(50);
            $table->decimal('pos_y', 5, 2)->default(50);
        });
    }

    public function down(): void
    {
        Schema::table('carousel_images', function (Blueprint $table) {
            $table->dropColumn(['zoom', 'pos_x', 'pos_y']);
        });
    }
};
