import { useState, useEffect, type FormEvent } from 'react';
import { useApi } from '../lib/api';

interface NotificationChannel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, any>;
  onMonitorDown: boolean;
  onMonitorRecovery: boolean;
  onTestFailure: boolean;
  onTestRecovery: boolean;
  createdAt: string;
}

interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  sourceType: string;
  sourceId: string | null;
  channelIds: string[];
  createdAt: string;
}

interface AlertRecord {
  id: string;
  severity: string;
  title: string;
  message: string;
  sourceType: string;
  sourceName: string;
  channelType: string;
  status: string;
  createdAt: string;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
}

const CHANNEL_TYPES = [
  { value: 'email', label: 'Email', icon: '📧', fields: ['addresses (comma-separated)'] },
  { value: 'sms', label: 'SMS', icon: '📱', fields: ['phone numbers'] },
  { value: 'phone', label: 'Phone Call', icon: '📞', fields: ['phone numbers'] },
  { value: 'pagerduty', label: 'PagerDuty', icon: '🔥', fields: ['routing key'] },
  { value: 'slack', label: 'Slack', icon: '💬', fields: ['webhook URL'] },
  { value: 'discord', label: 'Discord', icon: '🎮', fields: ['webhook URL'] },
  { value: 'webhook', label: 'Webhook', icon: '🔗', fields: ['URL'] },
];

