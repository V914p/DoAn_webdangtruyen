const CREATOR_PRESENTATION_REFRESH_EVENT = 'creator-presentation-refresh';

export function emitCreatorPresentationRefresh(user) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(CREATOR_PRESENTATION_REFRESH_EVENT, {
    detail: {
      user
    }
  }));
}

export function subscribeToCreatorPresentationRefresh(callback) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event) => {
    callback(event.detail?.user || null);
  };

  window.addEventListener(CREATOR_PRESENTATION_REFRESH_EVENT, handler);

  return () => {
    window.removeEventListener(CREATOR_PRESENTATION_REFRESH_EVENT, handler);
  };
}