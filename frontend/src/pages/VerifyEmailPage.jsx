import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Meteors } from '../components/Meteors';
import { verifyEmailOtp, sendVerificationOtp } from '../services/authService';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function VerifyEmailPage() {
  const query = useQuery();
  const initialEmail = query.get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    setLoading(true);
    try {
      const result = await verifyEmailOtp(email, code);
      if (result.success) {
        setMessage('Email verified. You may now sign in.');
        navigate('/login');
      } else {
        setError(result.error?.message || 'Failed to verify code');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');

    try {
      const result = await sendVerificationOtp(email);
      if (result.success) {
        setMessage('Verification code sent if the email exists.');
      } else {
        setError(result.error?.message || 'Failed to send code');
      }
    } catch {
      setError('An unexpected error occurred');
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-meteor-glow" />
      <div className="auth-meteor-layer">
        <Meteors />
      </div>

      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-card-header">
            <p className="auth-card-brand">Verify Email</p>
          </div>

          <h1 className="auth-card-title">Enter the verification code</h1>
          <p className="auth-card-copy">Check your email for the 6-digit code.</p>

          <form className="auth-form" onSubmit={handleVerify}>
            {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">{error}</div> : null}
            {message ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-300">{message}</div> : null}

            <div className="auth-form-stack">
              <div>
                <label className="auth-field-copy">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="auth-input" />
              </div>

              <div>
                <label className="auth-field-copy">Verification Code</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} required className="auth-input" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Verifying...' : 'Verify'}</button>
              <button type="button" onClick={handleResend} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm">Resend code</button>
            </div>
          </form>

          <p className="auth-footer">Return to <Link to="/login">Sign in</Link></p>
        </section>
      </div>
    </div>
  );
}
