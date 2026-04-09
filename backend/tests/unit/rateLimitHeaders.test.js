import express from 'express';
import request from 'supertest';
import { createRateLimit } from '../../middleware/rateLimit.js';
import { resetCacheStoreForTests } from '../../services/cacheStore.js';

describe('rate limit headers', () => {
  beforeEach(async () => {
    await resetCacheStoreForTests();
  });

  afterAll(async () => {
    await resetCacheStoreForTests();
  });

  it('returns standard headers and blocks requests after the configured limit', async () => {
    const app = express();

    app.get(
      '/limited',
      createRateLimit({
        namespace: 'test-rate-limit',
        windowMs: 60 * 1000,
        max: 2,
        message: {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests'
          }
        }
      }),
      (req, res) => {
        res.status(200).json({ success: true });
      }
    );

    const firstResponse = await request(app).get('/limited');
    const secondResponse = await request(app).get('/limited');
    const thirdResponse = await request(app).get('/limited');

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers['ratelimit-limit']).toBe('2');
    expect(firstResponse.headers['ratelimit-remaining']).toBe('1');
    expect(firstResponse.headers['ratelimit-policy']).toBe('2;w=60');

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers['ratelimit-remaining']).toBe('0');

    expect(thirdResponse.status).toBe(429);
    expect(thirdResponse.headers['ratelimit-limit']).toBe('2');
    expect(thirdResponse.headers['ratelimit-remaining']).toBe('0');
    expect(Number.parseInt(thirdResponse.headers['retry-after'], 10)).toBeGreaterThan(0);
    expect(thirdResponse.body.error?.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});