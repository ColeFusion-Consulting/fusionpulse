import { vi } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: null,
    token: null,
    loading: false,
    login: vi.fn(),
    rootLogin: vi.fn(),
    logout: vi.fn(),
    setAuth: vi.fn(),
  })),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
