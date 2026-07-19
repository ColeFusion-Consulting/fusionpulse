import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [mode, setMode] = useState<'user' | 'root'>('user');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, rootLogin } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'user') {
        await login(email, password);
      } else {
        await rootLogin(username, password);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-400">FusionPulse</h1>
          <p className="text-gray-500 mt-2">Sign in to your account</p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setMode('user')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'user' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              User Login
            </button>
            <button
              onClick={() => setMode('root')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'root' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Root Login
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'user' ? (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="you@company.com"
                  required
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="root-username"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                mode === 'root'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-brand-600 hover:bg-brand-700 text-white'
              } disabled:opacity-50`}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/signup" className="text-sm text-brand-400 hover:text-brand-300">
              Don't have an account? Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
