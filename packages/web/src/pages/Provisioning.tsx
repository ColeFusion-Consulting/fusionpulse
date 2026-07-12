import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface StepState {
  key: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export default function Provisioning() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Starting setup...');
  const [status, setStatus] = useState<'provisioning' | 'completed' | 'failed'>('provisioning');
  const [steps, setSteps] = useState<StepState[]>([]);
  const [error, setError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!tenantId || !token) return;

    const url = `/api/provisioning/events/${tenantId}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          setMessage('Connected to provisioning service...');
          return;
        }

        if (data.type === 'done') {
          es.close();
          return;
        }

        if (data.type === 'status') {
          if (data.steps) {
            const stepStates: StepState[] = data.steps.map((s: any) => ({
              key: s.key,
              name: s.name,
              status: data.stepsCompleted?.includes(s.key) ? 'completed' : s.key === data.step ? 'in_progress' : 'pending',
            }));
            setSteps(stepStates);
          }
          return;
        }

        // Provisioning event
        if (data.step) {
          setProgress(data.progress);
          setMessage(data.message || '');

          if (data.status === 'in_progress' || data.status === 'completed') {
            setSteps((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((s) => s.key === data.step);
              if (idx >= 0) {
                updated[idx] = { ...updated[idx], status: data.status };
              } else {
                updated.push({ key: data.step, name: data.message || data.step, status: data.status });
              }
              // Mark previously uncompleted steps
              return updated;
            });
          }

          if (data.status === 'completed' && data.tokens) {
            setStatus('completed');
            // Decode user info from the root token
            const payload = JSON.parse(atob(data.tokens.accessToken.split('.')[1]));
            setAuth(data.tokens.accessToken, {
              id: payload.sub || '',
              sub: payload.sub || '',
              email: payload.email || '',
              tenantId: payload.tenant_id || tenantId,
              role: 'root',
              userType: 'root',
              username: payload.username || '',
            });
            setMessage('Setup complete! Redirecting...');
            setTimeout(() => navigate('/'), 1500);
          }

          if (data.status === 'failed') {
            setStatus('failed');
            setError(data.error || 'Setup failed');
            setMessage('Setup failed');
            es.close();
          }
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setError('Connection lost. Please refresh the page.');
      setStatus('failed');
    };

    return () => {
      es.close();
    };
  }, [tenantId, token, setAuth, navigate]);

  function handleRetry() {
    window.location.reload();
  }

  const progressColor = status === 'completed' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : 'bg-brand-500';

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-400">FusionPulse</h1>
          <p className="text-gray-500 mt-2">Setting up your account</p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">{message}</span>
              <span className={`font-medium ${status === 'failed' ? 'text-red-400' : 'text-brand-400'}`}>
                {progress}%
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${progressColor}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps list */}
          <div className="space-y-3">
            {steps.length === 0 && status === 'provisioning' && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Initializing provisioning pipeline...</p>
              </div>
            )}

            {steps.map((step) => (
              <div key={step.key} className="flex items-center gap-3 text-sm">
                <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center">
                  {step.status === 'completed' && (
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {step.status === 'in_progress' && (
                    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {step.status === 'failed' && (
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {step.status === 'pending' && (
                    <div className="w-2 h-2 bg-gray-600 rounded-full" />
                  )}
                </div>
                <span className={
                  step.status === 'completed' ? 'text-green-400' :
                  step.status === 'in_progress' ? 'text-brand-400' :
                  step.status === 'failed' ? 'text-red-400' :
                  'text-gray-500'
                }>
                  {step.name}
                </span>
              </div>
            ))}
          </div>

          {/* Status messages */}
          {status === 'completed' && (
            <div className="mt-6 bg-green-900/30 border border-green-800 text-green-400 text-sm rounded-lg px-4 py-3 text-center">
              Your account is ready! Redirecting to dashboard...
            </div>
          )}

          {status === 'failed' && (
            <div className="mt-6">
              <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
                {error || 'An error occurred during setup. Please try again.'}
              </div>
              <button
                onClick={handleRetry}
                className="w-full py-2.5 rounded-lg font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
