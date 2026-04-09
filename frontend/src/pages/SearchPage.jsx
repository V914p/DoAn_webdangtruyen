import { Hash, Search, Star, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HashtagCharts from '../components/HashtagCharts';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/common/EmptyState';
import { VirtualizedFeedList } from '../components/feed/VirtualizedFeedList';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useRightRail } from '../contexts/RightRailContext';
import { usePagedContentSearch } from '../hooks/usePagedContentSearch';
import { fetchJsonWithCache, FRONTEND_CACHE_NAMESPACES } from '../services/frontendCache';
import { formatTag, normalizeTag, normalizeTagList, parseStrictHashtagInput } from '../utils/hashtags';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const TAG_DIRECTORY_LIMIT = 12;
const CREATOR_SEARCH_LIMIT = 12;
const SEARCH_VIEW_ITEMS = [
  { value: 'content', label: 'All Content' },
  { value: 'tags', label: 'Hashtag' },
  { value: 'creators', label: 'Creator' }
];

function TagStatCard({ label, value, hint }) {
  return (
    <div className="detail-subcard px-4 py-4">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{hint}</p>
    </div>
  );
}

function SearchChip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${active ? 'border-white/10 bg-white text-slate-950 shadow-sm' : 'border-slate-700 bg-slate-900/65 text-slate-300 hover:border-slate-500 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function SearchViewTab({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative z-10 min-w-0 flex-1 rounded-[18px] px-4 py-3 text-center text-sm font-medium transition-colors duration-300 ${active ? 'text-slate-950' : 'text-slate-300 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function getCreatorAvatarUrl(avatar) {
  if (!avatar) return '';
  return avatar.startsWith('http') ? avatar : `${API_URL}${avatar}`;
}

function formatMatchQualityLabel(value) {
  if (value === 'exact') return 'Closest match';
  if (value === 'strong') return 'Strong match';
  return 'Fuzzy match';
}

export default function SearchPage() {
  const {
    favoriteTags,
    favoriteTagBusy,
    handleFavoriteToggle
  } = useRightRail();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const viewMode = ['content', 'creators', 'tags'].includes(requestedView) ? requestedView : 'content';
  const initialTagQuery = normalizeTag(searchParams.get('tag') || '');
  const initialCreatorQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState('');
  const [tags, setTags] = useState('');
  const [searched, setSearched] = useState(false);
  const [contentFormError, setContentFormError] = useState('');
  const [submittedContentSearch, setSubmittedContentSearch] = useState({
    query: '',
    tags: []
  });

  const [creatorQuery, setCreatorQuery] = useState(initialCreatorQuery);
  const [creatorResults, setCreatorResults] = useState([]);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorError, setCreatorError] = useState('');
  const [creatorSearched, setCreatorSearched] = useState(false);
  const [creatorPagination, setCreatorPagination] = useState({
    page: 1,
    limit: CREATOR_SEARCH_LIMIT,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false
  });

  const [tagQuery, setTagQuery] = useState(initialTagQuery);
  const [tagDirectory, setTagDirectory] = useState([]);
  const [tagSummary, setTagSummary] = useState({
    totalTags: 0,
    totalTagAssignments: 0,
    totalCreatorsUsingTags: 0
  });
  const [tagLoading, setTagLoading] = useState(false);
  const [tagError, setTagError] = useState('');
  const [tagPagination, setTagPagination] = useState({
    page: 1,
    limit: TAG_DIRECTORY_LIMIT,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false
  });
  const contentSearchParams = useMemo(() => ({
    q: submittedContentSearch.query || undefined,
    tags: submittedContentSearch.tags.length > 0 ? submittedContentSearch.tags : undefined
  }), [submittedContentSearch]);
  const {
    items: results,
    loading: contentLoading,
    error: contentError,
    hasMore: contentHasMore,
    page: contentPage,
    isLoadingMore,
    loadMoreRef,
    reload: reloadContentSearch
  } = usePagedContentSearch({
    enabled: viewMode === 'content' && searched,
    params: contentSearchParams
  });

  async function loadTagDirectory(nextPage = 1, nextQuery = tagQuery) {
    setTagLoading(true);
    setTagError('');

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(TAG_DIRECTORY_LIMIT)
      });

      if (nextQuery) {
        params.set('q', nextQuery);
      }

      const data = await fetchJsonWithCache({
        namespace: FRONTEND_CACHE_NAMESPACES.TAG_DIRECTORY,
        key: `page=${nextPage}&q=${encodeURIComponent(nextQuery || '')}`,
        url: `${API_URL}/api/content/tags?${params}`,
        ttlMs: 90 * 1000
      });

      if (!data.success) {
        setTagError(data.error?.message || 'Failed to load hashtag directory');
        return;
      }

      setTagDirectory(data.data || []);
      setTagSummary(data.summary || {
        totalTags: 0,
        totalTagAssignments: 0,
        totalCreatorsUsingTags: 0
      });
      setTagPagination(data.pagination || {
        page: nextPage,
        limit: TAG_DIRECTORY_LIMIT,
        totalItems: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false
      });
    } catch (error) {
      console.error('Tag directory error:', error);
      setTagError('Failed to load hashtag directory');
    } finally {
      setTagLoading(false);
    }
  }

  async function loadCreators(nextPage = 1, nextQuery = creatorQuery) {
    setCreatorLoading(true);
    setCreatorError('');
    setCreatorSearched(true);

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(CREATOR_SEARCH_LIMIT)
      });

      if (nextQuery.trim()) {
        params.set('query', nextQuery.trim());
      }

      const data = await fetchJsonWithCache({
        namespace: FRONTEND_CACHE_NAMESPACES.CREATOR_SEARCH,
        key: `page=${nextPage}&query=${encodeURIComponent(nextQuery.trim())}`,
        url: `${API_URL}/api/users/search?${params}`,
        ttlMs: 60 * 1000
      });

      if (!data.success) {
        setCreatorError(data.error?.message || 'Failed to load creators');
        return;
      }

      setCreatorResults(data.data || []);
      setCreatorPagination(data.pagination || {
        page: nextPage,
        limit: CREATOR_SEARCH_LIMIT,
        totalItems: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false
      });
    } catch (error) {
      console.error('Creator search error:', error);
      setCreatorError('Failed to load creators');
    } finally {
      setCreatorLoading(false);
    }
  }

  useEffect(() => {
    loadTagDirectory(1, initialTagQuery);
    if (viewMode === 'creators') {
      loadCreators(1, initialCreatorQuery);
    }
  }, []);

  useEffect(() => {
    const incomingTagQuery = normalizeTag(searchParams.get('tag') || '');
    const incomingCreatorQuery = searchParams.get('q') || '';

    if (incomingTagQuery !== tagQuery) {
      setTagQuery(incomingTagQuery);
      loadTagDirectory(1, incomingTagQuery);
    }

    if (viewMode === 'creators' && incomingCreatorQuery !== creatorQuery) {
      setCreatorQuery(incomingCreatorQuery);
      loadCreators(1, incomingCreatorQuery);
    }
  }, [searchParams, viewMode]);

  const handleContentSearch = async (event) => {
    event.preventDefault();

    const parsedTags = parseStrictHashtagInput(tags);

    if (parsedTags.error) {
      setContentFormError(parsedTags.error);
      return;
    }

    setContentFormError('');
    setSearched(true);

    const nextSearch = {
      query: query.trim(),
      tags: parsedTags.tags || []
    };
    const isSameSearch = submittedContentSearch.query === nextSearch.query
      && submittedContentSearch.tags.join('|') === nextSearch.tags.join('|');

    setSubmittedContentSearch(nextSearch);

    if (isSameSearch) {
      reloadContentSearch();
    }
  };

  const handleCreatorSearch = async (event) => {
    event.preventDefault();

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', 'creators');
    if (creatorQuery.trim()) {
      nextParams.set('q', creatorQuery.trim());
    } else {
      nextParams.delete('q');
    }
    setSearchParams(nextParams);
    await loadCreators(1, creatorQuery);
  };

  const handleTagSearch = async (event) => {
    event.preventDefault();

    const normalized = normalizeTag(tagQuery);
    setTagQuery(normalized);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', 'tags');
    if (normalized) {
      nextParams.set('tag', normalized);
    } else {
      nextParams.delete('tag');
    }
    nextParams.delete('q');
    setSearchParams(nextParams);
    await loadTagDirectory(1, normalized);
  };

  const switchView = (nextView) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', nextView);
    if (nextView !== 'tags') {
      nextParams.delete('tag');
    }
    setSearchParams(nextParams);
    if (nextView === 'creators') {
      loadCreators(1, creatorQuery);
    }
  };

  const activeViewMeta =
    viewMode === 'content'
      ? {
          label: 'Content search',
          description: 'Find stories and artworks by title, description, or hashtags.',
          metric: searched
            ? `${results.length} results loaded${contentHasMore ? ' · scroll to load more' : ''}`
            : 'Ready for a new lookup'
        }
      : viewMode === 'creators'
        ? {
            label: 'Creator search',
            description: 'Look up creators with accent-insensitive fuzzy matching.',
            metric: creatorSearched
              ? `${creatorPagination.totalItems || creatorResults.length} creators matched`
              : 'Search creators by name'
          }
        : {
            label: 'Tag explorer',
            description: 'Browse hashtag usage and creator reach in one place.',
            metric: `${tagPagination.totalItems || tagDirectory.length || 0} tags in directory`
          };
  const currentTagPostVolume = tagDirectory.reduce((total, tag) => total + (tag.contentCount || 0), 0);
  const currentTagCreatorReach = tagDirectory.reduce((total, tag) => total + (tag.creatorCount || 0), 0);
  const strongestTag = tagDirectory.reduce((best, tag) => {
    if (!best || (tag.contentCount || 0) > (best.contentCount || 0)) {
      return tag;
    }
    return best;
  }, null);
  const freshestTag = tagDirectory.reduce((best, tag) => {
    if (!best || new Date(tag.latestUsedAt).getTime() > new Date(best.latestUsedAt).getTime()) {
      return tag;
    }
    return best;
  }, null);
  const topTagsByPosts = useMemo(
    () => [...tagDirectory].sort((left, right) => (right.contentCount || 0) - (left.contentCount || 0)).slice(0, 8),
    [tagDirectory]
  );
  const tagPostChartPoints = useMemo(
    () => topTagsByPosts.map((tag) => ({ primary: formatTag(tag.name), secondary: tag.contentCount || 0 })),
    [topTagsByPosts]
  );
  const activeViewIndex = Math.max(SEARCH_VIEW_ITEMS.findIndex((item) => item.value === viewMode), 0);
  const submittedQueryLabel = submittedContentSearch.query;
  const submittedTagLabel = submittedContentSearch.tags.map((tag) => formatTag(tag)).join(', ');

  return (
    <div className="space-y-6">
      <section className="detail-card p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="detail-eyebrow">Discovery tools</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Search</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">{activeViewMeta.description}</p>
            </div>

            <div className="w-full max-w-2xl">
              <div className="relative overflow-hidden rounded-[24px] border border-slate-700 bg-slate-950/70 p-1 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-1 left-1 rounded-[18px] bg-white/12 blur-xl transition-transform duration-300 ease-out"
                  style={{
                    width: `calc((100% - 0.5rem) / ${SEARCH_VIEW_ITEMS.length})`,
                    transform: `translateX(${activeViewIndex * 100}%)`
                  }}
                />
                <div
                  aria-hidden="true"
                  className="absolute bottom-1 left-1 top-1 rounded-[18px] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(226,232,240,0.92))] shadow-[0_14px_30px_rgba(15,23,42,0.26)] transition-transform duration-300 ease-out"
                  style={{
                    width: `calc((100% - 0.5rem) / ${SEARCH_VIEW_ITEMS.length})`,
                    transform: `translateX(${activeViewIndex * 100}%)`
                  }}
                />
                <div className="relative flex items-center">
                  {SEARCH_VIEW_ITEMS.map((item) => (
                    <SearchViewTab
                      key={item.value}
                      active={viewMode === item.value}
                      onClick={() => switchView(item.value)}
                    >
                      {item.label}
                    </SearchViewTab>
                  ))}
                </div>
              </div>
              <p className="mt-3 px-1 text-sm text-slate-500">{activeViewMeta.metric}</p>
            </div>
          </div>
        </div>
      </section>

      {viewMode === 'content' ? (
        <>
          <section className="detail-card p-5">
            <form onSubmit={handleContentSearch} className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                <label className="surface-search flex items-center gap-3 px-4 py-3">
                  <Search size={16} />
                  <input
                    className="w-full bg-transparent text-sm text-white outline-none"
                    placeholder="Search by title or description"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="surface-search flex items-center gap-3 px-4 py-3">
                  <Hash size={16} />
                  <input
                    className="w-full bg-transparent text-sm text-white outline-none"
                    placeholder="digitalart anime or #digitalart #anime"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={contentLoading} className="editor-action-primary px-6 py-3">
                  {contentLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              <p className="text-sm text-slate-400">Hashtags accept both plain words and #prefixed tags. Duplicate tags collapse automatically.</p>
              <p className="text-sm text-slate-500">Keyword search also matches Vietnamese titles without accents, for example chao ngay moi.</p>
            </form>
          </section>

          {contentFormError || contentError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {contentFormError || contentError}
            </div>
          ) : null}

          {contentLoading ? (
            <div className="panel flex min-h-72 items-center justify-center">
              <LoadingSpinner label="Searching content..." />
            </div>
          ) : searched ? (
            results.length ? (
              <div className="space-y-6">
                <div className="detail-card flex flex-wrap items-center justify-between gap-3 p-4">
                  <p className="text-sm text-slate-400">
                    Loaded {results.length} results{contentPage > 1 ? ` across ${contentPage} pages` : ''}.
                    {contentHasMore ? ' Keep scrolling to load more.' : ' End of current search results.'}
                  </p>
                  {(submittedQueryLabel || submittedTagLabel) && (
                    <p className="text-sm text-slate-500">
                      {submittedQueryLabel ? `Keyword: ${submittedQueryLabel}` : 'Browsing by tags'}
                      {submittedQueryLabel && submittedTagLabel ? ' · ' : ''}
                      {submittedTagLabel ? `Tags: ${submittedTagLabel}` : ''}
                    </p>
                  )}
                </div>
                <div className="detail-card overflow-hidden p-0">
                  <VirtualizedFeedList
                    items={results}
                    renderItem={(item) => <ContentCard item={item} />}
                    estimateSize={560}
                    hasMore={contentHasMore}
                    isLoadingMore={isLoadingMore}
                    loadMoreRef={loadMoreRef}
                    loadingMoreLabel="Loading more search results..."
                  />
                </div>
              </div>
            ) : (
              <EmptyState title="No matching results" description="Try changing the keywords or tag combination." />
            )
          ) : (
            <div className="detail-empty-state">
              <div className="text-lg font-semibold text-white">Start with a keyword or hashtags</div>
              <p className="max-w-md text-sm text-slate-400">Search by title, description, or a group of hashtags to find matching content.</p>
            </div>
          )}
        </>
      ) : viewMode === 'creators' ? (
        <>
          <section className="detail-card p-5">
            <form onSubmit={handleCreatorSearch} className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <label className="surface-search flex items-center gap-3 px-4 py-3">
                  <Users size={16} />
                  <input
                    className="w-full bg-transparent text-sm text-white outline-none"
                    placeholder="Search creator name, for example hachi yasuo"
                    value={creatorQuery}
                    onChange={(event) => setCreatorQuery(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={creatorLoading} className="editor-action-primary px-6 py-3">
                  {creatorLoading ? 'Searching...' : 'Search Creators'}
                </button>
              </div>

              <p className="text-sm text-slate-400">Creator search is accent-insensitive and fuzzy-ranked, so close spellings can still surface the right profile.</p>
            </form>
          </section>

          {creatorError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {creatorError}
            </div>
          ) : null}

          {creatorLoading ? (
            <div className="panel flex min-h-72 items-center justify-center">
              <LoadingSpinner label="Searching creators..." />
            </div>
          ) : creatorSearched ? (
            creatorResults.length ? (
              <div className="space-y-6">
                <div className="detail-card p-4">
                  <p className="text-sm text-slate-400">
                    Showing {creatorResults.length} creators on page {creatorPagination.page}. Ranking blends match quality, popularity, verified status, and your activity.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {creatorResults.map((creator) => (
                    <article key={creator._id} className="detail-card p-4">
                      <div className="flex items-start gap-4">
                        {creator.avatar ? (
                          <img src={getCreatorAvatarUrl(creator.avatar)} alt={creator.username} className="h-14 w-14 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-lg font-semibold text-white">
                            {creator.username?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-white sm:text-xl">{creator.username}</h3>
                            {creator.isVerified ? (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                                Verified
                              </span>
                            ) : null}
                            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                              {formatMatchQualityLabel(creator.matchQuality)}
                            </span>
                          </div>

                          <p className="mt-2 text-sm leading-6 text-slate-400">{creator.bio || 'No bio yet.'}</p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{creator.approvedContentCount} published posts</span>
                        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{creator.followerCount} followers</span>
                        {creator.isFollowedByCurrentUser ? (
                          <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs text-brand-light">Following</span>
                        ) : null}
                        {creator.hasBeenViewedByCurrentUser ? (
                          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">Seen before</span>
                        ) : null}
                      </div>

                      <div className="mt-5 flex items-center justify-end">
                        <Link to={`/profile/${creator._id}`} className="text-sm font-medium text-brand-light transition hover:text-white">
                          Open Profile →
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={creatorLoading || !creatorPagination.hasPreviousPage}
                    onClick={() => loadCreators(creatorPagination.page - 1, creatorQuery)}
                    className="detail-inline-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-400">
                    Page {creatorPagination.page} of {creatorPagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={creatorLoading || !creatorPagination.hasNextPage}
                    onClick={() => loadCreators(creatorPagination.page + 1, creatorQuery)}
                    className="detail-inline-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState title="No creators matched" description="Try another spelling. The search already tolerates missing accents and small typos." />
            )
          ) : (
            <div className="detail-empty-state">
              <div className="text-lg font-semibold text-white">Search for a creator</div>
              <p className="max-w-md text-sm text-slate-400">Type a creator name to get exact, strong, or fuzzy matches ranked by quality and popularity.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <section className="detail-card p-5">
            <form onSubmit={handleTagSearch} className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <label className="surface-search flex flex-1 items-center gap-3 px-4 py-3">
                <Hash size={16} />
                <input
                  className="w-full bg-transparent text-sm text-white outline-none"
                  placeholder="Search hashtag name, for example newday or #newday"
                  value={tagQuery}
                  onChange={(event) => setTagQuery(event.target.value)}
                />
              </label>
              <button type="submit" disabled={tagLoading} className="editor-action-primary px-6 py-3">
                {tagLoading ? 'Searching...' : 'Search Tags'}
              </button>
            </form>
          </section>

          {tagError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {tagError}
            </div>
          ) : null}

          {tagLoading ? (
            <div className="panel flex min-h-72 items-center justify-center">
              <LoadingSpinner label="Loading hashtag directory..." />
            </div>
          ) : tagDirectory.length ? (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <TagStatCard label="Tags on this page" value={tagDirectory.length} hint="Current slice of the hashtag directory." />
                <TagStatCard label="Post volume" value={currentTagPostVolume} hint="Approved posts covered by the visible tags." />
                <TagStatCard label="Creator reach" value={currentTagCreatorReach} hint="Combined creator usage across visible tags." />
                <TagStatCard
                  label="Strongest tag"
                  value={strongestTag ? formatTag(strongestTag.name) : '-'}
                  hint={strongestTag ? `${strongestTag.contentCount} posts · ${strongestTag.creatorCount} creators` : 'No tag data loaded.'}
                />
              </div>

              <HashtagCharts postData={tagPostChartPoints} />

              <section className="detail-card overflow-hidden p-0">
                <div className="border-b border-slate-800 bg-slate-950/55 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Hashtag dashboard</p>
                      <p className="mt-1 text-sm text-slate-400">A compact numeric view for the “View all” hashtag page.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="rounded-full border border-slate-700 bg-slate-950/45 px-3 py-1.5">Page {tagPagination.page} of {tagPagination.totalPages}</span>
                      {freshestTag ? (
                        <span className="rounded-full border border-slate-700 bg-slate-950/45 px-3 py-1.5">Freshest: {formatTag(freshestTag.name)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="hidden grid-cols-[minmax(0,1.5fr)_110px_110px_170px_auto] gap-3 border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-500 md:grid">
                  <span>Hashtag</span>
                  <span>Posts</span>
                  <span>Creators</span>
                  <span>Last used</span>
                  <span className="text-right">Action</span>
                </div>

                <div>
                  {tagDirectory.map((tag, index) => (
                    <div
                      key={tag.name}
                      className={`grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.5fr)_110px_110px_170px_auto] md:items-center ${
                        index === 0 ? '' : 'border-t border-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-lg font-semibold text-white">{formatTag(tag.name)}</p>
                        <p className="mt-1 text-sm text-slate-400">Hashtag used across approved content.</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 md:hidden">Posts</p>
                        <p className="text-sm font-medium text-white">{tag.contentCount}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 md:hidden">Creators</p>
                        <p className="text-sm font-medium text-white">{tag.creatorCount}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 md:hidden">Last used</p>
                        <p className="text-sm text-slate-300">{new Date(tag.latestUsedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <button
                          type="button"
                          disabled={favoriteTagBusy === normalizeTag(tag.name)}
                          onClick={async () => {
                            const normalizedTag = normalizeTag(tag.name);
                            const result = await handleFavoriteToggle(normalizedTag, favoriteTags.includes(normalizedTag));

                            if (!result.success) {
                              alert(result.error?.message || 'Failed to update favorite hashtag');
                            }
                          }}
                          className={`detail-inline-button inline-flex items-center gap-2 px-4 py-2 text-sm ${favoriteTags.includes(normalizeTag(tag.name)) ? 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:border-amber-300/60 hover:text-amber-100' : ''}`}
                          aria-label={favoriteTags.includes(normalizeTag(tag.name)) ? `Remove ${formatTag(tag.name)} from favorites` : `Save ${formatTag(tag.name)} to favorites`}
                        >
                          <Star size={15} fill={favoriteTags.includes(normalizeTag(tag.name)) ? 'currentColor' : 'none'} />
                          <span>{favoriteTags.includes(normalizeTag(tag.name)) ? 'Saved' : 'Favorite'}</span>
                        </button>
                        <Link to={`/home?tag=${encodeURIComponent(tag.name)}`} className="detail-inline-button px-4 py-2 text-sm">
                          Open feed
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  disabled={tagLoading || !tagPagination.hasPreviousPage}
                  onClick={() => loadTagDirectory(tagPagination.page - 1, tagQuery)}
                  className="detail-inline-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-400">
                  Page {tagPagination.page} of {tagPagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={tagLoading || !tagPagination.hasNextPage}
                  onClick={() => loadTagDirectory(tagPagination.page + 1, tagQuery)}
                  className="detail-inline-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <EmptyState title="No hashtags found" description="Try another hashtag keyword or clear the filter to browse everything." />
          )}
        </>
      )}
    </div>
  );
}