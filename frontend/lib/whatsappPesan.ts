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

// Kode telepon negara mitra (sama dengan pilihan di form pengajuan, tanpa tanda +).
const KODE_TELEPON_NEGARA: Record<string, string> = {
  Indonesia: '62',
  Malaysia: '60',
  Singapura: '65',
  'Amerika Serikat': '1',
  Jepang: '81',
  'Korea Selatan': '82',
  Australia: '61',
  Jerman: '49',
  Belanda: '31',
  Inggris: '44',
  Tiongkok: '86',
  Taiwan: '886',
  Prancis: '33',
  Filipina: '63',
  Vietnam: '84',
  Palestina: '970',
};

/**
 * Nomor WhatsApp mitra → format internasional untuk wa.me. Form pengajuan menyimpan nomor TANPA kode
 * negara (awalan +62 dsb. hanya tampilan), mis. "821-7134-3390" untuk 0821-7134-3390. Kalau dikirim
 * apa adanya, wa.me membacanya sebagai kode negara (82 = Korea) sehingga muncul "nomor tidak ada di
 * WhatsApp". Jadi kode negara mitra ditambahkan di sini; negara kosong dianggap Indonesia.
 */
export function normalisasiNomorWhatsAppMitra(nomor?: string | null, negara?: string | null): string {
  const digits = (nomor || '').replace(/\D/g, '');
  if (!digits) return '';

  const kode = KODE_TELEPON_NEGARA[(negara || '').trim()] ?? (negara?.trim() ? '' : '62');
  // Negara asing yang kodenya tidak dikenal: nomor dianggap sudah lengkap.
  if (!kode) return digits;

  const tanpaNol = digits.replace(/^0+/, '');
  return tanpaNol.startsWith(kode) ? tanpaNol : `${kode}${tanpaNol}`;
}

export function buatUrlWhatsAppMitra(nomor?: string | null, negara?: string | null, pesan?: string): string | null {
  const normalized = normalisasiNomorWhatsAppMitra(nomor, negara);
  return normalized ? `https://wa.me/${normalized}${pesan ? `?text=${encodeURIComponent(pesan)}` : ''}` : null;
}
