import {
  CACHE_NAMESPACES,
  getNamespaceVersion,
  getOrSetNamespacedCache,
  invalidateCacheNamespaces,
  resetCacheStoreForTests
} from '../../services/cacheStore.js';

describe('cache store invalidation', () => {
  beforeEach(async () => {
    await resetCacheStoreForTests();
  });

  afterAll(async () => {
    await resetCacheStoreForTests();
  });

  it('reuses cached values until the namespace is invalidated', async () => {
    let loaderCalls = 0;

    const firstValue = await getOrSetNamespacedCache({
      namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
      key: 'tag-directory-stats',
      ttlSeconds: 60,
      loader: async () => {
        loaderCalls += 1;
        return { version: loaderCalls };
      }
    });

    const secondValue = await getOrSetNamespacedCache({
      namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
      key: 'tag-directory-stats',
      ttlSeconds: 60,
      loader: async () => {
        loaderCalls += 1;
        return { version: loaderCalls };
      }
    });

    expect(firstValue).toEqual({ version: 1 });
    expect(secondValue).toEqual({ version: 1 });
    expect(loaderCalls).toBe(1);

    await invalidateCacheNamespaces([CACHE_NAMESPACES.CONTENT_DISCOVERY]);

    const thirdValue = await getOrSetNamespacedCache({
      namespace: CACHE_NAMESPACES.CONTENT_DISCOVERY,
      key: 'tag-directory-stats',
      ttlSeconds: 60,
      loader: async () => {
        loaderCalls += 1;
        return { version: loaderCalls };
      }
    });

    expect(thirdValue).toEqual({ version: 2 });
    expect(loaderCalls).toBe(2);
  });

  it('increments namespace versions when invalidated', async () => {
    expect(await getNamespaceVersion(CACHE_NAMESPACES.CREATOR_SEARCH)).toBe(0);

    await invalidateCacheNamespaces([CACHE_NAMESPACES.CREATOR_SEARCH]);

    expect(await getNamespaceVersion(CACHE_NAMESPACES.CREATOR_SEARCH)).toBe(1);
  });
});