import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, error } = useAuth();
  const [tenantCode, setTenantCode] = useState('MAIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await login(tenantCode, username, password);
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
      <div className="card" style={{ width: 390 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600, marginBottom: 4 }}>
          Jewel<span style={{ color: 'var(--brass)' }}>ERP</span>
        </div>
        <p className="page-sub">Sign in to your retailer account</p>
        <form onSubmit={handleSubmit}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Retailer Code</label>
            <input autoFocus value={tenantCode} onChange={e => setTenantCode(e.target.value.toUpperCase())} required placeholder="e.g. MAIN" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p style={{ color: 'var(--ledger-red)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>}
          <button className="primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: 18 }}>
          Default development login: <strong>MAIN</strong> / <strong>admin</strong> / <strong>admin123</strong>
        </p>
      </div>
    </div>
  );
}
