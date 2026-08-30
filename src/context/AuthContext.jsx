import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState(null);

  async function login(tenantCode, username, password) {
    setError(null);
    try {
      const user = await window.erp.auth.login(tenantCode, username, password);
      setCurrentUser(user);
      return true;
    } catch (err) {
      setError(err.message || 'Login failed');
      return false;
    }
  }

  async function changePassword(newPassword) {
    setError(null);
    try {
      await window.erp.auth.changePassword(currentUser.id, newPassword);
      setCurrentUser(prev => ({ ...prev, must_change_password: 0 }));
      return true;
    } catch (err) {
      setError(err.message || 'Password change failed');
      return false;
    }
  }

  function logout() {
    setCurrentUser(null);
    setError(null);
  }

  return (
    <AuthContext.Provider value={{ currentUser, login, changePassword, logout, error, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
