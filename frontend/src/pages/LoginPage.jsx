import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Meteors } from '../components/Meteors';
import { APP_NAME, APP_SLOGAN } from '../constants/app';
import { login, submitAccountAppeal } from '../services/authService';

function formatDateTime(value) {
  if (!value) return 'Unknown time';
  return new Date(value).toLocaleString();
}

function formatRemainingTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return 'Appeal window expired';
  }

  const totalMinutes = Math.ceil(milliseconds / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && parts.length < 2) parts.push(`${minutes}m`);

  return parts.join(' ') || 'Less than 1 minute';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [banDialog, setBanDialog] = useState(null);
  const [appealDialog, setAppealDialog] = useState({ open: false, reason: '', evidence: '', loading: false, error: '', success: '' });
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        navigate('/home'); // Changed from '/' to '/home'
      } else if (result.error?.code === 'ACCOUNT_BANNED_PERMANENT') {
        setBanDialog(result.data);
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const closeBanDialog = () => {
    setBanDialog(null);
    setAppealDialog({ open: false, reason: '', evidence: '', loading: false, error: '', success: '' });
  };

  const openAppealDialog = () => {
    setAppealDialog({ open: true, reason: '', evidence: '', loading: false, error: '', success: '' });
  };

  const closeAppealDialog = () => {
    if (appealDialog.loading) return;
    setAppealDialog((prev) => ({ ...prev, open: false, error: '', success: '' }));
  };

  const handleSubmitAppeal = async (event) => {
    event.preventDefault();

    if (!appealDialog.reason.trim()) {
      setAppealDialog((prev) => ({ ...prev, error: 'Please explain why this ban should be reviewed.' }));
      return;
    }

    try {
      setAppealDialog((prev) => ({ ...prev, loading: true, error: '', success: '' }));
      const result = await submitAccountAppeal(
        banDialog?.appealToken,
        appealDialog.reason,
        appealDialog.evidence
      );

      if (!result.success) {
        setAppealDialog((prev) => ({
          ...prev,
          loading: false,
          error: result.error?.message || 'Failed to submit the appeal.'
        }));
        return;
      }

      setBanDialog((prev) => ({
        ...prev,
        latestAppeal: result.data
      }));
      setAppealDialog((prev) => ({
        ...prev,
        loading: false,
        success: 'Your appeal has been submitted. The admin team will review it.'
      }));
    } catch (submitError) {
      setAppealDialog((prev) => ({
        ...prev,
        loading: false,
        error: 'Failed to submit the appeal.'
      }));
    }
  };

  const latestAppeal = banDialog?.latestAppeal;
  const hasPendingAppeal = latestAppeal?.status === 'pending';
  const canSubmitAppeal = Boolean(banDialog?.canSubmitAppeal) && !hasPendingAppeal;

  return (
    <div className="auth-screen">
      <div className="auth-meteor-glow" />
      <div className="auth-meteor-layer">
        <Meteors />
      </div>

      <div className="auth-shell">
        <section className="auth-showcase">
          <div className="auth-showcase-grid">
            <div>
              <p className="auth-brand-mark">{APP_NAME}</p>
              <p className="auth-showcase-slogan">{APP_SLOGAN}</p>
            </div>
            <div className="auth-showcase-note">
              {APP_NAME} is a creator-first platform for publishing original stories, manga chapters, and artwork in one place.
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card-header">
            <p className="auth-card-brand">{APP_NAME}</p>
            <span className="auth-card-badge">Creator Access</span>
          </div>

          <h1 className="auth-card-title">Sign in to {APP_NAME}</h1>
          <p className="auth-card-copy">
            Continue with your email and password to manage stories, chapters, and artwork.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
                {error}
              </div>
            ) : null}

            <div className="auth-form-stack">
              <div>
                <label htmlFor="email" className="auth-field-copy">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-input"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="auth-field-copy">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="auth-footer">
            Need an account? <Link to="/register">Create one now</Link>
          </p>
        </section>
      </div>

      {banDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-700 bg-slate-900/95 p-6 text-slate-100 shadow-2xl light:border-slate-200 light:bg-white light:text-slate-800">
            <div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-rose-300 light:text-rose-500">Account status</p>
                <h3 className="mt-2 text-2xl font-semibold text-white light:text-slate-900">This account has been permanently banned</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300 light:text-slate-600">
                  Reason: {banDialog.permanentBanReason}
                </p>
                <p className="mt-2 text-sm text-slate-400 light:text-slate-500">
                  Banned at: {formatDateTime(banDialog.permanentlyBannedAt)}
                </p>
                <p className="mt-2 text-sm text-amber-300 light:text-amber-600">
                  Account and related data will be permanently deleted on {formatDateTime(banDialog.permanentDeletionScheduledFor)}.
                </p>
                <p className="mt-2 text-sm text-slate-300 light:text-slate-700">
                  Time remaining to appeal: {formatRemainingTime(banDialog.permanentDeletionMillisecondsRemaining)}
                </p>
              </div>
            </div>

            {latestAppeal ? (
              <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/50 p-4 light:border-slate-200 light:bg-slate-50">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Latest appeal</p>
                <p className="mt-2 text-sm text-slate-300 light:text-slate-700">Status: {latestAppeal.status}</p>
                <p className="mt-2 text-sm text-slate-400 light:text-slate-600">Submitted: {formatDateTime(latestAppeal.createdAt)}</p>
                {latestAppeal.reviewReason ? (
                  <p className="mt-2 text-sm text-slate-300 light:text-slate-700">Admin note: {latestAppeal.reviewReason}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeBanDialog}
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white light:border-slate-200 light:text-slate-600 light:hover:border-slate-300 light:hover:text-slate-900"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!canSubmitAppeal}
                onClick={openAppealDialog}
                className="rounded-2xl bg-brand px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                {hasPendingAppeal ? 'Appeal Pending' : canSubmitAppeal ? 'Appeal to Admin' : 'Appeal Window Closed'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {banDialog && appealDialog.open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-700 bg-slate-900/95 p-6 text-slate-100 shadow-2xl light:border-slate-200 light:bg-white light:text-slate-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-brand-light light:text-brand">Appeal request</p>
                <h3 className="mt-2 text-2xl font-semibold text-white light:text-slate-900">Submit an appeal</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300 light:text-slate-600">
                  Explain why this permanent ban should be reviewed. You can add evidence if it helps clarify your case.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAppealDialog}
                className="rounded-2xl border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white light:border-slate-200 light:text-slate-600 light:hover:border-slate-300 light:hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmitAppeal} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300 light:text-slate-700">Appeal reason</label>
                <textarea
                  value={appealDialog.reason}
                  onChange={(event) => setAppealDialog((prev) => ({ ...prev, reason: event.target.value }))}
                  rows={5}
                  className="w-full rounded-3xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 light:border-slate-200 light:bg-slate-50 light:text-slate-900"
                  placeholder="Explain what happened and why the ban should be reviewed."
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300 light:text-slate-700">Evidence (optional)</label>
                <textarea
                  value={appealDialog.evidence}
                  onChange={(event) => setAppealDialog((prev) => ({ ...prev, evidence: event.target.value }))}
                  rows={4}
                  className="w-full rounded-3xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 light:border-slate-200 light:bg-slate-50 light:text-slate-900"
                  placeholder="Links, timeline, or any proof that supports your appeal."
                />
              </div>

              {appealDialog.error ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 light:text-rose-600">
                  {appealDialog.error}
                </div>
              ) : null}
              {appealDialog.success ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 light:text-emerald-700">
                  {appealDialog.success}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closeAppealDialog}
                  className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white light:border-slate-200 light:text-slate-600 light:hover:border-slate-300 light:hover:text-slate-900"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={appealDialog.loading}
                  className="rounded-2xl bg-brand px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {appealDialog.loading ? 'Submitting...' : 'Send Appeal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
