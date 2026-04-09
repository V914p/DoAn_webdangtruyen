import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRoutePrefetchProps } from '../services/routePrefetch';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const FEED_TAB_SLIDE_MS = 220;

const FEED_TABS = [
  { key: 'home', label: 'For you', to: '/home' },
  { key: 'stories', label: 'Stories', to: '/stories' },
  { key: 'artworks', label: 'Artwork', to: '/artworks' }
];

function getAvatarUrl(avatar) {
  if (!avatar) {
    return '';
  }

  if (avatar.startsWith('http') || avatar.startsWith('data:image')) {
    return avatar;
  }

  return `${API_URL}${avatar}`;
}

export function FeedTabs({ activeTab }) {
  const navigate = useNavigate();
  const [visualActiveTab, setVisualActiveTab] = useState(activeTab);
  const navigationTimeoutRef = useRef(null);

  useEffect(() => {
    setVisualActiveTab(activeTab);
  }, [activeTab]);

  useEffect(
    () => () => {
      if (navigationTimeoutRef.current) {
        window.clearTimeout(navigationTimeoutRef.current);
      }
    },
    []
  );

  const handleTabClick = (event, tab) => {
    const isModifiedClick = event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;

    if (isModifiedClick || event.button !== 0) {
      return;
    }

    if (tab.key === activeTab) {
      event.preventDefault();
      navigate(tab.to, {
        replace: true,
        state: {
          feedTab: tab.key,
          feedRefreshKey: Date.now()
        }
      });
      return;
    }

    event.preventDefault();

    if (navigationTimeoutRef.current) {
      window.clearTimeout(navigationTimeoutRef.current);
    }

    setVisualActiveTab(tab.key);
    navigationTimeoutRef.current = window.setTimeout(() => {
      navigate(tab.to);
    }, FEED_TAB_SLIDE_MS);
  };

  const activeIndex = Math.max(
    FEED_TABS.findIndex((tab) => tab.key === visualActiveTab),
    0
  );

  return (
    <nav
      className="feed-tabs"
      aria-label="Feed navigation"
      style={{
        '--feed-tab-count': FEED_TABS.length,
        '--feed-tab-index': activeIndex
      }}
    >
      <span className="feed-tab-slider" aria-hidden="true" />
      {FEED_TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          {...getRoutePrefetchProps(tab.to)}
          onClick={(event) => handleTabClick(event, tab)}
          aria-current={activeTab === tab.key ? 'page' : undefined}
          className={`feed-tab ${visualActiveTab === tab.key ? 'feed-tab-active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function FeedComposer({ user, prompt, hint, primaryAction, secondaryAction }) {
  const avatarUrl = getAvatarUrl(user?.avatar);
  const initials = user?.username?.[0]?.toUpperCase() || '?';

  return (
    <section className="feed-composer">
      <div className="flex gap-3">
        <div className="shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={user?.username || 'Guest'} className="feed-avatar" />
          ) : (
            <div className="feed-avatar-fallback">{initials}</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="feed-composer-prompt">{prompt}</div>
          <p className="feed-composer-hint">{hint}</p>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {secondaryAction ? (
                <Link
                  to={secondaryAction.to}
                  {...getRoutePrefetchProps(secondaryAction.to)}
                  className="feed-cta-secondary"
                >
                  {secondaryAction.label}
                </Link>
              ) : null}

              {primaryAction ? (
                <Link
                  to={primaryAction.to}
                  {...getRoutePrefetchProps(primaryAction.to)}
                  className="feed-cta-primary"
                >
                  {primaryAction.label}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}