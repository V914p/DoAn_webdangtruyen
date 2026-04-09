import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Meteors } from '../components/Meteors';
import { requestPasswordReset } from '../services/authService';

export default function RequestPasswordResetPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.success) {
        setMessage('If an account exists, a reset code was sent. Please check your email.');
        navigate(`/reset-password?email=${encodeURIComponent(email)}`);
      } else {
        setError(result.error?.message || 'Failed to request reset');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
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
            <p className="auth-card-brand">Reset Password</p>
          </div>

          <h1 className="auth-card-title">Request password reset</h1>
          <p className="auth-card-copy">Enter your account email and we'll send a reset code.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">{error}</div> : null}
            {message ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-300">{message}</div> : null}

            <div className="auth-form-stack">
              <div>
                <label className="auth-field-copy">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="auth-input" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Sending...' : 'Send reset code'}</button>
          </form>

          <p className="auth-footer">Return to <Link to="/login">Sign in</Link></p>
        </section>
      </div>
    </div>
  );
}
