<?php

namespace App\Http\Controllers;

use App\Models\Notifikasi;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Notifikasi lonceng milik pengguna yang login (tidak pernah menampilkan milik orang lain). */
class NotifikasiController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Notifikasi::query()->where('user_id', $request->user()->id);

        return response()->json([
            'data' => (clone $query)->latest('id')->limit(100)->get()->map(fn (Notifikasi $n) => $this->map($n)),
            'belum_dibaca' => (clone $query)->whereNull('dibaca_pada')->count(),
        ]);
    }

    public function baca(Request $request, int $id): JsonResponse
    {
        $notifikasi = Notifikasi::query()->where('user_id', $request->user()->id)->findOrFail($id);
        if ($notifikasi->dibaca_pada === null) {
            $notifikasi->update(['dibaca_pada' => now()]);
        }

        return response()->json(['message' => 'Notifikasi ditandai sudah dibaca.']);
    }

    public function bacaSemua(Request $request): JsonResponse
    {
        Notifikasi::query()->where('user_id', $request->user()->id)->whereNull('dibaca_pada')->update(['dibaca_pada' => now()]);

        return response()->json(['message' => 'Semua notifikasi ditandai sudah dibaca.']);
    }

    /** Tandai dibaca semua notifikasi milik pengguna yang tujuannya diawali $prefix (saat halaman tujuan dibuka). */
    public function bacaHref(Request $request): JsonResponse
    {
        // Hanya jalur halaman biasa (tanpa % atau karakter khusus LIKE) supaya pencocokan awalan aman.
        $data = $request->validate(['prefix' => ['required', 'string', 'max:200', 'regex:/^\/[A-Za-z0-9_\/\-]*$/']]);

        Notifikasi::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('dibaca_pada')
            ->where('href', 'like', $data['prefix'].'%')
            ->update(['dibaca_pada' => now()]);

        return response()->json(['message' => 'Notifikasi untuk halaman ini ditandai sudah dibaca.']);
    }

    public function hapus(Request $request, int $id): JsonResponse
    {
        Notifikasi::query()->where('user_id', $request->user()->id)->findOrFail($id)->delete();

        return response()->json(['message' => 'Notifikasi dihapus.']);
    }

    public function hapusSemua(Request $request): JsonResponse
    {
        Notifikasi::query()->where('user_id', $request->user()->id)->delete();

        return response()->json(['message' => 'Semua notifikasi dihapus.']);
    }

    private function map(Notifikasi $n): array
    {
        return [
            'id' => $n->id,
            'judul' => $n->judul,
            'pesan' => $n->pesan,
            'dari' => $n->dari,
            'href' => $n->href,
            'kategori' => $n->kategori,
            'dibaca' => $n->dibaca_pada !== null,
            'dibuat_pada' => $n->created_at?->toISOString(),
        ];
    }
}
