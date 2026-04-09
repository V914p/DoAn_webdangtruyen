import { useEffect, useRef, useState } from 'react';

const OBSERVER_ROOT_MARGIN = '320px 0px';

export function LazyImage({
  src,
  alt,
  className = '',
  wrapperClassName = '',
  placeholderClassName = '',
  fallbackSrc = '',
  loading = 'lazy',
  decoding = 'async',
  sizes,
  onError,
  onLoad,
  ...props
}) {
  const containerRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(loading === 'eager');
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setShouldLoad(loading === 'eager');
    setHasLoaded(false);
  }, [src, loading]);

  useEffect(() => {
    if (loading === 'eager') {
      setShouldLoad(true);
      return undefined;
    }

    const node = containerRef.current;
    if (!node) {
      return undefined;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: OBSERVER_ROOT_MARGIN }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [loading, src]);

  const handleError = (event) => {
    if (fallbackSrc && event.currentTarget.dataset.fallbackApplied !== 'true') {
      event.currentTarget.dataset.fallbackApplied = 'true';
      event.currentTarget.src = fallbackSrc;
      return;
    }

    onError?.(event);
  };

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${wrapperClassName}`}>
      {!hasLoaded ? <div className={`absolute inset-0 animate-pulse bg-slate-900/75 ${placeholderClassName}`} /> : null}
      {shouldLoad ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding={decoding}
          sizes={sizes}
          onError={handleError}
          onLoad={(event) => {
            setHasLoaded(true);
            onLoad?.(event);
          }}
          className={`${className} transition-opacity duration-300 ${hasLoaded ? 'opacity-100' : 'opacity-0'}`}
          {...props}
        />
      ) : null}
    </div>
  );
}