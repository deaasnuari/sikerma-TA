<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CarouselImage extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'image_path',
        'sort_order',
        'is_active',
        'zoom',
        'pos_x',
        'pos_y',
        'fit',
    ];
}
