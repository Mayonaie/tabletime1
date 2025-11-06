import React, { useEffect, useState } from 'react';

const USERS_KEY = 'users:v1';
const SESSION_KEY = 'currentUser:v1';
const ADMIN_EMAILS = ['admin@tabletime.local']; // demo: any of these emails will be treated as admin

function readUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const sess = getSession();
    if (sess) onAuthed?.(sess);
  }, [onAuthed]);

  function validateEmail(v) {
    return /.+@.+\..+/.test(v);
  }

  function handleLogin(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!validateEmail(email)) return setError('Enter a valid email');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password) return setError('Invalid email or password');
    const role = user.role || (ADMIN_EMAILS.includes(user.email.toLowerCase()) ? 'admin' : 'user');
    saveSession({ id: user.id, name: user.name, email: user.email, role });
    setSuccess('Logged in');
    onAuthed?.({ id: user.id, name: user.name, email: user.email, role });
  }

  function handleRegister(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!name.trim()) return setError('Name is required');
    if (!validateEmail(email)) return setError('Enter a valid email');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    const users = readUsers();
    const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) return setError('Email already registered');
    const role = ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user';
    const user = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, name: name.trim(), email: email.trim(), password, role };
    users.push(user);
    saveUsers(users);
    // Do not auto-login after registration; switch to login tab
    setSuccess('Registered successfully. Please log in.');
    setMode('login');
    setPassword('');
    setName('');
  }

  return (
    <div className="auth fancy-bg">
      <div className="auth-card">
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>Login</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setSuccess(''); }}>Register</button>
        </div>

        <div className="auth-header">
          <h1>{mode === 'login' ? 'Welcome back to TableTime' : 'Create your TableTime account'}</h1>
          <p className="subtitle">{mode === 'login' ? 'Log in to book, view, and manage your reservations.' : 'Join to start booking and managing your reservations.'}</p>
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        {success ? <div className="alert success">{success}</div> : null}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-group">
                <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
                <button type="button" className="toggle-visibility" onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Login</button>
            <div className="auth-divider"><span>or</span></div>
            <button type="button" className="btn btn-secondary" onClick={() => alert('Social login not configured in demo')}>Continue with Google</button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Maria Gomez" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-group">
                <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" />
                <button type="button" className="toggle-visibility" onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Create account</button>
            <div className="switch-link">Already have an account? <button type="button" className="linklike" onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>Log in</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
