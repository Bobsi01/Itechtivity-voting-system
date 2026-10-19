import jsQR from 'jsqr';

export async function decodeQrImage(file: File): Promise<string> {

  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 10 MB.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Some embedded browsers cannot decode a File directly; use their image loader instead.
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be loaded.'));
      reader.onerror = () => reject(new Error('Image could not be loaded. Choose another image or use manual entry.'));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = source;
    try {
      await image.decode();
      bitmap = await createImageBitmap(image);
    } catch {
      throw new Error('Image could not be loaded. Choose a PNG or JPEG image, or use manual entry.');
    }
  }
  try {
    // Bound decoder memory even when a phone supplies a full-resolution photo.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image scanning is unavailable. Use manual entry.');

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(pixels.data, pixels.width, pixels.height);
    if (!code) throw new Error('No QR code found. Choose a clear image or use manual entry.');
    return code.data;
  } finally {
    bitmap.close();
  }
}
