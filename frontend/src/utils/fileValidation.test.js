import { describe, expect, it } from 'vitest';
import {
  detectImageMimeFromFile,
  validateImageFilesBeforeUpload,
  validateSingleImageBeforeUpload
} from './fileValidation';

const VALID_PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);

const VALID_WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
]);

function createFile(name, bytes, type = 'application/octet-stream') {
  return new File([bytes], name, { type });
}

describe('fileValidation', () => {
  it('detects png images from byte header instead of the extension', async () => {
    const file = createFile('fake.txt', VALID_PNG_BYTES, 'text/plain');

    await expect(detectImageMimeFromFile(file)).resolves.toBe('image/png');
  });

  it('accepts valid image files and keeps the original file list', async () => {
    const pngFile = createFile('cover.bin', VALID_PNG_BYTES);
    const webpFile = createFile('preview.dat', VALID_WEBP_BYTES);

    await expect(validateImageFilesBeforeUpload([pngFile, webpFile], {
      maxFiles: 5,
      maxSizeBytes: 1024 * 1024,
      fieldLabel: 'story image'
    })).resolves.toEqual({
      valid: true,
      files: [pngFile, webpFile]
    });
  });

  it('rejects invalid files even if the extension looks like an image', async () => {
    const file = createFile('avatar.png', Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]), 'image/png');

    await expect(validateSingleImageBeforeUpload(file, {
      maxSizeBytes: 1024 * 1024,
      fieldLabel: 'avatar'
    })).resolves.toMatchObject({
      valid: false,
      error: expect.stringMatching(/byte header/i),
      file: null
    });
  });

  it('rejects files that exceed the configured size limit before upload', async () => {
    const file = createFile('big.webp', VALID_WEBP_BYTES, 'image/webp');
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: 6 * 1024 * 1024
    });

    await expect(validateSingleImageBeforeUpload(file, {
      maxSizeBytes: 5 * 1024 * 1024,
      fieldLabel: 'avatar'
    })).resolves.toMatchObject({
      valid: false,
      error: expect.stringMatching(/5MB/),
      file: null
    });
  });
});