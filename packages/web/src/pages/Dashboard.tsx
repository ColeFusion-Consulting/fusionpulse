import { useState, useEffect } from 'react';
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
  enabled: boolean;
  latestResult: LatestResult | null;
}

interface UsageSummary {
  plan: string;
  planName: string;
  usage: Record<string, { used: number; limit: number }>;
}

interface TestRun {
  id: string;
  status: string;
  testType: string;
  durationMs: number;
  createdAt: string;
}

export default function Dashboard() {
  const api = useApi();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Monitor[]>('/monitors'),
      api.get<UsageSummary>('/billing/usage'),
      api.get<TestRun[]>('/tests/runs?limit=10').catch(() => []),
    ]).then(([m, u, r]) => {
      setMonitors(m);
      setUsage(u);
      setRuns(r);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const up = monitors.filter(m => m.latestResult?.status === 'up').length;
  const down = monitors.filter(m => m.latestResult?.status === 'down').length;
  const total = monitors.length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard title="Monitors" value={String(total)} subtitle="configured" color="blue" />
            <StatCard title="Healthy" value={String(up)} subtitle="monitors up" color="green" />
            <StatCard title="Down" value={String(down)} subtitle="monitors down" color={down > 0 ? 'red' : 'green'} />
            <StatCard title="Plan" value={usage?.planName || 'Free'} subtitle={usage ? `${usage.usage.monitors?.used || 0}/${usage.usage.monitors?.limit || 10} monitors` : ''} color="purple" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
              {runs.length === 0 ? (
                <p className="text-gray-500 text-sm">No test runs yet. Create a test suite to get started.</p>
              ) : (
                <div className="space-y-3">
                  {runs.slice(0, 5).map((run) => (
                    <div key={run.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${run.status === 'passed' ? 'bg-green-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                        <span className="text-gray-300">{run.testType} test</span>
                      </div>
                      <div className="flex items-center gap-3 text-gray-500">
                        <span>{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '-'}</span>
                        <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Monitor Status Summary */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4">Monitor Status</h2>
              {monitors.length === 0 ? (
                <p className="text-gray-500 text-sm">No monitors configured. Add a monitor to start tracking.</p>
              ) : (
                <div className="space-y-2">
                  {monitors.slice(0, 8).map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.latestResult?.status === 'up' ? 'bg-green-500' : m.latestResult?.status === 'down' ? 'bg-red-500' : 'bg-gray-600'}`} />
                        <span className="text-gray-300 truncate">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
                        {m.latestResult?.statusCode && <span>{m.latestResult.statusCode}</span>}
                        {m.latestResult?.responseTimeMs && <span>{m.latestResult.responseTimeMs}ms</span>}
                      </div>
                    </div>
                  ))}
                  {monitors.length > 8 && (
                    <p className="text-xs text-gray-600 pt-2">+{monitors.length - 8} more</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, color }: { title: string; value: string; subtitle: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    red: 'text-red-400',
  };
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${colors[color] || 'text-white'}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-600 mt-1">{subtitle}</p>}
    </div>
  );
}
