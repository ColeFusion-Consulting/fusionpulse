import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';

interface SignupData {
  fullName: string;
  email: string;
  password: string;
  companyName: string;
  phone: string;
  siteUrl: string;
  crawlInstructions: string;
  aiCrawlEnabled: boolean;
  plan: 'free' | 'starter' | 'pro' | 'business';
  addons: {
    aiRepairAgent: boolean;
    e2eVideoRecordings: boolean;
    stealthBrowser: boolean;
    phoneCallAlerts: boolean;
    multiRegionChecks: boolean;
  };
  repoProvider: string;
  repoOwner: string;
  repoName: string;
  repoToken: string;
  agentInstructions: string;
}

const PLANS = [
  { id: 'free', name: 'Free', price: 0, description: 'Basic monitoring for small projects' },
  { id: 'starter', name: 'Starter', price: 5, description: 'Essential features for growing teams' },
  { id: 'pro', name: 'Pro', price: 15, description: 'Advanced monitoring and AI features' },
  { id: 'business', name: 'Business', price: 49, description: 'Enterprise-grade infrastructure' },
] as const;

const ADDONS = [
  { id: 'aiRepairAgent', name: 'AI Repair Agent', price: 15, description: 'Automated test repair' },
  { id: 'e2eVideoRecordings', name: 'E2E Video Recordings', price: 10, description: 'Record test runs' },
  { id: 'stealthBrowser', name: 'Stealth Browser + CAPTCHA', price: 5, description: 'Bypass CAPTCHA checks' },
  { id: 'phoneCallAlerts', name: 'Phone Call Alerts', price: 8, description: 'Phone alerting' },
  { id: 'multiRegionChecks', name: 'Multi-Region Checks', price: 12, description: 'Run from multiple regions' },
] as const;

function computeTotal(plan: string, addons: SignupData['addons']): number {
  const planPrice = PLANS.find((p) => p.id === plan)?.price ?? 0;
  const addonTotal = ADDONS.reduce((sum, a) => sum + (addons[a.id as keyof typeof addons] ? a.price : 0), 0);
  return planPrice + addonTotal;
}

