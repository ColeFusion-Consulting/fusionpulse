import { vi } from 'vitest';
import React, { type ReactNode } from 'react';

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
  AuthProvider: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
}));
