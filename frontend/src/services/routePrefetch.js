export const routeModuleLoaders = {
  splash: () => import('../pages/SplashScreen'),
  login: () => import('../pages/LoginPage'),
  register: () => import('../pages/RegisterPage'),
  home: () => import('../pages/HomePage'),
  stories: () => import('../pages/StoriesPage'),
  artworks: () => import('../pages/ArtworksPage'),
  saved: () => import('../pages/SavedPage'),
  search: () => import('../pages/SearchPage'),
  notifications: () => import('../pages/NotificationPage'),
  postUnavailable: () => import('../pages/RemovedContentPage'),
  createStory: () => import('../pages/CreateStoryPage'),
  createArtwork: () => import('../pages/CreateArtworkPage'),
  story: () => import('../pages/StoryPage'),
  artwork: () => import('../pages/ArtworkPage'),
  profile: () => import('../pages/ProfilePage'),
  admin: () => import('../pages/AdminPage')
};

const routeToModule = {
  '/splash': 'splash',
  '/login': 'login',
  '/register': 'register',
  '/home': 'home',
  '/stories': 'stories',
  '/artworks': 'artworks',
  '/saved': 'saved',
  '/search': 'search',
  '/notifications': 'notifications',
  '/post-unavailable': 'postUnavailable',
  '/create-story': 'createStory',
  '/create-artwork': 'createArtwork',
  '/profile': 'profile',
  '/admin': 'admin'
};

const prefetchedModules = new Set();
const MIN_PREFETCH_DOWNLINK_MBPS = 1.5;

function getConnection() {
  if (typeof navigator === 'undefined') {
    return null;
  }

  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

function hasGoodPrefetchNetwork() {
  const connection = getConnection();

  if (!connection) {
    return true;
  }

  if (connection.saveData) {
    return false;
  }

  if (typeof connection.effectiveType === 'string') {
    const normalizedType = connection.effectiveType.toLowerCase();
    if (normalizedType === 'slow-2g' || normalizedType === '2g' || normalizedType === '3g') {
      return false;
    }
  }

  if (typeof connection.downlink === 'number' && connection.downlink > 0 && connection.downlink < MIN_PREFETCH_DOWNLINK_MBPS) {
    return false;
  }

  return true;
}

function isDocumentReadyForIdlePrefetch() {
  if (typeof document === 'undefined') {
    return true;
  }

  return document.visibilityState !== 'hidden';
}

function normalizeRoutePath(path) {
  if (!path) {
    return '';
  }

  const [pathname] = String(path).split('?');

  if (pathname.startsWith('/story/') && pathname.endsWith('/edit')) {
    return '/create-story';
  }

  if (pathname.startsWith('/artwork/') && pathname.endsWith('/edit')) {
    return '/create-artwork';
  }

  if (pathname.startsWith('/profile/')) {
    return '/profile';
  }

  if (pathname.startsWith('/story/')) {
    return '/story';
  }

  if (pathname.startsWith('/artwork/')) {
    return '/artwork';
  }

  return pathname;
}

export function prefetchRouteModule(path) {
  if (!hasGoodPrefetchNetwork()) {
    return Promise.resolve();
  }

  const normalizedPath = normalizeRoutePath(path);
  const moduleKey = routeToModule[normalizedPath];

  if (!moduleKey || prefetchedModules.has(moduleKey)) {
    return Promise.resolve();
  }

  const loader = routeModuleLoaders[moduleKey];
  if (!loader) {
    return Promise.resolve();
  }

  prefetchedModules.add(moduleKey);

  return loader().catch((error) => {
    prefetchedModules.delete(moduleKey);
    throw error;
  });
}

export function getRoutePrefetchProps(path) {
  const runPrefetch = () => {
    void prefetchRouteModule(path);
  };

  return {
    onMouseEnter: runPrefetch,
    onFocus: runPrefetch,
    onTouchStart: runPrefetch
  };
}

export function scheduleRoutePrefetch(paths = []) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length || typeof window === 'undefined') {
    return () => {};
  }

  const runPrefetch = () => {
    if (!hasGoodPrefetchNetwork() || !isDocumentReadyForIdlePrefetch()) {
      return;
    }

    uniquePaths.forEach((path) => {
      void prefetchRouteModule(path);
    });
  };

  if (typeof window.requestIdleCallback === 'function') {
    const callbackId = window.requestIdleCallback(runPrefetch, { timeout: 1500 });
    return () => window.cancelIdleCallback?.(callbackId);
  }

  const timeoutId = window.setTimeout(runPrefetch, 300);
  return () => window.clearTimeout(timeoutId);
}