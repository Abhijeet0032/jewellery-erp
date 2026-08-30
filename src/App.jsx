import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import ItemMaster from './pages/ItemMaster.jsx';
import Billing from './pages/Billing.jsx';
import Users from './pages/Users.jsx';

function Placeholder({ title }) {
  return <div className="main-panel"><h1 className="page-title">{title}</h1><p className="page-sub">This module is next in line.</p></div>;
}

const NAV_ITEMS = [
  { path: '/', label: 'Item Master', module: 'item_master' },
  { path: '/billing', label: 'Billing', module: 'billing' },
  { path: '/customers', label: 'Customers', module: 'customers' },
  { path: '/rates', label: 'Rate Master', module: 'rates' },
  { path: '/reports', label: 'Reports', module: 'reports' },
  { path: '/users', label: 'Staff & Roles', module: 'users' },
  { path: '/settings', label: 'Settings', module: 'settings' },
];

function Shell() {
  const { currentUser, logout } = useAuth();
  const [roles, setRoles] = useState({});
  useEffect(() => { window.erp.auth.roles().then(setRoles); }, []);
  const roleConfig = roles[currentUser.role];
  const visibleNav = NAV_ITEMS.filter(item => roleConfig?.modules?.includes(item.module));

  return (
    <HashRouter>
      <div className="app-shell">
        <nav className="sidebar">
          <div className="brand">Jewel<span className="accent">ERP</span></div>
          <div style={{ padding: '0 10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 10 }}>
            <div style={{ fontSize: '0.82rem', color: '#F7F5F0', fontWeight: 600 }}>{currentUser.business_name}</div>
            <div style={{ fontSize: '0.68rem', color: '#8A93A6', marginTop: 2 }}>Retailer: {currentUser.tenant_code}</div>
          </div>
          {visibleNav.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/'}>{item.label}</NavLink>)}
          <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '0.78rem', color: '#C7CDD9' }}>{currentUser.full_name || currentUser.username}</div>
            <div style={{ fontSize: '0.7rem', color: '#8A93A6', marginBottom: 10 }}>{roleConfig?.label || currentUser.role}</div>
            <button onClick={logout} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: '#C7CDD9', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem' }}>Sign Out</button>
          </div>
        </nav>
        <Routes>
          <Route path="/" element={roleConfig?.modules?.includes('item_master') ? <ItemMaster /> : <Denied />} />
          <Route path="/billing" element={roleConfig?.modules?.includes('billing') ? <Billing /> : <Denied />} />
          <Route path="/customers" element={roleConfig?.modules?.includes('customers') ? <Placeholder title="Customers" /> : <Denied />} />
          <Route path="/rates" element={roleConfig?.modules?.includes('rates') ? <Placeholder title="Rate Master" /> : <Denied />} />
          <Route path="/reports" element={roleConfig?.modules?.includes('reports') ? <Placeholder title="Reports" /> : <Denied />} />
          <Route path="/users" element={roleConfig?.modules?.includes('users') ? <Users /> : <Denied />} />
          <Route path="/settings" element={roleConfig?.modules?.includes('settings') ? <Placeholder title="Settings" /> : <Denied />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

function Denied() { return <div className="main-panel"><h1 className="page-title">Not available</h1><p className="page-sub">Your role doesn't have access to this module.</p></div>; }

function Gate() {
  const { currentUser } = useAuth();
  if (!currentUser) return <Login />;
  if (currentUser.must_change_password) return <ChangePassword />;
  return <Shell />;
}

export default function App() { return <AuthProvider><Gate /></AuthProvider>; }
