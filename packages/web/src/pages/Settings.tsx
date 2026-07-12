import { useState, useEffect, type FormEvent } from 'react';
import { useApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: string;
  userType: string;
  createdAt: string;
}

export default function Settings() {
  const api = useApi();
  const { user } = useAuth();
  const isRoot = user?.userType === 'root';
  const [tab, setTab] = useState<'profile' | 'users' | 'api-keys'>(isRoot ? 'users' : 'profile');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-6 w-fit">
        <button onClick={() => setTab('profile')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'profile' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Profile</button>
        <button onClick={() => setTab('users')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'users' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>Users</button>
        <button onClick={() => setTab('api-keys')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'api-keys' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>API Keys</button>
      </div>

      {tab === 'profile' && <ProfileSection api={api} />}
      {tab === 'users' && <UsersSection api={api} isRoot={isRoot} />}
      {tab === 'api-keys' && <ApiKeysSection />}
    </div>
  );
}

function ProfileSection({ api }: { api: ReturnType<typeof useApi> }) {
  const { user } = useAuth();
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-lg">
      <h2 className="text-lg font-semibold mb-4">Profile</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Email</label>
          <p className="text-white">{user?.email || user?.username || '-'}</p>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Role</label>
          <p className="text-white capitalize">{user?.userType} · {user?.role}</p>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Tenant ID</label>
          <p className="text-sm text-gray-500 font-mono">{user?.tenantId}</p>
        </div>
      </div>
    </div>
  );
}

function UsersSection({ api, isRoot }: { api: ReturnType<typeof useApi>; isRoot: boolean }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    api.get<TenantUser[]>('/users').then(setUsers).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleDeleteUser(id: string) {
    if (!confirm('Remove this user?')) return;
    try { await api.del(`/users/${id}`); setUsers(users.filter(u => u.id !== id)); } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Team Members ({users.length})</h2>
        {isRoot && (
          <button onClick={() => setShowInvite(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Invite User
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
        </div>
      ) : users.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400 mb-2">No users</p>
          <p className="text-gray-600 text-sm">Invite team members to collaborate.</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-800/30">
                  <td className="p-4 text-white">{u.name || '-'}</td>
                  <td className="p-4 text-gray-400">{u.email || '-'}</td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${u.userType === 'root' ? 'bg-red-500/10 text-red-400' : 'bg-brand-500/10 text-brand-400'}`}>
                      {u.userType}
                    </span>
                  </td>
                  <td className="p-4 capitalize text-gray-400">{u.role}</td>
                  <td className="p-4 text-right">
                    {isRoot && u.id !== user?.id && (
                      <button onClick={() => handleDeleteUser(u.id)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <InviteUserModal api={api} onClose={() => setShowInvite(false)} onInvited={() => { setShowInvite(false); api.get<TenantUser[]>('/users').then(setUsers).catch(() => {}); }} />
      )}
    </div>
  );
}

function InviteUserModal({ api, onClose, onInvited }: { api: ReturnType<typeof useApi>; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try { await api.post('/users/invite', { email, name, role }); onInvited(); } catch {}
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Invite User</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={submitting} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {submitting ? 'Inviting...' : 'Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApiKeysSection() {
  const [keys] = useState<any[]>([]);
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-lg">
      <h2 className="text-lg font-semibold mb-4">API Keys</h2>
      {keys.length === 0 ? (
        <p className="text-gray-500 text-sm">No API keys yet. API key management coming soon.</p>
      ) : (
        <div className="space-y-3">{keys.map(k => <div key={k.id} className="text-sm text-gray-400">{k.name}</div>)}</div>
      )}
    </div>
  );
}
