import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/monitors', label: 'Monitors', icon: '🔍' },
  { to: '/tests', label: 'Tests', icon: '🧪' },
  { to: '/ai', label: 'AI Console', icon: '🤖' },
  { to: '/alerts', label: 'Alerts', icon: '🔔' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-brand-400">FusionPulse</h1>
          <p className="text-xs text-gray-500 mt-1">AI Testing by ColeFusion</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800 space-y-3">
          {/* User info */}
          {user && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                user.userType === 'root' ? 'bg-red-600/20 text-red-400' : 'bg-brand-600/20 text-brand-400'
              }`}>
                {user.userType === 'root' ? 'R' : (user.email?.[0] || 'U').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-300 truncate">
                  {user.userType === 'root' ? user.username : user.email}
                </div>
                <div className="text-xs text-gray-500 capitalize">{user.userType} · {user.role}</div>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            Sign Out
          </button>
          <div className="text-xs text-gray-600 px-3">
            <span className="text-brand-500">ColeFusion</span> © 2026
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
