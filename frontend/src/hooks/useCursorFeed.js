import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJsonWithCache, FRONTEND_CACHE_NAMESPACES } from '../services/frontendCache';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function appendQueryParams(searchParams, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });
}

export function useCursorFeed({
  enabled = true,
  params = {},
  limit = 10,
  namespace = FRONTEND_CACHE_NAMESPACES.HOME_FEED,
  ttlMs = 30 * 1000,
  rootMargin = '900px 0px'
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreNode, setLoadMoreNode] = useState(null);
  const requestIdRef = useRef(0);

  const loadMoreRef = useCallback((node) => {
    setLoadMoreNode(node);
  }, []);

  const baseQueryString = useMemo(() => {
    const searchParams = new URLSearchParams();
    appendQueryParams(searchParams, params);
    searchParams.set('limit', String(limit));
    return searchParams.toString();
  }, [limit, params]);

  const fetchPage = async ({ cursor = null, append = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setLoading(true);
      setError('');
    }

    try {
      const searchParams = new URLSearchParams(baseQueryString);
      if (cursor) {
        searchParams.set('cursor', cursor);
      }

      const data = await fetchJsonWithCache({
        namespace,
        key: `${baseQueryString}&cursor=${encodeURIComponent(cursor || 'first')}`,
        url: `${API_URL}/api/content/feed?${searchParams.toString()}`,
        ttlMs
      });

      if (requestIdRef.current !== requestId) {
        return;
      }

      if (!data.success) {
        setError(data.error?.message || 'Failed to load feed');
        return;
      }

      setItems((prev) => (append ? [...prev, ...(data.data || [])] : (data.data || [])));
      setNextCursor(data.pageInfo?.nextCursor || null);
      setHasMore(Boolean(data.pageInfo?.hasMore));
      setError('');
    } catch (loadError) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setError(loadError.message || 'Failed to load feed');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
        setIsLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    fetchPage({ append: false, cursor: null });
  }, [baseQueryString, enabled]);

  useEffect(() => {
    if (!enabled || loading || isLoadingMore || !hasMore || !nextCursor) {
      return undefined;
    }

    const node = loadMoreNode;
    if (!node) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          fetchPage({ append: true, cursor: nextCursor });
        }
      },
      { rootMargin }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [enabled, hasMore, isLoadingMore, loading, nextCursor, rootMargin, baseQueryString, loadMoreNode]);

  return {
    items,
    loading,
    error,
    hasMore,
    isLoadingMore,
    loadMoreRef,
    reload: () => {
      setItems([]);
      setNextCursor(null);
      setHasMore(true);
      fetchPage({ append: false, cursor: null });
    }
  };
}