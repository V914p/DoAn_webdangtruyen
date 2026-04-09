const STORAGE_PREFIX = 'frontend-cache:v1:';
const FRONTEND_CACHE_INVALIDATED_EVENT = 'frontend-cache-invalidated';

export const FRONTEND_CACHE_NAMESPACES = {
  HOME_FEED: 'home-feed',
  TRENDING: 'trending',
  CONTENT_SEARCH: 'content-search',
  CREATOR_SEARCH: 'creator-search',
  TAG_DIRECTORY: 'tag-directory',
  PROFILE: 'profile',
  USER_PREFERENCES: 'user-preferences',
  TAG_RECOMMENDATIONS: 'tag-recommendations'
};

const memoryCache = new Map();
const inflightRequests = new Map();

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage;
}

function buildCacheKey(namespace, key, scope = 'shared') {
  return `${STORAGE_PREFIX}${namespace}:${scope}:${key}`;
}

function isEntryFresh(entry) {
  return Boolean(entry) && Number(entry.expiresAt) > Date.now();
}

function removeCacheEntry(cacheKey) {
  memoryCache.delete(cacheKey);
  getStorage()?.removeItem(cacheKey);
}

function writeCacheEntry(cacheKey, namespace, scope, value, ttlMs) {
  const entry = {
    namespace,
    scope,
    expiresAt: Date.now() + ttlMs,
    value
  };

  memoryCache.set(cacheKey, entry);

  try {
    getStorage()?.setItem(cacheKey, JSON.stringify(entry));
  } catch {
    // Ignore storage write failures and keep memory cache only.
  }
}

function readCacheEntry(cacheKey) {
  const memoryEntry = memoryCache.get(cacheKey);
  if (isEntryFresh(memoryEntry)) {
    return memoryEntry.value;
  }

  if (memoryEntry) {
    memoryCache.delete(cacheKey);
  }

  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const rawEntry = storage.getItem(cacheKey);
  if (!rawEntry) {
    return null;
  }

  try {
    const parsedEntry = JSON.parse(rawEntry);
    if (!isEntryFresh(parsedEntry)) {
      removeCacheEntry(cacheKey);
      return null;
    }

    memoryCache.set(cacheKey, parsedEntry);
    return parsedEntry.value;
  } catch {
    removeCacheEntry(cacheKey);
    return null;
  }
}

function emitFrontendCacheInvalidated(namespaces) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(FRONTEND_CACHE_INVALIDATED_EVENT, {
    detail: {
      namespaces
    }
  }));
}

export function getFrontendCacheScope(userId) {
  return userId ? `user:${encodeURIComponent(String(userId))}` : 'guest';
}

export async function fetchJsonWithCache({
  namespace,
  key,
  url,
  ttlMs = 60 * 1000,
  scope = 'shared',
  options
}) {
  const cacheKey = buildCacheKey(namespace, key, scope);
  const cachedValue = readCacheEntry(cacheKey);

  if (cachedValue !== null) {
    return cachedValue;
  }

  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok && data?.success !== false) {
      writeCacheEntry(cacheKey, namespace, scope, data, ttlMs);
    }

    return data;
  })().finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

export function invalidateFrontendCache(namespaces = []) {
  const normalizedNamespaces = [...new Set(namespaces.filter(Boolean))];

  if (!normalizedNamespaces.length) {
    return;
  }

  for (const cacheKey of [...memoryCache.keys()]) {
    const entry = memoryCache.get(cacheKey);
    if (entry && normalizedNamespaces.includes(entry.namespace)) {
      removeCacheEntry(cacheKey);
    }
  }

  const storage = getStorage();
  if (!storage) {
    return;
  }

  const keysToDelete = [];
  for (let index = 0; index < storage.length; index += 1) {
    const cacheKey = storage.key(index);

    if (!cacheKey) {
      continue;
    }

    if (normalizedNamespaces.some((namespace) => cacheKey.startsWith(`${STORAGE_PREFIX}${namespace}:`))) {
      keysToDelete.push(cacheKey);
    }
  }

  keysToDelete.forEach((cacheKey) => {
    removeCacheEntry(cacheKey);
  });

  emitFrontendCacheInvalidated(normalizedNamespaces);
}

export function subscribeToFrontendCacheInvalidation(callback) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event) => {
    callback(event.detail?.namespaces || []);
  };

  window.addEventListener(FRONTEND_CACHE_INVALIDATED_EVENT, handler);

  return () => {
    window.removeEventListener(FRONTEND_CACHE_INVALIDATED_EVENT, handler);
  };
}