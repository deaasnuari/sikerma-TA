"""
Bentuk beban bertahap untuk Locust (dipakai oleh uji_load.py dan uji_stress.py).
Atur kecepatan waktu dengan LOCUST_SKALA_WAKTU (1 = normal, 0.1 = sepuluh kali lebih singkat, untuk mencoba skrip).
"""
import os

from locust import LoadTestShape

SKALA = float(os.environ.get("LOCUST_SKALA_WAKTU", "1"))


class BebanBertahap(LoadTestShape):
    """Subclass mengisi `tahap`: daftar (durasi_detik, jumlah_pengguna, kecepatan_tambah_per_detik)."""

    tahap: list[tuple[float, int, float]] = []

    def tick(self):
        berlalu = self.get_run_time()
        batas = 0.0
        for durasi, pengguna, laju in self.tahap:
            batas += durasi * SKALA
            if berlalu < batas:
                return pengguna, laju
        return None  # selesai -> Locust berhenti sendiri
