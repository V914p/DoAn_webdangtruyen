import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import { env } from '../config/env.js';

export const CACHE_NAMESPACES = {
  CONTENT_DISCOVERY: 'content-discovery',
  CREATOR_SEARCH: 'creator-search',
  PUBLIC_PROFILE: 'public-profile',
  COMMENT_THREADS: 'comment-threads'
};

const INITIAL_NAMESPACE_VERSION = 0;

const memoryResponseCache = new LRUCache({
  max: env.cache.maxEntries
});

const memoryNamespaceVersions = new Map();
const memoryRateLimitCounters = new Map();

let redisClient = null;

const cacheState = {
  initialized: false,
  connected: false,
  lastError: null
};

function getBackendType() {
  if (!env.cache.enabled) {
    return 'disabled';
  }

  return cacheState.connected && redisClient ? 'redis' : 'memory';
}

function buildRedisKey(kind, key) {
  return `${env.cache.keyPrefix}:${kind}:${key}`;
}

function buildVersionedDataKey(namespace, version, key) {
  return `data:${namespace}:v${version}:key:${key}`;
}

function rememberCacheError(error) {
  cacheState.lastError = error instanceof Error ? error.message : String(error);
}

function getMemoryNamespaceVersion(namespace) {
  if (!memoryNamespaceVersions.has(namespace)) {
    memoryNamespaceVersions.set(namespace, INITIAL_NAMESPACE_VERSION);
  }

  return memoryNamespaceVersions.get(namespace);
}

function incrementMemoryNamespaceVersion(namespace) {
  const nextVersion = getMemoryNamespaceVersion(namespace) + 1;
  memoryNamespaceVersions.set(namespace, nextVersion);
  return nextVersion;
}

function incrementMemoryRateLimitCounter(key, windowMs) {
  const now = Date.now();
  const currentEntry = memoryRateLimitCounters.get(key);

  if (!currentEntry || currentEntry.expiresAt <= now) {
    const nextEntry = { count: 1, expiresAt: now + windowMs };
    memoryRateLimitCounters.set(key, nextEntry);
    return {
      count: nextEntry.count,
      resetAt: new Date(nextEntry.expiresAt)
    };
  }

  currentEntry.count += 1;

  return {
    count: currentEntry.count,
    resetAt: new Date(currentEntry.expiresAt)
  };
}

function attachRedisListeners(client) {
  client.on('ready', () => {
    cacheState.connected = true;
    cacheState.lastError = null;
  });

  client.on('close', () => {
    cacheState.connected = false;
  });

  client.on('end', () => {
    cacheState.connected = false;
  });

  client.on('error', (error) => {
    rememberCacheError(error);
  });
}

export async function initializeCache() {
  if (cacheState.initialized) {
    return getCacheStatus();
  }

  cacheState.initialized = true;

  if (!env.redis.url) {
    return getCacheStatus();
  }

  redisClient = new Redis(env.redis.url, {
    lazyConnect: true,
    connectTimeout: env.redis.connectTimeoutMs,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });

  attachRedisListeners(redisClient);

  try {
    await redisClient.connect();
    cacheState.connected = true;
  } catch (error) {
    rememberCacheError(error);
    cacheState.connected = false;

    try {
      redisClient.disconnect();
    } catch {
      // Ignore cleanup failures during fallback.
    }

    redisClient = null;
  }

  return getCacheStatus();
}

export async function shutdownCache() {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.quit();
  } catch {
    redisClient.disconnect();
  } finally {
    redisClient = null;
    cacheState.connected = false;
  }
}

export function getCacheStatus() {
  return {
    enabled: env.cache.enabled,
    backend: getBackendType(),
    redisConfigured: Boolean(env.redis.url),
    connected: cacheState.connected,
    initialized: cacheState.initialized,
    defaultTtlSeconds: env.cache.defaultTtlSeconds,
    memoryEntries: memoryResponseCache.size,
    lastError: cacheState.lastError
  };
}

