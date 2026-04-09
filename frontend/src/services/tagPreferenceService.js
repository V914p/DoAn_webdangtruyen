import { getCurrentUser, getToken, updateCurrentUserFavoriteTags } from './authService';
import { fetchJsonWithCache, FRONTEND_CACHE_NAMESPACES, getFrontendCacheScope, invalidateFrontendCache } from './frontendCache';
import { normalizeTag } from '../utils/hashtags';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getUserScope() {
  const currentUser = getCurrentUser();
  return getFrontendCacheScope(currentUser?._id || currentUser?.id || null);
}

function getAuthHeaders() {
  const token = getToken();

  return token
    ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    : {
        'Content-Type': 'application/json'
      };
}

export async function fetchFavoriteTags({ forceFresh = false } = {}) {
  if (!getToken()) {
    updateCurrentUserFavoriteTags([]);
    return { success: true, data: [] };
  }

  const scope = getUserScope();
  const data = forceFresh
    ? await (async () => {
        const response = await fetch(`${API_URL}/api/users/me/favorite-tags`, {
          headers: getAuthHeaders()
        });
        return response.json();
      })()
    : await fetchJsonWithCache({
        namespace: FRONTEND_CACHE_NAMESPACES.USER_PREFERENCES,
        key: 'favorite-tags',
        scope,
        url: `${API_URL}/api/users/me/favorite-tags`,
        ttlMs: 2 * 60 * 1000,
        options: {
          headers: getAuthHeaders()
        }
      });

  if (data.success) {
    updateCurrentUserFavoriteTags(data.data || []);
  }

  return data;
}

export async function fetchRecommendedTags({ forceFresh = false } = {}) {
  if (!getToken()) {
    return { success: true, data: [], favoriteTags: [] };
  }

  const scope = getUserScope();

  return forceFresh
    ? (async () => {
        const response = await fetch(`${API_URL}/api/content/tags/recommended?limit=6`, {
          headers: getAuthHeaders()
        });
        return response.json();
      })()
    : fetchJsonWithCache({
        namespace: FRONTEND_CACHE_NAMESPACES.TAG_RECOMMENDATIONS,
        key: 'recommended-tags:limit=6',
        scope,
        url: `${API_URL}/api/content/tags/recommended?limit=6`,
        ttlMs: 2 * 60 * 1000,
        options: {
          headers: getAuthHeaders()
        }
      });
}

export async function saveFavoriteTag(tag) {
  const normalized = normalizeTag(tag);

  if (!normalized || !getToken()) {
    return { success: false, error: { message: 'Authentication and a valid hashtag are required' } };
  }

  const response = await fetch(`${API_URL}/api/users/me/favorite-tags`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tag: normalized })
  });

  const data = await response.json();

  if (data.success) {
    updateCurrentUserFavoriteTags(data.data || []);
    invalidateFrontendCache([
      FRONTEND_CACHE_NAMESPACES.USER_PREFERENCES,
      FRONTEND_CACHE_NAMESPACES.TAG_RECOMMENDATIONS
    ]);
  }

  return data;
}

export async function removeFavoriteTag(tag) {
  const normalized = normalizeTag(tag);

  if (!normalized || !getToken()) {
    return { success: false, error: { message: 'Authentication and a valid hashtag are required' } };
  }

  const response = await fetch(`${API_URL}/api/users/me/favorite-tags/${encodeURIComponent(normalized)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  const data = await response.json();

  if (data.success) {
    updateCurrentUserFavoriteTags(data.data || []);
    invalidateFrontendCache([
      FRONTEND_CACHE_NAMESPACES.USER_PREFERENCES,
      FRONTEND_CACHE_NAMESPACES.TAG_RECOMMENDATIONS
    ]);
  }

  return data;
}

export async function toggleFavoriteTag(tag, isFavorite) {
  return isFavorite ? removeFavoriteTag(tag) : saveFavoriteTag(tag);
}