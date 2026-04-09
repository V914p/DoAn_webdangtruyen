import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';

export function VirtualizedFeedList({
  items,
  renderItem,
  estimateSize = 520,
  overscan = 4,
  hasMore = false,
  isLoadingMore = false,
  loadMoreRef,
  loadingMoreLabel = 'Loading more...',
  sentinelHeight = 72,
  className = 'feed-stream',
  emptySentinelClassName = 'h-4 w-full'
}) {
  const containerRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const totalCount = items.length + (hasMore || isLoadingMore ? 1 : 0);

  useEffect(() => {
    const updateScrollMargin = () => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      setScrollMargin(rect.top + window.scrollY);
    };

    updateScrollMargin();
    window.addEventListener('resize', updateScrollMargin);

    return () => {
      window.removeEventListener('resize', updateScrollMargin);
    };
  }, [items.length]);

  const virtualizer = useWindowVirtualizer({
    count: totalCount,
    estimateSize: () => estimateSize,
    overscan,
    scrollMargin,
    gap: 0
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0
    ? Math.max(0, virtualItems[0].start - scrollMargin)
    : 0;
  const paddingBottom = virtualItems.length > 0
    ? Math.max(0, totalSize - virtualItems[virtualItems.length - 1].end)
    : 0;

  const loadingRow = useMemo(() => {
    if (!hasMore && !isLoadingMore) {
      return null;
    }

    return (
      <div className="feed-virtual-sentinel" ref={loadMoreRef}>
        {isLoadingMore ? loadingMoreLabel : <div className={emptySentinelClassName} aria-hidden="true" />}
      </div>
    );
  }, [emptySentinelClassName, hasMore, isLoadingMore, loadMoreRef, loadingMoreLabel]);

  return (
    <div ref={containerRef} className={className}>
      <div
        className="feed-virtual-shell"
        style={{
          paddingTop: `${paddingTop}px`,
          paddingBottom: `${paddingBottom}px`
        }}
      >
        {virtualItems.map((virtualRow) => {
          const isLoaderRow = virtualRow.index >= items.length;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={isLoaderRow ? undefined : virtualizer.measureElement}
              className={`feed-virtual-row ${isLoaderRow ? 'feed-virtual-row-sentinel' : ''}`}
              style={isLoaderRow ? { minHeight: `${sentinelHeight}px` } : undefined}
            >
              {isLoaderRow ? loadingRow : renderItem(items[virtualRow.index], virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}