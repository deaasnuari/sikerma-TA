# SATU PERINTAH: uji beban (10/20/50/100 pengguna @ 5 menit) + uji stress, lalu ringkasan otomatis.
# Total sekitar 30 menit. Hasil: hasil/load_*, hasil/stress*, dan hasil/ringkasan.md
#
# Dari folder pengujian_performa:   .\jalankan_semua.ps1
# Opsi: -Tahap 10,20 (ubah tahap beban)  -TanpaStress  -TanpaBeban
# (tutup dulu 'php artisan serve' yang sedang berjalan)

param(
    [int[]]$Tahap = @(10, 20, 50, 100),
    [switch]$TanpaStress,
    [switch]$TanpaBeban,
    [string]$Backend = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$akar = Split-Path $PSScriptRoot -Parent

function BackendHidup {
    try { Invoke-WebRequest -Uri "$Backend/api/public/stats" -UseBasicParsing -TimeoutSec 5 | Out-Null; return $true }
    catch { return ($_.Exception.Response -ne $null) }
}

function SegarkanToken {
    Push-Location "$akar\backend"
    php ..\pengujian_performa\segarkan_token.php
    $kode = $LASTEXITCODE
    Pop-Location
    if ($kode -ne 0) { throw "segarkan_token.php gagal" }
    . "$PSScriptRoot\env_uji.ps1"
}

function BarisTotal($berkas) {
    # Baris "Aggregated" dari file *_stats.csv milik Locust
    if (-not (Test-Path $berkas)) { return $null }
    Import-Csv $berkas | Where-Object { $_.Name -eq "Aggregated" } | Select-Object -First 1
}

if (-not (Get-Command locust -ErrorAction SilentlyContinue)) {
    Write-Host "Locust belum terpasang. Jalankan:  pip install locust" -ForegroundColor Red; exit 1
}
# Bersihkan sisa 'php artisan serve' yang masih memegang port (proses anak php.exe sering tertinggal)
$port = ([uri]$Backend).Port
$sisa = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
foreach ($s in $sisa) {
    $p = Get-Process -Id $s.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq "php") {
        Write-Host "Mematikan sisa backend (php, PID $($p.Id)) di port $port ..." -ForegroundColor Yellow
        Stop-Process -Id $p.Id -Force
        Start-Sleep -Seconds 2
    }
}
if (BackendHidup) {
    Write-Host "Port $port dipakai program lain (bukan php), tutup dulu lalu jalankan ulang." -ForegroundColor Red; exit 1
}

Write-Host "Menyalakan backend pengujian (API_IP_LIMIT=100000) ..." -ForegroundColor Cyan
$proses = Start-Process powershell -PassThru -ArgumentList "-NoExit", "-Command", "`$env:API_IP_LIMIT='100000'; Set-Location '$akar\backend'; php artisan serve"
for ($i = 0; $i -lt 30 -and -not (BackendHidup); $i++) { Start-Sleep -Seconds 1 }
if (-not (BackendHidup)) { taskkill /PID $proses.Id /T /F | Out-Null; Write-Host "Backend tidak merespons." -ForegroundColor Red; exit 1 }

New-Item -ItemType Directory -Force -Path "hasil" | Out-Null
$mulai = Get-Date

try {
    if (-not $TanpaBeban) {
        foreach ($u in $Tahap) {
            Write-Host "`n=== BEBAN $u pengguna (5 menit) ===" -ForegroundColor Green
            SegarkanToken
            locust -f locustfile.py --host $Backend --headless -u $u -r 5 -t 5m `
                --csv "hasil/load_${u}user_5menit" --html "hasil/load_${u}user_5menit.html"
            Write-Host "Jeda 70 detik agar hitungan batas per menit kosong ..."
            Start-Sleep -Seconds 70
        }
    }
    if (-not $TanpaStress) {
        Write-Host "`n=== STRESS (10 -> 400 pengguna + pemulihan) ===" -ForegroundColor Green
        SegarkanToken
        locust -f uji_stress.py --host $Backend --headless --csv "hasil/stress" --html "hasil/stress.html"
    }
}
finally {
    taskkill /PID $proses.Id /T /F | Out-Null
    Write-Host "Backend pengujian dimatikan." -ForegroundColor Yellow
}

# ---- Ringkasan otomatis ----
$baris = @("# Ringkasan Pengujian Locust", "", "Dijalankan: $($mulai.ToString('yyyy-MM-dd HH:mm'))  |  Durasi: $([int]((Get-Date) - $mulai).TotalMinutes) menit", "",
           "| Skenario | Permintaan | Gagal | Gagal % | Rata-rata (ms) | Median (ms) | p95 (ms) | RPS |",
           "|---|---:|---:|---:|---:|---:|---:|---:|")
$daftar = @()
if (-not $TanpaBeban) { $daftar += $Tahap | ForEach-Object { @{ N = "Beban $_ pengguna"; F = "hasil/load_${_}user_5menit_stats.csv" } } }
if (-not $TanpaStress) { $daftar += @{ N = "Stress 10-400 pengguna"; F = "hasil/stress_stats.csv" } }
foreach ($d in $daftar) {
    $t = BarisTotal $d.F
    if ($null -eq $t) { $baris += "| $($d.N) | (tidak ada data) | | | | | | |"; continue }
    $req = [double]$t.'Request Count'; $gal = [double]$t.'Failure Count'
    $pct = if ($req -gt 0) { [math]::Round(100 * $gal / $req, 2) } else { 0 }
    $baris += "| $($d.N) | $req | $gal | $pct | $([math]::Round([double]$t.'Average Response Time', 0)) | $($t.'Median Response Time') | $($t.'95%') | $([math]::Round([double]$t.'Requests/s', 2)) |"
}
$baris | Set-Content -Encoding utf8 "hasil/ringkasan.md"

Write-Host ""
$baris | ForEach-Object { Write-Host $_ }
Write-Host "`nSelesai. Ringkasan: pengujian_performa\hasil\ringkasan.md" -ForegroundColor Green
