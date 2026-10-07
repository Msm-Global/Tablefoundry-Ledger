'use client';
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (res.ok) {
        const n = new URLSearchParams(location.search).get('next') || '/';
        location.replace(n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/');
        return;
      }
      setError((await res.json().catch(() => ({}))).error || 'Login failed.');
    } catch { setError('Could not reach the server.'); }
    setBusy(false);
  };

  return (
    <div className="center">
      <form className="panel" onSubmit={submit}>
        <h1>Tablefoundry · Sign in</h1>
        <p>This test environment is private. Sign in to continue.</p>
        <input type="email" autoComplete="username" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: 11, marginBottom: 10, fontSize: 15 }} />
        <input type="password" autoComplete="current-password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: 11, marginBottom: 14, fontSize: 15 }} />
        {error && <p className="err">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
