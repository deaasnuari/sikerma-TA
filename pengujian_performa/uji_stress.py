"""
UJI STRESS (stress test): beban dinaikkan terus melewati batas wajar untuk mencari titik patah,
lalu diturunkan ke beban ringan untuk melihat apakah sistem PULIH.

Tahap (durasi, pengguna): 10 -> 50 -> 100 -> 200 -> 400 (masing-masing 60 detik), lalu pemulihan 10 pengguna 90 detik.

    locust -f uji_stress.py --host http://127.0.0.1:8000
    locust -f uji_stress.py --host http://127.0.0.1:8000 --headless --csv hasil/stress --html hasil/stress.html

Catatan: server dev satu pekerja (php artisan serve) akan sangat lambat / timeout di tahap besar — itu yang dicari.
Permintaan dibatasi timeout 30 detik per permintaan (tercatat sebagai gagal).
"""
from locustfile import Admin, Eksternal, Internal, Logout, Publik  # noqa: F401  (kelas pengguna)
import bentuk_beban


class BentukStress(bentuk_beban.BebanBertahap):
    tahap = [
        (60, 10, 5),      # pemanasan / pembanding
        (60, 50, 10),
        (60, 100, 20),
        (60, 200, 20),
        (60, 400, 40),
        (90, 10, 40),     # PEMULIHAN: apakah waktu respons kembali normal?
    ]
