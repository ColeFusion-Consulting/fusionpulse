import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';

vi.mock('../pages/Login', () => ({ default: () => <div>Login Page</div> }));
vi.mock('../pages/Signup', () => ({ default: () => <div>Signup Page</div> }));
vi.mock('../pages/Dashboard', () => ({ default: () => <div>Dashboard</div> }));
vi.mock('../pages/Monitors', () => ({ default: () => <div>Monitors</div> }));
vi.mock('../pages/Tests', () => ({ default: () => <div>Tests</div> }));
vi.mock('../pages/AIConsole', () => ({ default: () => <div>AI Console</div> }));
vi.mock('../pages/Notifications', () => ({ default: () => <div>Notifications</div> }));
vi.mock('../pages/Billing', () => ({ default: () => <div>Billing</div> }));
vi.mock('../pages/Settings', () => ({ default: () => <div>Settings</div> }));
vi.mock('../pages/TestPlans', () => ({ default: () => <div>Test Plans</div> }));
vi.mock('../pages/Provisioning', () => ({ default: () => <div>Provisioning</div> }));
vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render login page at /login', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Login Page')).toBeTruthy();
  });

  it('should render signup page at /signup', () => {
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Signup Page')).toBeTruthy();
  });

  it('should redirect unknown routes to /', () => {
    render(
      <MemoryRouter initialEntries={['/unknown']}>
        <App />
      </MemoryRouter>,
    );

    // When not authenticated, / redirects to /login via ProtectedRoute
    expect(screen.getByText('Login Page')).toBeTruthy();
  });
});
