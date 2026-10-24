// Membuka browser setelah dev server Next.js siap menerima koneksi.
// Dijalankan sebelum `next dev`: skrip ini langsung selesai, pemantauan berjalan di proses terpisah.
import { spawn } from 'node:child_process';

const url = process.argv[2] ?? 'http://localhost:3000';

if (process.argv[3] !== '--watch') {
  spawn(process.execPath, [process.argv[1], url, '--watch'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
  process.exit(0);
}

const deadline = Date.now() + 120_000;

async function tunggu() {
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      const [cmd, args] =
        process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', url]]
          : process.platform === 'darwin'
            ? ['open', [url]]
            : ['xdg-open', [url]];
      spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

tunggu();
