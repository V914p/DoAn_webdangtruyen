import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getToken } from '../../services/authService';
import { getRoutePrefetchProps } from '../../services/routePrefetch';
import { normalizeTag } from '../../utils/hashtags';
import { useRightRail } from '../../contexts/RightRailContext';

export function RightPanel() {
  const {
    tags,
    creators,
    favoriteTags,
    recommendedTags,
    favoriteTagBusy,
    currentUser,
    getImageUrl,
    handleFavoriteToggle
  } = useRightRail();
  const location = useLocation();
  const activeTag = normalizeTag(new URLSearchParams(location.search).get('tag'));

  const currentUserId = useMemo(() => String(currentUser?._id || currentUser?.id || ''), [currentUser?._id, currentUser?.id]);

  const renderTagRow = (tag, { allowFavorite = true } = {}) => {
    const normalizedTag = normalizeTag(tag.name || tag);
    const isFavorite = favoriteTags.includes(normalizedTag);

    return (
      <div key={normalizedTag} className="right-rail-tag-row">
        <Link
          to={`/home?tag=${encodeURIComponent(normalizedTag)}`}
          className={`right-rail-tag flex-1 ${activeTag === normalizedTag ? 'border-brand bg-brand/20 text-brand-light' : ''}`}
        >
          #{normalizedTag}
        </Link>
        {allowFavorite && getToken() ? (
          <button
            type="button"
            disabled={favoriteTagBusy === normalizedTag}
            onClick={async () => {
              const result = await handleFavoriteToggle(normalizedTag, isFavorite);
              if (!result.success) {
                alert(result.error?.message || 'Failed to update favorite hashtag');
              }
            }}
            className={`right-rail-tag-action ${isFavorite ? 'right-rail-tag-action-active' : ''}`}
            aria-label={isFavorite ? `Remove #${normalizedTag} from favorites` : `Save #${normalizedTag} to favorites`}
          >
            <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="right-rail sidebar-scroll xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pr-1">
      {getToken() ? (
        <section className="right-rail-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="right-rail-title">Favorite Tags</h2>
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Personal</span>
          </div>
          <div className="mt-3 space-y-2">
            {favoriteTags.length > 0 ? (
              favoriteTags.map((tag) => renderTagRow(tag))
            ) : (
              <p className="text-sm text-slate-400">Save hashtags you care about to start building recommendations.</p>
            )}
          </div>
        </section>
      ) : null}

      {getToken() ? (
        <section className="right-rail-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="right-rail-title">Recommended Tags</h2>
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">For you</span>
          </div>
          <div className="mt-3 space-y-2">
            {recommendedTags.length > 0 ? (
              recommendedTags.map((tag) => renderTagRow(tag))
            ) : (
              <p className="text-sm text-slate-400">Favorite a few hashtags first, then recommendations will appear here.</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="right-rail-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="right-rail-title">Trending Tags</h2>
          <Link to="/search?view=tags" {...getRoutePrefetchProps('/search')} className="text-xs uppercase tracking-[0.18em] text-brand-light transition hover:text-white">
            View all
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {tags.length > 0 ? (
            tags.map((tag) => renderTagRow(tag))
          ) : (
            <p className="text-sm text-slate-400">No trending tags yet</p>
          )}
        </div>
      </section>

      <section className="right-rail-card">
        <h2 className="right-rail-title">Popular Creators</h2>
        <div className="mt-3 space-y-2.5 2xl:space-y-4">
          {creators.length > 0 ? (
            creators.map((creator) => {
              const matchesCurrentUser = String(creator.id) === currentUserId;
              const displayUsername = matchesCurrentUser ? (currentUser?.username || creator.username) : creator.username;
              const displayAvatar = matchesCurrentUser ? (currentUser?.avatar || null) : creator.avatar;

              return (
              <Link
                key={creator.id}
                to={`/profile/${creator.id}`}
                {...getRoutePrefetchProps('/profile')}
                className="right-rail-creator"
              >
                {displayAvatar ? (
                  <img
                    src={getImageUrl(displayAvatar)}
                    alt={displayUsername}
                    className="h-10 w-10 rounded-full object-cover 2xl:h-12 2xl:w-12"
                  />
                ) : (
                  <div className="user-avatar-fallback h-10 w-10 text-base 2xl:h-12 2xl:w-12 2xl:text-lg">
                    {displayUsername?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white transition hover:text-brand-light">{displayUsername}</p>
                  <p className="truncate text-xs text-slate-400">{creator.totalLikes} total likes</p>
                </div>
              </Link>
            );
            })
          ) : (
            <p className="text-sm text-slate-400">No creators yet</p>
          )}
        </div>
      </section>
    </aside>
  );
}
