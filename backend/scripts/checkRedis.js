import { env } from '../config/env.js';
import { getCacheStatus, initializeCache, shutdownCache } from '../services/cacheStore.js';

async function main() {
  const initialStatus = getCacheStatus();

  if (!env.redis.url) {
    console.log('[redis-check] REDIS_URL is not configured.');
    console.log('[redis-check] Backend will keep using in-memory cache and rate-limit fallback.');
    return;
  }

  const status = await initializeCache();

  if (status.backend !== 'redis' || !status.connected) {
    console.error('[redis-check] Redis is configured but the backend could not connect.');
    console.error(`[redis-check] Status: ${JSON.stringify(status, null, 2)}`);
    process.exitCode = 1;
    return;
  }

  console.log('[redis-check] Redis connection is ready.');
  console.log(`[redis-check] Status: ${JSON.stringify(status, null, 2)}`);

  if (!initialStatus.initialized) {
    await shutdownCache();
  }
}

main().catch(async (error) => {
  console.error('[redis-check] Unexpected error:', error);

  try {
    await shutdownCache();
  } catch {
    // Ignore shutdown failures in the diagnostic script.
  }

  process.exit(1);
});