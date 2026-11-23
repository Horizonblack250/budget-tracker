import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Email + password sign-in. "Create account" is for the very first time only. */
export function Login({ db }: { db: SupabaseClient }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    setError('');
    setInfo('');
    if (!email.trim() || password.length < 6) {
      setError(password.length < 6 ? 'Password needs at least 6 characters.' : 'Enter your email.');
      return;
    }
    setBusy(true);
    if (mode === 'signin') {
      const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    } else {
      const { data, error } = await db.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
      if (error) setError(error.message);
      else if (!data.session) {
        setInfo('Account created. Check your email and click the confirmation link, then sign in here.');
        setMode('signin');
      }
    }
    setBusy(false);
  };

  return (
    <div className="loginwrap">
      <form
        className="card login"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="brand">
          <span className="logo" aria-hidden>
            ₹
          </span>
          <span>Monthly budget</span>
        </div>
        <h2>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
        <p className="small mute">{mode === 'signin' ? 'Your budget syncs between your PC and phone.' : 'Do this once. Afterwards you just sign in.'}</p>
        <label className="field-label">
          Email
          <input className="field" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field-label">
          Password
          <input
            className="field"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="small neg" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="notice small" role="status">
            {info}
          </p>
        )}
        <button type="submit" className="primary wide" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="link center-link" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}>
          {mode === 'signin' ? 'First time here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
