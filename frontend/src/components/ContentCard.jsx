import { memo, useEffect, useState } from 'react';
import { Bookmark, Heart, Images, SquareArrowOutUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LazyImage } from './common/LazyImage';
import { formatCount, formatRelative } from '../utils/helpers';
import { formatTag, normalizeTagList } from '../utils/hashtags';
import { getCurrentUser, getToken, subscribeToCurrentUserChange, updateCurrentUserCollection } from '../services/authService';
import { invalidateContentMutationCaches } from '../services/appDataInvalidation';
import { getRoutePrefetchProps } from '../services/routePrefetch';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const STORY_FALLBACK_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1e293b"/></linearGradient></defs><rect width="1200" height="675" fill="url(#bg)"/><circle cx="180" cy="520" r="220" fill="#334155" opacity="0.25"/><circle cx="980" cy="140" r="180" fill="#475569" opacity="0.22"/><rect x="420" y="220" width="360" height="220" rx="24" fill="#0b1222" stroke="#64748b" stroke-width="2"/><rect x="465" y="275" width="270" height="14" rx="7" fill="#94a3b8" opacity="0.85"/><rect x="465" y="315" width="220" height="14" rx="7" fill="#94a3b8" opacity="0.65"/><rect x="465" y="355" width="180" height="14" rx="7" fill="#94a3b8" opacity="0.55"/><text x="600" y="188" fill="#e2e8f0" text-anchor="middle" font-size="42" font-family="Georgia, serif">Story Cover</text></svg>'
)}`;
const IMAGE_FALLBACK_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#111827"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="1200" height="675" fill="url(#bg)"/><rect x="250" y="130" width="700" height="420" rx="30" fill="#0b1222" stroke="#475569" stroke-width="2"/><path d="M320 470 L510 280 L640 380 L760 300 L880 470 Z" fill="#334155"/><circle cx="700" cy="240" r="52" fill="#64748b"/><text x="600" y="585" fill="#cbd5e1" text-anchor="middle" font-size="34" font-family="Arial, sans-serif">Image unavailable</text></svg>'
)}`;

