import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Notice, errorText } from '../ui.jsx';

export default function AuthPage({ next }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.email, form.fullName, form.password);
      // "next" is only followed if it is a path inside this app (never an outside address).
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      window.location.hash = `#${target}`;
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  return (
    <section className="narrow">
      <h1>{mode === 'login' ? 'Log in' : 'Create an account'}</h1>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <label>Your name
            <input required maxLength="100" autoComplete="name" value={form.fullName} onChange={set('fullName')} />
          </label>
        )}
        <label>Email
          <input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </label>
        <label>Password {mode === 'register' && <span className="muted">(at least 10 characters)</span>}
          <input type="password" required minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password} onChange={set('password')} />
        </label>
        <Notice kind="error">{error}</Notice>
        <button type="submit" className="button" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <p>
        {mode === 'login' ? 'New here? ' : 'Already have an account? '}
        <button type="button" className="link-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </button>
      </p>
      <p className="muted">This is a demo: please do not reuse a password from another site.</p>
    </section>
  );
}
