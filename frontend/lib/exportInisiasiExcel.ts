import { getProtectedObjectUrl } from '@/lib/api';
import { formatTanggalInisiasi, type InisiasiItem } from '@/services/inisiasiService';

// Foto di sel dibuat thumbnail supaya file Excel tidak membengkak (foto asli bisa beberapa MB).
const FOTO_MAKS_PX = 400; // sisi terpanjang gambar yang disimpan di file
const FOTO_TAMPIL_LEBAR = 150; // kotak tampil di sel (piksel)
const FOTO_TAMPIL_TINGGI = 110;
const BARIS_TINGGI_POIN = 90; // ~120 px
const KONKURENSI_UNDUH = 8;

type Thumbnail = { buffer: ArrayBuffer; lebar: number; tinggi: number };

// Ambil foto terlindungi (butuh login), lalu kecilkan dan simpan sebagai JPEG lewat canvas. Sekaligus menangani
// WebP/PNG, yang tidak perlu dikirim utuh ke Excel. Pengecilan dilakukan saat decode (resizeWidth/Height) supaya
// foto beberapa MB tidak perlu didekode penuh dulu.
async function muatThumbnail(path: string): Promise<Thumbnail | null> {
  try {
    const objectUrl = await getProtectedObjectUrl(path);
    const blob = await (await fetch(objectUrl)).blob();

    let bitmap: ImageBitmap;
    try {
      const asli = await createImageBitmap(blob);
      const skala = Math.min(1, FOTO_MAKS_PX / Math.max(asli.width, asli.height));
      if (skala < 1) {
        const kecil = await createImageBitmap(asli, {
          resizeWidth: Math.max(1, Math.round(asli.width * skala)),
          resizeHeight: Math.max(1, Math.round(asli.height * skala)),
          resizeQuality: 'medium',
        });
        asli.close();
        bitmap = kecil;
      } else {
        bitmap = asli;
      }
    } catch {
      return null;
    }

    const lebar = bitmap.width;
    const tinggi = bitmap.height;
    const canvas = document.createElement('canvas');
    canvas.width = lebar;
    canvas.height = tinggi;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lebar, tinggi);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!jpeg) return null;

    return { buffer: await jpeg.arrayBuffer(), lebar, tinggi };
  } catch {
    return null;
  }
}

async function muatBanyak(paths: string[], onProgress?: (selesai: number, total: number) => void): Promise<Map<string, Thumbnail | null>> {
  const hasil = new Map<string, Thumbnail | null>();
  const antrean = [...new Set(paths)];
  const total = antrean.length;

  const pekerja = Array.from({ length: Math.min(KONKURENSI_UNDUH, antrean.length) }, async () => {
    while (antrean.length > 0) {
      const path = antrean.shift() as string;
      hasil.set(path, await muatThumbnail(path));
      onProgress?.(hasil.size, total);
    }
  });
  await Promise.all(pekerja);

  return hasil;
}

/**
 * Export data Inisiasi ke Excel lengkap dengan foto dokumentasinya: satu baris per kegiatan, foto-foto
 * ditanam di kolom "Foto 1", "Foto 2", dst. di sebelah kanan. ExcelJS dimuat saat dibutuhkan saja
 * (import dinamis) supaya tidak membebani halaman lain.
 */
export async function exportInisiasiKeExcel(
  items: InisiasiItem[],
  namaFile: string,
  onProgress?: (selesai: number, total: number) => void,
): Promise<void> {
  const maksFoto = Math.max(0, ...items.map((item) => item.fotos.length));

  // Library Excel dimuat bersamaan dengan pengunduhan foto, bukan menunggu satu per satu.
  const [excelModule, thumbnails] = await Promise.all([
    import('exceljs'),
    muatBanyak(items.flatMap((item) => item.fotos.map((foto) => foto.path_file)), onProgress),
  ]);
  const ExcelJS = excelModule.default;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inisiasi', { views: [{ state: 'frozen', ySplit: 1 }] });

  const kolomTeks = [
    { header: 'No', width: 5 },
    { header: 'Tanggal Kegiatan', width: 18 },
    { header: 'Judul Kegiatan', width: 32 },
    { header: 'Nama Mitra', width: 26 },
    { header: 'Deskripsi Kegiatan', width: 50 },
    { header: 'Unit Terlibat', width: 32 },
    { header: 'Jumlah Peserta', width: 10 },
    { header: 'Nama Peserta', width: 32 },
  ];
  const kolomFoto = Array.from({ length: maksFoto }, (_, i) => ({ header: `Foto ${i + 1}`, width: 23 }));
  sheet.columns = [...kolomTeks, ...kolomFoto].map((kolom) => ({ header: kolom.header, width: kolom.width }));

  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E376C' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  items.forEach((item, index) => {
    const baris = sheet.addRow([
      index + 1,
      formatTanggalInisiasi(item.tanggal_kegiatan),
      item.judul,
      item.nama_mitra,
      item.deskripsi,
      item.units.map((unit) => unit.nama).join(', '),
      item.peserta.length,
      item.peserta.map((p) => p.nama).join(', '),
    ]);
    baris.alignment = { vertical: 'top', wrapText: true };
    baris.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
    baris.getCell(7).alignment = { vertical: 'top', horizontal: 'center' };
    if (item.fotos.length > 0) baris.height = BARIS_TINGGI_POIN;

    item.fotos.forEach((foto, fotoIndex) => {
      const kolom = kolomTeks.length + fotoIndex; // indeks 0-based untuk addImage
      const thumb = thumbnails.get(foto.path_file);

      if (!thumb) {
        baris.getCell(kolom + 1).value = '(foto gagal dimuat)';
        return;
      }

      const skala = Math.min(FOTO_TAMPIL_LEBAR / thumb.lebar, FOTO_TAMPIL_TINGGI / thumb.tinggi);
      const imageId = workbook.addImage({ buffer: thumb.buffer, extension: 'jpeg' });
      sheet.addImage(imageId, {
        tl: { col: kolom + 0.05, row: baris.number - 1 + 0.05 },
        ext: { width: Math.round(thumb.lebar * skala), height: Math.round(thumb.tinggi * skala) },
      });
    });
  });

  // Garis tipis supaya antar baris mudah dibaca.
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9DCE4' } },
        left: { style: 'thin', color: { argb: 'FFD9DCE4' } },
        bottom: { style: 'thin', color: { argb: 'FFD9DCE4' } },
        right: { style: 'thin', color: { argb: 'FFD9DCE4' } },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = namaFile;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
