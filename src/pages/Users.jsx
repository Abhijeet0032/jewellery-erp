import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_FORM = { username: '', password: '', full_name: '', role: 'sales_staff' };

export default function Users() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [userList, roleDefs] = await Promise.all([
      window.erp.users.list(currentUser.id),
      window.erp.auth.roles(),
    ]);
    setUsers(userList);
    setRoles(roleDefs);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await window.erp.users.create(form, currentUser.id);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(userId, active) {
    await window.erp.users.setActive(userId, !active, currentUser.id);
    await load();
  }

  return (
    <div className="main-panel">
      <h1 className="page-title">Staff & Roles</h1>
      <p className="page-sub">Every account here is restricted to exactly what its role allows — enforced on the backend, not just hidden in the menu.</p>

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field"><label>Username</label><input required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
          <div className="field"><label>Full Name</label><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
          <div className="field"><label>Temporary Password</label><input required type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {Object.entries(roles).map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {roles[form.role] && <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: 8 }}>{roles[form.role].description}</p>}
        {errorMsg && <p style={{ color: 'var(--ledger-red)', fontSize: '0.85rem', marginTop: 8 }}>{errorMsg}</p>}
        <div style={{ marginTop: 16 }}>
          <button className="primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Account'}</button>
        </div>
      </form>

      <div className="card">
        <strong>Staff Accounts ({users.length})</strong>
        <table className="data-table" style={{ marginTop: 14 }}>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.full_name || '—'}</td>
                <td>{roles[u.role]?.label || u.role}</td>
                <td><span className={`pill ${u.active ? 'in_stock' : 'sold'}`}>{u.active ? 'active' : 'disabled'}</span></td>
                <td>
                  {u.id !== currentUser.id && (
                    <button onClick={() => toggleActive(u.id, u.active)}>{u.active ? 'Disable' : 'Enable'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
