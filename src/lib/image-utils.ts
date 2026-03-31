const MAX_DIMENSION = 2048;
const WEBP_QUALITY = 0.85;
const MAX_FILE_SIZE_MB = 10;

export async function processImageFile(
  file: File,
  maxSizeMB = MAX_FILE_SIZE_MB,
  maxDimension = MAX_DIMENSION
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > maxDimension || height > maxDimension) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });

  if (blob.size > maxSizeMB * 1024 * 1024) {
    const smallerBlob = await canvas.convertToBlob({ type: "image/webp", quality: 0.6 });
    if (smallerBlob.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`Image still exceeds ${maxSizeMB}MB after compression`);
    }
    return new File([smallerBlob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}
