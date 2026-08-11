import {
  saveAktivitasByKerjasamaId as saveAdminAktivitasByKerjasamaId,
  type AktivitasItem,
} from './adminStoryAktivitasService';

export type { AktivitasItem };

export function saveAktivitasByKerjasamaId(kerjasamaId: number, items: AktivitasItem[]): void {
  saveAdminAktivitasByKerjasamaId(kerjasamaId, items);
}
