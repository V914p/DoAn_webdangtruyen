import { Bell, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ThemeToggler } from '../ThemeToggler';
import { getCurrentUser, getToken, subscribeToCurrentUserChange } from '../../services/authService';
import { subscribeToNotificationChanges } from '../../services/notificationService';
import { getRoutePrefetchProps } from '../../services/routePrefetch';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const titles = {
  '/': 'Home Feed',
  '/home': 'Home Feed',
  '/login': 'Login',
  '/register': 'Register',
  '/profile': 'My Profile',
  '/create-story': 'Create Story',
  '/create-artwork': 'Create Artwork',
  '/stories': 'Stories',
  '/artworks': 'Artworks',
  '/search': 'Search',
  '/notifications': 'Notifications',
  '/admin': 'Admin Review',
};

export function Topbar() {
  const location = useLocation();
  const [user, setUser] = useState(() => getCurrentUser());
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => subscribeToCurrentUserChange(setUser), []);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const response = await fetch(`${API_URL}/api/notifications`, {
          headers: {
            Authorization: `Bearer ${getToken()}`
          }
        });
        const data = await response.json();
        if (data.success) {
          setUnreadCount((data.data || []).filter((item) => !item.read).length);
        }
      } catch (error) {
        console.error('Failed to load notification count:', error);
      }
    };

    fetchNotifications();
  }, [user]);

  useEffect(() => {
    return subscribeToNotificationChanges((payload) => {
      if (payload?.type === 'created') {
        setUnreadCount((prev) => prev + 1);
      }

      if (payload?.type === 'updated' && payload.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }

      if (payload?.type === 'deleted' && !payload.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    });
  }, []);
  
  const title = location.pathname.startsWith('/story/')
    ? (location.pathname.endsWith('/edit') ? 'Edit Story' : 'Story Detail')
    : location.pathname.startsWith('/artwork/')
      ? (location.pathname.endsWith('/edit') ? 'Edit Artwork' : 'Artwork Detail')
      : titles[location.pathname] || 'The Index';

  return (
    <header className="panel mb-6 flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-brand-light">The Index</p>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
      </div>

      <div className="hidden flex-1 items-center justify-center lg:flex">
        <Link to="/search" {...getRoutePrefetchProps('/search')} className="surface-search flex w-full max-w-md items-center gap-3 px-4 py-3">
          <Search size={16} />
          <span className="text-sm">Search creators, original stories, and art...</span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <Link to="/notifications" className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 text-slate-300 transition hover:bg-slate-800">
            <Bell size={18} />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </Link>
        ) : null}
        <ThemeToggler />
        {user ? (
          <Link to="/profile" {...getRoutePrefetchProps('/profile')} className="flex items-center gap-3 rounded-2xl border border-slate-700 px-3 py-2">
            {user.avatar ? (
              <img 
                src={`${API_URL}${user.avatar}`} 
                alt={user.username}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="user-avatar-fallback h-9 w-9 text-sm">
                {user.username?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="hidden text-left md:block">
              <p className="text-sm font-medium text-white">{user.username}</p>
              <p className="text-xs text-slate-400">@{user.username}</p>
            </div>
          </Link>
        ) : null}
      </div>
    </header>
  );
}