export async function getCacheEntry(key) {
  if (!env.cache.enabled) {
    return null;
  }

  if (getBackendType() === 'redis' && redisClient) {
    try {
      const payload = await redisClient.get(buildRedisKey('response', key));
      return payload ? JSON.parse(payload) : null;
    } catch (error) {
      rememberCacheError(error);
    }
  }

  return memoryResponseCache.get(key) ?? null;
}

export async function setCacheEntry(key, value, ttlSeconds = env.cache.defaultTtlSeconds) {
  if (!env.cache.enabled) {
    return false;
  }

  if (getBackendType() === 'redis' && redisClient) {
    try {
      await redisClient.set(
        buildRedisKey('response', key),
        JSON.stringify(value),
        'EX',
        Math.max(ttlSeconds, 1)
      );
      return true;
    } catch (error) {
      rememberCacheError(error);
    }
  }

  memoryResponseCache.set(key, value, {
    ttl: Math.max(ttlSeconds, 1) * 1000
  });

  return true;
}

export async function getNamespaceVersion(namespace) {
  if (getBackendType() === 'redis' && redisClient) {
    try {
      const value = await redisClient.get(buildRedisKey('namespace', namespace));
      const parsedValue = Number.parseInt(value || String(INITIAL_NAMESPACE_VERSION), 10);
      return Number.isNaN(parsedValue) ? INITIAL_NAMESPACE_VERSION : parsedValue;
    } catch (error) {
      rememberCacheError(error);
    }
  }

  return getMemoryNamespaceVersion(namespace);
}

export async function getOrSetNamespacedCache({
  namespace,
  key,
  ttlSeconds = env.cache.defaultTtlSeconds,
  loader
}) {
  if (!env.cache.enabled) {
    return loader();
  }

  const namespaceVersion = await getNamespaceVersion(namespace);
  const cacheKey = buildVersionedDataKey(namespace, namespaceVersion, key);
  const cachedValue = await getCacheEntry(cacheKey);

  if (cachedValue !== null) {
    return cachedValue;
  }

  const loadedValue = await loader();
  await setCacheEntry(cacheKey, loadedValue, ttlSeconds);
  return loadedValue;
}

export async function invalidateCacheNamespaces(namespaces = []) {
  const uniqueNamespaces = [...new Set(namespaces.filter(Boolean))];

  if (!uniqueNamespaces.length) {
    return;
  }

  if (getBackendType() === 'redis' && redisClient) {
    try {
      const pipeline = redisClient.multi();
      uniqueNamespaces.forEach((namespace) => {
        pipeline.incr(buildRedisKey('namespace', namespace));
      });
      await pipeline.exec();
      return;
    } catch (error) {
      rememberCacheError(error);
    }
  }

  uniqueNamespaces.forEach((namespace) => {
    incrementMemoryNamespaceVersion(namespace);
  });
}

export async function incrementRateLimitCounter(key, windowMs) {
  if (cacheState.connected && redisClient) {
    try {
      const redisKey = buildRedisKey('ratelimit', key);
      const count = await redisClient.incr(redisKey);
      let ttl = await redisClient.pttl(redisKey);

      if (ttl < 0) {
        await redisClient.pexpire(redisKey, windowMs);
        ttl = windowMs;
      }

      return {
        count,
        resetAt: new Date(Date.now() + ttl)
      };
    } catch (error) {
      rememberCacheError(error);
    }
  }

  return incrementMemoryRateLimitCounter(key, windowMs);
}

export async function resetCacheStoreForTests() {
  memoryResponseCache.clear();
  memoryNamespaceVersions.clear();
  memoryRateLimitCounters.clear();
  cacheState.lastError = null;
  cacheState.connected = false;
  cacheState.initialized = false;

  if (redisClient) {
    redisClient.removeAllListeners();

    try {
      redisClient.disconnect();
    } catch {
      // Ignore cleanup failures in tests.
    }

    redisClient = null;
  }
}