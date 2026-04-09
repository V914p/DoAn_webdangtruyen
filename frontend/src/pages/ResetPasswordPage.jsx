import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Meteors } from '../components/Meteors';
import { resetPassword } from '../services/authService';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function ResetPasswordPage() {
  const query = useQuery();
  const initialEmail = query.get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword(email, code, newPassword);
      if (result.success) {
        setMessage('Password updated. You can now sign in.');
        navigate('/login');
      } else {
        setError(result.error?.message || 'Failed to reset password');
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

          <h1 className="auth-card-title">Enter reset code and new password</h1>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">{error}</div> : null}
            {message ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-300">{message}</div> : null}

            <div className="auth-form-stack">
              <div>
                <label className="auth-field-copy">Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="auth-input" />
              </div>

              <div>
                <label className="auth-field-copy">Reset Code</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} required className="auth-input" />
              </div>

              <div>
                <label className="auth-field-copy">New Password</label>
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required type="password" minLength={8} className="auth-input" />
              </div>

              <div>
                <label className="auth-field-copy">Confirm Password</label>
                <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required type="password" className="auth-input" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Resetting...' : 'Reset Password'}</button>
          </form>

          <p className="auth-footer">Return to <Link to="/login">Sign in</Link></p>
        </section>
      </div>
    </div>
  );
}
