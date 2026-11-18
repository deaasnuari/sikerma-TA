@echo off
rem Klik dua kali: uji beban + uji stress + ringkasan otomatis (+/- 30 menit).
rem Tutup dulu "php artisan serve" yang sedang menyala.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0jalankan_semua.ps1" %*
echo.
pause
