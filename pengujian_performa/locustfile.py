"""
Uji performa SIKERMA dengan Locust (hanya permintaan BACA/GET — tidak mengubah data).

Menjalankan:
    pip install locust
    locust -f locustfile.py --host http://127.0.0.1:8000
    -> buka http://localhost:8089, isi jumlah pengguna & kecepatan penambahan, klik Start.

Akun uji diberikan lewat variabel lingkungan (JANGAN ditulis di file ini):
    LOCUST_ADMIN       = "email1:password1,email2:password2"
    LOCUST_INTERNAL    = "email:password"
    LOCUST_EKSTERNAL   = "email:password"
Boleh sebagian saja; peran yang akunnya tidak diisi dilewati.
Alternatif tanpa login: beri token langsung (dipisah koma) lewat LOCUST_TOKEN_ADMIN / LOCUST_TOKEN_INTERNAL /
LOCUST_TOKEN_EKSTERNAL (token Sanctum "Bearer"), sehingga batas login tidak berlaku.
Beberapa akun per peran dianjurkan: batas API 600 permintaan/menit PER AKUN (~10 req/detik),
jadi satu akun yang dipakai ratusan pengguna akan kena 429 (tercatat sebagai gagal).

Login dibatasi 10x/menit per IP, jadi login dilakukan SEKALI per akun (token dipakai bersama
semua pengguna virtual) dengan jeda antar login.
"""
import os
import threading
import time
import itertools

from locust import HttpUser, between, task

_lock = threading.Lock()
_token_cache: dict[str, str] = {}
_last_login = [0.0]
_rr = {"admin": itertools.count(), "internal": itertools.count(), "eksternal": itertools.count()}


def _akun(env_name: str) -> list[tuple[str, str]]:
    hasil = []
    for bagian in os.environ.get(env_name, "").split(","):
        if ":" in bagian:
            email, password = bagian.split(":", 1)
            hasil.append((email.strip(), password))
    return hasil


AKUN = {
    "admin": _akun("LOCUST_ADMIN"),
    "internal": _akun("LOCUST_INTERNAL"),
    "eksternal": _akun("LOCUST_EKSTERNAL"),
}
TOKEN = {
    peran: [t.strip() for t in os.environ.get(f"LOCUST_TOKEN_{peran.upper()}", "").split(",") if t.strip()]
    for peran in ("admin", "internal", "eksternal")
}
for _peran in TOKEN:
    if TOKEN[_peran] and not AKUN[_peran]:
        AKUN[_peran] = [(f"token-{i}", "") for i in range(len(TOKEN[_peran]))]  # penanda: peran ini aktif


def _ambil_token(client, peran: str):
    """Pilih akun bergiliran untuk peran ini; login sekali per akun dengan jeda (batas 10 login/menit)."""
    if TOKEN[peran]:
        return TOKEN[peran][next(_rr[peran]) % len(TOKEN[peran])]
    daftar = AKUN[peran]
    if not daftar:
        return None
    email, password = daftar[next(_rr[peran]) % len(daftar)]
    with _lock:
        if email in _token_cache:
            return _token_cache[email]
        selisih = time.time() - _last_login[0]
        if selisih < 7:
            time.sleep(7 - selisih)
        r = client.post(
            "/api/login",
            json={"email": email, "password": password},
            name="POST /api/login (sekali per akun)",
        )
        _last_login[0] = time.time()
        if r.status_code != 200:
            return None
        token = r.json().get("access_token")
        if token:
            _token_cache[email] = token
        return token


class _PenggunaLogin(HttpUser):
    abstract = True
    peran = ""
    wait_time = between(1, 3)  # jeda antar aksi, menyerupai orang sungguhan

    def on_start(self):
        token = _ambil_token(self.client, self.peran)
        self.client.headers.update({"Accept": "application/json", "Authorization": f"Bearer {token or ''}"})

    def _get(self, path: str, nama: str | None = None):
        self.client.get(path, name=nama or path, timeout=30)


class Publik(HttpUser):
    """Pengunjung landing page (tanpa login). Jeda lebih lama: permintaan tanpa login dibatasi 120/menit per IP,
    dan semua pengguna virtual berasal dari satu IP (komputer ini)."""
    weight = 2
    wait_time = between(5, 10)

    @task(3)
    def statistik(self):
        self.client.get("/api/public/stats", name="/api/public/stats", timeout=30)

    @task(2)
    def kerjasama_publik(self):
        self.client.get("/api/public/kerjasama", name="/api/public/kerjasama", timeout=30)

    @task(1)
    def carousel(self):
        self.client.get("/api/carousel-images", name="/api/carousel-images", timeout=30)


