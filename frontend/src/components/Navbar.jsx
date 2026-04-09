import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAuthenticated, getCurrentUser, logout } from '../services/authService';
import { getRoutePrefetchProps } from '../services/routePrefetch';
import { ThemeToggler } from './ThemeToggler';

export default function Navbar() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const authenticated = isAuthenticated();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/splash');
  };

  return (
    <nav className="bg-blue-600 dark:bg-gray-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/home" className="text-xl font-bold">
              Community Platform
            </Link>
            
            {authenticated && (
              <>
                <Link to="/home" className="hover:text-blue-200 dark:hover:text-blue-300">
                  Home
                </Link>
                <Link to="/stories" className="hover:text-blue-200 dark:hover:text-blue-300">
                  Stories
                </Link>
                <Link to="/artworks" className="hover:text-blue-200 dark:hover:text-blue-300">
                  Artworks
                </Link>
                <Link to="/search" {...getRoutePrefetchProps('/search')} className="hover:text-blue-200 dark:hover:text-blue-300">
                  Search
                </Link>
                <div 
                  className="relative"
                  onMouseEnter={() => setIsCreateOpen(true)}
                  onMouseLeave={() => setIsCreateOpen(false)}
                >
                  <button className="hover:text-blue-200 dark:hover:text-blue-300 py-2">
                    Create ▾
                  </button>
                  {isCreateOpen && (
                    <div className="absolute left-0 top-full bg-white dark:bg-gray-700 text-gray-800 dark:text-white rounded-md shadow-lg py-2 w-48 z-50">
                      <Link 
                        to="/create/story" 
                        className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600"
                        onClick={() => setIsCreateOpen(false)}
                      >
                        Create Story
                      </Link>
                      <Link 
                        to="/create/artwork" 
                        className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600"
                        onClick={() => setIsCreateOpen(false)}
                      >
                        Create Artwork
                      </Link>
                    </div>
                  )}
                </div>
                <Link to={`/profile/${user?.id}`} {...getRoutePrefetchProps('/profile')} className="hover:text-blue-200 dark:hover:text-blue-300">
                  Profile
                </Link>
                {user?.role === 'admin' && (
                  <Link to="/admin" {...getRoutePrefetchProps('/admin')} className="hover:text-blue-200 dark:hover:text-blue-300">
                    Admin
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggler />
            {authenticated ? (
              <>
                <span className="text-sm">Hello, {user?.username}</span>
                <button
                  onClick={handleLogout}
                  className="bg-blue-700 dark:bg-gray-700 hover:bg-blue-800 dark:hover:bg-gray-600 px-4 py-2 rounded"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-blue-200 dark:hover:text-blue-300">
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-blue-700 dark:bg-gray-700 hover:bg-blue-800 dark:hover:bg-gray-600 px-4 py-2 rounded"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
