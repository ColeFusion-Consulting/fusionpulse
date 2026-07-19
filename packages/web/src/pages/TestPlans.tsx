import { useState, useEffect, type FormEvent } from 'react';
import { useApi } from '../lib/api';

interface TestPlan {
  id: string;
  name: string;
  description: string;
  siteUrl: string;
  status: string;
  pages: { path: string; title: string; elements: string[] }[];
  suggestedCases: { id: string; name: string; description: string; priority: string; steps: string[]; pagePath?: string }[];
  userFeedback: string | null;
  createdAt: string;
}

export default function TestPlans() {
  const api = useApi();
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TestPlan | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<TestPlan[]>('/test-plans').then(setPlans).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleApprove(id: string, feedback: string) {
    try {
      const updated = await api.post<TestPlan>(`/test-plans/${id}/approve`, { feedback: feedback || undefined });
      setPlans(plans.map(p => p.id === id ? updated : p));
      if (selectedPlan?.id === id) setSelectedPlan(updated);
    } catch (err: any) { setError(err.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Test Plans</h1>
          <p className="text-gray-400 text-sm mt-1">AI-generated test plans for your site</p>
        </div>
        <button onClick={() => setShowGenerate(true)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Generate Plan
        </button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2.5 mb-4">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : plans.length === 0 && !showGenerate ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400 mb-2">No test plans yet</p>
          <p className="text-gray-600 text-sm">Generate an AI test plan to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            {plans.map(plan => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan)}
                className={`bg-gray-900 rounded-xl border p-4 cursor-pointer transition-colors ${selectedPlan?.id === plan.id ? 'border-brand-500' : 'border-gray-800 hover:border-gray-700'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm truncate">{plan.name}</p>
                  <StatusBadge status={plan.status} />
                </div>
                <p className="text-xs text-gray-500 truncate">{plan.siteUrl}</p>
                <p className="text-xs text-gray-600 mt-1">{plan.suggestedCases?.length || 0} test cases</p>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2">
            {selectedPlan ? (
              <PlanDetail plan={selectedPlan} onApprove={handleApprove} />
            ) : (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
                <p className="text-gray-500">Select a plan to review</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showGenerate && (
        <GenerateForm api={api} onClose={() => setShowGenerate(false)} onGenerated={(plan) => { setShowGenerate(false); setPlans([plan, ...plans]); setSelectedPlan(plan); }} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { draft: 'bg-gray-500/10 text-gray-400', review: 'bg-amber-500/10 text-amber-400', approved: 'bg-green-500/10 text-green-400', implemented: 'bg-blue-500/10 text-blue-400' };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || 'bg-gray-500/10 text-gray-400'}`}>{status}</span>;
}

function PlanDetail({ plan, onApprove }: { plan: TestPlan; onApprove: (id: string, feedback: string) => void }) {
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const priorityColors: Record<string, string> = { critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-gray-400' };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{plan.name}</h2>
          <p className="text-sm text-gray-500">{plan.siteUrl}</p>
        </div>
        <StatusBadge status={plan.status} />
      </div>

      <p className="text-sm text-gray-400 mb-6">{plan.description}</p>

      {plan.pages?.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Pages ({plan.pages.length})</h3>
          <div className="flex flex-wrap gap-2">
            {plan.pages.map((page, i) => (
              <div key={i} className="bg-gray-800 rounded-lg px-3 py-2 text-sm">
                <p className="text-gray-200 font-medium">{page.title}</p>
                <p className="text-xs text-gray-500">{page.path}</p>
                <p className="text-xs text-gray-600 mt-1">{page.elements?.length || 0} elements</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.suggestedCases?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Test Cases ({plan.suggestedCases.length})</h3>
          <div className="space-y-3">
            {plan.suggestedCases.map((tc) => (
              <div key={tc.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{tc.name}</p>
                    <p className="text-xs text-gray-500">{tc.description}</p>
                  </div>
                  <span className={`text-xs font-medium ${priorityColors[tc.priority] || 'text-gray-400'}`}>{tc.priority}</span>
                </div>
                {tc.steps?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {tc.steps.map((step, i) => (
                      <div key={i} className="flex gap-2 text-xs text-gray-500">
                        <span className="text-gray-600 w-4">{i + 1}.</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(plan.status === 'draft' || plan.status === 'review') && (
        <div className="mt-6 pt-4 border-t border-gray-800">
          <button onClick={() => setShowFeedback(!showFeedback)} className="text-sm text-brand-400 hover:text-brand-300">
            {showFeedback ? 'Cancel' : 'Add feedback & approve'}
          </button>
          {showFeedback && (
            <div className="mt-3 space-y-3">
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3} placeholder="What test scenarios did we miss? Any complex flows to add?" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" />
              <button onClick={() => onApprove(plan.id, feedback)} className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Submit for Review
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GenerateForm({ api, onClose, onGenerated }: { api: ReturnType<typeof useApi>; onClose: () => void; onGenerated: (plan: TestPlan) => void }) {
  const [siteUrl, setSiteUrl] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!siteUrl.trim()) return;
    setSubmitting(true);
    try {
      const plan = await api.post<TestPlan>('/test-plans/generate', { siteUrl, name: name || undefined });
      onGenerated(plan);
    } catch (err: any) { setError(err.message); }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Generate Test Plan</h2>
        {error && <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Website URL</label>
            <input type="url" value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="https://example.com" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Plan Name (optional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Main Site Test Plan" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={submitting} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {submitting ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
