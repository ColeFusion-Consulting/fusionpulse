import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Signup() {
  const [step, setStep] = useState(1);
  const [tenantName, setTenantName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [rootUsername, setRootUsername] = useState('');
  const [rootPassword, setRootPassword] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/provisioning-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName,
          siteUrl,
          root: { username: rootUsername, password: rootPassword },
          manager: { name: managerName, email: managerEmail, password: managerPassword },
        }),
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

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-400">FusionPulse</h1>
          <p className="text-gray-500 mt-2">Set up your monitoring account</p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    s <= step ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-500'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && <div className={`w-16 h-0.5 mx-2 ${s < step ? 'bg-brand-600' : 'bg-gray-800'}`} />}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 1 && (
              <>
                <h2 className="text-lg font-medium text-white mb-4">Company Details</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Acme Corp"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Website URL</label>
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="https://example.com"
                    required
                  />
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400">
                  We'll crawl this site to generate test recommendations.
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                >
                  Next
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-lg font-medium text-white mb-4">Root Administrator</h2>
                <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 mb-4">
                  Root users handle administrative tasks like billing and user management. They cannot access monitoring features.
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Root Username</label>
                  <input
                    type="text"
                    value={rootUsername}
                    onChange={(e) => setRootUsername(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="acme-admin"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Root Password</label>
                  <input
                    type="password"
                    value={rootPassword}
                    onChange={(e) => setRootPassword(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Min 8 characters"
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-lg font-medium text-white mb-4">Manager User</h2>
                <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 mb-4">
                  This is the main user who will manage monitors, tests, and alerts. They can be granted admin permissions.
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Manager Name</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Jane Doe"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Manager Email</label>
                  <input
                    type="email"
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="jane@acme.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Manager Password</label>
                  <input
                    type="password"
                    value={managerPassword}
                    onChange={(e) => setManagerPassword(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Min 8 characters"
                    minLength={8}
                    required
                  />
                </div>
                {error && (
                  <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2.5">
                    {error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Creating Account...' : 'Create Account'}
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
