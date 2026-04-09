import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJsonWithCache, FRONTEND_CACHE_NAMESPACES } from '../services/frontendCache';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function appendSearchParams(searchParams, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') {
          searchParams.append(key, String(item));
        }
      });
      return;
    }

    searchParams.set(key, String(value));
  });
}

export function usePagedContentSearch({
  enabled = false,
  params = {},
  namespace = FRONTEND_CACHE_NAMESPACES.CONTENT_SEARCH,
  ttlMs = 45 * 1000,
  rootMargin = '900px 0px'
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreNode, setLoadMoreNode] = useState(null);
  const requestIdRef = useRef(0);

  const loadMoreRef = useCallback((node) => {
    setLoadMoreNode(node);
  }, []);

  const baseQueryString = useMemo(() => {
    const searchParams = new URLSearchParams();
    appendSearchParams(searchParams, params);
    return searchParams.toString();
  }, [params]);

  const fetchPage = useCallback(async ({ nextPage = 1, append = false } = {}) => {
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
      searchParams.set('page', String(nextPage));

      const data = await fetchJsonWithCache({
        namespace,
        key: `page=${nextPage}&${baseQueryString}`,
        url: `${API_URL}/api/content/search?${searchParams.toString()}`,
        ttlMs
      });

      if (requestIdRef.current !== requestId) {
        return;
      }

      if (!data.success) {
        setError(data.error?.message || 'Search failed');
        return;
      }

      const nextItems = data.data || [];
      const pageLimit = data.pagination?.limit || 50;

      setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setPage(nextPage);
      setHasMore(nextItems.length >= pageLimit);
      setError('');
    } catch (loadError) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setError(loadError.message || 'Search failed');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [baseQueryString, namespace, ttlMs]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setPage(1);
      setHasMore(false);
      setLoading(false);
      setError('');
      return;
    }

    setItems([]);
    setPage(1);
    setHasMore(false);
    fetchPage({ nextPage: 1, append: false });
  }, [enabled, baseQueryString, fetchPage]);

  useEffect(() => {
    if (!enabled || loading || isLoadingMore || !hasMore) {
      return undefined;
    }

    const node = loadMoreNode;
    if (!node) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          fetchPage({ nextPage: page + 1, append: true });
        }
      },
      { rootMargin }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [enabled, fetchPage, hasMore, isLoadingMore, loadMoreNode, loading, page, rootMargin]);

  return {
    items,
    loading,
    error,
    hasMore,
    page,
    isLoadingMore,
    loadMoreRef,
    reload: () => fetchPage({ nextPage: 1, append: false })
  };
}
