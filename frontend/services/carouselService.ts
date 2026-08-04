import { apiRequest } from '@/lib/api';

export type CarouselImageItem = {
  id: number;
  title: string | null;
  image_path: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
};

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

export async function uploadCarouselImage(payload: { file: File; title?: string; sortOrder?: number }): Promise<CarouselImageItem> {
  const formData = new FormData();
  formData.append('image', payload.file);

  if (payload.title) {
    formData.append('title', payload.title);
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

export async function deleteCarouselImage(id: number): Promise<void> {
  await apiRequest(`/admin/carousel-images/${id}`, {
    method: 'DELETE',
  });
}
