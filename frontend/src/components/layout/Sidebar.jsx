import { PenSquare, UserCircle2, House, BookOpen, Image, Bell, Shield, Bookmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { getCurrentUser, logout, subscribeToCurrentUserChange } from '../../services/authService';
import { getRoutePrefetchProps } from '../../services/routePrefetch';

const APP_NAME = 'The Index';
const APP_SLOGAN = 'Share Your Stories. Showcase Your Art.';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');
  const [user, setUser] = useState(() => getCurrentUser());
  const isAuthenticated = !!token;

  useEffect(() => subscribeToCurrentUserChange(setUser), []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = (event, link) => {
    const isModifiedClick = event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;

    if (isModifiedClick || event.button !== 0) {
      return;
    }

    if (link.feedRefreshKey && location.pathname === link.to) {
      event.preventDefault();
      navigate(link.to, {
        replace: true,
        state: {
          feedTab: link.feedRefreshKey,
          feedRefreshKey: Date.now()
        }
      });
    }
  };

  const links = [
    { to: '/home', label: 'Home', icon: House, feedRefreshKey: 'home' },
    { to: '/stories', label: 'Stories', icon: BookOpen, feedRefreshKey: 'stories' },
    { to: '/artworks', label: 'Artworks', icon: Image, feedRefreshKey: 'artworks' },
    { to: '/notifications', label: 'Notifications', icon: Bell, protected: true },
    { to: '/create-story', label: 'Create Story', icon: PenSquare, protected: true },
    { to: '/create-artwork', label: 'Create Artwork', icon: PenSquare, protected: true },
    { to: '/saved', label: 'Saved', icon: Bookmark, protected: true },
    { to: '/profile', label: 'My Profile', icon: UserCircle2, protected: true },
    { to: '/admin', label: 'Admin', icon: Shield, protected: true, adminOnly: true },
  ].filter((link) => {
    if (link.protected && !isAuthenticated) return false;
    if (link.adminOnly && user?.role !== 'admin') return false;
    return true;
  });

  return (
    <aside className="panel sticky top-6 hidden h-[calc(100vh-3rem)] w-64 overflow-hidden xl:flex 2xl:w-72">
      <div className="flex h-full min-h-0 w-full flex-col p-5 2xl:p-6">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1 sidebar-scroll">
          <div>
            <p className="text-2xl font-bold text-white">{APP_NAME}</p>
            <p className="mt-2 text-sm text-slate-400">{APP_SLOGAN}</p>
          </div>

          <nav className="space-y-2">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  {...getRoutePrefetchProps(link.to)}
                  onClick={(event) => handleNavClick(event, link)}
                  className={({ isActive }) =>
                    `sidebar-link flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                      isActive ? 'sidebar-link-active' : ''
                    }`
                  }
                >
                  <Icon size={18} />
                  <span>{link.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {user ? (
            <div className="panel-soft p-4">
              <div className="flex items-center gap-3">
                {user.avatar ? (
                  <img 
                    src={`${API_URL}${user.avatar}`} 
                    alt={user.username}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="user-avatar-fallback h-10 w-10 text-sm">
                    {user.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{user.username}</p>
                  <p className="truncate text-sm text-slate-400">@{user.username}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel-soft p-4 text-sm text-slate-400">
              Login to post your original content.
            </div>
          )}
        </div>

        <div className="shrink-0 pt-4">
          {isAuthenticated ? (
            <Button variant="secondary" className="w-full" onClick={handleLogout}>
              Logout
            </Button>
          ) : (
            <NavLink to="/login" className="block w-full">
              <Button className="w-full">Login</Button>
            </NavLink>
          )}
        </div>
      </div>
    </aside>
  );
}
