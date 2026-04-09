import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { isAuthenticated } from './services/authService';
import { connectNotificationSocket, disconnectNotificationSocket } from './services/notificationService';
import { routeModuleLoaders, scheduleRoutePrefetch } from './services/routePrefetch';
import { SmoothCursor } from './components/SmoothCursor';
import { NotificationToastLayer } from './components/notifications/NotificationToastLayer';
import { AppLayout } from './components/layout/AppLayout';

const SplashScreen = lazy(routeModuleLoaders.splash);
const LoginPage = lazy(routeModuleLoaders.login);
const RegisterPage = lazy(routeModuleLoaders.register);
const HomePage = lazy(routeModuleLoaders.home);
const StoriesPage = lazy(routeModuleLoaders.stories);
const ArtworksPage = lazy(routeModuleLoaders.artworks);
const SearchPage = lazy(routeModuleLoaders.search);
const CreateStoryPage = lazy(routeModuleLoaders.createStory);
const CreateArtworkPage = lazy(routeModuleLoaders.createArtwork);
const StoryPage = lazy(routeModuleLoaders.story);
const ArtworkPage = lazy(routeModuleLoaders.artwork);
const ProfilePage = lazy(routeModuleLoaders.profile);
const NotificationPage = lazy(routeModuleLoaders.notifications);
const RemovedContentPage = lazy(routeModuleLoaders.postUnavailable);
const AdminPage = lazy(routeModuleLoaders.admin);
const SavedPage = lazy(routeModuleLoaders.saved);

function RouteFallback() {
  return (
    <div className="panel flex min-h-72 items-center justify-center">
      <LoadingSpinner label="Loading page..." />
    </div>
  );
}

// Protected Route component
function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  return user?.role === 'admin' ? children : <Navigate to="/home" replace />;
}

function App() {
  useEffect(() => {
    if (isAuthenticated()) {
      connectNotificationSocket();
    }

    return () => {
      disconnectNotificationSocket();
    };
  }, []);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const likelyRoutes = ['/search'];

    if (isAuthenticated()) {
      likelyRoutes.push('/profile');
    }

    if (user?.role === 'admin') {
      likelyRoutes.push('/admin');
    }

    return scheduleRoutePrefetch(likelyRoutes);
  }, []);

  return (
    <Router>
      <SmoothCursor />
      <NotificationToastLayer />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Splash Screen */}
          <Route path="/splash" element={<SplashScreen />} />
          
          {/* Redirect root based on auth status */}
          <Route path="/" element={isAuthenticated() ? <Navigate to="/home" replace /> : <Navigate to="/splash" replace />} />

          {/* Auth pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected pages with AppLayout */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/artworks" element={<ArtworksPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/notifications" element={<NotificationPage />} />
            <Route path="/post-unavailable" element={<RemovedContentPage />} />
            <Route path="/create-story" element={<CreateStoryPage />} />
            <Route path="/create-artwork" element={<CreateArtworkPage />} />
            <Route path="/story/:id" element={<StoryPage />} />
            <Route path="/story/:id/edit" element={<CreateStoryPage />} />
            <Route path="/artwork/:id" element={<ArtworkPage />} />
            <Route path="/artwork/:id/edit" element={<CreateArtworkPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
