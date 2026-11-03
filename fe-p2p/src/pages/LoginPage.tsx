import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import Logo from '../components/Logo';
import './LoginPage.css';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'login') await login(form.username, form.password);
      else await register(form.username, form.displayName, form.password);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const switchMode = () => {
    setError('');
    setMode(mode === 'login' ? 'register' : 'login');
  };

  return (
    <main className="landing">
      <section className="landing-intro">
        <div className="landing-brand">
          <Logo size={48} />
          <h1>PEER Messenger</h1>
        </div>
        <p className="landing-tagline">A messenger built to connect people directly, browser to browser.</p>
        <ul className="landing-features">
          <li>Find people by name or username</li>
          <li>See which contacts are online</li>
          <li>Chat directly, browser to browser, with end-to-end encrypted delivery to contacts who are offline</li>
          <li>Send files up to 500 MB the same way, checked for damage on arrival</li>
        </ul>
        <p className="landing-soon">Coming soon: audio and video calls.</p>
      </section>

      <section className="landing-panel">
        <form className="landing-form" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="landing-sub">
            {mode === 'login' ? 'Log in to pick up your conversations.' : 'It only takes a few seconds.'}
          </p>
          <label>
            Username
            <input autoComplete="username" value={form.username} onChange={set('username')} />
          </label>
          {mode === 'register' && (
            <label>
              Display name
              <input autoComplete="name" value={form.displayName} onChange={set('displayName')} />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={set('password')}
            />
          </label>
          {error && <p className="landing-error" role="alert">{error}</p>}
          <button className="landing-submit" type="submit">
            {mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
          <button className="landing-switch" type="button" onClick={switchMode}>
            {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
          </button>
        </form>
      </section>
    </main>
  );
}
