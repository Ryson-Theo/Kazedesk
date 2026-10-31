import { describe, expect, it } from 'vitest';
import { MAX_WALL_ATTACHMENT_SIZE, validateWallAttachment } from './noteWallMedia';

describe('validateWallAttachment', () => {
  it.each([
    ['image/jpeg', 'photo.jpg', 'image'],
    ['application/pdf', 'document.pdf', 'pdf'],
    ['audio/mpeg', 'recording.mp3', 'audio'],
  ])('accepts supported %s files', (type, name, mediaType) => {
    expect(validateWallAttachment(new File(['data'], name, { type }))).toEqual({ mimeType: type, mediaType });
  });

  it('rejects unsupported formats and files above the size limit', () => {
    expect(() => validateWallAttachment(new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' }))).toThrow(/Supported files:/);
    expect(() => validateWallAttachment({ name: 'large.pdf', type: 'application/pdf', size: MAX_WALL_ATTACHMENT_SIZE + 1 })).toThrow(/50 MB or smaller/);
  });
});
