import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FeedComposer, FeedTabs } from '../components/FeedScaffold';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/common/EmptyState';
import { VirtualizedFeedList } from '../components/feed/VirtualizedFeedList';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useCursorFeed } from '../hooks/useCursorFeed';
import { getCurrentUser, subscribeToCurrentUserChange } from '../services/authService';
import { FRONTEND_CACHE_NAMESPACES, invalidateFrontendCache } from '../services/frontendCache';
const ARTWORKS_PAGE_SIZE = 10;

export default function ArtworksPage() {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const feedParams = useMemo(() => ({ sort: 'newest', type: 'artwork' }), []);
  const {
    items: artworks,
    loading,
    error,
    hasMore,
    isLoadingMore,
    loadMoreRef,
    reload
  } = useCursorFeed({
    params: feedParams,
    limit: ARTWORKS_PAGE_SIZE
  });

  useEffect(() => subscribeToCurrentUserChange(setCurrentUser), []);

  useEffect(() => {
    if (location.state?.feedTab !== 'artworks' || !location.state?.feedRefreshKey) {
      return;
    }

    invalidateFrontendCache([FRONTEND_CACHE_NAMESPACES.HOME_FEED]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    reload();
  }, [location.state?.feedRefreshKey]);

  return (
    <div className="feed-shell">
      <div className="feed-column">
        <FeedTabs activeTab="artworks" />

        <section className="feed-headline">
          <p className="feed-kicker">Gallery line</p>
          <h1 className="feed-title">Artwork</h1>
          <p className="feed-subtitle">
            A dark gallery feed for illustrations, concept boards, and image-first drops with the same rhythm as a social timeline.
          </p>
        </section>

        <FeedComposer
          user={currentUser}
          prompt={currentUser ? 'Ready to drop a new piece?' : 'Login to upload artwork'}
          hint="Lead with the image, keep the caption concise, and let the timeline carry viewers into the full artwork page."
          primaryAction={currentUser ? { to: '/create-artwork', label: 'Upload artwork' } : { to: '/login', label: 'Login' }}
          secondaryAction={currentUser ? { to: '/home', label: 'Mixed feed' } : { to: '/register', label: 'Create account' }}
        />

        {error ? <div className="feed-inline-alert">{error}</div> : null}

        {loading ? (
          <div className="feed-loading">
            <LoadingSpinner label="Loading artworks..." />
          </div>
        ) : artworks.length === 0 ? (
          <div className="feed-empty">
            <EmptyState title="No artworks yet" description="Be the first to upload artwork!" />
          </div>
        ) : (
          <VirtualizedFeedList
            items={artworks}
            renderItem={(artwork) => <ContentCard key={artwork._id} item={artwork} />}
            estimateSize={560}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            loadMoreRef={loadMoreRef}
            loadingMoreLabel="Loading more artwork posts..."
          />
        )}
      </div>
    </div>
  );
}