class Admin(_PenggunaLogin):
    peran = "admin"
    weight = 3 if AKUN["admin"] else 0  # 0 = tidak dibuat bila akunnya tidak diisi

    def on_start(self):
        if not AKUN["admin"]:
            self.stop(True)
            return
        super().on_start()

    @task(4)
    def rekap_data(self):
        self._get("/api/dokumen-kerjasama")

    @task(3)
    def dashboard_statistik(self):
        self._get("/api/dokumen-kerjasama/stats/mitra")
        self._get("/api/public/stats")

    @task(3)
    def data_pengajuan(self):
        self._get("/api/pengajuan")

    @task(2)
    def data_kemitraan(self):
        self._get("/api/master/mitra")

    @task(2)
    def permintaan_perpanjangan(self):
        self._get("/api/dokumen-kerjasama/perpanjangan/requests")

    @task(5)
    def lonceng_notifikasi(self):  # dipanggil browser tiap ~20 detik
        self._get("/api/notifikasi/jumlah-belum-dibaca")

    @task(1)
    def daftar_notifikasi(self):
        self._get("/api/notifikasi")


class Internal(_PenggunaLogin):
    peran = "internal"
    weight = 3 if AKUN["internal"] else 0

    def on_start(self):
        if not AKUN["internal"]:
            self.stop(True)
            return
        super().on_start()

    @task(4)
    def rekap_data(self):
        self._get("/api/dokumen-kerjasama")

    @task(3)
    def data_pengajuan(self):
        self._get("/api/pengajuan")

    @task(2)
    def statistik(self):
        self._get("/api/dokumen-kerjasama/stats/mitra")

    @task(5)
    def lonceng_notifikasi(self):
        self._get("/api/notifikasi/jumlah-belum-dibaca")


def _muat_token_logout() -> list[str]:
    berkas = os.path.join(os.path.dirname(os.path.abspath(__file__)), "token_logout.txt")
    try:
        with open(berkas, encoding="utf-8") as f:
            return [baris.strip() for baris in f if baris.strip()]
    except OSError:
        return []


_TOKEN_LOGOUT = _muat_token_logout()
_antrean_logout = iter(_TOKEN_LOGOUT)  # tiap token dipakai SEKALI (logout menghapusnya)


def _token_logout_berikutnya():
    with _lock:
        return next(_antrean_logout, None)


class Logout(HttpUser):
    """Skenario logout: tiap pengguna memakai token sendiri (sekali pakai), membuka beberapa halaman,
    lalu POST /api/logout. Sesudahnya token harus DITOLAK (401) -> itu hasil yang benar, bukan kegagalan.
    Token disiapkan segarkan_token.php (token_logout.txt). Bila token habis, pengguna ini berhenti."""
    weight = 1 if _TOKEN_LOGOUT else 0
    wait_time = between(8, 15)

    def on_start(self):
        self.token = _token_logout_berikutnya()
        if not self.token:
            self.stop(True)
            return
        self.client.headers.update({"Accept": "application/json", "Authorization": f"Bearer {self.token}"})

    @task
    def sesi_lalu_logout(self):
        # 1. Aktivitas singkat saat masih login
        self.client.get("/api/notifikasi/jumlah-belum-dibaca", name="/api/notifikasi/jumlah-belum-dibaca (logout)", timeout=30)
        self.client.get("/api/dokumen-kerjasama", name="/api/dokumen-kerjasama (logout)", timeout=30)

        # 2. Logout: harus 200
        self.client.post("/api/logout", name="POST /api/logout", timeout=30)

        # 3. Token sudah dihapus: akses ulang HARUS 401 (200 = logout tidak benar-benar mencabut token)
        with self.client.get(
            "/api/notifikasi/jumlah-belum-dibaca", name="GET setelah logout (harus 401)", timeout=30, catch_response=True
        ) as r:
            if r.status_code == 401:
                r.success()
            else:
                r.failure(f"Setelah logout harusnya 401, dapat {r.status_code}")

        # 4. Ambil token baru untuk sesi berikutnya (mensimulasikan login ulang)
        self.token = _token_logout_berikutnya()
        if not self.token:
            self.stop(True)
            return
        self.client.headers.update({"Authorization": f"Bearer {self.token}"})


class Eksternal(_PenggunaLogin):
    peran = "eksternal"
    weight = 2 if AKUN["eksternal"] else 0

    def on_start(self):
        if not AKUN["eksternal"]:
            self.stop(True)
            return
        super().on_start()

    @task(3)
    def daftar_kerjasama(self):
        self._get("/api/dokumen-kerjasama")

    @task(2)
    def pengajuan_saya(self):
        self._get("/api/pengajuan")

    @task(4)
    def lonceng_notifikasi(self):
        self._get("/api/notifikasi/jumlah-belum-dibaca")
