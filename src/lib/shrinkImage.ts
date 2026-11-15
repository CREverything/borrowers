/**
 * Shrinks a photo in the browser before upload: at most 1600px on the long
 * side, re-encoded as JPEG. Phone photos drop from several MB to a few
 * hundred KB, well under the server's 2 MB limit. Re-encoding also strips
 * metadata such as GPS location.
 */
const MAX_SIDE = 1600;
const MAX_BYTES = 1_900_000;

export class ImageReadError extends Error {}

export async function shrinkImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // Respects the photo's EXIF rotation, so portrait shots stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageReadError(`${file.name} couldn't be opened. Try a JPEG or PNG.`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageReadError("Your browser couldn't process that photo.");
  // JPEG has no transparency; give see-through PNGs a white background.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new ImageReadError(`${file.name} is too large even after shrinking it.`);
}
