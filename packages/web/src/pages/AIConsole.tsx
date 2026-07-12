import { useState } from 'react';

export default function AIConsole() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.success) setResult(data.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">AI Test Generator</h1>
      <p className="text-gray-400 mb-6">Describe what to test in plain English. AI generates Playwright test steps.</p>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Test the login flow: go to the login page, enter email and password, click submit, verify the dashboard loads"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
          rows={4}
        />
        <div className="flex justify-end mt-4">
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Generating...' : 'Generate Test Steps'}
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-lg font-semibold mb-1">{result.suggestedName}</h2>
          <p className="text-sm text-gray-400 mb-4">{result.suggestedDescription}</p>
          <div className="space-y-2">
            {result.steps.map((step: any, i: number) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-gray-600 w-6">{i + 1}.</span>
                <span className="text-purple-400 font-mono min-w-[140px]">{step.action}</span>
                <span className="text-gray-400">{step.target || step.url || step.value || ''}</span>
                {step.description && <span className="text-gray-600 ml-auto">{step.description}</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Save as Test Case
            </button>
            <button
              onClick={() => setResult(null)}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Origin story easter egg */}
      <div className="mt-12 text-center text-xs text-gray-700">
        Built with ❤️ by <span className="text-brand-600">ColeFusion</span> — from ColdFusion to the future
      </div>
    </div>
  );
}
