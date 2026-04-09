import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { fileURLToPath } from 'url';
import upload from '../../middleware/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');

const VALID_PNG_BUFFER = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360180500008200010D0A2DB40000000049454E44AE426082',
  'hex'
);

describe('upload header validation', () => {
  const createdFiles = [];
  const app = express();

  app.post('/upload/multiple', upload.array('images', 10), (req, res) => {
    res.status(200).json({
      success: true,
      files: (req.files || []).map((file) => ({
        filename: file.filename,
        mimetype: file.mimetype
      }))
    });
  });

  app.post('/upload/single', upload.single('avatar'), (req, res) => {
    res.status(200).json({
      success: true,
      file: req.file
        ? {
            filename: req.file.filename,
            mimetype: req.file.mimetype
          }
        : null
    });
  });

  afterEach(async () => {
    await Promise.all(createdFiles.splice(0).map(async (filename) => {
      try {
        await fs.unlink(path.join(uploadsDir, filename));
      } catch {
        // Ignore cleanup failures in tests.
      }
    }));
  });

  it('accepts a valid image by byte header even with a misleading extension', async () => {
    const response = await request(app)
      .post('/upload/multiple')
      .attach('images', VALID_PNG_BUFFER, {
        filename: 'looks-like-text.txt',
        contentType: 'application/octet-stream'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.files).toHaveLength(1);
    expect(response.body.files[0].mimetype).toBe('image/png');
    expect(response.body.files[0].filename.endsWith('.png')).toBe(true);

    createdFiles.push(response.body.files[0].filename);
  });

  it('rejects a fake image that only claims to be a png', async () => {
    const response = await request(app)
      .post('/upload/multiple')
      .attach('images', Buffer.from('this is not a real image'), {
        filename: 'fake.png',
        contentType: 'image/png'
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error?.message).toMatch(/byte header/i);
  });

  it('applies the same header validation to avatar uploads', async () => {
    const response = await request(app)
      .post('/upload/single')
      .attach('avatar', Buffer.from('definitely not an image'), {
        filename: 'avatar.webp',
        contentType: 'image/webp'
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error?.message).toMatch(/jpeg, png, gif, and webp/i);
  });
});