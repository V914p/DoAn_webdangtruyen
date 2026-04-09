import { useState } from 'react';
import { REPORT_REASONS } from '../../constants/app';
import { getToken } from '../../services/authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function formatReasonLabel(reason) {
  return reason
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ReportContentButton({ contentId, contentType, disabled = false, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const closeModal = () => {
    if (submitting) return;
    setIsOpen(false);
    setError('');
    setMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    const payloadReason = details.trim()
      ? `${selectedReason}: ${details.trim()}`
      : selectedReason;

    try {
      const response = await fetch(`${API_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          contentId,
          contentType,
          reason: payloadReason
        })
      });

      const data = await response.json();
      if (!data.success) {
        setError(data.error?.message || 'Failed to submit report');
        return;
      }

      setMessage('Report submitted. Our moderation team will review it.');
      setDetails('');
    } catch (submitError) {
      setError('Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      >
        Report Post
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="detail-card w-full max-w-lg p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="detail-eyebrow">Safety review</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">Report this post</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Tell the admin team what looks wrong so they can inspect the full story or artwork.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="detail-inline-button px-3 py-2 text-xs"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Reason</label>
                <select
                  value={selectedReason}
                  onChange={(event) => setSelectedReason(event.target.value)}
                  className="input-base"
                >
                  {REPORT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {formatReasonLabel(reason)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Extra details</label>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={4}
                  maxLength={400}
                  className="detail-textarea"
                  placeholder="Explain what users should know, for example copyright concerns or age-inappropriate content."
                />
              </div>

              {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div> : null}
              {message ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{message}</div> : null}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="detail-inline-button"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
