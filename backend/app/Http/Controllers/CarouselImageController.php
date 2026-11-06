<?php

namespace App\Http\Controllers;

use App\Models\CarouselImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class CarouselImageController extends Controller
{
    private const MAX_IMAGES = 7;

    private function toPublicImageUrl(Request $request, string $imagePath): string
    {
        return $request->getSchemeAndHttpHost() . '/storage/' . ltrim($imagePath, '/');
    }

    private function serialize(Request $request, CarouselImage $image): array
    {
        return [
            'id' => $image->id,
            'title' => $image->title,
            'image_path' => $image->image_path,
            'image_url' => $this->toPublicImageUrl($request, $image->image_path),
            'sort_order' => $image->sort_order,
            'is_active' => $image->is_active,
            'zoom' => (float) $image->zoom,
            'pos_x' => (float) $image->pos_x,
            'pos_y' => (float) $image->pos_y,
            'fit' => $image->fit,
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $images = CarouselImage::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (CarouselImage $image) => $this->serialize($request, $image));

        return response()->json([
            'data' => $images,
            'max_images' => self::MAX_IMAGES,
        ]);
    }

    private function ensureAdmin(Request $request): void
    {
        if (! $request->user() || $request->user()->role !== 'admin') {
            abort(403, 'Akses ditolak. Hanya admin yang dapat mengelola carousel.');
        }
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);

        $currentCount = CarouselImage::query()->where('is_active', true)->count();

        if ($currentCount >= self::MAX_IMAGES) {
            throw ValidationException::withMessages([
                'image' => ['Maksimal 7 gambar carousel aktif. Hapus salah satu gambar terlebih dahulu.'],
            ]);
        }

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'image' => [
                'required', 'image', 'mimes:jpg,jpeg,png', 'max:5120',
                'dimensions:min_width=800,min_height=350,max_width=6000,max_height=6000',
            ],
            'zoom' => ['nullable', 'numeric', 'between:0.5,3'],
            'pos_x' => ['nullable', 'numeric', 'between:0,100'],
            'pos_y' => ['nullable', 'numeric', 'between:0,100'],
            'fit' => ['nullable', 'in:cover,contain'],
        ], [
            'image.required' => 'Pilih file gambar terlebih dahulu.',
            'image.uploaded' => 'Upload gagal. Ukuran gambar melebihi batas 5 MB.',
            'image.image' => 'File harus berupa gambar (JPG atau PNG).',
            'image.mimes' => 'Format gambar harus JPG atau PNG.',
            'image.max' => 'Ukuran gambar maksimal 5 MB.',
            'image.dimensions' => 'Dimensi gambar harus antara 800x350 dan 6000x6000 piksel.',
        ]);

        $storedPath = $request->file('image')->store('carousel', 'public');

        $maxOrder = CarouselImage::query()->where('is_active', true)->max('sort_order') ?? -1;

        $image = CarouselImage::create([
            'title' => $validated['title'] ?? null,
            'image_path' => $storedPath,
            'sort_order' => $validated['sort_order'] ?? ($maxOrder + 1),
            'is_active' => true,
            'zoom' => $validated['zoom'] ?? 1,
            'pos_x' => $validated['pos_x'] ?? 50,
            'pos_y' => $validated['pos_y'] ?? 50,
            'fit' => $validated['fit'] ?? 'cover',
        ]);

        return response()->json([
            'message' => 'Gambar carousel berhasil diupload.',
            'data' => $this->serialize($request, $image),
        ], 201);
    }

    public function update(Request $request, CarouselImage $carouselImage): JsonResponse
    {
        $this->ensureAdmin($request);

        // Dipakai untuk dua hal: mengubah urutan (sort_order) dan mengatur tampilan foto di landing
        // page (zoom + titik fokus). Minimal salah satunya harus dikirim.
        $validated = $request->validate([
            'sort_order' => ['sometimes', 'required', 'integer', 'min:0', 'max:9999'],
            'zoom' => ['sometimes', 'required', 'numeric', 'between:0.5,3'],
            'pos_x' => ['sometimes', 'required', 'numeric', 'between:0,100'],
            'pos_y' => ['sometimes', 'required', 'numeric', 'between:0,100'],
            'fit' => ['sometimes', 'required', 'in:cover,contain'],
        ]);

        if ($validated === []) {
            abort(422, 'Tidak ada perubahan yang dikirim.');
        }

        $carouselImage->update($validated);

        return response()->json([
            'message' => 'Carousel diperbarui.',
            'data' => $this->serialize($request, $carouselImage->refresh()),
        ]);
    }

    public function destroy(Request $request, CarouselImage $carouselImage): JsonResponse
    {
        $this->ensureAdmin($request);

        if ($carouselImage->image_path && Storage::disk('public')->exists($carouselImage->image_path)) {
            Storage::disk('public')->delete($carouselImage->image_path);
        }

        $carouselImage->delete();

        return response()->json([
            'message' => 'Gambar carousel berhasil dihapus.',
        ]);
    }
}
