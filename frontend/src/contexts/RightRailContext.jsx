import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser, getToken, subscribeToCurrentUserChange } from '../services/authService';
import { subscribeToCreatorPresentationRefresh } from '../services/creatorPresentationEvents';
import { fetchJsonWithCache, FRONTEND_CACHE_NAMESPACES, subscribeToFrontendCacheInvalidation } from '../services/frontendCache';
import { fetchFavoriteTags, fetchRecommendedTags, toggleFavoriteTag } from '../services/tagPreferenceService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const RightRailContext = createContext(null);

function getImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_URL}${url}`;
}

export function RightRailProvider({ children }) {
  const [tags, setTags] = useState([]);
  const [creators, setCreators] = useState([]);
  const [favoriteTags, setFavoriteTags] = useState([]);
  const [recommendedTags, setRecommendedTags] = useState([]);
  const [favoriteTagBusy, setFavoriteTagBusy] = useState('');
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const queuedRefreshRef = useRef({ tags: false, creators: false, personalized: false, forceFresh: false });
  const flushScheduledRef = useRef(false);
  const refreshTokenRef = useRef(0);

  const fetchTrendingTags = useCallback(async () => {
    const data = await fetchJsonWithCache({
      namespace: FRONTEND_CACHE_NAMESPACES.TAG_DIRECTORY,
      key: 'right-rail:trending-tags:limit=6',
      url: `${API_URL}/api/content/tags/trending?limit=6`,
      ttlMs: 90 * 1000
    });

    if (data.success) {
      setTags(data.data || []);
    }
  }, []);

  const fetchPopularCreators = useCallback(async ({ forceFresh = false } = {}) => {
    const data = forceFresh
      ? await (async () => {
          const response = await fetch(`${API_URL}/api/content/creators/popular?limit=10`);
          return response.json();
        })()
      : await fetchJsonWithCache({
          namespace: FRONTEND_CACHE_NAMESPACES.TRENDING,
          key: 'right-rail:popular-creators:limit=10',
          url: `${API_URL}/api/content/creators/popular?limit=10`,
          ttlMs: 120 * 1000
        });

    if (data.success) {
      setCreators(data.data || []);
    }
  }, []);

  const loadPersonalizedTags = useCallback(async ({ forceFresh = false } = {}) => {
    if (!getToken()) {
      setFavoriteTags([]);
      setRecommendedTags([]);
      return;
    }

    const [favoriteData, recommendedData] = await Promise.all([
      fetchFavoriteTags({ forceFresh }),
      fetchRecommendedTags({ forceFresh })
    ]);

    if (favoriteData.success) {
      setFavoriteTags(favoriteData.data || []);
    }

    if (recommendedData.success) {
      setRecommendedTags(recommendedData.data || []);
    }
  }, []);

  const flushRefreshQueue = useCallback(async () => {
    flushScheduledRef.current = false;
    const nextRequest = queuedRefreshRef.current;
    queuedRefreshRef.current = { tags: false, creators: false, personalized: false, forceFresh: false };
    const refreshToken = refreshTokenRef.current + 1;
    refreshTokenRef.current = refreshToken;

    const tasks = [];

    if (nextRequest.tags) {
      tasks.push(fetchTrendingTags());
    }

    if (nextRequest.creators) {
      tasks.push(fetchPopularCreators({ forceFresh: nextRequest.forceFresh }));
    }

    if (nextRequest.personalized) {
      tasks.push(loadPersonalizedTags({ forceFresh: nextRequest.forceFresh }));
    }

    try {
      await Promise.all(tasks);
    } catch (error) {
      console.error('Right rail refresh failed:', error);
    }

    if (refreshToken !== refreshTokenRef.current) {
      return;
    }
  }, [fetchPopularCreators, fetchTrendingTags, loadPersonalizedTags]);

  const scheduleRefresh = useCallback((request = {}) => {
    queuedRefreshRef.current = {
      tags: queuedRefreshRef.current.tags || Boolean(request.tags),
      creators: queuedRefreshRef.current.creators || Boolean(request.creators),
      personalized: queuedRefreshRef.current.personalized || Boolean(request.personalized),
      forceFresh: queuedRefreshRef.current.forceFresh || Boolean(request.forceFresh)
    };

    if (flushScheduledRef.current) {
      return;
    }

    flushScheduledRef.current = true;
    queueMicrotask(() => {
      flushRefreshQueue();
    });
  }, [flushRefreshQueue]);

  useEffect(() => {
    scheduleRefresh({ tags: true, creators: true, personalized: true });

    const unsubscribeCacheInvalidation = subscribeToFrontendCacheInvalidation((namespaces) => {
      scheduleRefresh({
        tags: namespaces.includes(FRONTEND_CACHE_NAMESPACES.TAG_DIRECTORY),
        creators: namespaces.includes(FRONTEND_CACHE_NAMESPACES.TRENDING),
        personalized:
          namespaces.includes(FRONTEND_CACHE_NAMESPACES.USER_PREFERENCES) ||
          namespaces.includes(FRONTEND_CACHE_NAMESPACES.TAG_RECOMMENDATIONS),
        forceFresh: true
      });
    });

    const unsubscribeCreatorPresentation = subscribeToCreatorPresentationRefresh((user) => {
      const userId = String(user?._id || user?.id || '');

      if (userId) {
        setCreators((prev) => prev.map((creator) => (
          String(creator.id) === userId
            ? {
                ...creator,
                username: user.username || creator.username,
                avatar: user.avatar || null
              }
            : creator
        )));
      }

      scheduleRefresh({ creators: true, forceFresh: true });
    });

    return () => {
      unsubscribeCacheInvalidation();
      unsubscribeCreatorPresentation();
    };
  }, [scheduleRefresh]);

  useEffect(() => subscribeToCurrentUserChange(setCurrentUser), []);

  useEffect(() => {
    scheduleRefresh({ personalized: true, forceFresh: true });
  }, [currentUser?._id, currentUser?.id, scheduleRefresh]);

  const handleFavoriteToggle = useCallback(async (tag, isFavorite) => {
    if (!getToken() || favoriteTagBusy) {
      return { success: false, error: { message: 'Authentication required' } };
    }

    setFavoriteTagBusy(tag);

    try {
      const result = await toggleFavoriteTag(tag, isFavorite);

      if (result.success) {
        setFavoriteTags(result.data || []);
        scheduleRefresh({ personalized: true, forceFresh: true });
      }

      return result;
    } finally {
      setFavoriteTagBusy('');
    }
  }, [favoriteTagBusy, scheduleRefresh]);

  const value = useMemo(() => ({
    tags,
    creators,
    favoriteTags,
    recommendedTags,
    favoriteTagBusy,
    currentUser,
    getImageUrl,
    handleFavoriteToggle,
    refreshRightRail: scheduleRefresh
  }), [creators, currentUser, favoriteTagBusy, favoriteTags, recommendedTags, scheduleRefresh, tags, handleFavoriteToggle]);

  return <RightRailContext.Provider value={value}>{children}</RightRailContext.Provider>;
}

export function useRightRail() {
  const context = useContext(RightRailContext);

  if (!context) {
    throw new Error('useRightRail must be used within a RightRailProvider');
  }

  return context;
}