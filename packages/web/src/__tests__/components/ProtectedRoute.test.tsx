import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import { useAuth } from '../../contexts/AuthContext';

const mockUseAuth = vi.mocked(useAuth);

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: true,
      login: vi.fn(),
      rootLogin: vi.fn(),
      logout: vi.fn(),
      setAuth: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Protected</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('should redirect to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: false,
      login: vi.fn(),
      rootLogin: vi.fn(),
      logout: vi.fn(),
      setAuth: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Protected</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login Page')).toBeTruthy();
  });

  it('should render children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', sub: '1', email: 'a@b.com', tenantId: 't1', role: 'admin', userType: 'user' },
      token: 'token',
      loading: false,
      login: vi.fn(),
      rootLogin: vi.fn(),
      logout: vi.fn(),
      setAuth: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Protected Content')).toBeTruthy();
  });
});
