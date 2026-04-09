import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Heart, MessageCircle } from 'lucide-react';
import { Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { getCurrentUser, getToken, subscribeToCurrentUserChange, updateCurrentUserCollection } from '../services/authService';
import { invalidateContentMutationCaches } from '../services/appDataInvalidation';
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

export default function StoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser() || {});
  const [story, setStory] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [newComment, setNewComment] = useState('');
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
  const storyTags = normalizeTagList(story?.tags || []);
  const hasHandledAuthIdentityRef = useRef(false);
  const authIdentityKey = `${getToken() ? 'auth' : 'guest'}:${currentUser?._id || currentUser?.id || 'guest'}`;
  const authorAvatarUrl = getAvatarUrl(story?.author?.avatar);

  const isAuthor = story?.author?._id === currentUser._id || story?.author?._id === currentUser.id;
  const highlightTimeoutRef = useRef(null);
  const commentScrollTimeoutsRef = useRef([]);

  const jumpToComments = () => {
    document.getElementById('story-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    fetchStory();
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

  const fetchStory = async () => {
    try {
      const response = await fetch(`${API_URL}/api/content/${id}`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setStory(data.data);
      } else {
        if (response.status === 410 || data.error?.code === 'CONTENT_DELETED') {
          const notification = location.state?.notification;
          navigate(buildRemovedContentLink({
            contentId: id,
            contentType: 'Story',
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
                    contentType: notification.contentType || 'Story'
                  }
                : {
                    contentDeleted: true,
                    contentId: id,
                    contentType: 'Story'
                  },
              openedFromNotification: Boolean(location.state?.openedFromNotification)
            }
          });
          return;
        } else {
          setError('Story not found');
        }
      }
    } catch (err) {
      setError('Failed to load story');
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
      const response = await fetch(`${API_URL}/api/content/${id}/comments?type=story`, {
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

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this story? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);

    try {
      console.log('Deleting story:', id);
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
        alert('Story deleted successfully');
        navigate('/stories');
      } else {
        const errorMsg = data.error?.message || 'Failed to delete story';
        console.error('Delete failed:', errorMsg);
        alert(errorMsg);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete story: ' + err.message);
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
      setStory(data.data);
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
      setStory(data.data);
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

  if (error || !story) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
          {error || 'Story not found'}
        </div>
        <button
          onClick={() => navigate('/stories')}
          className="detail-back-link mt-4"
        >
          ← Back to Stories
        </button>
      </div>
    );
  }

  return (
    <div className="detail-shell px-4 py-6 sm:py-8">
      <article className="detail-post-card">
        <div className="detail-post-toolbar">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/stories')} className="detail-back-icon" aria-label="Back to stories">
              <ArrowLeft size={20} />
            </button>
            <h1 className="detail-post-heading">Post</h1>
          </div>
        </div>

        <div className="detail-post-main">
          <div className="flex gap-3">
            <div className="shrink-0 pt-1">
              {authorAvatarUrl ? (
                <img src={authorAvatarUrl} alt={story.author?.username || 'Unknown'} className="feed-avatar" />
              ) : (
                <div className="feed-avatar-fallback">{story.author?.username?.[0]?.toUpperCase() || '?'}</div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="truncate font-semibold text-white">{story.author?.username || 'Unknown'}</span>
                <span className="text-slate-500">@{story.author?.username || 'unknown'}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">{formatRelative(story.createdAt)}</span>
              </div>

              <h2 className="mt-4 detail-title">{story.title}</h2>

              {story.description ? <p className="mt-4 text-lg leading-8 text-slate-300">{story.description}</p> : null}

              {storyTags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {storyTags.map((tag) => (
                    <span key={tag} className="detail-tag">
                      {formatTag(tag)}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 detail-prose whitespace-pre-wrap leading-8">{story.content}</div>

              <div className="detail-post-meta-line">{new Date(story.createdAt).toLocaleString()}</div>

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
                  <span>{formatCount(story.likes || 0)}</span>
                </button>
                <button
                  type="button"
                  onClick={handleBookmarkToggle}
                  disabled={pendingAction === 'bookmark'}
                  className={`detail-stat-button ${isBookmarked ? 'detail-stat-bookmark-active' : ''}`}
                >
                  <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
                  <span>{formatCount(story.bookmarks || 0)}</span>
                </button>
              </div>

              <div className="detail-post-support">
                {!isAuthor ? <ReportContentButton contentId={id} contentType="Story" className="rounded-full px-4 py-2" /> : null}
                {isAuthor ? (
                  <>
                    <Link
                      to={`/story/${id}/edit`}
                      {...getRoutePrefetchProps(`/story/${id}/edit`)}
                      className="detail-inline-button"
                    >
                      Edit Story
                    </Link>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Story'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </article>

      <section id="story-comments" className="detail-comments detail-comments-compact space-y-6">
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
