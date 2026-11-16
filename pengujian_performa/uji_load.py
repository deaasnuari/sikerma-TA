"""
UJI BEBAN (load test): beban wajar yang naik bertahap — 10 -> 25 -> 50 pengguna, masing-masing 60 detik.

    locust -f uji_load.py --host http://127.0.0.1:8000              (dengan halaman web http://localhost:8089)
    locust -f uji_load.py --host http://127.0.0.1:8000 --headless --csv hasil/load --html hasil/load.html
"""
from locustfile import Admin, Eksternal, Internal, Logout, Publik  # noqa: F401  (kelas pengguna)
import bentuk_beban


class BentukLoad(bentuk_beban.BebanBertahap):
    tahap = [
        (60, 10, 5),
        (60, 25, 5),
        (60, 50, 5),
    ]
