const EXTENSION_MIME_MAP: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
};

type FileValidationOptions = {
  accept?: string | string[];
  maxSizeBytes?: number;
  acceptedExtensions?: string[];
  maxSizeInBytes?: number;
};

type CompressImageOptions = {
  maxDimension?: number;
  quality?: number;
  minBytesToCompress?: number;
};

function parseAcceptList(accept?: string | string[]) {
  if (!accept) {
    return [];
  }

  if (Array.isArray(accept)) {
    return accept.map((item) => item.trim().toLowerCase()).filter(Boolean);
  }

  return accept
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getFileExtension(fileName: string) {
  const lowerName = fileName.toLowerCase();
  const lastDotIndex = lowerName.lastIndexOf('.');

  if (lastDotIndex < 0) {
    return '';
  }

  return lowerName.slice(lastDotIndex);
}

function isMimeMatch(fileType: string, acceptedType: string) {
  if (!fileType) {
    return false;
  }

  if (acceptedType.endsWith('/*')) {
    const prefix = acceptedType.replace('/*', '/');
    return fileType.startsWith(prefix);
  }

  return fileType === acceptedType;
}

function isAllowedFileType(file: File, acceptedTypes: string[]) {
  if (acceptedTypes.length === 0) {
    return true;
  }

  const fileType = file.type.toLowerCase();
  const fileExtension = getFileExtension(file.name);

  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.startsWith('.')) {
      if (fileExtension !== acceptedType) {
        return false;
      }

      const mappedMimes = EXTENSION_MIME_MAP[acceptedType];
      if (!mappedMimes || mappedMimes.length === 0 || !fileType) {
        return true;
      }

      return mappedMimes.includes(fileType);
    }

    if (acceptedType.includes('/')) {
      return isMimeMatch(fileType, acceptedType);
    }

    return false;
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateSelectedFile(file: File, options: FileValidationOptions) {
  const acceptedTypes = parseAcceptList(options.accept ?? options.acceptedExtensions);
  const maxSizeBytes = options.maxSizeBytes ?? options.maxSizeInBytes ?? Number.POSITIVE_INFINITY;

  if (file.size > maxSizeBytes) {
    return `Ukuran file maksimal ${formatBytes(maxSizeBytes)}.`;
  }

  if (!isAllowedFileType(file, acceptedTypes)) {
    return 'Format file tidak didukung untuk upload ini.';
  }

  return null;
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal membaca file gambar.'));
    };

    image.src = objectUrl;
  });
}

export async function compressImageFileIfNeeded(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  const maxDimension = options.maxDimension ?? 1920;
  const quality = options.quality ?? 0.8;
  const minBytesToCompress = options.minBytesToCompress ?? 1024 * 1024;

  if (!file.type.startsWith('image/')) {
    return file;
  }

  if (file.size < minBytesToCompress) {
    return file;
  }

  const image = await loadImageElement(file);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, width, height);

  const compressedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });

  if (!compressedBlob || compressedBlob.size >= file.size) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([compressedBlob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