export default function Notifications() {
  const api = useApi();
  const [tab, setTab] = useState<'channels' | 'rules' | 'alerts'>('channels');
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<NotificationChannel[]>('/notifications/channels').then(setChannels).catch(() => {}),
      api.get<AlertRule[]>('/notifications/rules').then(setRules).catch(() => {}),
      api.get<AlertRecord[]>('/notifications/alerts').then(setAlerts).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleDeleteChannel(id: string) {
    if (!confirm('Delete this channel?')) return;
    try { await api.del(`/notifications/channels/${id}`); setChannels(channels.filter(c => c.id !== id)); } catch {}
  }

  async function handleDeleteRule(id: string) {
    if (!confirm('Delete this rule?')) return;
    try { await api.del(`/notifications/rules/${id}`); setRules(rules.filter(r => r.id !== id)); } catch {}
  }

  const channelMap = Object.fromEntries(channels.map(c => [c.id, c]));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Alerting</h1>
          <p className="text-gray-400 text-sm mt-1">Configure notifications for monitors and test failures</p>
        </div>
        <div className="flex gap-2">
          {tab === 'rules' && (
            <button onClick={() => setShowRuleForm(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + Add Rule
            </button>
          )}
          {tab === 'channels' && (
            <button onClick={() => setShowCreate(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              + Add Channel
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-6 w-fit">
        {(['channels', 'rules', 'alerts'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            {t === 'channels' ? 'Channels' : t === 'rules' ? 'Rules' : 'Alert History'}
          </button>
        ))}
      </div>

      {/* Channels Tab */}
      {tab === 'channels' && (
        <div className="space-y-3">
          {channels.length === 0 ? (
            <EmptyState title="No notification channels" description="Add a channel to start receiving alerts." />
          ) : (
            channels.map((ch) => (
              <div key={ch.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{CHANNEL_TYPES.find((t) => t.value === ch.type)?.icon || '❓'}</span>
                  <div>
                    <p className="font-medium">{ch.name}</p>
                    <p className="text-sm text-gray-500 capitalize">{ch.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2 text-xs">
                    {ch.onMonitorDown && <span className="px-2 py-1 rounded bg-red-500/10 text-red-400">Down</span>}
                    {ch.onTestFailure && <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-400">Fail</span>}
                    {ch.onMonitorRecovery && <span className="px-2 py-1 rounded bg-green-500/10 text-green-400">Recovery</span>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${ch.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                    {ch.enabled ? 'Active' : 'Disabled'}
                  </span>
                  <button onClick={() => handleDeleteChannel(ch.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <EmptyState title="No alert rules" description="Connect monitors and tests to notification channels." />
          ) : (
            rules.map((r) => (
              <div key={r.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{r.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                      {r.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Source: {r.sourceType}{r.channelIds.map(id => channelMap[id]?.name || id).join(', ')}
                  </p>
                </div>
                <button onClick={() => handleDeleteRule(r.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Alert History Tab */}
      {tab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <EmptyState title="No alerts yet" description="Alerts will appear here when monitors go down or tests fail." />
          ) : (
            alerts.map((alert) => (
              <div key={alert.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      alert.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
                      alert.severity === 'warning' ? 'bg-yellow-500/10 text-yellow-400' :
                      alert.severity === 'recovery' ? 'bg-green-500/10 text-green-400' :
                      'bg-blue-500/10 text-blue-400'
                    }`}>{alert.severity}</span>
                    <div>
                      <p className="font-medium text-sm">{alert.title}</p>
                      <p className="text-xs text-gray-500">{alert.sourceName} · via {alert.channelType}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      alert.status === 'delivered' ? 'bg-green-500/10 text-green-400' :
                      alert.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                      alert.status === 'acknowledged' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-gray-500/10 text-gray-400'
                    }`}>{alert.status}</span>
                    <p className="text-xs text-gray-600 mt-1">{new Date(alert.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showCreate && <CreateChannelModal api={api} onClose={() => { setShowCreate(false); api.get<NotificationChannel[]>('/notifications/channels').then(setChannels).catch(() => {}); }} />}
      {showRuleForm && <RuleForm api={api} channels={channels} onClose={() => setShowRuleForm(false)} onSaved={() => { setShowRuleForm(false); api.get<AlertRule[]>('/notifications/rules').then(setRules).catch(() => {}); }} />}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
      <p className="text-gray-400 mb-2">{title}</p>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

function CreateChannelModal({ api, onClose }: { api: ReturnType<typeof useApi>; onClose: () => void }) {
  const [type, setType] = useState('email');
  const [name, setName] = useState('');
  const [configInput, setConfigInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    let config: Record<string, any> = {};
    const values = configInput.split(',').map((s) => s.trim()).filter(Boolean);
    switch (type) {
      case 'email': config = { email: { addresses: values } }; break;
      case 'sms': config = { sms: { phoneNumbers: values } }; break;
      case 'phone': config = { phone: { phoneNumbers: values } }; break;
      case 'pagerduty': config = { pagerduty: { routingKey: values[0] || '', integrationKey: '' } }; break;
      case 'slack': config = { slack: { webhookUrl: values[0] || '' } }; break;
      case 'discord': config = { discord: { webhookUrl: values[0] || '' } }; break;
      case 'webhook': config = { webhook: { url: values[0] || '' } }; break;
    }
    try { await api.post('/notifications/channels', { name, type, config }); onClose(); } catch {}
    setLoading(false);
  }

  const selectedType = CHANNEL_TYPES.find((t) => t.value === type);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold mb-4">Add Notification Channel</h2>
        <label className="block text-sm text-gray-400 mb-1">Channel Type</label>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {CHANNEL_TYPES.map((ct) => (
            <button key={ct.value} onClick={() => setType(ct.value)} className={`p-2 rounded-lg text-center text-sm transition-colors ${type === ct.value ? 'bg-brand-600/20 border border-brand-500 text-brand-400' : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200'}`}>
              <div className="text-xl mb-1">{ct.icon}</div>
              {ct.label}
            </button>
          ))}
        </div>
        <label className="block text-sm text-gray-400 mb-1">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. PagerDuty On-Call" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm mb-4 focus:outline-none focus:border-brand-500" />
        <label className="block text-sm text-gray-400 mb-1">{selectedType?.fields[0] || 'Config'}</label>
        <input value={configInput} onChange={e => setConfigInput(e.target.value)} placeholder={type === 'email' ? 'ops@example.com' : type === 'slack' ? 'https://hooks.slack.com/...' : 'value'} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm mb-4 focus:outline-none focus:border-brand-500" />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
          <button onClick={handleCreate} disabled={loading || !name.trim()} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">{loading ? 'Creating...' : 'Create Channel'}</button>
        </div>
      </div>
    </div>
  );
}

function RuleForm({ api, channels, onClose, onSaved }: { api: ReturnType<typeof useApi>; channels: NotificationChannel[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('all');
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggleChannel(id: string) {
    setChannelIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || channelIds.length === 0) return;
    setSubmitting(true);
    try { await api.post('/notifications/rules', { name, sourceType, channelIds }); onSaved(); } catch {}
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">New Alert Rule</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Source</label>
            <select value={sourceType} onChange={e => setSourceType(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500">
              <option value="all">All monitors & tests</option>
              <option value="monitor">Monitors only</option>
              <option value="test">Tests only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Notify via</label>
            {channels.length === 0 ? (
              <p className="text-xs text-gray-600">No channels configured. Create a channel first.</p>
            ) : (
              <div className="space-y-1">
                {channels.map(ch => (
                  <label key={ch.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-800 cursor-pointer">
                    <input type="checkbox" checked={channelIds.includes(ch.id)} onChange={() => toggleChannel(ch.id)} className="rounded border-gray-600" />
                    <span className="text-sm">{ch.name}</span>
                    <span className="text-xs text-gray-600">({ch.type})</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={submitting || channelIds.length === 0} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {submitting ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
