<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // 'cover' = foto memenuhi bingkai (bagian pinggir terpotong), 'contain' = foto tampil utuh.
    public function up(): void
    {
        Schema::table('carousel_images', function (Blueprint $table) {
            $table->string('fit', 10)->default('cover');
        });
    }

    public function down(): void
    {
        Schema::table('carousel_images', function (Blueprint $table) {
            $table->dropColumn('fit');
        });
    }
};
