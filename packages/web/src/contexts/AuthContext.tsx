import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface AuthUser {
  id: string;
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  userType: 'root' | 'user';
  username?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  rootLogin: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setAuth: (token: string, user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('fp_token');
    const storedUser = localStorage.getItem('fp_user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('fp_token');
        localStorage.removeItem('fp_user');
      }
    }
    setLoading(false);
  }, []);

  const setAuth = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('fp_token', newToken);
    localStorage.setItem('fp_user', JSON.stringify(newUser));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Login failed');

    const { accessToken } = json.data;

    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    const user: AuthUser = {
      id: payload.sub || '',
      sub: payload.sub || '',
      email: payload.email || '',
      tenantId: payload['custom:tenant_id'] || '',
      role: payload['custom:role'] || 'member',
      userType: (payload['custom:user_type'] as 'root' | 'user') || 'user',
    };

    setAuth(accessToken, user);
  }, [setAuth]);

  const rootLogin = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/root-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Login failed');

    const { accessToken } = json.data;

    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    const user: AuthUser = {
      id: payload.sub || '',
      sub: payload.sub || '',
      email: payload.email || '',
      tenantId: payload.tenant_id || '',
      role: 'root',
      userType: 'root',
      username: payload.username || username,
    };

    setAuth(accessToken, user);
  }, [setAuth]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('fp_token');
    localStorage.removeItem('fp_user');
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, rootLogin, logout, setAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
