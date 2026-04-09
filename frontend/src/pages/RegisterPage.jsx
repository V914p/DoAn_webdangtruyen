import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Meteors } from '../components/Meteors';
import { APP_NAME, APP_SLOGAN } from '../constants/app';
import { register } from '../services/authService';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const result = await register(username, email, password);

      if (result.success) {
        navigate('/login');
      } else {
        setError(result.error.message);
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
        <section className="auth-showcase">
          <div className="auth-showcase-grid">
            <div>
              <p className="auth-brand-mark">{APP_NAME}</p>
              <p className="auth-showcase-slogan">{APP_SLOGAN}</p>
            </div>
            <div className="auth-showcase-note">
              Build your creator profile, publish original work, and grow your audience inside {APP_NAME}.
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card-header">
            <p className="auth-card-brand">{APP_NAME}</p>
            <span className="auth-card-badge">Creator Access</span>
          </div>

          <h1 className="auth-card-title">Create your creator account</h1>
          <p className="auth-card-copy">
            Start publishing original stories and artwork with one account.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
                {error}
              </div>
            ) : null}

            <div className="auth-form-stack">
              <div>
                <label htmlFor="username" className="auth-field-copy">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="auth-input"
                  placeholder="At least 3 characters"
                />
              </div>

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
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="auth-field-copy">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="auth-input"
                  placeholder="Repeat your password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
