// Pengganti window.alert() / window.confirm() yang bisa dipanggil dari mana saja (termasuk
// event handler & util non-komponen). Tampilannya dirender oleh <DialogHost /> yang dipasang
// sekali di app/layout.tsx, jadi tidak muncul lagi dialog bawaan browser ("localhost says").

export type DialogTone = 'warning' | 'success';

export type DialogRequest =
  | { kind: 'notice'; message: string; title?: string; tone: DialogTone }
  | { kind: 'confirm'; message: string; title?: string; confirmLabel?: string; resolve: (value: boolean) => void };

type Listener = (request: DialogRequest) => void;

let listener: Listener | null = null;

export function registerDialogListener(next: Listener | null): void {
  listener = next;
}

// Pemberitahuan satu tombol. Tidak menunggu — setara alert().
export function showNotice(message: string, options: { title?: string; tone?: DialogTone } = {}): void {
  if (listener) {
    listener({ kind: 'notice', message, title: options.title, tone: options.tone ?? 'warning' });
    return;
  }
  // Host belum terpasang (mis. dipanggil di server): jatuh ke alert bawaan supaya pesan tidak hilang.
  if (typeof window !== 'undefined') window.alert(message);
}

// Konfirmasi Ya/Batal — setara confirm(), tapi harus di-await: `if (!(await askConfirm('...'))) return;`
export function askConfirm(message: string, options: { title?: string; confirmLabel?: string } = {}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (listener) {
      listener({ kind: 'confirm', message, title: options.title, confirmLabel: options.confirmLabel, resolve });
      return;
    }
    resolve(typeof window !== 'undefined' ? window.confirm(message) : false);
  });
}
