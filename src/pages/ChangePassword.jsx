import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function ChangePassword() {
  const { currentUser, changePassword, error } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 8) return setLocalError('Password must be at least 8 characters.');
    if (password !== confirm) return setLocalError('Passwords do not match.');
    setSaving(true);
    await changePassword(password);
    setSaving(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
      <div className="card" style={{ width: 420 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 600, marginBottom: 4 }}>
          Change your password
        </div>
        <p className="page-sub">A new password is required before you can enter the ERP.</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
          Account: <strong>{currentUser.username}</strong> · {currentUser.business_name}
        </p>
        <form onSubmit={submit}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>New Password</label>
            <input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} />
          </div>
          {(localError || error) && <p style={{ color: 'var(--ledger-red)', fontSize: '0.85rem', marginBottom: 12 }}>{localError || error}</p>}
          <button className="primary" type="submit" disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Saving…' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
