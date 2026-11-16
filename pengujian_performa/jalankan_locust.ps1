# Satu skrip untuk menjalankan uji performa Locust dengan halaman web.
#
# Dari folder pengujian_performa:
#     .\jalankan_locust.ps1 -Mode load       # uji beban: 10 -> 25 -> 50 pengguna (+/- 3 menit)
#     .\jalankan_locust.ps1 -Mode stress     # uji stress: 10 -> 400 pengguna + pemulihan (+/- 7,5 menit)
#     .\jalankan_locust.ps1 -Mode bebas      # kamu atur sendiri jumlah penggunanya di halaman web
#
# Yang dilakukan skrip: (1) menyalakan backend bila belum hidup, (2) memuat token akun uji,
# (3) menjalankan Locust, (4) membuka http://localhost:8089 di browser.
# Mode load/stress langsung berjalan otomatis (tidak perlu klik Start); mode bebas: isi jumlah pengguna lalu klik Start.
# Berhenti: tekan Ctrl + C di jendela ini.

param(
    [ValidateSet("load", "stress", "bebas")]
    [string]$Mode = "load",
    [string]$Backend = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$akar = Split-Path $PSScriptRoot -Parent

# 1. Locust terpasang?
if (-not (Get-Command locust -ErrorAction SilentlyContinue)) {
    Write-Host "Locust belum terpasang. Jalankan:  pip install locust" -ForegroundColor Red
    exit 1
}

# 2. Backend hidup? Jika belum, nyalakan di jendela terpisah.
function BackendHidup {
    try { Invoke-WebRequest -Uri "$Backend/api/public/stats" -UseBasicParsing -TimeoutSec 8 | Out-Null; return $true }
    catch { return $false }
}
if (-not (BackendHidup)) {
    Write-Host "Backend belum hidup, menyalakan 'php artisan serve' di jendela baru ..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$akar\backend'; php artisan serve"
    for ($i = 0; $i -lt 30 -and -not (BackendHidup); $i++) { Start-Sleep -Seconds 1 }
    if (-not (BackendHidup)) { Write-Host "Backend tidak merespons di $Backend." -ForegroundColor Red; exit 1 }
}
Write-Host "Backend hidup di $Backend." -ForegroundColor Green

# 3. Token akun uji: dibuat baru setiap kali (token lama kedaluwarsa setelah 8 jam -> 401)
Push-Location (Join-Path $akar "backend")
try { php ..\pengujian_performa\segarkan_token.php } catch { Write-Host "Gagal memperbarui token: $_" -ForegroundColor Red }
Pop-Location
$berkasToken = Join-Path $PSScriptRoot "env_uji.ps1"
if (Test-Path $berkasToken) {
    . $berkasToken
    Write-Host "Token akun uji dimuat (admin, internal, eksternal)." -ForegroundColor Green
} else {
    Write-Host "env_uji.ps1 tidak ada: hanya pengunjung publik yang akan diuji." -ForegroundColor Yellow
}

# 4. Pilih skrip uji, buka browser, jalankan Locust
$skrip = switch ($Mode) { "load" { "uji_load.py" } "stress" { "uji_stress.py" } default { "locustfile.py" } }
if ($Mode -eq "bebas") {
    Write-Host "Mode: bebas. Membuka http://localhost:8089 - isi jumlah pengguna lalu klik Start." -ForegroundColor Cyan
    Start-Process "http://localhost:8089"
    locust -f $skrip --host $Backend
} else {
    # --autostart: tes langsung berjalan sendiri sesuai tahap (tanpa mengisi apa pun / klik Start).
    # Halaman web hanya untuk memantau grafik dan angkanya.
    Write-Host "Mode: $Mode ($skrip). Tes LANGSUNG berjalan; pantau di http://localhost:8089 (tidak perlu klik Start)." -ForegroundColor Cyan
    Start-Process "http://localhost:8089"
    locust -f $skrip --host $Backend --autostart
}
