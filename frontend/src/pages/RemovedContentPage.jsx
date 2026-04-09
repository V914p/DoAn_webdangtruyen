import { BellOff, ChevronLeft, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getRoutePrefetchProps } from '../services/routePrefetch';

export default function RemovedContentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const notification = location.state?.notification;
  const contentType = notification?.contentType || params.get('contentType') || 'Post';
  const contentTitle = notification?.contentTitle || params.get('title') || '';
  const creatorUsername = notification?.from?.username || params.get('creator') || '';
  const creatorId = notification?.from?._id || params.get('creatorId') || '';
  const contentLabel = contentType === 'Artwork' ? 'artwork' : contentType === 'Story' ? 'story' : 'post';
  const collectionPath = contentType === 'Artwork' ? '/artworks' : '/stories';

  return (
    <div className="detail-shell px-4 py-6 sm:py-8">
      <section className="detail-post-card overflow-hidden">
        <div className="detail-post-toolbar">
          <button type="button" onClick={() => navigate('/notifications')} className="detail-back-icon" aria-label="Back to notifications">
            <ChevronLeft size={20} />
          </button>
          <h1 className="detail-post-heading">Post unavailable</h1>
        </div>

        <div className="p-5 sm:p-7">
          <div className="mx-auto flex max-w-2xl flex-col items-start gap-5 rounded-[1.8rem] border border-amber-400/20 bg-amber-500/8 p-5 sm:p-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-100">
              <BellOff size={26} />
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-amber-300">Notification updated</p>
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                This {contentLabel} was deleted before you opened it.
              </h2>
              <p className="text-sm leading-7 text-slate-300 sm:text-base">
                {creatorUsername ? `@${creatorUsername} posted this ${contentLabel}, but it was removed shortly after publishing.` : `The original ${contentLabel} is no longer available.`}
              </p>
              {contentTitle ? (
                <div className="rounded-2xl border border-slate-700 bg-slate-950/65 px-4 py-3 text-sm text-slate-200">
                  Original title: <span className="font-medium text-white">{contentTitle}</span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/notifications"
                {...getRoutePrefetchProps('/notifications')}
                className="detail-inline-button inline-flex items-center gap-2"
              >
                <Trash2 size={16} />
                Back to notifications
              </Link>
              <Link
                to={collectionPath}
                {...getRoutePrefetchProps(collectionPath)}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-light"
              >
                Browse more {contentType === 'Artwork' ? 'artworks' : 'stories'}
              </Link>
              {creatorId ? (
                <Link
                  to={`/profile/${creatorId}`}
                  {...getRoutePrefetchProps('/profile')}
                  className="detail-inline-button"
                >
                  Open creator profile
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}