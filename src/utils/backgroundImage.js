const MAX_BACKGROUND_IMAGE_SIZE = 2 * 1024 * 1024;
const IMAGE_SIGNATURES = [
  { format: 'GIF', mimeType: 'image/gif', matches: (bytes) => (
    bytes.length >= 6
    && bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39)
    && bytes[5] === 0x61
  ) },
  { format: 'PNG', mimeType: 'image/png', matches: (bytes) => (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) },
  { format: 'JPEG', mimeType: 'image/jpeg', matches: (bytes) => (
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  ) },
  { format: 'WebP', mimeType: 'image/webp', matches: (bytes) => (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) },
];

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The selected image could not be read.'));
    };
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.onabort = () => reject(new Error('Reading the selected image was canceled.'));
    reader.readAsDataURL(file);
  });
}

export async function readBackgroundImage(file) {
  if (!file) throw new Error('Choose an image to continue.');
  if (file.size > MAX_BACKGROUND_IMAGE_SIZE) {
    throw new Error('Choose an image or GIF smaller than 2 MB.');
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const format = IMAGE_SIGNATURES.find((signature) => signature.matches(header));
  if (!format) {
    throw new Error('Use a GIF, PNG, JPEG, or WebP image. SVG and other file types are not supported.');
  }
  if (file.type && file.type !== format.mimeType) {
    throw new Error('The selected file type does not match its image format.');
  }

  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('The selected image could not be decoded.');
    }
    try {
      if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 16_000_000) {
        throw new Error('Choose an image with dimensions no larger than 8192 × 8192 pixels.');
      }
    } finally {
      bitmap?.close();
    }
  }

  return readAsDataUrl(file);
}
