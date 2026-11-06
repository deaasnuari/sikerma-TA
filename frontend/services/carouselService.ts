import { apiRequest } from '@/lib/api';

export type CarouselImageItem = {
  id: number;
  title: string | null;
  image_path: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  // Tampilan foto di bingkai carousel: perbesaran (1-3x) dan titik fokus (0-100%).
  zoom?: number;
  pos_x?: number;
  pos_y?: number;
  // 'cover' = memenuhi bingkai (pinggir terpotong), 'contain' = foto tampil utuh.
  fit?: 'cover' | 'contain';
};

// Aturan ukuran gambar carousel (diperiksa juga di backend).
export const CAROUSEL_RULES = {
  maxBytes: 5 * 1024 * 1024,
  minWidth: 800,
  minHeight: 350,
  maxWidth: 6000,
  maxHeight: 6000,
  recommended: '1600 x 700 px',
  types: ['image/jpeg', 'image/png'],
} as const;

export const CAROUSEL_RULES_TEXT = `Format JPG atau PNG. Maksimal 5 MB. Dimensi ${CAROUSEL_RULES.minWidth}x${CAROUSEL_RULES.minHeight} sampai ${CAROUSEL_RULES.maxWidth}x${CAROUSEL_RULES.maxHeight} px (disarankan ${CAROUSEL_RULES.recommended}).`;

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// Mengembalikan pesan error (bahasa Indonesia) bila file tidak memenuhi aturan, atau null bila lolos.
export async function validateCarouselFile(file: File): Promise<string | null> {
  const isImageType = (CAROUSEL_RULES.types as readonly string[]).includes(file.type);
  const hasImageExtension = /\.(jpe?g|png)$/i.test(file.name);
  if (!isImageType || !hasImageExtension) {
    return `"${file.name}" bukan gambar yang didukung. Gunakan file JPG atau PNG.`;
  }

  if (file.size > CAROUSEL_RULES.maxBytes) {
    return `Ukuran gambar ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 5 MB. Kecilkan atau kompres gambar terlebih dahulu.`;
  }

  const size = await readImageSize(file);
  if (!size) {
    return 'File tidak dapat dibaca sebagai gambar. Pastikan file tidak rusak.';
  }
  if (size.width < CAROUSEL_RULES.minWidth || size.height < CAROUSEL_RULES.minHeight) {
    return `Dimensi gambar ${size.width}x${size.height} px terlalu kecil. Minimal ${CAROUSEL_RULES.minWidth}x${CAROUSEL_RULES.minHeight} px (disarankan ${CAROUSEL_RULES.recommended}).`;
  }
  if (size.width > CAROUSEL_RULES.maxWidth || size.height > CAROUSEL_RULES.maxHeight) {
    return `Dimensi gambar ${size.width}x${size.height} px terlalu besar. Maksimal ${CAROUSEL_RULES.maxWidth}x${CAROUSEL_RULES.maxHeight} px.`;
  }

  return null;
}

export const CAROUSEL_ZOOM_MIN = 0.5;
export const CAROUSEL_ZOOM_MAX = 3;

export type CarouselTampilan = { zoom: number; pos_x: number; pos_y: number; fit: 'cover' | 'contain' };

export const CAROUSEL_TAMPILAN_DEFAULT: CarouselTampilan = { zoom: 1, pos_x: 50, pos_y: 50, fit: 'cover' };

export function getCarouselTampilan(item: Pick<CarouselImageItem, 'zoom' | 'pos_x' | 'pos_y' | 'fit'>): CarouselTampilan {
  return { zoom: item.zoom ?? 1, pos_x: item.pos_x ?? 50, pos_y: item.pos_y ?? 50, fit: item.fit ?? 'cover' };
}

// Dipakai bersama oleh landing page, kartu admin, dan editor supaya tampilannya persis sama.
// Bingkainya harus overflow-hidden.
export function carouselImageStyle(tampilan: CarouselTampilan): React.CSSProperties {
  const origin = `${tampilan.pos_x}% ${tampilan.pos_y}%`;
  return { objectFit: tampilan.fit, objectPosition: origin, transformOrigin: origin, transform: `scale(${tampilan.zoom})` };
}

type CarouselListResponse = {
  data: CarouselImageItem[];
  max_images: number;
};

type CarouselStoreResponse = {
  message: string;
  data: CarouselImageItem;
};

export async function getCarouselImages(): Promise<CarouselImageItem[]> {
  const response = await apiRequest<CarouselListResponse>('/carousel-images');
  return response.data.slice(0, response.max_images || 7);
}

export async function uploadCarouselImage(payload: {
  file: File;
  title?: string;
  sortOrder?: number;
  tampilan?: CarouselTampilan;
}): Promise<CarouselImageItem> {
  const formData = new FormData();
  formData.append('image', payload.file);

  if (payload.title) {
    formData.append('title', payload.title);
  }

  if (payload.tampilan) {
    formData.append('zoom', String(payload.tampilan.zoom));
    formData.append('pos_x', String(payload.tampilan.pos_x));
    formData.append('pos_y', String(payload.tampilan.pos_y));
    formData.append('fit', payload.tampilan.fit);
  }

  if (typeof payload.sortOrder === 'number') {
    formData.append('sort_order', String(payload.sortOrder));
  }

  const response = await apiRequest<CarouselStoreResponse>('/admin/carousel-images', {
    method: 'POST',
    body: formData,
  });

  return response.data;
}

export async function updateCarouselSortOrder(id: number, sortOrder: number): Promise<void> {
  await apiRequest(`/admin/carousel-images/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ sort_order: sortOrder }),
  });
}

export async function updateCarouselTampilan(id: number, tampilan: CarouselTampilan): Promise<void> {
  await apiRequest(`/admin/carousel-images/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(tampilan),
  });
}

export async function deleteCarouselImage(id: number): Promise<void> {
  await apiRequest(`/admin/carousel-images/${id}`, {
    method: 'DELETE',
  });
}
