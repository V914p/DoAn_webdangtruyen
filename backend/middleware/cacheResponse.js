import { env } from '../config/env.js';
import { getCacheEntry, getNamespaceVersion, setCacheEntry } from '../services/cacheStore.js';

function resolveScopeKey(req, varyByUser) {
  if (!varyByUser || !req.user?.userId) {
    return 'shared';
  }

  const role = req.user.role || 'user';
  return `${role}:${req.user.userId}`;
}

export function cacheResponse({
  namespace,
  ttlSeconds = env.cache.defaultTtlSeconds,
  shouldCache = () => true,
  varyByUser = false
}) {
  return async function cacheResponseMiddleware(req, res, next) {
    if (!env.cache.enabled || req.method !== 'GET' || !namespace || !shouldCache(req)) {
      return next();
    }

    try {
      const namespaceVersion = await getNamespaceVersion(namespace);
      const scopeKey = resolveScopeKey(req, varyByUser);
      const cacheKey = `${namespace}:v${namespaceVersion}:scope:${scopeKey}:url:${req.originalUrl}`;
      const cachedResponse = await getCacheEntry(cacheKey);

      if (cachedResponse) {
        res.set('X-Cache', 'HIT');
        res.set('Cache-Control', `${req.user ? 'private' : 'public'}, max-age=${ttlSeconds}`);
        return res.status(cachedResponse.statusCode).json(cachedResponse.body);
      }

      const originalJson = res.json.bind(res);
      res.json = (body) => {
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', `${req.user ? 'private' : 'public'}, max-age=${ttlSeconds}`);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          void setCacheEntry(cacheKey, {
            statusCode: res.statusCode,
            body
          }, ttlSeconds);
        }

        return originalJson(body);
      };
    } catch {
      // Fail open so cache issues do not block the API.
    }

    return next();
  };
}