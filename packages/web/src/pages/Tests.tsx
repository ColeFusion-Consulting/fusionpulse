import { useState, useEffect, type FormEvent } from 'react';
import { useApi } from '../lib/api';

interface TestSuite {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

interface TestStep {
  action: string;
  target?: string;
  value?: string;
  url?: string;
  description?: string;
}

interface TestCase {
  id: string;
  suiteId: string;
  name: string;
  description: string;
  steps: TestStep[];
  enabled: boolean;
  createdAt: string;
}

export default function Tests() {
  const api = useApi();
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSuite, setExpandedSuite] = useState<string | null>(null);
  const [showSuiteForm, setShowSuiteForm] = useState(false);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [selectedSuiteId, setSelectedSuiteId] = useState('');
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [error, setError] = useState('');

  async function fetchSuites() {
    try { setSuites(await api.get<TestSuite[]>('/tests/suites')); } catch {}
    setLoading(false);
  }

  async function fetchCases(suiteId?: string) {
    try {
      const data = await api.get<TestCase[]>(`/tests/cases${suiteId ? `?suiteId=${suiteId}` : ''}`);
      setCases(data);
    } catch {}
  }

  useEffect(() => { fetchSuites(); }, []);

  async function handleDeleteSuite(id: string) {
    if (!confirm('Delete this suite and all its test cases?')) return;
    try { await api.del(`/tests/suites/${id}`); await fetchSuites(); }
    catch (err: any) { setError(err.message); }
  }

  async function handleDeleteCase(id: string) {
    if (!confirm('Delete this test case?')) return;
    try { await api.del(`/tests/cases/${id}`); await fetchCases(expandedSuite || undefined); }
    catch (err: any) { setError(err.message); }
  }

  function expandSuite(id: string) {
    if (expandedSuite === id) { setExpandedSuite(null); return; }
    setExpandedSuite(id);
    fetchCases(id);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">E2E Tests</h1>
          <p className="text-gray-400 text-sm mt-1">Manage test suites and Playwright test cases</p>
        </div>
        <button onClick={() => setShowSuiteForm(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + New Suite
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2.5 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : suites.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400 mb-2">No test suites yet</p>
          <p className="text-gray-600 text-sm">Create a suite to organize your E2E tests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suites.map((s) => {
            const suiteCases = cases.filter(c => c.suiteId === s.id);
            const isExpanded = expandedSuite === s.id;
            return (
              <div key={s.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => expandSuite(s.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-sm text-gray-500">{s.description || 'No description'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{suiteCases.length} cases</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedSuiteId(s.id); setEditingCase(null); setShowCaseForm(true); }}
                      className="text-xs text-brand-400 hover:text-brand-300"
                    >
                      + Add Case
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSuite(s.id); }} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-800">
                    {suiteCases.length === 0 ? (
                      <div className="p-6 text-center text-sm text-gray-600">No test cases in this suite yet.</div>
                    ) : (
                      <div className="divide-y divide-gray-800">
                        {suiteCases.map((tc) => (
                          <div key={tc.id} className="p-4 pl-12 flex items-center justify-between hover:bg-gray-800/30">
                            <div className="flex items-center gap-3">
                              <span className={`w-2 h-2 rounded-full ${tc.enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
                              <div>
                                <p className="text-sm font-medium">{tc.name}</p>
                                <p className="text-xs text-gray-500">{tc.steps?.length || 0} steps{tc.description ? ` — ${tc.description}` : ''}</p>
                              </div>
                            </div>
                            <div className="flex gap-3">
                              <button onClick={() => { setEditingCase(tc); setShowCaseForm(true); }} className="text-xs text-gray-500 hover:text-gray-300">Edit</button>
                              <button onClick={() => handleDeleteCase(tc.id)} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showSuiteForm && (
        <SuiteForm onClose={() => setShowSuiteForm(false)} onSaved={() => { setShowSuiteForm(false); fetchSuites(); }} api={api} />
      )}

      {showCaseForm && (
        <CaseForm suiteId={selectedSuiteId} existing={editingCase} onClose={() => { setShowCaseForm(false); setEditingCase(null); }} onSaved={() => { setShowCaseForm(false); setEditingCase(null); fetchCases(expandedSuite || undefined); }} api={api} />
      )}
    </div>
  );
}

function SuiteForm({ onClose, onSaved, api }: { onClose: () => void; onSaved: () => void; api: ReturnType<typeof useApi> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try { await api.post('/tests/suites', { name, description }); onSaved(); }
    catch { /* ignore */ }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">New Test Suite</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={submitting} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {submitting ? 'Creating...' : 'Create Suite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STEP_ACTIONS = [
  { value: 'navigate', label: 'Navigate', fields: ['url'] },
  { value: 'click', label: 'Click', fields: ['target (CSS selector)'] },
  { value: 'type', label: 'Type', fields: ['target', 'value'] },
  { value: 'waitForSelector', label: 'Wait For', fields: ['target (CSS selector)'] },
  { value: 'waitForNavigation', label: 'Wait Nav', fields: [] },
  { value: 'assertText', label: 'Assert Text', fields: ['target', 'expected text'] },
  { value: 'assertElementExists', label: 'Assert Element', fields: ['target (CSS selector)'] },
  { value: 'screenshot', label: 'Screenshot', fields: [] },
  { value: 'scrollToElement', label: 'Scroll To', fields: ['target (CSS selector)'] },
];

function CaseForm({ suiteId, existing, onClose, onSaved, api }: {
  suiteId: string;
  existing: TestCase | null;
  onClose: () => void;
  onSaved: () => void;
  api: ReturnType<typeof useApi>;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [steps, setSteps] = useState<TestStep[]>(existing?.steps || [{ action: 'navigate', url: '', description: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updateStep(i: number, field: string, value: string) {
    setSteps(steps.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  function addStep() { setSteps([...steps, { action: 'navigate', url: '', description: '' }]); }
  function removeStep(i: number) { setSteps(steps.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const body = { suiteId: existing ? existing.suiteId : suiteId, name, description, steps };
      if (existing) { await api.put(`/tests/cases/${existing.id}`, body); }
      else { await api.post('/tests/cases', body); }
      onSaved();
    } catch (err: any) { setError(err.message); }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{existing ? 'Edit Test Case' : 'New Test Case'}</h2>
        {error && <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-gray-400">Test Steps</label>
              <button type="button" onClick={addStep} className="text-xs text-brand-400 hover:text-brand-300">+ Add Step</button>
            </div>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 bg-gray-800 rounded-lg p-3">
                  <span className="text-xs text-gray-600 mt-3 w-5">{i + 1}.</span>
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    <select value={step.action} onChange={e => updateStep(i, 'action', e.target.value)} className="bg-gray-700 border border-gray-600 rounded text-xs p-2 focus:outline-none focus:border-brand-500">
                      {STEP_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    <input value={step.url || step.target || ''} onChange={e => updateStep(i, step.action === 'navigate' ? 'url' : 'target', e.target.value)} placeholder={step.action === 'navigate' ? 'https://...' : 'CSS selector'} className="bg-gray-700 border border-gray-600 rounded text-xs p-2 focus:outline-none focus:border-brand-500 col-span-2" />
                    <input value={step.value || ''} onChange={e => updateStep(i, 'value', e.target.value)} placeholder="value" className="bg-gray-700 border border-gray-600 rounded text-xs p-2 focus:outline-none focus:border-brand-500" />
                  </div>
                  <button type="button" onClick={() => removeStep(i)} className="text-red-500 hover:text-red-400 mt-2 text-xs">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={submitting} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {submitting ? 'Saving...' : existing ? 'Update Case' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
