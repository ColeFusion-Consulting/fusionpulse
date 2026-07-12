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
      {tab === 'users' && <UsersSection api={api} isRoot={isRoot} currentUserId={user?.id || ''} />}
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

function UsersSection({ api, isRoot, currentUserId }: { api: ReturnType<typeof useApi>; isRoot: boolean; currentUserId: string }) {
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
                    {isRoot && u.id !== currentUserId && (
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
  const api = useApi();
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyData, setNewKeyData] = useState<any>(null);

  useEffect(() => {
    api.get('/keys').then(setKeys).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleToggle(id: string, enabled: boolean) {
    try { await api.put(`/keys/${id}/toggle`, { enabled }); setKeys(keys.map(k => k.id === id ? { ...k, enabled } : k)); } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this API key? Any services using it will lose access.')) return;
    try { await api.del(`/keys/${id}`); setKeys(keys.filter(k => k.id !== id)); } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">API Keys ({keys.length})</h2>
        <button onClick={() => setShowCreate(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Create Key
        </button>
      </div>

      {newKeyData && (
        <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-amber-400 mb-1">Key created — copy it now. You won't see it again.</p>
          <div className="bg-gray-950 rounded p-3 font-mono text-sm text-amber-300 break-all select-all">{newKeyData.raw}</div>
          <button onClick={() => setNewKeyData(null)} className="mt-2 text-xs text-amber-400 hover:text-amber-300">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
        </div>
      ) : keys.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400 mb-2">No API keys</p>
          <p className="text-gray-600 text-sm">Create a key to integrate FusionPulse with your tools.</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Key</th>
                <th className="p-4 font-medium">Created</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-gray-800/30">
                  <td className="p-4 text-white">{k.name}</td>
                  <td className="p-4 font-mono text-xs text-gray-500">{k.keyPrefix}...</td>
                  <td className="p-4 text-gray-400 text-xs">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${k.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                      {k.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleToggle(k.id, !k.enabled)} className="text-xs text-gray-500 hover:text-gray-300 mr-3">
                      {k.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => handleDelete(k.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateKeyModal api={api} onClose={() => setShowCreate(false)} onCreated={(data) => { setShowCreate(false); setNewKeyData(data); api.get('/keys').then(setKeys).catch(() => {}); }} />
      )}
    </div>
  );
}

function CreateKeyModal({ api, onClose, onCreated }: { api: ReturnType<typeof useApi>; onClose: () => void; onCreated: (data: any) => void }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const data = await api.post('/keys', { name });
      onCreated(data);
    } catch {}
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Create API Key</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CI Pipeline, Terraform" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" required />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={submitting} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {submitting ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
