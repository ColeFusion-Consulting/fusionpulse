import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  features: string[];
  limits: Record<string, number>;
}

interface UsageSummary {
  plan: string;
  planName: string;
  monthlyPrice: number;
  usage: Record<string, { used: number; limit: number }>;
  overage: {
    items: { metric: string; label: string; overage: number; rateCents: number; totalCents: number }[];
    totalCents: number;
  };
}

export default function Billing() {
  const api = useApi();
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<UsageSummary>('/billing/usage').then(setUsage).catch(() => {}),
      api.get<{ plans: Plan[] }>('/billing/plans').then(d => setPlans(d.plans)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      {/* Current Plan */}
      {usage && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Current Plan: {usage.planName}</h2>
              <p className="text-sm text-gray-500">${usage.monthlyPrice}/mo</p>
            </div>
            {usage.plan !== 'business' && (
              <button className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Upgrade Plan
              </button>
            )}
          </div>

          {/* Usage meters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(usage.usage).map(([key, val]) => (
              <UsageMeter key={key} label={key} used={val.used} limit={val.limit} />
            ))}
          </div>

          {/* Overage */}
          {usage.overage.items.length > 0 && (
            <div className="mt-6 bg-orange-900/20 border border-orange-800/40 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-orange-400 mb-3">Overage Charges</h3>
              <div className="space-y-2">
                {usage.overage.items.map((item) => (
                  <div key={item.metric} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{item.label}: {item.overage} over limit</span>
                    <span className="text-orange-400">${(item.totalCents / 100).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold border-t border-orange-800/40 pt-2 mt-2">
                  <span className="text-gray-300">Total overage</span>
                  <span className="text-orange-400">${(usage.overage.totalCents / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Plan comparison */}
      <h2 className="text-lg font-semibold mb-4">Compare Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <div key={plan.id} className={`bg-gray-900 rounded-xl border p-6 ${plan.id === usage?.plan ? 'border-brand-500' : 'border-gray-800'}`}>
            <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
            <p className="text-2xl font-bold text-white mt-2">${plan.monthlyPrice}<span className="text-sm text-gray-500 font-normal">/mo</span></p>
            {plan.id === 'free' && <p className="text-xs text-gray-500">Forever free</p>}
            <ul className="mt-4 space-y-2">
              {plan.features.map((f, i) => (
                <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span> {f}
                </li>
              ))}
            </ul>
            {plan.id === usage?.plan ? (
              <div className="mt-4 text-center text-sm text-brand-400 font-medium">Current Plan</div>
            ) : plan.id !== 'free' ? (
              <button className="mt-4 w-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {usage && parseInt(plan.id === 'starter' ? '1' : plan.id === 'pro' ? '2' : '3') > parseInt(usage.plan === 'free' ? '0' : usage.plan === 'starter' ? '1' : usage.plan === 'pro' ? '2' : '3') ? 'Upgrade' : 'Downgrade'}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  const isNear = pct >= 80;
  const isOver = used > limit;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-400 capitalize">{label.replace(/([A-Z])/g, ' $1').trim()}</span>
        <span className={isOver ? 'text-red-400' : isNear ? 'text-yellow-400' : 'text-gray-500'}>
          {used}/{limit}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : isNear ? 'bg-yellow-500' : 'bg-brand-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
