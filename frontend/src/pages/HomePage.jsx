import { Search, Star } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { FeedComposer, FeedTabs } from '../components/FeedScaffold';
import { EmptyState } from '../components/common/EmptyState';
import { VirtualizedFeedList } from '../components/feed/VirtualizedFeedList';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ContentCard } from '../components/ContentCard';
import { SAVED_COLLECTION_ENDPOINTS } from '../constants/app';
import { useCursorFeed } from '../hooks/useCursorFeed';
import { consumePostLoginNotice, getCurrentUser, getToken, subscribeToCurrentUserChange } from '../services/authService';
import { FRONTEND_CACHE_NAMESPACES, invalidateFrontendCache } from '../services/frontendCache';
import { fetchFavoriteTags, toggleFavoriteTag } from '../services/tagPreferenceService';
import { normalizeTag, normalizeTagList } from '../utils/hashtags';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const HOME_FEED_PAGE_SIZE = 10;

export default function HomePage() {
  const location = useLocation();
  const [savedCollections, setSavedCollections] = useState({
    bookmarked: [],
    liked: []
  });
  const [savedLoading, setSavedLoading] = useState({
    bookmarked: false,
    liked: false
  });
  const [savedErrors, setSavedErrors] = useState({
    bookmarked: '',
    liked: ''
  });
  const [loginNotice, setLoginNotice] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [search, setSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTag = normalizeTag(searchParams.get('tag'));
  const deferredSearch = useDeferredValue(search.trim());
  const restrictionEndsAt = currentUser?.postingRestrictedUntil ? new Date(currentUser.postingRestrictedUntil) : null;
  const isPostingRestricted = Boolean(restrictionEndsAt) && restrictionEndsAt > new Date();
  const bookmarkedIds = Array.isArray(currentUser?.bookmarks) ? currentUser.bookmarks.map((value) => String(value)) : [];
  const likedIds = Array.isArray(currentUser?.likes) ? currentUser.likes.map((value) => String(value)) : [];
  const bookmarkCount = bookmarkedIds.length;
  const likeCount = likedIds.length;
  const isSavedView = typeFilter === 'bookmarked' || typeFilter === 'liked';
  const activeSavedItems = typeFilter === 'bookmarked' ? savedCollections.bookmarked : savedCollections.liked;
  const [favoriteTagBusy, setFavoriteTagBusy] = useState(false);
  const feedType = typeFilter === 'story' || typeFilter === 'artwork' ? typeFilter : 'all';
  const feedParams = useMemo(() => ({
    sort: sortBy,
    type: feedType !== 'all' ? feedType : undefined,
    tag: selectedTag || undefined,
    q: deferredSearch || undefined
  }), [deferredSearch, feedType, selectedTag, sortBy]);
  const {
    items: content,
    loading,
    error,
    hasMore: hasMoreFeed,
    isLoadingMore,
    loadMoreRef,
    reload: reloadFeed
  } = useCursorFeed({
    enabled: !isSavedView,
    params: feedParams,
    limit: HOME_FEED_PAGE_SIZE
  });
  const activeItems = isSavedView ? activeSavedItems : content;
  const activeLoading = isSavedView ? savedLoading[typeFilter] : loading;
  const activeError = isSavedView ? savedErrors[typeFilter] : error;

  useEffect(() => {
    const notice = consumePostLoginNotice();
    if (notice) {
      setLoginNotice(notice);
    }
  }, []);

  useEffect(() => subscribeToCurrentUserChange(setCurrentUser), []);

  useEffect(() => {
    if (!getToken()) {
      return;
    }

    fetchFavoriteTags({ forceFresh: true });
  }, [currentUser?._id, currentUser?.id]);

  useEffect(() => {
    if (!currentUser || !isSavedView) {
      return;
    }

    const collectionKey = typeFilter;
    const endpoint = SAVED_COLLECTION_ENDPOINTS[collectionKey];

    if (!endpoint) {
      return;
    }

    const loadSavedCollection = async () => {
      setSavedLoading((prev) => ({ ...prev, [collectionKey]: true }));
      setSavedErrors((prev) => ({ ...prev, [collectionKey]: '' }));

      try {
        const response = await fetch(`${API_URL}/api/users/me/${endpoint}`, {
          headers: {
            Authorization: `Bearer ${getToken()}`
          }
        });

        const data = await response.json();

        if (!data.success) {
          setSavedErrors((prev) => ({
            ...prev,
            [collectionKey]: data.error?.message || `Failed to load ${collectionKey}`
          }));
          return;
        }

        setSavedCollections((prev) => ({
          ...prev,
          [collectionKey]: data.data || []
        }));
      } catch (loadError) {
        setSavedErrors((prev) => ({
          ...prev,
          [collectionKey]: `Failed to load ${collectionKey}`
        }));
      } finally {
        setSavedLoading((prev) => ({ ...prev, [collectionKey]: false }));
      }
    };

    loadSavedCollection();
  }, [currentUser, isSavedView, typeFilter]);

  const visibleContent = useMemo(() => {
    if (!isSavedView) {
      return activeItems;
    }

    const keyword = search.trim().toLowerCase().replace(/^#/, '');
    const filtered = activeItems.filter((item) => {
      const isStory = item.content !== undefined;
      const itemType = isStory ? 'story' : 'artwork';
      const normalizedTags = normalizeTagList(item.tags || []);
      const matchesType = typeFilter === 'all' || typeFilter === 'bookmarked' || typeFilter === 'liked'
        ? true
        : itemType === typeFilter;
      const matchesSearch =
        !keyword ||
        item.title.toLowerCase().includes(keyword) ||
        normalizedTags.some((tag) => tag.includes(keyword));
      const matchesTag = !selectedTag || normalizedTags.includes(selectedTag);
      const matchesSavedCollection = typeFilter === 'bookmarked'
        ? bookmarkedIds.includes(String(item._id))
        : typeFilter === 'liked'
          ? likedIds.includes(String(item._id))
          : true;

      return matchesType && matchesSearch && matchesTag && matchesSavedCollection;
    });

    return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [activeItems, bookmarkedIds, likedIds, isSavedView, search, selectedTag, typeFilter]);

  const bookmarkedFeedCount = useMemo(
    () => savedCollections.bookmarked.length,
    [savedCollections.bookmarked]
  );

  const likedFeedCount = useMemo(
    () => savedCollections.liked.length,
    [savedCollections.liked]
  );
  const favoriteTags = useMemo(() => normalizeTagList(currentUser?.favoriteTags || []), [currentUser?.favoriteTags]);
  const isSelectedTagFavorite = Boolean(selectedTag) && favoriteTags.includes(selectedTag);

  useEffect(() => {
    if (location.state?.feedTab !== 'home' || !location.state?.feedRefreshKey) {
      return;
    }

    invalidateFrontendCache([FRONTEND_CACHE_NAMESPACES.HOME_FEED]);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const shouldResetFeed = typeFilter !== 'all' || sortBy !== 'newest' || search.trim() !== '';

    if (shouldResetFeed) {
      setTypeFilter('all');
      setSortBy('newest');
      setSearch('');
      return;
    }

    if (!selectedTag && !isSavedView) {
      reloadFeed();
    }
  }, [location.state?.feedRefreshKey]);

  const clearTagFilter = () => {
    if (searchParams.has('tag')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('tag');
      setSearchParams(nextParams);
    }
  };

  const handleSelectedTagFavoriteToggle = async () => {
    if (!selectedTag || !getToken() || favoriteTagBusy) {
      return;
    }

    setFavoriteTagBusy(true);

    try {
      const result = await toggleFavoriteTag(selectedTag, isSelectedTagFavorite);

      if (!result.success) {
        alert(result.error?.message || 'Failed to update favorite hashtag');
      }
    } finally {
      setFavoriteTagBusy(false);
    }
  };

  const filterChips = [
    { key: 'all', label: 'All posts' },
    { key: 'story', label: 'Stories' },
    { key: 'artwork', label: 'Artwork' },
    ...(currentUser ? [{ key: 'bookmarked', label: `Bookmarks ${bookmarkCount}` }] : []),
    ...(currentUser ? [{ key: 'liked', label: `Likes ${likeCount}` }] : [])
  ];

  return (
    <div className="feed-shell">
      {loginNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-700 bg-slate-900/95 p-6 text-slate-100 shadow-2xl light:border-slate-200 light:bg-white light:text-slate-800">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300 light:text-emerald-600">Account update</p>
            <h3 className="mt-2 text-2xl font-semibold text-white light:text-slate-900">{loginNotice.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300 light:text-slate-600">{loginNotice.message}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setLoginNotice(null)}
                className="rounded-2xl bg-brand px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-light"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="feed-column">
        <FeedTabs activeTab="home" />

        {isPostingRestricted ? (
          <section className="feed-section bg-rose-950/20">
            <p className="text-xs uppercase tracking-[0.24em] text-rose-200 light:text-rose-600">Posting restriction</p>
            <h2 className="mt-2 text-xl font-semibold text-rose-50 light:text-rose-950">
              Posting locked until {restrictionEndsAt.toLocaleString()}
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-100/90 light:text-rose-900/80">
              Reason: {currentUser.postingRestrictionReason}. You can still browse the feed while this restriction is active.
            </p>
          </section>
        ) : null}

        <section className="feed-headline">
          <p className="feed-kicker">Community timeline</p>
          <h2 className="feed-title">For you</h2>
          <p className="feed-subtitle">
            Approved stories and artwork in one stream. Filter by type, switch between newest and trending, or jump in with a tag search.
          </p>
        </section>

        <FeedComposer
          user={currentUser}
          prompt={currentUser ? "What's happening in your studio?" : 'Login to publish your next drop'}
          hint="Start a new story draft or upload fresh artwork directly from the feed flow."
          primaryAction={currentUser ? { to: '/create-story', label: 'Post story' } : { to: '/login', label: 'Login' }}
          secondaryAction={currentUser ? { to: '/create-artwork', label: 'Upload art' } : { to: '/register', label: 'Create account' }}
        />

        <section className="feed-toolbar">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="surface-search flex w-full items-center gap-3 px-4 py-3 lg:max-w-[22rem]">
              <Search size={16} />
              <input
                className="w-full bg-transparent text-sm text-white outline-none light:text-slate-800"
                placeholder="Search by title or tag..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`feed-filter-chip ${sortBy === 'newest' ? 'feed-filter-chip-active' : ''}`}
                onClick={() => setSortBy('newest')}
              >
                Latest
              </button>
              <button
                type="button"
                className={`feed-filter-chip ${sortBy === 'trending' ? 'feed-filter-chip-active' : ''}`}
                onClick={() => setSortBy('trending')}
              >
                Trending
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`feed-filter-chip ${typeFilter === chip.key ? 'feed-filter-chip-active' : ''}`}
                onClick={() => setTypeFilter(chip.key)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {selectedTag ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="feed-inline-banner">Filtering by #{selectedTag}</span>
              <button type="button" className="feed-filter-chip py-1.5 text-xs" onClick={clearTagFilter}>
                Clear
              </button>
              {getToken() ? (
                <button
                  type="button"
                  disabled={favoriteTagBusy}
                  className={`feed-filter-chip inline-flex items-center gap-2 py-1.5 text-xs ${isSelectedTagFavorite ? 'feed-filter-chip-active' : ''}`}
                  onClick={handleSelectedTagFavoriteToggle}
                >
                  <Star size={14} fill={isSelectedTagFavorite ? 'currentColor' : 'none'} />
                  {isSelectedTagFavorite ? 'Favorited' : 'Favorite'}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {activeError ? <div className="feed-inline-alert">{activeError}</div> : null}

        {activeLoading ? (
          <div className="feed-loading">
            <LoadingSpinner label={isSavedView ? `Loading ${typeFilter} posts...` : 'Loading feed...'} />
          </div>
        ) : visibleContent.length ? (
          <VirtualizedFeedList
            items={visibleContent}
            renderItem={(item) => <ContentCard key={item._id} item={item} />}
            estimateSize={540}
            hasMore={!isSavedView && hasMoreFeed}
            isLoadingMore={!isSavedView && isLoadingMore}
            loadMoreRef={!isSavedView ? loadMoreRef : undefined}
            loadingMoreLabel="Loading more posts..."
          />
        ) : typeFilter === 'bookmarked' ? (
          <div className="feed-empty">
            <EmptyState
              title={bookmarkCount === 0 ? 'No saved posts yet' : 'No saved posts match this view'}
              description={bookmarkCount === 0
                ? 'Use the bookmark button on any post to save it and come back to it here.'
                : bookmarkedFeedCount === 0
                  ? 'Your saved posts are not part of the current feed selection.'
                  : 'Try clearing the search keyword or tag filter to show more saved posts.'}
            />
          </div>
        ) : typeFilter === 'liked' ? (
          <div className="feed-empty">
            <EmptyState
              title={likeCount === 0 ? 'No liked posts yet' : 'No liked posts match this view'}
              description={likeCount === 0
                ? 'Use the heart button on any post to add it to your liked list.'
                : likedFeedCount === 0
                  ? 'Your liked posts are not available in this collection right now.'
                  : 'Try clearing the search keyword or tag filter to show more liked posts.'}
            />
          </div>
        ) : (
          <div className="feed-empty">
            <EmptyState
              title={content.length === 0 ? 'No content yet' : 'No matching results'}
              description={content.length === 0 ? 'Feed will display approved stories and artworks.' : 'Try changing your filter or search keywords.'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
