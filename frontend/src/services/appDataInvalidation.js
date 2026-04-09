import { FRONTEND_CACHE_NAMESPACES, invalidateFrontendCache } from './frontendCache';

export function invalidateContentMutationCaches({ includeTagDirectory = false } = {}) {
  const namespaces = [
    FRONTEND_CACHE_NAMESPACES.HOME_FEED,
    FRONTEND_CACHE_NAMESPACES.TRENDING,
    FRONTEND_CACHE_NAMESPACES.CONTENT_SEARCH,
    FRONTEND_CACHE_NAMESPACES.PROFILE,
    FRONTEND_CACHE_NAMESPACES.TAG_RECOMMENDATIONS
  ];

  if (includeTagDirectory) {
    namespaces.push(FRONTEND_CACHE_NAMESPACES.TAG_DIRECTORY);
  }

  invalidateFrontendCache(namespaces);
}

export function invalidateCreatorPresentationCaches() {
  invalidateFrontendCache([
    FRONTEND_CACHE_NAMESPACES.PROFILE,
    FRONTEND_CACHE_NAMESPACES.CREATOR_SEARCH,
    FRONTEND_CACHE_NAMESPACES.TRENDING
  ]);
}