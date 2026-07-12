import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@fusionpulse/api-client';

const API_URL = 'https://app.fusionpulse.colefusion.net/api';

interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  role: string;
  userType: 'root' | 'user';
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  api: ReturnType<typeof createApiClient>;
  login: (email: string, password: string) => Promise<void>;
  rootLogin: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const api = createApiClient({ baseUrl: API_URL, getToken: () => token || '' });

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync('fp_token').catch(() => null);
      if (stored) setToken(stored);
      setLoading(false);
    })();
  }, []);

  const setAuth = useCallback(async (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    await SecureStore.setItemAsync('fp_token', newToken).catch(() => {});
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Login failed');
    const { accessToken } = json.data;
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    await setAuth(accessToken, {
      id: payload.sub || '', email: payload.email || '',
      tenantId: payload['custom:tenant_id'] || '', role: payload['custom:role'] || 'member',
      userType: (payload['custom:user_type'] as 'root' | 'user') || 'user',
    });
  }, [setAuth]);

  const rootLogin = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/root-login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Login failed');
    const { accessToken } = json.data;
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    await setAuth(accessToken, {
      id: payload.sub || '', email: payload.email || '',
      tenantId: payload.tenant_id || '', role: 'root', userType: 'root',
    });
  }, [setAuth]);

  const logout = useCallback(async () => {
    setToken(null); setUser(null);
    await SecureStore.deleteItemAsync('fp_token').catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, api, login, rootLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
