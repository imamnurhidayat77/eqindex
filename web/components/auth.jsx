'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { API } from '../lib/api';

const AuthCtx = createContext({ user: null, loading: true, login: async () => {}, register: async () => {}, logout: async () => {} });

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    jsonFetch('/auth/me').then((j) => setUser(j.data)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);
  const login = async (email, password) => {
    const j = await jsonFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setUser(j.data);
    return j.data;
  };
  const register = async ({ name, email, password, role }) => {
    const j = await jsonFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
    setUser(j.data);
    return j.data;
  };
  const logout = async () => {
    try { await jsonFetch('/auth/logout', { method: 'POST' }); } catch { /* already out */ }
    setUser(null);
  };
  return <AuthCtx.Provider value={{ user, loading, login, register, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
