import { describe, expect, it } from 'vitest';
import { readBackgroundImage } from './backgroundImage';

const gifHeader = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
]);
const supportedHeaders = [
  { mimeType: 'image/gif', bytes: gifHeader },
  { mimeType: 'image/png', bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mimeType: 'image/jpeg', bytes: Uint8Array.from([0xff, 0xd8, 0xff]) },
  { mimeType: 'image/webp', bytes: Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]) },
];

describe('background image validation', () => {
  it.each(supportedHeaders)('accepts $mimeType data and returns a data URL', async ({ mimeType, bytes }) => {
    const file = new File([bytes], 'background', { type: mimeType });
    const result = await readBackgroundImage(file);
    expect(result).toMatch(new RegExp(`^data:${mimeType.replace('/', '\\/')};base64,`));
  });

  it('rejects SVG and other unsupported formats', async () => {
    const file = new File(['<svg/>'], 'background.svg', { type: 'image/svg+xml' });

    await expect(readBackgroundImage(file)).rejects.toThrow('Use a GIF, PNG, JPEG, or WebP image.');
  });

  it('rejects files whose MIME type does not match their contents', async () => {
    const file = new File([gifHeader], 'background.png', { type: 'image/png' });

    await expect(readBackgroundImage(file)).rejects.toThrow('does not match its image format');
  });

  it('rejects files over the local-storage-safe size limit', async () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'background.gif', { type: 'image/gif' });

    await expect(readBackgroundImage(file)).rejects.toThrow('smaller than 2 MB');
  });
});
