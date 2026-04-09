import { Bookmark, Heart } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ContentCard } from '../components/ContentCard';
import { SAVED_COLLECTION_ENDPOINTS } from '../constants/app';
import { getCurrentUser, getToken, subscribeToCurrentUserChange } from '../services/authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const PAGE_SIZE = 12;

const EMPTY_STATE = {
  bookmarked: {
    title: 'No saved posts yet',
    description: 'Use the bookmark button on any story or artwork to collect it here.'
  },
  liked: {
    title: 'No liked posts yet',
    description: 'Use the heart button on posts you want to revisit later.'
  }
};

function createCollectionState() {
  return {
    items: [],
    loading: false,
    error: '',
    pagination: {
      page: 1,
      limit: PAGE_SIZE,
      totalItems: 0,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false
    },
    initialized: false
  };
}

export default function SavedPage() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [activeTab, setActiveTab] = useState('bookmarked');
  const [collections, setCollections] = useState({
    bookmarked: createCollectionState(),
    liked: createCollectionState()
  });

  const bookmarkedCount = Array.isArray(currentUser?.bookmarks) ? currentUser.bookmarks.length : 0;
  const likedCount = Array.isArray(currentUser?.likes) ? currentUser.likes.length : 0;
  const activeCollection = collections[activeTab];

  useEffect(() => subscribeToCurrentUserChange(setCurrentUser), []);

  const loadCollection = async (tab, page = 1, append = false) => {
    const endpoint = SAVED_COLLECTION_ENDPOINTS[tab];

    if (!currentUser || !getToken() || !endpoint) {
      return;
    }

    setCollections((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        loading: true,
        error: ''
      }
    }));

    try {
      const response = await fetch(`${API_URL}/api/users/me/${endpoint}?page=${page}&limit=${PAGE_SIZE}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });
      const data = await response.json();

      if (!data.success) {
        setCollections((prev) => ({
          ...prev,
          [tab]: {
            ...prev[tab],
            loading: false,
            initialized: true,
            error: data.error?.message || `Failed to load ${tab}`
          }
        }));
        return;
      }

      setCollections((prev) => ({
        ...prev,
        [tab]: {
          ...prev[tab],
          items: append ? [...prev[tab].items, ...(data.data || [])] : (data.data || []),
          loading: false,
          initialized: true,
          pagination: data.pagination || prev[tab].pagination,
          error: ''
        }
      }));
    } catch (error) {
      setCollections((prev) => ({
        ...prev,
        [tab]: {
          ...prev[tab],
          loading: false,
          initialized: true,
          error: `Failed to load ${tab}`
        }
      }));
    }
  };

  useEffect(() => {
    if (!currentUser || !getToken()) {
      return;
    }

    if (!collections[activeTab].initialized) {
      loadCollection(activeTab, 1, false);
    }
  }, [activeTab, collections, currentUser]);

  const handleInteractionComplete = ({ action, isActive, contentId, updatedItem }) => {
    const targetCollection = action === 'bookmark' ? 'bookmarked' : 'liked';

    setCollections((prev) => {
      const next = { ...prev };
      const currentItems = next[targetCollection].items;

      next[targetCollection] = {
        ...next[targetCollection],
        items: isActive
          ? currentItems.map((item) => (String(item._id) === String(contentId) ? updatedItem : item))
          : currentItems.filter((item) => String(item._id) !== String(contentId)),
        pagination: {
          ...next[targetCollection].pagination,
          totalItems: Math.max(0, next[targetCollection].pagination.totalItems + (isActive ? 0 : -1))
        }
      };

      if (targetCollection !== activeTab) {
        next[activeTab] = {
          ...next[activeTab],
          items: next[activeTab].items.map((item) => (String(item._id) === String(contentId) ? updatedItem : item))
        };
      }

      return next;
    });
  };

  const statCards = useMemo(() => ([
    {
      key: 'bookmarked',
      label: 'Bookmarked',
      value: bookmarkedCount,
      hint: 'Posts you explicitly saved.',
      icon: Bookmark
    },
    {
      key: 'liked',
      label: 'Liked',
      value: likedCount,
      hint: 'Posts you reacted to with a heart.',
      icon: Heart
    }
  ]), [bookmarkedCount, likedCount]);

  return (
    <div className="detail-shell">
      <section className="detail-hero">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="detail-eyebrow">Saved library</p>
            <h2 className="detail-title mt-2">Liked and bookmarked posts</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
              Keep every saved story and artwork in one place, with lazy loading for bigger libraries.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant={activeTab === 'bookmarked' ? 'primary' : 'secondary'}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs uppercase"
              onClick={() => setActiveTab('bookmarked')}
            >
              Bookmarked
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${activeTab === 'bookmarked' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {bookmarkedCount}
              </span>
            </Button>
            <Button
              type="button"
              variant={activeTab === 'liked' ? 'primary' : 'secondary'}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs uppercase"
              onClick={() => setActiveTab('liked')}
            >
              Liked
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${activeTab === 'liked' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {likedCount}
              </span>
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:max-w-3xl">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className={`detail-subcard transition ${activeTab === card.key ? 'border-brand/35 bg-brand/10' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{card.label}</p>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{card.value}</p>
                    <p className="mt-2 text-sm text-slate-400">{card.hint}</p>
                  </div>
                  <div className={`rounded-2xl border p-3 ${activeTab === card.key ? 'border-brand/30 bg-brand/10 text-brand-light' : 'border-slate-700 bg-slate-950/50 text-slate-300'}`}>
                    <Icon size={18} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {activeCollection.error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {activeCollection.error}
        </div>
      ) : null}

      {activeCollection.loading && !activeCollection.items.length ? (
        <div className="panel flex min-h-72 items-center justify-center">
          <LoadingSpinner label={`Loading ${activeTab} posts...`} />
        </div>
      ) : activeCollection.items.length ? (
        <div className="space-y-6">
          <div className="detail-card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-slate-400">
              Showing {activeCollection.items.length} of {activeCollection.pagination.totalItems} {activeTab} posts.
            </p>
            <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1.5 text-sm text-slate-300">
              Page {activeCollection.pagination.page} of {activeCollection.pagination.totalPages}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {activeCollection.items.map((item) => (
              <ContentCard
                key={`${activeTab}-${item._id}`}
                item={item}
                onInteractionComplete={handleInteractionComplete}
              />
            ))}
          </div>

          {activeCollection.pagination.hasNextPage ? (
            <div className="flex justify-center">
              <button
                type="button"
                disabled={activeCollection.loading}
                onClick={() => loadCollection(activeTab, activeCollection.pagination.page + 1, true)}
                className="detail-inline-button px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activeCollection.loading ? 'Loading more...' : 'Load More'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title={EMPTY_STATE[activeTab].title}
          description={EMPTY_STATE[activeTab].description}
        />
      )}
    </div>
  );
}