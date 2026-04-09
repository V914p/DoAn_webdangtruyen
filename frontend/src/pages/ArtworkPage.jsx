import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Heart, MessageCircle, X } from 'lucide-react';
import { Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { getCurrentUser, getToken, subscribeToCurrentUserChange, updateCurrentUserCollection } from '../services/authService';
import { invalidateContentMutationCaches } from '../services/appDataInvalidation';
import { LazyImage } from '../components/common/LazyImage';
import { ReportContentButton } from '../components/common/ReportContentButton';
import { subscribeToContentComments, subscribeToNotificationSocketState } from '../services/notificationService';
import { getRoutePrefetchProps } from '../services/routePrefetch';
import { formatCount, formatRelative } from '../utils/helpers';
import { formatTag, normalizeTagList } from '../utils/hashtags';
import { buildRemovedContentLink } from '../utils/notifications';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getAvatarUrl(avatar) {
  if (!avatar) {
    return '';
  }

  if (avatar.startsWith('http') || avatar.startsWith('data:image')) {
    return avatar;
  }

  return `${API_URL}${avatar}`;
}

function upsertComment(items, nextComment) {
  const exists = items.some((comment) => String(comment._id) === String(nextComment._id));
  const nextItems = exists
    ? items.map((comment) => (String(comment._id) === String(nextComment._id) ? nextComment : comment))
    : [...items, nextComment];

  return [...nextItems].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

export default function ArtworkPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser() || {});
  const [artwork, setArtwork] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentTargetNotice, setCommentTargetNotice] = useState('');
  const [highlightedCommentId, setHighlightedCommentId] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(() => {
    const bookmarks = currentUser.bookmarks || [];
    return bookmarks.map((value) => String(value)).includes(String(id));
  });
  const artworkTags = normalizeTagList(artwork?.tags || []);
  const hasHandledAuthIdentityRef = useRef(false);
  const authIdentityKey = `${getToken() ? 'auth' : 'guest'}:${currentUser?._id || currentUser?.id || 'guest'}`;
  const artworkImages = Array.isArray(artwork?.images) ? artwork.images : [];
  const activeImage = artworkImages[currentImageIndex] || null;
  const visibleArtworkImages = artworkImages.slice(0, 4);
  const hiddenArtworkImageCount = Math.max(artworkImages.length - 4, 0);
  const authorAvatarUrl = getAvatarUrl(artwork?.author?.avatar);

  const isAuthor = artwork?.author?._id === currentUser._id || artwork?.author?._id === currentUser.id;
  const highlightTimeoutRef = useRef(null);
  const commentScrollTimeoutsRef = useRef([]);

  const jumpToComments = () => {
    document.getElementById('artwork-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      commentScrollTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    },
    []
  );

  useEffect(() => {
    fetchArtwork();
    fetchComments();
  }, [id]);

  useEffect(() => subscribeToContentComments(id, (payload) => {
    if (payload?.type === 'created' && payload.comment) {
      setComments((prev) => upsertComment(prev, payload.comment));
    }

    if (payload?.type === 'deleted' && payload.commentId) {
      setComments((prev) => prev.filter((comment) => String(comment._id) !== String(payload.commentId)));
    }
  }), [id]);

  useEffect(() => subscribeToCurrentUserChange((user) => setCurrentUser(user || {})), []);

  useEffect(() => {
    if (!id) {
      return;
    }

    if (!hasHandledAuthIdentityRef.current) {
      hasHandledAuthIdentityRef.current = true;
      return;
    }

    fetchComments();
  }, [authIdentityKey, id]);

  useEffect(() => subscribeToNotificationSocketState((payload) => {
    if (payload?.type === 'open' && payload.reason === 'reconnect') {
      fetchComments();
    }
  }), [id]);

  useEffect(() => {
    const handleOnline = () => {
      fetchComments();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [id]);

  useEffect(() => {
    const likeIds = Array.isArray(currentUser?.likes) ? currentUser.likes.map((value) => String(value)) : [];
    const bookmarkIds = Array.isArray(currentUser?.bookmarks) ? currentUser.bookmarks.map((value) => String(value)) : [];
    setIsLiked(likeIds.includes(String(id)));
    setIsBookmarked(bookmarkIds.includes(String(id)));
  }, [currentUser, id]);

  useEffect(() => {
    const targetCommentId =
      location.state?.targetCommentId ||
      new URLSearchParams(location.search).get('comment') ||
      location.hash.replace('#comment-', '');

    if (!targetCommentId || !commentsLoaded) {
      return;
    }

    const targetExists = comments.some((comment) => String(comment._id) === String(targetCommentId));

    if (!targetExists) {
      setCommentTargetNotice('This comment is no longer available. It may have been deleted.');
      jumpToComments();
      return;
    }

    setCommentTargetNotice('');

    commentScrollTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    commentScrollTimeoutsRef.current = [];

    const scrollToComment = () => {
      const targetElement = document.getElementById(`comment-${targetCommentId}`);

      if (!targetElement) {
        return;
      }

      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedCommentId(String(targetCommentId));

      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedCommentId('');
      }, 2600);
    };

    [0, 180, 420, 900].forEach((delay) => {
      const timeoutId = window.setTimeout(scrollToComment, delay);
      commentScrollTimeoutsRef.current.push(timeoutId);
    });
  }, [comments, commentsLoaded, location.hash, location.search, location.state]);

  useEffect(() => {
    setCurrentImageIndex(0);
    setIsViewerOpen(false);
  }, [id, artwork?.images?.length]);

  useEffect(() => {
    if (!isViewerOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsViewerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isViewerOpen]);

  const fetchArtwork = async () => {
    try {
      const response = await fetch(`${API_URL}/api/content/${id}`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setArtwork(data.data);
      } else {
        if (response.status === 410 || data.error?.code === 'CONTENT_DELETED') {
          const notification = location.state?.notification;
          navigate(buildRemovedContentLink({
            contentId: id,
            contentType: 'Artwork',
            contentTitle: notification?.contentTitle,
            creatorUsername: notification?.from?.username,
            creatorId: notification?.from?._id
          }), {
            replace: true,
            state: {
              notification: notification
                ? {
                    ...notification,
                    contentDeleted: true,
                    contentId: notification.contentId || id,
                    contentType: notification.contentType || 'Artwork'
                  }
                : {
                    contentDeleted: true,
                    contentId: id,
                    contentType: 'Artwork'
                  },
              openedFromNotification: Boolean(location.state?.openedFromNotification)
            }
          });
          return;
        } else {
          setError('Artwork not found');
        }
      }
    } catch (err) {
      setError('Failed to load artwork');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await fetch(`${API_URL}/api/content/${id}/comments`);
      const data = await response.json();

      if (data.success) {
        setComments(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load comments');
    } finally {
      setCommentsLoaded(true);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    setCommentError('');

    if (!newComment.trim()) {
      setCommentError('Comment cannot be empty');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/content/${id}/comments?type=artwork`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ text: newComment })
      });

      const data = await response.json();

      if (data.success) {
        setNewComment('');
        setComments((prev) => upsertComment(prev, data.data));
      } else {
        setCommentError(data.error.message);
      }
    } catch (err) {
      setCommentError('Failed to post comment');
    }
  };

  const nextImage = () => {
    if (artworkImages.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % artworkImages.length);
    }
  };

  const prevImage = () => {
    if (artworkImages.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + artworkImages.length) % artworkImages.length);
    }
  };

  const resolveImageSrc = (image) => (image.startsWith('http') ? image : `${API_URL}${image}`);

  const openViewer = (index) => {
    setCurrentImageIndex(index);
    setIsViewerOpen(true);
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this artwork? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);

    try {
      console.log('Deleting artwork:', id);
      console.log('API URL:', `${API_URL}/api/content/${id}`);
      console.log('Token:', getToken());

      const response = await fetch(`${API_URL}/api/content/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });

      console.log('Delete response status:', response.status);
      const data = await response.json();
      console.log('Delete response data:', data);

      if (data.success) {
        invalidateContentMutationCaches({ includeTagDirectory: true });
        alert('Artwork deleted successfully');
        navigate('/artworks');
      } else {
        const errorMsg = data.error?.message || 'Failed to delete artwork';
        console.error('Delete failed:', errorMsg);
        alert(errorMsg);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete artwork: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      const response = await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setComments((prev) => prev.filter((comment) => String(comment._id) !== String(commentId)));
      } else {
        alert(data.error?.message || 'Failed to delete comment');
      }
    } catch (err) {
      alert('Failed to delete comment');
    }
  };

  const handleBookmarkToggle = async () => {
    if (pendingAction) {
      return;
    }

    try {
      setPendingAction('bookmark');
      const response = await fetch(`${API_URL}/api/content/${id}/bookmark`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await response.json();
      if (!data.success) {
        alert(data.error?.message || 'Failed to update bookmark');
        return;
      }

      const nextBookmarked = !isBookmarked;
      updateCurrentUserCollection('bookmarks', id, nextBookmarked);
      setIsBookmarked(nextBookmarked);
      setArtwork(data.data);
      invalidateContentMutationCaches();
    } catch (err) {
      alert('Failed to update bookmark');
    } finally {
      setPendingAction('');
    }
  };

  const handleLikeToggle = async () => {
    if (pendingAction) {
      return;
    }

    try {
      setPendingAction('like');
      const response = await fetch(`${API_URL}/api/content/${id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.error?.message || 'Failed to update like');
        return;
      }

      const nextLiked = !isLiked;
      updateCurrentUserCollection('likes', id, nextLiked);
      setIsLiked(nextLiked);
      setArtwork(data.data);
      invalidateContentMutationCaches();
    } catch (err) {
      alert('Failed to update like');
    } finally {
      setPendingAction('');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-300">Loading...</div>;
  }

  if (error || !artwork) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
          {error || 'Artwork not found'}
        </div>
        <button
          onClick={() => navigate('/artworks')}
          className="detail-back-link mt-4"
        >
          ← Back to Artworks
        </button>
      </div>
    );
  }

  return (
    <div className="detail-shell px-4 py-6 sm:py-8">
      <article className="detail-post-card">
        <div className="detail-post-toolbar">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/artworks')} className="detail-back-icon" aria-label="Back to artworks">
              <ArrowLeft size={20} />
            </button>
            <h1 className="detail-post-heading">Post</h1>
          </div>
        </div>

        <div className="detail-post-main">
          <div className="flex gap-3">
            <div className="shrink-0 pt-1">
              {authorAvatarUrl ? (
                <img src={authorAvatarUrl} alt={artwork.author?.username || 'Unknown'} className="feed-avatar" />
              ) : (
                <div className="feed-avatar-fallback">{artwork.author?.username?.[0]?.toUpperCase() || '?'}</div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="truncate font-semibold text-white">{artwork.author?.username || 'Unknown'}</span>
                <span className="text-slate-500">@{artwork.author?.username || 'unknown'}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">{formatRelative(artwork.createdAt)}</span>
              </div>

              <h2 className="mt-4 detail-title">{artwork.title}</h2>

              {artwork.description ? <p className="mt-4 text-lg leading-8 text-slate-300">{artwork.description}</p> : null}

              {artworkTags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {artworkTags.map((tag) => (
                    <span key={tag} className="detail-tag">
                      {formatTag(tag)}
                    </span>
                  ))}
                </div>
              ) : null}

              {artworkImages.length > 0 ? (
                <div className={`detail-media-grid ${artworkImages.length === 1 ? 'detail-media-grid-single' : ''}`}>
                  {visibleArtworkImages.map((image, index) => {
                    const showMoreOverlay = index === 3 && hiddenArtworkImageCount > 0;
                    const isWideLead = visibleArtworkImages.length === 3 && index === 0;

                    return (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        onClick={() => openViewer(index)}
                        className={`detail-media-tile ${artworkImages.length === 1 ? 'detail-media-tile-single' : isWideLead ? 'detail-media-tile-featured' : 'detail-media-tile-rect'}`}
                      >
                        <LazyImage
                          src={resolveImageSrc(image)}
                          alt={`${artwork.title} - Preview ${index + 1}`}
                          fallbackSrc={'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage not available%3C/text%3E%3C/svg%3E'}
                          wrapperClassName="h-full w-full"
                          className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]"
                        />
                        <div className="detail-media-badge">{index + 1}/{artworkImages.length}</div>
                        {showMoreOverlay ? <div className="detail-media-more">+{hiddenArtworkImageCount}</div> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="detail-post-meta-line">{new Date(artwork.createdAt).toLocaleString()}</div>

              <div className="detail-stat-row">
                <button type="button" onClick={jumpToComments} className="detail-stat-button">
                  <MessageCircle size={18} />
                  <span>{formatCount(comments.length)}</span>
                </button>
                <button
                  type="button"
                  onClick={handleLikeToggle}
                  disabled={pendingAction === 'like'}
                  className={`detail-stat-button ${isLiked ? 'detail-stat-like-active' : ''}`}
                >
                  <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
                  <span>{formatCount(artwork.likes || 0)}</span>
                </button>
                <button
                  type="button"
                  onClick={handleBookmarkToggle}
                  disabled={pendingAction === 'bookmark'}
                  className={`detail-stat-button ${isBookmarked ? 'detail-stat-bookmark-active' : ''}`}
                >
                  <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
                  <span>{formatCount(artwork.bookmarks || 0)}</span>
                </button>
              </div>

              <div className="detail-post-support">
                {!isAuthor ? <ReportContentButton contentId={id} contentType="Artwork" className="rounded-full px-4 py-2" /> : null}
                {isAuthor ? (
                  <>
                    <Link
                      to={`/artwork/${id}/edit`}
                      {...getRoutePrefetchProps(`/artwork/${id}/edit`)}
                      className="detail-inline-button"
                    >
                      Edit Artwork
                    </Link>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Artwork'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </article>

      {isViewerOpen && activeImage ? (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm" onClick={() => setIsViewerOpen(false)}>
          <div className="flex min-h-full items-center justify-center px-4 py-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-[min(88vh,56rem)] w-full max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.55)] lg:flex-row">
              <div className="relative flex min-h-[22rem] flex-1 items-center justify-center bg-black px-4 py-6 lg:px-8">
                <img
                  src={resolveImageSrc(activeImage)}
                  alt={`${artwork.title} - Image ${currentImageIndex + 1}`}
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => {
                    console.error('Image load error:', activeImage);
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage not available%3C/text%3E%3C/svg%3E';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIsViewerOpen(false)}
                  className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-slate-100 transition hover:border-white/20 hover:bg-slate-900"
                  aria-label="Close image viewer"
                >
                  <X size={18} />
                </button>
              </div>

              <aside className="flex w-full flex-col border-t border-white/10 bg-slate-950/98 lg:w-[20rem] lg:border-l lg:border-t-0">
                <div className="border-b border-white/10 px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Artwork viewer</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">{artwork.title}</h2>
                  <p className="mt-1 text-sm text-slate-400">Image {currentImageIndex + 1} of {artworkImages.length}</p>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {artworkImages.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => setCurrentImageIndex(index)}
                      className={`flex w-full items-center gap-3 rounded-[1.35rem] border p-2 text-left transition ${index === currentImageIndex ? 'border-brand/50 bg-brand/10' : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900'}`}
                    >
                      <div className="h-20 w-20 overflow-hidden rounded-[1rem] bg-slate-900">
                        <LazyImage
                          src={resolveImageSrc(image)}
                          alt={`${artwork.title} thumbnail ${index + 1}`}
                          fallbackSrc={'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage not available%3C/text%3E%3C/svg%3E'}
                          wrapperClassName="h-full w-full"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">Page {index + 1}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {index === 0 ? 'Main cover preview' : 'Click to focus this image'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                {artworkImages.length > 1 ? (
                  <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-4">
                    <button
                      type="button"
                      onClick={prevImage}
                      className="detail-inline-button px-4 py-3 text-sm"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={nextImage}
                      className="detail-inline-button px-4 py-3 text-sm"
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      <section id="artwork-comments" className="detail-comments detail-comments-compact space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-white">Comments</h2>
          <span className="detail-comment-count">{formatCount(comments.length)} replies</span>
        </div>

        {commentTargetNotice ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {commentTargetNotice}
          </div>
        ) : null}

        <form onSubmit={handleCommentSubmit} className="detail-comment-form">
          {commentError ? <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">{commentError}</div> : null}

          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            maxLength={1000}
            rows={4}
            className="detail-textarea"
            placeholder="Write a comment..."
          />
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-400">{newComment.length}/1000</span>
            <button type="submit" className="rounded-2xl bg-brand px-6 py-2 text-white transition hover:bg-brand-light">
              Post Comment
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {comments.length === 0 ? (
            <p className="py-8 text-center text-slate-400">No comments yet. Be the first to comment.</p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment._id}
                id={`comment-${comment._id}`}
                className={`detail-comment-item ${highlightedCommentId === String(comment._id) ? 'detail-comment-item-highlighted' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white">{comment.user?.username || 'Anonymous'}</span>
                    <span className="text-sm text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  {comment.user?._id === currentUser._id || comment.user?._id === currentUser.id ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(comment._id)}
                      className="text-sm text-red-400 transition hover:text-red-300"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <p className="text-slate-300">{comment.text}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