export default function Signup() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const [data, setData] = useState<SignupData>({
    fullName: '',
    email: '',
    password: '',
    companyName: '',
    phone: '',
    siteUrl: '',
    crawlInstructions: '',
    aiCrawlEnabled: false,
    plan: 'free',
    addons: {
      aiRepairAgent: false,
      e2eVideoRecordings: false,
      stealthBrowser: false,
      phoneCallAlerts: false,
      multiRegionChecks: false,
    },
    repoProvider: 'github',
    repoOwner: '',
    repoName: '',
    repoToken: '',
    agentInstructions: '',
  });

  const total = computeTotal(data.plan, data.addons);
  const showStep4 = data.addons.aiRepairAgent;

  const totalSteps = showStep4 ? 6 : 5;

  function update(field: keyof SignupData, value: any) {
    setData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function updateAddon(id: keyof SignupData['addons'], value: boolean) {
    setData((prev) => ({
      ...prev,
      addons: { ...prev.addons, [id]: value },
    }));
  }

  function validateStep1(): boolean {
    const errors: Record<string, string> = {};
    if (!data.fullName.trim()) errors.fullName = 'Full name is required';
    if (!data.email.trim()) errors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(data.email)) errors.email = 'Invalid email address';
    if (!data.password) errors.password = 'Password is required';
    else if (data.password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (!data.companyName.trim()) errors.companyName = 'Company name is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStep2(): boolean {
    const errors: Record<string, string> = {};
    if (!data.siteUrl.trim()) errors.siteUrl = 'Site URL is required';
    else if (!/^https?:\/\/.+/.test(data.siteUrl)) errors.siteUrl = 'Must be a valid URL starting with http:// or https://';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStep4(): boolean {
    const errors: Record<string, string> = {};
    if (!data.repoOwner.trim()) errors.repoOwner = 'Repository owner is required';
    if (!data.repoName.trim()) errors.repoName = 'Repository name is required';
    if (!data.repoToken.trim()) errors.repoToken = 'Personal access token is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleNext() {
    setError('');
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 4 && showStep4 && !validateStep4()) return;
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError('');
    setStep((s) => s - 1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const body: Record<string, any> = {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        companyName: data.companyName,
        phone: data.phone || undefined,
        siteUrl: data.siteUrl,
        crawlInstructions: data.crawlInstructions || undefined,
        aiCrawlEnabled: data.aiCrawlEnabled,
        plan: data.plan,
        addons: Object.entries(data.addons)
          .filter(([, v]) => v)
          .map(([k]) => k),
      };

      if (data.addons.aiRepairAgent) {
        body.repoProvider = data.repoProvider;
        body.repoOwner = data.repoOwner;
        body.repoName = data.repoName;
        body.repoToken = data.repoToken;
        body.agentInstructions = data.agentInstructions || undefined;
      }

      const res = await fetch('/api/auth/full-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Signup failed');

      const { tenantId, provisioningToken } = json.data;
      navigate(`/provisioning/${tenantId}?token=${encodeURIComponent(provisioningToken)}`);
    } catch (err: any) {
      setError(err.message || 'Signup failed');
      setSubmitting(false);
    }
  }

  function renderProgressIndicator() {
    const steps = showStep4
      ? [
          { num: 1, label: 'Account' },
          { num: 2, label: 'Site' },
          { num: 3, label: 'Plan' },
          { num: 4, label: 'Agent' },
          { num: 5, label: 'Payment' },
          { num: 6, label: 'Confirm' },
        ]
      : [
          { num: 1, label: 'Account' },
          { num: 2, label: 'Site' },
          { num: 3, label: 'Plan' },
          { num: 4, label: 'Payment' },
          { num: 5, label: 'Confirm' },
        ];

    return (
      <div className="flex items-center justify-center mb-8 gap-0">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  s.num <= step ? 'bg-brand-600 text-white' : s.num === step + 1 && !showStep4 && step === 3
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-800 text-gray-500'
                }`}
              >
                {s.num < step ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s.num
                )}
              </div>
              <span
                className={`text-xs hidden sm:inline ${
                  s.num === step ? 'text-brand-400 font-medium' : s.num < step ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-6 sm:w-10 h-0.5 mx-1 sm:mx-2 ${s.num < step ? 'bg-brand-600' : 'bg-gray-800'}`} />
            )}
          </div>
        ))}
      </div>
    );
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';
  const inputErrorClass =
    'w-full bg-gray-800 border border-red-600 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent';
  const labelClass = 'block text-sm font-medium text-gray-400 mb-1';

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-brand-400">FusionPulse</h1>
          <p className="text-gray-500 mt-2">Create your monitoring account</p>
        </div>

        {renderProgressIndicator()}

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <form onSubmit={step === totalSteps ? handleSubmit : (e) => e.preventDefault()} className="space-y-5">
            {step === 1 && (
              <>
                <h2 className="text-lg font-medium text-white">Account Details</h2>
                <div>
                  <label className={labelClass}>Full Name</label>
                  <input
                    type="text"
                    value={data.fullName}
                    onChange={(e) => update('fullName', e.target.value)}
                    className={fieldErrors.fullName ? inputErrorClass : inputClass}
                    placeholder="Jane Doe"
                  />
                  {fieldErrors.fullName && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.fullName}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    value={data.email}
                    onChange={(e) => update('email', e.target.value)}
                    className={fieldErrors.email ? inputErrorClass : inputClass}
                    placeholder="jane@company.com"
                  />
                  {fieldErrors.email && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    value={data.password}
                    onChange={(e) => update('password', e.target.value)}
                    className={fieldErrors.password ? inputErrorClass : inputClass}
                    placeholder="Min 8 characters"
                  />
                  {fieldErrors.password && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.password}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Company Name</label>
                  <input
                    type="text"
                    value={data.companyName}
                    onChange={(e) => update('companyName', e.target.value)}
                    className={fieldErrors.companyName ? inputErrorClass : inputClass}
                    placeholder="Acme Corp"
                  />
                  {fieldErrors.companyName && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.companyName}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>
                    Phone <span className="text-gray-600">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={data.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    className={inputClass}
                    placeholder="+1 555-1234"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-6 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-lg font-medium text-white">Site Configuration</h2>
                <div>
                  <label className={labelClass}>Site URL</label>
                  <input
                    type="url"
                    value={data.siteUrl}
                    onChange={(e) => update('siteUrl', e.target.value)}
                    className={fieldErrors.siteUrl ? inputErrorClass : inputClass}
                    placeholder="https://example.com"
                  />
                  {fieldErrors.siteUrl && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.siteUrl}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>
                    Crawl Instructions <span className="text-gray-600">(optional)</span>
                  </label>
                  <textarea
                    value={data.crawlInstructions}
                    onChange={(e) => update('crawlInstructions', e.target.value)}
                    className={inputClass}
                    rows={3}
                    placeholder="Pages or sections to prioritize..."
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.aiCrawlEnabled}
                    onChange={(e) => update('aiCrawlEnabled', e.target.checked)}
                    className="mt-0.5 rounded bg-gray-800 border-gray-700 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-300">
                    I want AI to crawl my site and generate test plans
                  </span>
                </label>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-lg font-medium text-white mb-1">Plan & Add-ons</h2>
                <p className="text-sm text-gray-500 mb-4">Choose a plan and optional add-ons</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => update('plan', plan.id)}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        data.plan === plan.id
                          ? 'border-brand-500 bg-brand-600/10 ring-1 ring-brand-500'
                          : 'border-gray-800 bg-gray-800/50 hover:border-gray-700'
                      }`}
                    >
                      <p className={`text-sm font-semibold ${data.plan === plan.id ? 'text-brand-400' : 'text-gray-300'}`}>
                        {plan.name}
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">
                        ${plan.price}
                        <span className="text-xs font-normal text-gray-500">/mo</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{plan.description}</p>
                    </button>
                  ))}
                </div>

                <h3 className="text-sm font-medium text-gray-300 mb-3">Add-ons</h3>
                <div className="space-y-2 mb-6">
                  {ADDONS.map((addon) => {
                    const key = addon.id as keyof SignupData['addons'];
                    return (
                      <label
                        key={addon.id}
                        className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                          data.addons[key]
                            ? 'border-brand-700 bg-brand-600/5'
                            : 'border-gray-800 bg-gray-800/30 hover:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={data.addons[key]}
                            onChange={(e) => updateAddon(key, e.target.checked)}
                            className="rounded bg-gray-800 border-gray-700 text-brand-600 focus:ring-brand-500"
                          />
                          <div>
                            <p className="text-sm text-gray-200">{addon.name}</p>
                            <p className="text-xs text-gray-500">{addon.description}</p>
                          </div>
                        </div>
                        <span className="text-sm text-gray-300 font-medium">${addon.price}/mo</span>
                      </label>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-gray-800 pt-4 mb-4">
                  <span className="text-sm text-gray-400">Monthly Total</span>
                  <span className="text-xl font-bold text-white">${total.toFixed(2)}</span>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {step === 4 && showStep4 && (
              <>
                <h2 className="text-lg font-medium text-white">AI Repair Agent</h2>
                <p className="text-sm text-gray-500 mb-1">Configure the AI agent that will auto-repair your tests</p>

                <div>
                  <label className={labelClass}>Repository Provider</label>
                  <select
                    value={data.repoProvider}
                    onChange={(e) => update('repoProvider', e.target.value)}
                    className={inputClass}
                  >
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                    <option value="bitbucket">Bitbucket</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Repository Owner</label>
                  <input
                    type="text"
                    value={data.repoOwner}
                    onChange={(e) => update('repoOwner', e.target.value)}
                    className={fieldErrors.repoOwner ? inputErrorClass : inputClass}
                    placeholder="acme-corp"
                  />
                  {fieldErrors.repoOwner && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.repoOwner}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Repository Name</label>
                  <input
                    type="text"
                    value={data.repoName}
                    onChange={(e) => update('repoName', e.target.value)}
                    className={fieldErrors.repoName ? inputErrorClass : inputClass}
                    placeholder="my-app"
                  />
                  {fieldErrors.repoName && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.repoName}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Personal Access Token</label>
                  <input
                    type="password"
                    value={data.repoToken}
                    onChange={(e) => update('repoToken', e.target.value)}
                    className={fieldErrors.repoToken ? inputErrorClass : inputClass}
                    placeholder="ghp_..."
                  />
                  {fieldErrors.repoToken && (
                    <p className="text-red-400 text-xs mt-1">{fieldErrors.repoToken}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>
                    Special Instructions <span className="text-gray-600">(optional)</span>
                  </label>
                  <textarea
                    value={data.agentInstructions}
                    onChange={(e) => update('agentInstructions', e.target.value)}
                    className={inputClass}
                    rows={3}
                    placeholder="Any specific guidance for the AI agent..."
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {step === (showStep4 ? 5 : 4) && !showStep4 && (
              <>
                <h2 className="text-lg font-medium text-white">Payment</h2>
                <p className="text-sm text-gray-500 mb-1">You selected the Free plan — no payment needed!</p>
                <div className="bg-green-900/30 border border-green-800 text-green-400 text-sm rounded-lg px-4 py-3 text-center">
                  You're all set! No payment required.
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {step === (showStep4 ? 5 : 4) && data.plan !== 'free' && (
              <>
                <h2 className="text-lg font-medium text-white">Payment</h2>
                <p className="text-sm text-gray-500 mb-1">Complete your subscription</p>

                <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4 space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">
                      {PLANS.find((p) => p.id === data.plan)?.name ?? data.plan} Plan
                    </span>
                    <span className="text-white">$
                      {PLANS.find((p) => p.id === data.plan)?.price ?? 0}.00/mo</span>
                  </div>
                  {ADDONS.filter((a) => data.addons[a.id as keyof typeof data.addons]).map((a) => (
                    <div key={a.id} className="flex justify-between text-sm">
                      <span className="text-gray-400">{a.name}</span>
                      <span className="text-white">${a.price}.00/mo</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm border-t border-gray-700 pt-2 mt-2">
                    <span className="text-gray-300 font-medium">Total</span>
                    <span className="text-white font-bold">${total.toFixed(2)}/mo</span>
                  </div>
                </div>

                <div className="bg-brand-900/20 border border-brand-800 text-brand-300 text-sm rounded-lg px-4 py-3">
                  Stripe integration is being configured. You can pay later — your free trial starts now.
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {(step === (showStep4 ? 6 : 5)) && (
              <>
                <h2 className="text-lg font-medium text-white">Confirmation</h2>
                <p className="text-sm text-gray-500 mb-3">Review your selections before starting setup</p>

                <div className="bg-gray-800/30 rounded-lg border border-gray-800 divide-y divide-gray-800">
                  <div className="p-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Account</p>
                    <p className="text-sm text-gray-200">{data.fullName} — {data.email}</p>
                    <p className="text-sm text-gray-200">{data.companyName}{data.phone ? ` — ${data.phone}` : ''}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Site</p>
                    <p className="text-sm text-gray-200">{data.siteUrl}</p>
                    {data.crawlInstructions && (
                      <p className="text-sm text-gray-400">Crawl notes: {data.crawlInstructions}</p>
                    )}
                    <p className="text-sm text-gray-400">
                      AI crawl: {data.aiCrawlEnabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Plan</p>
                    <p className="text-sm text-gray-200">
                      {PLANS.find((p) => p.id === data.plan)?.name} — $
                      {PLANS.find((p) => p.id === data.plan)?.price ?? 0}/mo
                    </p>
                  </div>
                  {ADDONS.filter((a) => data.addons[a.id as keyof typeof data.addons]).length > 0 && (
                    <div className="p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Add-ons</p>
                      {ADDONS.filter((a) => data.addons[a.id as keyof typeof data.addons]).map((a) => (
                        <p key={a.id} className="text-sm text-gray-200">{a.name} — ${a.price}/mo</p>
                      ))}
                    </div>
                  )}
                  {data.addons.aiRepairAgent && (
                    <div className="p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">AI Repair Agent</p>
                      <p className="text-sm text-gray-200">
                        {data.repoProvider}/{data.repoOwner}/{data.repoName}
                      </p>
                      {data.agentInstructions && (
                        <p className="text-sm text-gray-400">Notes: {data.agentInstructions}</p>
                      )}
                    </div>
                  )}
                  <div className="p-3 flex justify-between">
                    <span className="text-sm text-gray-300 font-medium">Monthly Total</span>
                    <span className="text-lg font-bold text-white">${total.toFixed(2)}</span>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2.5">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Setting up...' : 'Start Setup'}
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-brand-400 hover:text-brand-300">
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
