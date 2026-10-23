import type { PengajuanItem } from '@/services/adminPengajuanService';

function salamWaktu(): string {
  const jam = new Date().getHours();
  if (jam < 11) return 'pagi';
  if (jam < 15) return 'siang';
  if (jam < 18) return 'sore';
  return 'malam';
}

/**
 * Pesan pembuka singkat saat admin menekan tombol WhatsApp PIC: perkenalan + minta konfirmasi
 * bahwa nomornya benar. Detail pengajuan dibahas setelah PIC membalas.
 */
export function buildPesanWhatsAppPengajuan(item: PengajuanItem, namaPenerima?: string | null): string {
  const sapaan = namaPenerima?.trim() ? `Bapak/Ibu ${namaPenerima.trim()}` : 'Bapak/Ibu';

  return [
    `Selamat ${salamWaktu()}, ${sapaan}.`,
    `Perkenalkan, kami dari Humas dan Kerja Sama Politeknik Negeri Batam. Kami menghubungi terkait pengajuan kerja sama "${item.judulPengajuan}" (${item.nomorPengajuan}).`,
    'Mohon konfirmasi apakah nomor ini benar dapat dihubungi. Terima kasih.',
  ].join('\n\n');
}

/** Tautan wa.me untuk nomor yang disimpan lengkap (mis. 0812…/62812…); nomor lokal 0 diubah ke 62. */
export function buatUrlWhatsApp(nomor?: string | null, pesan?: string): string | null {
  let digits = (nomor || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  return digits ? `https://wa.me/${digits}${pesan ? `?text=${encodeURIComponent(pesan)}` : ''}` : null;
}

/** Tautan wa.me untuk PIC Polibatam: nomornya disimpan tanpa kode negara karena form sudah memberi awalan +62. */
export function buatUrlWhatsAppPolibatam(nomor?: string | null, pesan?: string): string | null {
  const lokal = (nomor || '').replace(/\D/g, '').replace(/^62/, '').replace(/^0+/, '');
  return lokal ? `https://wa.me/62${lokal}${pesan ? `?text=${encodeURIComponent(pesan)}` : ''}` : null;
}

/** Pesan pembuka singkat untuk WhatsApp dari detail dokumen (tanpa objek pengajuan). */
export function buildPesanWhatsAppDokumen(judul: string, nomor: string, namaPenerima?: string | null): string {
  const sapaan = namaPenerima?.trim() ? `Bapak/Ibu ${namaPenerima.trim()}` : 'Bapak/Ibu';
  return [
    `Selamat ${salamWaktu()}, ${sapaan}.`,
    `Perkenalkan, kami dari Humas dan Kerja Sama Politeknik Negeri Batam. Kami menghubungi terkait kerja sama "${judul}" (${nomor}).`,
    'Mohon konfirmasi apakah nomor ini benar dapat dihubungi. Terima kasih.',
  ].join('\n\n');
}
