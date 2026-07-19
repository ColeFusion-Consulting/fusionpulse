import { useState, useEffect, type FormEvent } from 'react';
import { useApi } from '../lib/api';

interface LatestResult {
  status: string;
  statusCode: number;
  responseTimeMs: number;
  checkedAt: string;
}

interface Monitor {
  id: string;
  name: string;
  url: string;
  method: string;
  expectedStatus: number;
  intervalSeconds: number;
  enabled: boolean;
  latestResult: LatestResult | null;
}

export default function Monitors() {
  const api = useApi();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Monitor | null>(null);
  const [error, setError] = useState('');
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  async function fetchMonitors() {
    try {
      const data = await api.get<Monitor[]>('/monitors');
      setMonitors(data);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { fetchMonitors(); }, []);

  async function handleCheck(id: string) {
    setFetchingId(id);
    try {
      await api.post(`/monitors/${id}/check`);
      await fetchMonitors();
    } catch (err: any) {
      setError(err.message);
    }
    setFetchingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this monitor?')) return;
    try {
      await api.del(`/monitors/${id}`);
      await fetchMonitors();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Monitors</h1>
          <p className="text-gray-400 text-sm mt-1">HTTP status and uptime checks</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Monitor
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2.5 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : monitors.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400 mb-2">No monitors yet</p>
          <p className="text-gray-600 text-sm">Add a monitor to start tracking your site's health.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {monitors.map((m) => (
            <div key={m.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${m.latestResult?.status === 'up' ? 'bg-green-500' : m.latestResult?.status === 'down' ? 'bg-red-500' : 'bg-gray-600'}`} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.name}</p>
                    <p className="text-sm text-gray-500 truncate">{m.method} {m.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  {m.latestResult?.responseTimeMs && (
                    <span className="text-xs text-gray-500">{m.latestResult.responseTimeMs}ms</span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    m.latestResult?.status === 'up' ? 'bg-green-500/10 text-green-400' :
                    m.latestResult?.status === 'down' ? 'bg-red-500/10 text-red-400' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>
                    {m.latestResult?.status === 'up' ? 'UP' : m.latestResult?.status === 'down' ? 'DOWN' : 'PENDING'}
                  </span>
                  <button
                    onClick={() => handleCheck(m.id)}
                    disabled={fetchingId === m.id}
                    className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50"
                  >
                    {fetchingId === m.id ? '...' : 'Check'}
                  </button>
                  <button
                    onClick={() => { setEditing(m); setShowForm(true); }}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="text-xs text-red-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <MonitorForm
          monitor={editing}
          onClose={() => { setShowForm(false); setEditing(null); setError(''); }}
          onSaved={() => { setShowForm(false); setEditing(null); fetchMonitors(); }}
          onError={setError}
          api={api}
        />
      )}
    </div>
  );
}

function MonitorForm({ monitor, onClose, onSaved, onError, api }: {
  monitor: Monitor | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
  api: ReturnType<typeof useApi>;
}) {
  const [name, setName] = useState(monitor?.name || '');
  const [url, setUrl] = useState(monitor?.url || '');
  const [method, setMethod] = useState(monitor?.method || 'GET');
  const [expectedStatus, setExpectedStatus] = useState(monitor?.expectedStatus || 200);
  const [intervalSeconds, setIntervalSeconds] = useState(monitor?.intervalSeconds || 300);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    try {
      const body = { name, url, method, expectedStatus, intervalSeconds };
      if (monitor) {
        await api.put(`/monitors/${monitor.id}`, body);
      } else {
        await api.post('/monitors', body);
      }
      onSaved();
    } catch (err: any) {
      onError(err.message);
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold mb-4">{monitor ? 'Edit Monitor' : 'Add Monitor'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Site" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Method</label>
              <select value={method} onChange={e => setMethod(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500">
                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Expected Status</label>
              <input type="number" value={expectedStatus} onChange={e => setExpectedStatus(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Check Interval (seconds)</label>
            <select value={intervalSeconds} onChange={e => setIntervalSeconds(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500">
              <option value={60}>Every minute</option>
              <option value={300}>Every 5 minutes</option>
              <option value={600}>Every 10 minutes</option>
              <option value={1800}>Every 30 minutes</option>
              <option value={3600}>Every hour</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={submitting} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {submitting ? 'Saving...' : monitor ? 'Update Monitor' : 'Create Monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