function ContentCardComponent({ item, onInteractionComplete }) {
  const [contentItem, setContentItem] = useState(item);
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [pendingAction, setPendingAction] = useState('');

  useEffect(() => {
    setContentItem(item);
  }, [item]);

  useEffect(() => subscribeToCurrentUserChange(setCurrentUser), []);

  const isStory = contentItem.content !== undefined;
  const contentId = String(contentItem._id);
  const detailPath = isStory ? `/story/${contentItem._id}` : `/artwork/${contentItem._id}`;
  const mediaImages = Array.isArray(contentItem.images) ? contentItem.images : [];
  const thumbnail = mediaImages.length > 0 ? mediaImages[0] : null;
  const displayTags = normalizeTagList(contentItem.tags || []).slice(0, 3);
  const likedIds = Array.isArray(currentUser?.likes) ? currentUser.likes.map((value) => String(value)) : [];
  const bookmarkedIds = Array.isArray(currentUser?.bookmarks) ? currentUser.bookmarks.map((value) => String(value)) : [];
  const isLiked = likedIds.includes(contentId);
  const isBookmarked = bookmarkedIds.includes(contentId);
  const visibleMediaImages = mediaImages.slice(0, 4);
  const hiddenMediaImageCount = Math.max(mediaImages.length - 4, 0);
  const showArtworkCollage = !isStory && mediaImages.length > 1;

  const getFallbackImage = () => (isStory ? STORY_FALLBACK_SVG : IMAGE_FALLBACK_SVG);

  const getImageUrl = (url) => {
    if (!url) return getFallbackImage();
    if (url.startsWith('http')) return url;
    if (url.startsWith('data:image')) return url;
    return `${API_URL}${url}`;
  };

  const getAuthorAvatarUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:image')) return url;
    return `${API_URL}${url}`;
  };

  const handleToggleInteraction = async (action) => {
    if (!getToken()) {
      alert('Please login to like or bookmark posts.');
      return;
    }

    if (pendingAction) {
      return;
    }

    const isLikeAction = action === 'like';
    const nextActive = isLikeAction ? !isLiked : !isBookmarked;

    setPendingAction(action);

    try {
      const response = await fetch(`${API_URL}/api/content/${contentId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.error?.message || `Failed to update ${action}`);
        return;
      }

      setContentItem(data.data);
      invalidateContentMutationCaches();
      updateCurrentUserCollection(isLikeAction ? 'likes' : 'bookmarks', contentId, nextActive);
      onInteractionComplete?.({
        updatedItem: data.data,
        action,
        isActive: nextActive,
        contentId
      });
    } catch (error) {
      alert(`Failed to update ${action}`);
    } finally {
      setPendingAction('');
    }
  };

  return (
    <article className="feed-card" {...getRoutePrefetchProps(detailPath)}>
      <div className="flex gap-3">
        <div className="shrink-0 pt-1">
          {contentItem.author?.avatar ? (
            <img
              src={getAuthorAvatarUrl(contentItem.author.avatar)}
              alt={contentItem.author.username}
              className="feed-avatar"
            />
          ) : (
            <div className="feed-avatar-fallback">
              {contentItem.author?.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="truncate font-semibold text-white">{contentItem.author?.username || 'Unknown'}</span>
                <span className="text-slate-500">@{contentItem.author?.username || 'unknown'}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">{formatRelative(contentItem.createdAt)}</span>
              </div>
              <span className="mt-2 inline-flex rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                {isStory ? 'Story drop' : 'Artwork post'}
              </span>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <Link to={detailPath} {...getRoutePrefetchProps(detailPath)} className="feed-card-title">
                {contentItem.title}
              </Link>
              {contentItem.description ? (
                <p className="feed-copy-clamp mt-2 text-[15px] leading-7 text-slate-200">{contentItem.description}</p>
              ) : null}
            </div>

            {displayTags.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {displayTags.map((tag) => (
                  <span key={tag} className="feed-tag">
                    {formatTag(tag)}
                  </span>
                ))}
              </div>
            ) : null}

            {showArtworkCollage ? (
              <Link to={detailPath} {...getRoutePrefetchProps(detailPath)} className="feed-media-grid">
                {visibleMediaImages.map((image, index) => {
                  const showMoreOverlay = index === 3 && hiddenMediaImageCount > 0;
                  const isWideLead = visibleMediaImages.length === 3 && index === 0;

                  return (
                    <div
                      key={`${image}-${index}`}
                      className={`feed-media-tile ${isWideLead ? 'feed-media-tile-featured' : 'feed-media-tile-rect'}`}
                    >
                      <LazyImage
                        src={getImageUrl(image)}
                        alt={`${contentItem.title} ${index + 1}`}
                        fallbackSrc={getFallbackImage()}
                        wrapperClassName="h-full w-full"
                        className="h-full w-full object-cover"
                      />
                      {index === 0 ? (
                        <div className="feed-media-badge">
                          <Images size={12} />
                          <span>{mediaImages.length}</span>
                        </div>
                      ) : null}
                      {showMoreOverlay ? <div className="feed-media-more">+{hiddenMediaImageCount}</div> : null}
                    </div>
                  );
                })}
              </Link>
            ) : (
              <Link to={detailPath} {...getRoutePrefetchProps(detailPath)} className="feed-media block">
                <LazyImage
                  src={getImageUrl(thumbnail)}
                  alt={contentItem.title}
                  fallbackSrc={getFallbackImage()}
                  wrapperClassName="aspect-[16/10] w-full"
                  className="h-full w-full object-cover"
                />
              </Link>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => handleToggleInteraction('like')}
                disabled={pendingAction === 'like'}
                className={`feed-action-button ${isLiked ? 'feed-action-like-active' : ''}`}
              >
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
                <span>{formatCount(contentItem.likes || 0)}</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleInteraction('bookmark')}
                disabled={pendingAction === 'bookmark'}
                className={`feed-action-button ${isBookmarked ? 'feed-action-bookmark-active' : ''}`}
              >
                <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
                <span>{formatCount(contentItem.bookmarks || 0)}</span>
              </button>
            </div>

            <Link to={detailPath} {...getRoutePrefetchProps(detailPath)} className="feed-open-link">
              <SquareArrowOutUpRight size={16} />
              <span>Open</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export const ContentCard = memo(ContentCardComponent);
